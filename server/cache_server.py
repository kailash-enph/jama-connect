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
import hashlib
import json
import logging
import os
import secrets
import sys
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
