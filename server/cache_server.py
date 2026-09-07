#!/usr/bin/env python3
"""
Jama Connect LAN Cache Server

Replaces ``python -m http.server`` with a proper FastAPI server that serves
pre-generated .db.gz files AND provides a password-protected admin panel for:

  - Managing which Jama projects are synced
  - Triggering on-demand syncs with live log streaming (SSE)
  - Configuring the auto-sync schedule (daily / biweekly / weekly / monthly)
  - Changing the admin password

Usage::

    python cache_server.py [--port 8866] [--data ./data] [--env ./.env]

Config is persisted in ``server_config.json`` (same directory as this script).
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import gzip
import hashlib
import json
import logging
import os
import re
import secrets
import shutil
import sqlite3
import sys
import tempfile
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, AsyncGenerator, Optional

# ── logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# ── resolved at startup via main() ────────────────────────────────────────────
_HERE = Path(__file__).resolve().parent          # server/
_GENERATE_SCRIPT = _HERE / "scripts" / "generate_caches.py"
_ENV_FILE = _HERE / ".env"
_CONFIG_PATH = _HERE / "server_config.json"
_DATA_DIR = _HERE / "data"

# ── schedule constants ────────────────────────────────────────────────────────
SCHEDULE_SECONDS: dict[str, int] = {
    "daily":    86400,
    "biweekly": 86400 * 3,
    "weekly":   86400 * 7,
    "monthly":  86400 * 30,
    "never":    0,
}
SCHEDULE_LABELS: dict[str, str] = {
    "daily":    "Daily",
    "biweekly": "Every 3 days",
    "weekly":   "Weekly",
    "monthly":  "Monthly",
    "never":    "Manual only",
}

DEFAULT_CONFIG: dict[str, Any] = {
    "admin_password_hash": "",   # empty = first-run setup required
    "projects": [],              # list[int] — Jama project IDs
    "schedule": "biweekly",
    "schedule_time": "02:00",    # HH:MM UTC
}

# ── mutable globals ───────────────────────────────────────────────────────────
_sessions: dict[str, datetime] = {}           # token -> expiry
_sync_running: bool = False
_sync_log: list[str] = []                     # rolling buffer (last 500 lines)
_sync_subscribers: set[asyncio.Queue] = set()
_next_sync_at: Optional[datetime] = None
_scheduler_task: Optional[asyncio.Task] = None

SESSION_LIFETIME = timedelta(hours=8)
MAX_LOG_LINES = 500


# ── config helpers ────────────────────────────────────────────────────────────

def load_config() -> dict[str, Any]:
    if _CONFIG_PATH.exists():
        try:
            data = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
            return {**DEFAULT_CONFIG, **data}
        except Exception as e:
            logger.warning("Bad server_config.json: %s — using defaults", e)
    return dict(DEFAULT_CONFIG)


def save_config(cfg: dict[str, Any]) -> None:
    _CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Config saved: projects=%s  schedule=%s", cfg.get("projects"), cfg.get("schedule"))


def _hash_pw(pw: str) -> str:
    return "sha256:" + hashlib.sha256(pw.encode("utf-8")).hexdigest()


def _verify_pw(pw: str, stored: str) -> bool:
    return bool(stored) and _hash_pw(pw) == stored


# ── session helpers ───────────────────────────────────────────────────────────

def _new_session() -> str:
    token = secrets.token_hex(32)
    _sessions[token] = datetime.now(timezone.utc) + SESSION_LIFETIME
    return token


def _session_valid(token: Optional[str]) -> bool:
    if not token:
        return False
    exp = _sessions.get(token)
    if not exp:
        return False
    if datetime.now(timezone.utc) > exp:
        _sessions.pop(token, None)
        return False
    return True


# ── sync helpers ──────────────────────────────────────────────────────────────

def _push_log(line: str) -> None:
    """Append a line to the rolling log buffer and wake all SSE subscribers."""
    global _sync_log
    _sync_log.append(line)
    if len(_sync_log) > MAX_LOG_LINES:
        _sync_log = _sync_log[-MAX_LOG_LINES:]
    for q in list(_sync_subscribers):
        try:
            q.put_nowait({"type": "log", "text": line})
        except asyncio.QueueFull:
            pass


async def run_sync(project_ids: Optional[list[int]] = None) -> bool:
    """Run generate_caches.py in a subprocess, streaming output via SSE."""
    global _sync_running, _sync_log

    if _sync_running:
        logger.warning("Sync already running — ignoring request")
        return False

    _sync_running = True
    _sync_log = []

    cfg = load_config()
    if project_ids is None:
        project_ids = cfg.get("projects", [])

    cmd = [sys.executable, str(_GENERATE_SCRIPT), "--env", str(_ENV_FILE), "--out", str(_DATA_DIR)]
    if project_ids:
        cmd += ["--projects"] + [str(p) for p in project_ids]

    _push_log(f"[server] Starting: generate_caches.py --projects {' '.join(str(p) for p in project_ids)}")
    logger.info("Sync: %s", " ".join(cmd))

    success = False
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(_HERE),
        )
        assert proc.stdout
        async for raw in proc.stdout:
            line = raw.decode("utf-8", errors="replace").rstrip()
            _push_log(line)
        rc = await proc.wait()
        success = rc == 0
        _push_log(f"[server] Sync {'DONE (success)' if success else 'FAILED (exit ' + str(rc) + ')'}")
    except Exception as e:
        _push_log(f"[server] ERROR: {e}")
        logger.error("Sync error: %s", e, exc_info=True)
    finally:
        _sync_running = False
        for q in list(_sync_subscribers):
            try:
                q.put_nowait({"type": "done", "success": success})
            except asyncio.QueueFull:
                pass

    # Regenerate index.html after a successful sync
    if success:
        try:
            sys.path.insert(0, str(_HERE / "scripts"))
            from generate_caches import _write_index_html  # type: ignore[import]
            _write_index_html(_DATA_DIR)
            logger.info("index.html regenerated")
        except Exception as e2:
            logger.warning("Could not regenerate index.html: %s", e2)

    return success


# ── background scheduler ──────────────────────────────────────────────────────

def _compute_next_sync(cfg: dict[str, Any]) -> Optional[datetime]:
    schedule = cfg.get("schedule", "never")
    interval = SCHEDULE_SECONDS.get(schedule, 0)
    if not interval:
        return None
    time_str = cfg.get("schedule_time", "02:00")
    try:
        h, m = (int(x) for x in time_str.split(":"))
    except Exception:
        h, m = 2, 0
    now = datetime.now(timezone.utc)
    candidate = now.replace(hour=h, minute=m, second=0, microsecond=0)
    while candidate <= now:
        candidate += timedelta(seconds=interval)
    return candidate


async def _scheduler_loop() -> None:
    global _next_sync_at
    while True:
        cfg = load_config()
        _next_sync_at = _compute_next_sync(cfg)
        if _next_sync_at is None:
            await asyncio.sleep(3600)
            continue
        wait_s = (_next_sync_at - datetime.now(timezone.utc)).total_seconds()
        if wait_s > 0:
            logger.info(
                "Next scheduled sync: %s UTC (in %.0fh)",
                _next_sync_at.strftime("%Y-%m-%d %H:%M"), wait_s / 3600,
            )
            await asyncio.sleep(max(wait_s, 0))
        logger.info("Scheduler: running sync for all configured projects")
        await run_sync()
        await asyncio.sleep(60)  # brief pause before recomputing next slot


# ── FastAPI app ───────────────────────────────────────────────────────────────

try:
    import uvicorn
    from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
    from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
    from pydantic import BaseModel
except ImportError as e:
    print(f"Missing dependency: {e}\nInstall: pip install fastapi uvicorn")
    sys.exit(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler_task
    _scheduler_task = asyncio.create_task(_scheduler_loop())
    logger.info("Background scheduler started")
    yield
    _scheduler_task.cancel()
    try:
        await _scheduler_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Jama Cache Server", docs_url=None, redoc_url=None, lifespan=lifespan)


# ── auth dependency ───────────────────────────────────────────────────────────

def _get_token(request: Request) -> Optional[str]:
    return request.cookies.get("admin_token")


def _require_auth(request: Request) -> None:
    token = _get_token(request)
    if not _session_valid(token):
        raise HTTPException(401, "Not authenticated")


# ── Pydantic models ───────────────────────────────────────────────────────────

class LoginBody(BaseModel):
    password: str

class SetupBody(BaseModel):
    password: str

class AddProjectBody(BaseModel):
    project_id: int

class RemoveProjectBody(BaseModel):
    project_id: int

class ScheduleBody(BaseModel):
    schedule: str
    schedule_time: str = "02:00"

class PasswordBody(BaseModel):
    current: str
    new_password: str

class SyncBody(BaseModel):
    project_ids: Optional[list[int]] = None

# ── .env helpers ─────────────────────────────────────────────────────────────

def _read_env() -> dict[str, str]:
    """Parse the .env file into a key→value dict."""
    result: dict[str, str] = {}
    if not _ENV_FILE.exists():
        return result
    for line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        result[key.strip()] = val.strip().strip('"').strip("'")
    return result


def _write_env_key(key: str, value: str) -> None:
    """Update or insert a single key in the .env file, preserving all comments and ordering."""
    if not _ENV_FILE.exists():
        _ENV_FILE.write_text(f"{key}={value}\n", encoding="utf-8")
        return
    lines = _ENV_FILE.read_text(encoding="utf-8").splitlines(keepends=True)
    found = False
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(f"{key}=") or stripped.startswith(f"{key} ="):
            new_lines.append(f"{key}={value}\n")
            found = True
        else:
            new_lines.append(line)
    if not found:
        new_lines.append(f"{key}={value}\n")
    _ENV_FILE.write_text("".join(new_lines), encoding="utf-8")
    logger.info(".env updated: %s=%s", key, "***" if "SECRET" in key or "COOKIE" in key else value)


# ── browser image sync helpers ───────────────────────────────────────────────

# Matches browser-pasted attachment URLs: /attachment/{id}/{filename}
_WEB_IMG_RE = re.compile(r'/attachment/(\d+)/([^"\'<>\s\\]+)')
_upload_tokens: dict[str, datetime] = {}   # token -> expiry (30 min)
UPLOAD_TOKEN_TTL = timedelta(minutes=30)


def _scan_project_for_images(project_id: int) -> list[dict]:
    """Scan the project data_only DB for web-pasted attachment URLs.

    Returns list of {att_id, fname} dicts — deduplicated by attachment ID.
    """
    db_gz = _DATA_DIR / "projects" / f"{project_id}.db.gz"
    if not db_gz.exists():
        return []

    tmp = Path(tempfile.mktemp(suffix=".db"))
    try:
        with gzip.open(db_gz, "rb") as gz_in, open(tmp, "wb") as f_out:
            shutil.copyfileobj(gz_in, f_out)

        seen: dict[int, str] = {}
        conn = sqlite3.connect(str(tmp))
        try:
            for col in ("description", "fields_json"):
                try:
                    for (text,) in conn.execute(
                        f"SELECT {col} FROM items WHERE {col} IS NOT NULL AND {col} != ''"
                    ):
                        for m in _WEB_IMG_RE.finditer(text or ""):
                            att_id = int(m.group(1))
                            if att_id not in seen:
                                seen[att_id] = m.group(2)
                except sqlite3.OperationalError:
                    pass  # column might not exist in older schemas
        finally:
            conn.close()
        return [{"att_id": att_id, "fname": fname} for att_id, fname in seen.items()]
    finally:
        tmp.unlink(missing_ok=True)


def _store_images_in_db(project_id: int, images: list[dict]) -> int:
    """Insert browser-fetched image blobs into the _with_images.db.gz file.

    Falls back to data_only DB if _with_images does not exist yet.
    Returns the number of images stored.
    """
    with_gz = _DATA_DIR / "projects" / f"{project_id}_with_images.db.gz"
    data_gz = _DATA_DIR / "projects" / f"{project_id}.db.gz"
    src_gz = with_gz if with_gz.exists() else data_gz
    if not src_gz.exists():
        raise FileNotFoundError(f"No DB found for project {project_id} — run a sync first")

    tmp = Path(tempfile.mktemp(suffix=".db"))
    try:
        with gzip.open(src_gz, "rb") as gz_in, open(tmp, "wb") as f_out:
            shutil.copyfileobj(gz_in, f_out)

        conn = sqlite3.connect(str(tmp))
        count = 0
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS images (
                    attachment_id INTEGER PRIMARY KEY,
                    file_name     TEXT    NOT NULL DEFAULT '',
                    mime_type     TEXT    NOT NULL DEFAULT 'image/png',
                    data          BLOB    NOT NULL,
                    size_bytes    INTEGER NOT NULL DEFAULT 0,
                    cached_at     REAL    NOT NULL DEFAULT 0
                )
            """)
            for img in images:
                raw = base64.b64decode(img["data_b64"])
                conn.execute(
                    """INSERT INTO images(attachment_id,file_name,mime_type,data,size_bytes,cached_at)
                       VALUES(?,?,?,?,?,?)
                       ON CONFLICT(attachment_id) DO UPDATE SET
                         mime_type=excluded.mime_type, data=excluded.data,
                         size_bytes=excluded.size_bytes, cached_at=excluded.cached_at""",
                    (
                        int(img["att_id"]),
                        img.get("fname", "image.png"),
                        img.get("mime", "image/png"),
                        raw, len(raw), time.time(),
                    ),
                )
                count += 1
            conn.commit()
        finally:
            conn.close()

        # Recompress as _with_images.db.gz
        with open(tmp, "rb") as f_in, gzip.open(with_gz, "wb", compresslevel=6) as f_out:
            shutil.copyfileobj(f_in, f_out)
        return count
    finally:
        tmp.unlink(missing_ok=True)


def _make_upload_token() -> str:
    token = secrets.token_hex(20)
    _upload_tokens[token] = datetime.now(timezone.utc) + UPLOAD_TOKEN_TTL
    return token


def _validate_upload_token(token: str) -> bool:
    exp = _upload_tokens.get(token)
    if not exp:
        return False
    if datetime.now(timezone.utc) > exp:
        _upload_tokens.pop(token, None)
        return False
    return True


def _generate_browser_script(
    project_id: int,
    images: list[dict],
    server_url: str,
    token: str,
    jama_url: str,
) -> str:
    images_json = json.dumps(images)
    n = len(images)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return f"""// Jama Browser Image Sync — {n} image(s) for project {project_id}
// Generated: {ts}  |  Token expires in 30 minutes
// Paste into DevTools console on {jama_url} (must be logged in)
(async () => {{
  const SERVER     = '{server_url}';
  const TOKEN      = '{token}';
  const PID        = {project_id};
  const IMGS       = {images_json};

  // ── tuning knobs ──────────────────────────────────────────────────
  const DELAY_MS   = 300;   // ms between every request  (raise if still blocked)
  const JITTER_MS  = 150;   // random extra delay per request (smooths bursts)
  const BATCH_SZ   = 40;    // images per upload batch
  const MAX_RETRY  = 4;     // retries on 429 / 5xx
  const RETRY_BASE = 3000;  // ms for first retry backoff (doubles each attempt)
  // ─────────────────────────────────────────────────────────────────

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const style = (bg, fg='#fff') =>
    `background:${{bg}};color:${{fg}};padding:2px 6px;border-radius:3px;font-weight:bold`;

  console.log('%c Jama Image Sync ', style('#0066cc'),
    `${{IMGS.length}} image(s) — ${{DELAY_MS}}ms delay — batch size ${{BATCH_SZ}}`);

  // Fetch one URL with retry on 429 / 5xx
  async function fetchImg(url) {{
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {{
      let r;
      try {{ r = await fetch(url); }} catch(e) {{
        if (attempt === MAX_RETRY) throw e;
        await sleep(RETRY_BASE * attempt);
        continue;
      }}
      if (r.status === 429 || r.status >= 500) {{
        const wait = RETRY_BASE * attempt;
        console.warn(`  [${{r.status}}] Backing off ${{wait/1000}}s — ${{url.split('/').pop()}}`);
        await sleep(wait);
        if (attempt === MAX_RETRY) return r;
        continue;
      }}
      return r;
    }}
  }}

  const results = []; let ok = 0, fail = 0, skip = 0;

  for (let i = 0; i < IMGS.length; i++) {{
    const {{att_id, fname}} = IMGS[i];
    const url = `/attachment/${{att_id}}/${{fname}}`;
    try {{
      const r = await fetchImg(url);
      if (r.status === 403 || r.status === 404) {{ skip++; }}
      else if (!r.ok) {{ console.warn(`  HTTP ${{r.status}} — ${{fname}}`); fail++; }}
      else {{
        const blob = await r.blob();
        const b64  = await new Promise(res => {{
          const fr = new FileReader();
          fr.onload  = () => res(fr.result.split(',')[1]);
          fr.readAsDataURL(blob);
        }});
        results.push({{ att_id, fname, mime: blob.type || 'image/png', data_b64: b64 }});
        ok++;
      }}
    }} catch(e) {{ console.error(`  Error ${{fname}}:`, e.message); fail++; }}

    if ((i + 1) % 20 === 0 || i === IMGS.length - 1)
      console.log(`  ${{i+1}}/${{IMGS.length}} — ok:${{ok}} skip:${{skip}} fail:${{fail}}`);

    // Polite delay (skip after last item)
    if (i < IMGS.length - 1)
      await sleep(DELAY_MS + Math.random() * JITTER_MS);
  }}

  console.log(`Fetch done: ${{ok}} fetched, ${{skip}} not found, ${{fail}} failed.`);
  if (!results.length) {{ console.warn('Nothing to upload.'); return; }}

  // Upload in batches so the payload stays manageable
  const batches = [];
  for (let i = 0; i < results.length; i += BATCH_SZ)
    batches.push(results.slice(i, i + BATCH_SZ));

  console.log(`Uploading ${{results.length}} image(s) in ${{batches.length}} batch(es)...`);
  let stored = 0;
  for (let bi = 0; bi < batches.length; bi++) {{
    try {{
      const r = await fetch(`${{SERVER}}/admin/image-sync/upload?token=${{TOKEN}}`, {{
        method: 'POST',
        headers: {{'Content-Type': 'application/json'}},
        body: JSON.stringify({{ project_id: PID, images: batches[bi] }})
      }});
      if (!r.ok) {{
        const e = await r.json().catch(() => ({{detail: r.statusText}}));
        throw new Error(e.detail || r.statusText);
      }}
      const d = await r.json();
      stored += d.stored || 0;
      console.log(`  Batch ${{bi+1}}/${{batches.length}}: ${{d.stored}} stored`);
    }} catch(e) {{ console.error(`  Batch ${{bi+1}} failed:`, e.message); }}
  }}

  console.log('%c Done ', style('#1a7f37'),
    `${{stored}} / ${{results.length}} image(s) stored for project ${{PID}}`);
}})();
"""


# ── admin API ─────────────────────────────────────────────────────────────────

@app.get("/admin/auth-check")
def auth_check(request: Request):
    cfg = load_config()
    first_run = not cfg.get("admin_password_hash")
    token = _get_token(request)
    authenticated = _session_valid(token)
    return JSONResponse({"authenticated": authenticated, "first_run": first_run})


@app.post("/admin/setup")
def admin_setup(body: SetupBody, response: Response):
    cfg = load_config()
    if cfg.get("admin_password_hash"):
        raise HTTPException(400, "Password already set — use /admin/password to change it")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    cfg["admin_password_hash"] = _hash_pw(body.password)
    save_config(cfg)
    token = _new_session()
    response.set_cookie("admin_token", token, httponly=True, samesite="lax", max_age=28800)
    return {"ok": True, "message": "Admin password set"}


@app.post("/admin/login")
def admin_login(body: LoginBody, response: Response):
    cfg = load_config()
    if not cfg.get("admin_password_hash"):
        raise HTTPException(400, "No password set — complete first-time setup first")
    if not _verify_pw(body.password, cfg["admin_password_hash"]):
        raise HTTPException(403, "Incorrect password")
    token = _new_session()
    response.set_cookie("admin_token", token, httponly=True, samesite="lax", max_age=28800)
    return {"ok": True}


@app.post("/admin/logout")
def admin_logout(request: Request, response: Response):
    token = _get_token(request)
    _sessions.pop(token, None)
    response.delete_cookie("admin_token")
    return {"ok": True}


@app.get("/admin/config")
def admin_config(request: Request, _: None = Depends(_require_auth)):
    cfg = load_config()
    # Merge config project IDs with index.json data
    index_path = _DATA_DIR / "index.json"
    index_projects: dict[str, Any] = {}
    if index_path.exists():
        try:
            index_projects = json.loads(index_path.read_text(encoding="utf-8")).get("projects", {})
        except Exception:
            pass
    projects_out = []
    for pid in cfg.get("projects", []):
        p_data = index_projects.get(str(pid), {})
        projects_out.append({
            "id": pid,
            "name": p_data.get("name", f"Project {pid}"),
            "item_count": p_data.get("item_count"),
            "last_sync": p_data.get("last_sync"),
            "variants": p_data.get("variants", {}),
            "synced": bool(p_data),
        })
    return {
        "projects": projects_out,
        "schedule": cfg.get("schedule", "biweekly"),
        "schedule_time": cfg.get("schedule_time", "02:00"),
        "schedule_label": SCHEDULE_LABELS.get(cfg.get("schedule", "biweekly"), ""),
        "next_sync": _next_sync_at.isoformat() if _next_sync_at else None,
    }


@app.post("/admin/projects/add")
async def add_project(body: AddProjectBody, _: None = Depends(_require_auth)):
    cfg = load_config()
    pids: list[int] = cfg.get("projects", [])
    is_new = body.project_id not in pids
    if is_new:
        pids.append(body.project_id)
        cfg["projects"] = pids
        save_config(cfg)
    if not _sync_running:
        asyncio.create_task(run_sync([body.project_id]))
        syncing = True
    else:
        syncing = False
    return {
        "ok": True,
        "added": is_new,
        "syncing": syncing,
        "message": (
            f"Project {body.project_id} {'added and ' if is_new else ''}syncing in background"
            if syncing else
            f"Project {body.project_id} {'added' if is_new else 'already present'} — sync already running"
        ),
    }


@app.post("/admin/projects/remove")
def remove_project(body: RemoveProjectBody, _: None = Depends(_require_auth)):
    cfg = load_config()
    pids: list[int] = cfg.get("projects", [])
    if body.project_id not in pids:
        raise HTTPException(404, f"Project {body.project_id} is not in the configured list")
    pids.remove(body.project_id)
    cfg["projects"] = pids
    save_config(cfg)
    # Delete .db.gz files
    deleted: list[str] = []
    for suffix in ("", "_with_images"):
        p = _DATA_DIR / "projects" / f"{body.project_id}{suffix}.db.gz"
        if p.exists():
            p.unlink()
            deleted.append(p.name)
    # Remove from index.json
    index_path = _DATA_DIR / "index.json"
    if index_path.exists():
        try:
            idx = json.loads(index_path.read_text(encoding="utf-8"))
            idx.get("projects", {}).pop(str(body.project_id), None)
            index_path.write_text(json.dumps(idx, indent=2), encoding="utf-8")
        except Exception as e:
            logger.warning("Could not update index.json: %s", e)
    return {"ok": True, "deleted_files": deleted, "message": f"Project {body.project_id} removed"}


@app.post("/admin/sync/all")
async def sync_all(_: None = Depends(_require_auth)):
    if _sync_running:
        raise HTTPException(409, "A sync is already running — wait for it to finish")
    asyncio.create_task(run_sync())
    return {"ok": True, "message": "Full sync started in background"}


@app.post("/admin/sync/{project_id}")
async def sync_one(project_id: int, _: None = Depends(_require_auth)):
    if _sync_running:
        raise HTTPException(409, "A sync is already running — wait for it to finish")
    asyncio.create_task(run_sync([project_id]))
    return {"ok": True, "message": f"Sync started for project {project_id}"}


@app.get("/admin/sync/running")
def sync_running_status():
    return {"running": _sync_running}


@app.get("/admin/sync/stream")
async def sync_log_stream(request: Request):
    """SSE endpoint — streams live sync log output to the browser."""
    token = _get_token(request)
    if not _session_valid(token):
        raise HTTPException(401, "Not authenticated")

    async def generator() -> AsyncGenerator[str, None]:
        q: asyncio.Queue = asyncio.Queue(maxsize=300)
        _sync_subscribers.add(q)
        try:
            # Replay buffered log
            for line in list(_sync_log):
                yield f"data: {json.dumps({'type': 'log', 'text': line})}\n\n"
            if not _sync_running:
                yield f"data: {json.dumps({'type': 'idle'})}\n\n"
                return
            # Stream live until done
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=20)
                    yield f"data: {json.dumps(msg)}\n\n"
                    if msg.get("type") == "done":
                        break
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'keepalive'})}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            _sync_subscribers.discard(q)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/admin/schedule")
def update_schedule(body: ScheduleBody, _: None = Depends(_require_auth)):
    global _next_sync_at
    if body.schedule not in SCHEDULE_SECONDS:
        raise HTTPException(400, f"Invalid schedule '{body.schedule}'. Valid: {list(SCHEDULE_SECONDS)}")
    try:
        h, m = (int(x) for x in body.schedule_time.split(":"))
        assert 0 <= h < 24 and 0 <= m < 60
    except Exception:
        raise HTTPException(400, "Invalid schedule_time — use HH:MM (e.g. '02:00')")
    cfg = load_config()
    cfg["schedule"] = body.schedule
    cfg["schedule_time"] = body.schedule_time
    save_config(cfg)
    _next_sync_at = _compute_next_sync(cfg)
    return {
        "ok": True,
        "schedule": body.schedule,
        "label": SCHEDULE_LABELS[body.schedule],
        "next_sync": _next_sync_at.isoformat() if _next_sync_at else None,
    }


@app.get("/admin/schedule/next")
def next_sync_info(_: None = Depends(_require_auth)):
    cfg = load_config()
    return {
        "schedule": cfg.get("schedule", "biweekly"),
        "label": SCHEDULE_LABELS.get(cfg.get("schedule", "biweekly"), ""),
        "schedule_time": cfg.get("schedule_time", "02:00"),
        "next_sync": _next_sync_at.isoformat() if _next_sync_at else None,
    }


@app.post("/admin/password")
def change_password(body: PasswordBody, request: Request, response: Response, _: None = Depends(_require_auth)):
    cfg = load_config()
    if not _verify_pw(body.current, cfg.get("admin_password_hash", "")):
        raise HTTPException(403, "Current password is incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    cfg["admin_password_hash"] = _hash_pw(body.new_password)
    save_config(cfg)
    _sessions.clear()                           # invalidate all sessions
    response.delete_cookie("admin_token")
    return {"ok": True, "message": "Password changed — please log in again"}


# ── browser image sync endpoints ─────────────────────────────────────────────

def _cors_headers() -> dict[str, str]:
    """CORS headers that allow any origin for the token-protected upload endpoint.

    Since auth is via a short-lived single-use token (not a session cookie) we
    can safely allow * here — the token is required in every request.
    """
    return {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }


@app.options("/admin/image-sync/upload")
async def options_image_upload():
    """CORS preflight for cross-origin uploads from the Jama browser console."""
    from fastapi.responses import Response as _Resp
    return _Resp(status_code=204, headers=_cors_headers())


@app.get("/admin/image-sync/script")
def get_image_sync_script(
    project_id: int,
    request: Request,
    _: None = Depends(_require_auth),
):
    """Generate a browser console script for the given project.

    Scans the project DB for web-pasted attachment URLs, issues a 30-minute
    upload token, and returns a ready-to-paste JavaScript snippet.
    """
    images = _scan_project_for_images(project_id)
    if not images:
        raise HTTPException(
            404,
            f"No web-pasted images found in project {project_id}. "
            "They may not exist, or the DB hasn't been synced yet.",
        )

    token = _make_upload_token()
    env = _read_env()
    jama_url = env.get("JAMA_URL", "https://enphase.jamacloud.com").rstrip("/")

    # Use the Host header so the script points at the right server address
    host = request.headers.get("host", "localhost:8866")
    server_url = f"http://{host}"

    script = _generate_browser_script(project_id, images, server_url, token, jama_url)
    logger.info(
        "Image-sync script generated for project %d: %d URLs, token expires %s",
        project_id, len(images),
        (_upload_tokens[token]).strftime("%H:%M UTC"),
    )
    from fastapi.responses import Response as _Resp
    return _Resp(content=script, media_type="text/plain")


@app.post("/admin/image-sync/upload")
async def upload_browser_images(request: Request, token: str = ""):
    """Receive base64-encoded images from the browser console script.

    Auth is via a short-lived upload token (not the admin session cookie) so
    this endpoint works cross-origin from the Jama page without exposing cookies.
    Token is single-use — regenerate the script for each upload session.
    """
    if not _validate_upload_token(token):
        raise HTTPException(
            401,
            "Invalid or expired upload token. "
            "Click 'Generate Script' again in the admin panel.",
            headers=_cors_headers(),
        )

    body = await request.json()
    project_id = body.get("project_id")
    images: list[dict] = body.get("images", [])

    if not project_id:
        raise HTTPException(400, "project_id required", headers=_cors_headers())
    if not images:
        return JSONResponse(
            {"ok": True, "stored": 0, "message": "No images in payload — nothing stored"},
            headers=_cors_headers(),
        )

    # Token is multi-use within its TTL to support batched uploads.
    # It expires naturally after 30 minutes via _validate_upload_token.

    try:
        count = _store_images_in_db(int(project_id), images)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e), headers=_cors_headers())
    except Exception as e:
        logger.error("Image upload error for project %s: %s", project_id, e, exc_info=True)
        raise HTTPException(500, str(e), headers=_cors_headers())

    logger.info("Stored %d browser images for project %d", count, project_id)
    return JSONResponse(
        {
            "ok": True,
            "stored": count,
            "message": f"Stored {count} image(s) in project {project_id} — with_images DB updated",
        },
        headers=_cors_headers(),
    )


# ── static file serving ───────────────────────────────────────────────────────

@app.get("/")
@app.get("/index.html")
def serve_index():
    p = _DATA_DIR / "index.html"
    if p.exists():
        return FileResponse(str(p), media_type="text/html")
    return JSONResponse(
        {"error": "index.html not found — run generate_caches.py first"},
        status_code=503,
    )


@app.get("/{path:path}")
def serve_static(path: str):
    try:
        target = (_DATA_DIR / path).resolve()
        target.relative_to(_DATA_DIR.resolve())
    except (ValueError, RuntimeError):
        raise HTTPException(403, "Forbidden")
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "Not found")
    return FileResponse(str(target))


# ── entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    global _DATA_DIR, _ENV_FILE, _CONFIG_PATH

    parser = argparse.ArgumentParser(description="Jama Connect LAN Cache Server")
    parser.add_argument("--port", type=int, default=int(os.environ.get("SERVE_PORT", "8866")))
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--data", default=str(_HERE / "data"), help="Data directory to serve")
    parser.add_argument("--env", default=str(_HERE / ".env"), help="Path to .env file")
    parser.add_argument("--config", default=str(_HERE / "server_config.json"), help="Config file path")
    args = parser.parse_args()

    _DATA_DIR = Path(args.data).resolve()
    _ENV_FILE = Path(args.env).resolve()
    _CONFIG_PATH = Path(args.config).resolve()
    _DATA_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("=== Jama Connect Cache Server ===")
    logger.info("Data    : %s", _DATA_DIR)
    logger.info("Env     : %s", _ENV_FILE)
    logger.info("Config  : %s", _CONFIG_PATH)
    logger.info("Serving : http://%s:%d", args.host, args.port)

    cfg = load_config()
    if not cfg.get("admin_password_hash"):
        logger.warning("No admin password — open http://localhost:%d and complete first-time setup", args.port)

    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
