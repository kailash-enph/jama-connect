#!/usr/bin/env python3
"""Nightly cache generator for the Jama Connect LAN cache server.

Connects to the Jama REST API, syncs all project data to SQLite databases,
embeds REST-accessible images via OAuth, and compresses everything to .db.gz
files served by nginx.

Browser-pasted inline images (not accessible via OAuth) are synced separately
via the admin panel "Browser Image Sync" feature using a short-lived upload token.

Usage:
    python generate_caches.py [--env .env] [--out ./data] [--projects 20570 20571]

Requirements:
    pip install jama-connect  (from client/backend/)
    OR: add client/backend/src to PYTHONPATH

Environment variables (from .env or shell):
    JAMA_URL            Jama instance URL
    JAMA_CLIENT_ID      OAuth2 client ID
    JAMA_CLIENT_SECRET  OAuth2 client secret
    JAMA_PROJECTS       Comma-separated project IDs (or "all")
    SERVE_DIR           Output directory (default: ./data)
"""

from __future__ import annotations

import argparse
import asyncio
import gzip
import json
import logging
import os
import re
import shutil
import sqlite3
import sys
import time
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(
        # Force UTF-8 on Windows so Unicode arrows/arrows in log messages don't crash
        open(sys.stdout.fileno(), mode="w", encoding="utf-8", buffering=1, closefd=False)
        if hasattr(sys.stdout, "fileno") else sys.stdout
    )],
)
logger = logging.getLogger(__name__)


def load_env(env_path: str) -> None:
    """Load a .env file into os.environ (simple parser, no dependencies)."""
    p = Path(env_path)
    if not p.exists():
        logger.warning(".env file not found at %s — relying on shell environment", env_path)
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val
    logger.info("Loaded env from %s", env_path)


_IMAGES_DDL = """
    CREATE TABLE IF NOT EXISTS images (
        attachment_id INTEGER PRIMARY KEY,
        file_name     TEXT    NOT NULL DEFAULT '',
        mime_type     TEXT    NOT NULL DEFAULT 'image/png',
        data          BLOB    NOT NULL,
        size_bytes    INTEGER NOT NULL DEFAULT 0,
        cached_at     REAL    NOT NULL DEFAULT 0
    )
"""
_IMAGES_UPSERT = """
    INSERT INTO images(attachment_id,file_name,mime_type,data,size_bytes,cached_at)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(attachment_id) DO UPDATE SET
        mime_type=excluded.mime_type, data=excluded.data,
        size_bytes=excluded.size_bytes, cached_at=excluded.cached_at
"""


def _upsert_images(src: Path, dst: Path) -> int:
    """Upsert all rows from src.images into dst.images.  Returns row count."""
    src_conn = sqlite3.connect(str(src))
    dst_conn = sqlite3.connect(str(dst))
    count = 0
    try:
        dst_conn.execute(_IMAGES_DDL)
        try:
            rows = src_conn.execute(
                "SELECT attachment_id, file_name, mime_type, data, size_bytes, cached_at FROM images"
            ).fetchall()
        except sqlite3.OperationalError:
            return 0  # src has no images table
        for row in rows:
            dst_conn.execute(_IMAGES_UPSERT, row)
            count += 1
        dst_conn.commit()
    finally:
        src_conn.close()
        dst_conn.close()
    return count


def _count_images(db_path: Path) -> int:
    """Return the number of rows in the images table (0 if table absent)."""
    conn = sqlite3.connect(str(db_path))
    try:
        try:
            return conn.execute("SELECT COUNT(*) FROM images").fetchone()[0]
        except sqlite3.OperationalError:
            return 0
    finally:
        conn.close()


def _load_images_db(images_gz: Path, tmp_path: Path) -> None:
    """Decompress existing images-only DB into tmp_path, or create a fresh one."""
    if images_gz.exists():
        with gzip.open(images_gz, "rb") as gz_in, open(tmp_path, "wb") as f_out:
            shutil.copyfileobj(gz_in, f_out)
    else:
        conn = sqlite3.connect(str(tmp_path))
        conn.execute(_IMAGES_DDL)
        conn.commit()
        conn.close()


def _migrate_sidecar(project_id: int, images_tmp: Path, out_dir: Path) -> int:
    """One-time migration: copy old browser_images.db sidecar into images_tmp.

    The sidecar ({out_dir}/projects/{id}_browser_images.db) was written by
    the previous sidecar-based approach in cache_server.py.  This function
    merges it into the new cumulative images DB every run (idempotent upsert).
    Returns number of rows migrated.
    """
    sidecar = out_dir / "projects" / f"{project_id}_browser_images.db"
    if not sidecar.exists():
        return 0
    count = _upsert_images(src=sidecar, dst=images_tmp)
    if count:
        logger.info("  Migrated %d image(s) from legacy browser sidecar", count)
    return count


async def generate_project(
    project_id: int,
    out_dir: Path,
    jama_url: str,
    client_id: str,
    client_secret: str,
) -> dict:
    """Generate data_only and (optionally) with_images .db.gz for one project.
    
    Returns a dict of project metadata for index.json.
    """
    from jama_mcp_v2.api_client import JamaApiClient
    from jama_mcp_v2.db.project_db import ProjectDb
    from jama_mcp_v2.db.schema import SCHEMA_VERSION
    from jama_mcp_v2.sync import SyncEngine

    tmp_dir = out_dir / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    projects_dir = out_dir / "projects"
    projects_dir.mkdir(parents=True, exist_ok=True)

    db_path = tmp_dir / f"{project_id}.db"
    _remove_db(db_path)  # remove stale file + WAL sidecars (tolerates Windows locks)

    logger.info("=== Project %d: starting sync ===", project_id)

    # --- Pass 1: sync all Jama structured data via REST API ---
    async with JamaApiClient(jama_url, client_id, client_secret) as api:
        proj_db = ProjectDb(db_path, project_id)
        await proj_db.open()
        try:
            sync = SyncEngine(cache=proj_db, api=api)
            meta = await sync.sync_project(project_id)
        finally:
            await proj_db.close()

    # meta is a SyncProgress (Pydantic model), not a dict
    project_name = meta.project_name or str(project_id)
    item_count = meta.total_items
    logger.info("  Sync complete: %d items, project name: %s", item_count, project_name)
    if meta.errors:
        logger.warning("  Sync finished with %d errors — cache may be incomplete", meta.errors)

    # --- Export data_only variant ---
    data_only_path = projects_dir / f"{project_id}.db.gz"
    _compress_db(db_path, data_only_path)
    data_only_size = data_only_path.stat().st_size
    logger.info("  data_only: %s (%.1f MB)", data_only_path.name, data_only_size / 1024 / 1024)

    # --- Pass 2a: fetch fresh REST images into a temp full DB ---
    with_tmp = tmp_dir / f"{project_id}_with_images.db"
    shutil.copy2(db_path, with_tmp)

    proj_db2 = ProjectDb(with_tmp, project_id)
    await proj_db2.open()
    try:
        all_items = await proj_db2.get_all_items()
        rest_count = await _fetch_rest_images(proj_db2, all_items, jama_url, client_id, client_secret)
        logger.info("  REST images fetched: %d", rest_count)
    finally:
        await proj_db2.close()

    # --- Pass 2b: update the cumulative {id}_images.db.gz (images-only, persistent) ---
    #
    # This file accumulates images across nightly runs:
    #   - REST images: upserted fresh from Jama API each run
    #   - Browser images: written by cache_server.py on each browser sync — never lost
    #
    images_gz = projects_dir / f"{project_id}_images.db.gz"
    images_tmp = tmp_dir / f"{project_id}_images.db"

    # Load existing images DB (preserves browser images) or start fresh
    _load_images_db(images_gz, images_tmp)

    # Upsert fresh REST images into the cumulative images DB
    _upsert_images(src=with_tmp, dst=images_tmp)

    # Migrate legacy browser sidecar if present (idempotent, backward compat)
    _migrate_sidecar(project_id, images_tmp, out_dir)

    # Compress → {id}_images.db.gz  (the single source of truth for all images)
    _compress_db(images_tmp, images_gz)
    images_gz_size = images_gz.stat().st_size
    total_images = _count_images(images_tmp)
    browser_count = max(0, total_images - rest_count)

    logger.info(
        "  images.db.gz: %.1f MB — %d REST + %d browser = %d total",
        images_gz_size / 1024 / 1024, rest_count, browser_count, total_images,
    )

    # --- Pass 2c: generate {id}_with_images.db.gz = data + ALL images ---
    #
    # with_tmp currently has data + REST images.
    # Upsert browser images from images_tmp so the merged DB has everything.
    _upsert_images(src=images_tmp, dst=with_tmp)

    with_images_path = projects_dir / f"{project_id}_with_images.db.gz"
    _compress_db(with_tmp, with_images_path)
    with_images_size = with_images_path.stat().st_size
    logger.info(
        "  with_images.db.gz: %.1f MB (%d total images)", with_images_size / 1024 / 1024, total_images
    )

    # Cleanup temp files
    _remove_db(db_path)
    _remove_db(images_tmp)
    _remove_db(with_tmp)

    return {
        "id": project_id,
        "name": project_name,
        "last_sync": _now_iso(),
        "item_count": item_count,
        "variants": {
            "data_only": {
                "file": f"projects/{project_id}.db.gz",
                "size_bytes": data_only_size,
            },
            "images": {
                "file": f"projects/{project_id}_images.db.gz",
                "size_bytes": images_gz_size,
                "image_count": total_images,
                "rest_image_count": rest_count,
                "browser_image_count": browser_count,
            },
            "with_images": {
                "file": f"projects/{project_id}_with_images.db.gz",
                "size_bytes": with_images_size,
                "image_count": total_images,
            },
        },
    }


async def _fetch_rest_images(
    proj_db: "ProjectDb",
    all_items: list[dict],
    jama_url: str,
    client_id: str,
    client_secret: str,
) -> int:
    """Fetch REST-API-accessible images using OAuth Bearer token."""
    from jama_mcp_v2.api_client import JamaApiClient

    REST_IMG_RE = re.compile(
        r'https?://[^"\'\s]*?/rest/v1/(?:attachments|files)/(\d+)(?:/file)?'
    )

    att_ids: set[int] = set()
    for item in all_items:
        desc = item.get("description", "") or ""
        for m in REST_IMG_RE.finditer(desc):
            att_ids.add(int(m.group(1)))

    if not att_ids:
        return 0

    logger.info("  Fetching %d REST-API images via OAuth...", len(att_ids))
    count = 0

    async with JamaApiClient(jama_url, client_id, client_secret) as api:
        for att_id in att_ids:
            try:
                data = await api.download_attachment(att_id)
                if data:
                    await proj_db.upsert_image_blob(att_id, str(att_id), "image/png", data)
                    count += 1
            except Exception as e:
                logger.debug("  REST image %d: %s", att_id, e)

    return count


def _compress_db(src: Path, dst: Path) -> None:
    """Compress src SQLite file to dst .db.gz."""
    with open(src, "rb") as f_in, gzip.open(dst, "wb", compresslevel=6) as f_out:
        shutil.copyfileobj(f_in, f_out)


def _remove_db(path: Path) -> None:
    """Delete a SQLite file plus WAL sidecars, handling Windows file-lock errors.

    On Windows a locked SQLite file can't be unlinked, but it *can* be renamed —
    so we rename it to a .trash file (still within tmp/) and let the OS clean it
    up when the holding process exits.
    """
    import uuid
    for suffix in ("", "-wal", "-shm"):
        p = Path(str(path) + suffix)
        if not p.exists():
            continue
        try:
            p.unlink()
        except (PermissionError, OSError):
            trash = p.with_name(p.name + f".{uuid.uuid4().hex}.trash")
            try:
                p.rename(trash)
                logger.debug("Renamed locked file to %s", trash.name)
            except Exception as e:
                logger.warning("Could not remove %s: %s", p.name, e)


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


async def generate_master_db(project_metas: list[dict], out_dir: Path) -> int:
    """Generate master.db containing only project list metadata."""
    import aiosqlite

    master_path = out_dir / "tmp" / "master.db"
    master_path.parent.mkdir(parents=True, exist_ok=True)
    master_path.unlink(missing_ok=True)

    async with aiosqlite.connect(master_path) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                item_count INTEGER NOT NULL DEFAULT 0,
                last_sync REAL NOT NULL DEFAULT 0
            )
        """)
        for meta in project_metas:
            await db.execute(
                "INSERT OR REPLACE INTO projects(id, name, item_count, last_sync) VALUES (?, ?, ?, ?)",
                (meta["id"], meta["name"], meta["item_count"], time.time())
            )
        await db.commit()

    master_gz = out_dir / "master.db.gz"
    _compress_db(master_path, master_gz)
    size = master_gz.stat().st_size
    master_path.unlink(missing_ok=True)
    return size


def _write_index_html(out_dir: Path) -> None:
    """Write a self-contained HTML dashboard to out_dir/index.html.

    Public view: live stats, projects table, master DB info (fetches index.json).
    Admin panel (requires cache_server.py): project CRUD, schedule management,
    live sync log via SSE, password change.  Falls back gracefully when served
    by a plain static server (admin button is hidden on 404).
    """
    html = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Jama Connect Cache Server</title>
<style>
  :root {
    --blue:#0066cc; --blue-light:#e8f0fb; --blue-dark:#0052a3;
    --green:#1a7f37; --amber:#b45309; --red:#cf222e; --gray:#57606a;
    --border:#d0d7de; --bg:#f6f8fa; --card:#ffffff;
    --radius:8px; --shadow:0 1px 4px rgba(0,0,0,.1);
  }
  /* ── Dark mode — applied via JS (class on <html>) so user can toggle ── */
  html.dark {
    --blue:#4a9eff; --blue-light:#1a2d4a; --blue-dark:#5aaeff;
    --green:#3fb950; --amber:#e3b341; --red:#f85149; --gray:#8b949e;
    --border:#30363d; --bg:#0d1117; --card:#161b22;
    --shadow:0 1px 4px rgba(0,0,0,.4);
  }
  html.dark body{color:#e6edf3}
  html.dark th{color:#8b949e}
  html.dark tr:hover td{background:#1f2937}
  html.dark .section-div span{color:#e6edf3}
  html.dark .section-div::before{background:linear-gradient(to right,#4a9eff,#30363d)}
  html.dark .section-div::after{background:linear-gradient(to left,#4a9eff,#30363d)}
  html.dark input[type=text],html.dark input[type=number],
  html.dark input[type=password],html.dark input[type=time]{
    background:#0d1117;color:#e6edf3;border-color:#30363d}
  html.dark kbd{background:#21262d!important;border-color:#30363d!important;color:#c9d1d9}
  html.dark .pill-green{background:#0f2a1a}
  html.dark .pill-amber{background:#2e2000}
  html.dark .pill-red{background:#2a0f0f}
  html.dark .pill-blue{background:#1a2d4a}
  html.dark .sched-card{border-color:#30363d}
  html.dark .sched-card:hover,html.dark .sched-card.active{border-color:#4a9eff;background:#1a2d4a}
  html.dark .add-form,html.dark .pw-form{background:#0d1117;border-color:#30363d}
  /* ── Theme toggle widget ── */
  .theme-toggle{display:flex;align-items:center;gap:2px;
    background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:2px}
  .theme-btn{padding:3px 9px;border-radius:4px;border:none;cursor:pointer;
    font-size:.78rem;background:transparent;color:var(--gray);transition:all .15s;
    display:flex;align-items:center;gap:4px;white-space:nowrap}
  .theme-btn.active{background:var(--card);color:var(--blue);
    font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.12)}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
       background:var(--bg);color:#24292f;line-height:1.5;padding:24px}
  header{display:flex;align-items:center;gap:12px;margin-bottom:24px}
  header h1{font-size:1.4rem;font-weight:600;flex:1}
  .badge{background:var(--blue);color:#fff;font-size:.75rem;
         padding:2px 8px;border-radius:12px;font-weight:600}
  .meta{color:var(--gray);font-size:.85rem;margin-bottom:20px;display:flex;justify-content:space-between}
  /* cards */
  .card{background:var(--card);border:1px solid var(--border);
        border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:20px}
  .card-header{padding:14px 20px;border-bottom:1px solid var(--border);
               font-weight:600;font-size:.95rem;display:flex;align-items:center;gap:8px}
  .card-header .hdr-actions{margin-left:auto;display:flex;gap:8px;align-items:center}
  .card-body{padding:20px}
  /* tables */
  table{width:100%;border-collapse:collapse;font-size:.9rem}
  th{background:var(--bg);text-align:left;padding:8px 12px;
     border-bottom:2px solid var(--border);color:var(--gray);
     font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em}
  td{padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:var(--blue-light)}
  .proj-name{font-weight:600}
  .proj-id{color:var(--gray);font-size:.8rem}
  /* pills */
  .pill{display:inline-block;border-radius:12px;font-size:.75rem;padding:2px 8px;font-weight:600}
  .pill-green{background:#dafbe1;color:var(--green)}
  .pill-amber{background:#fff8c5;color:var(--amber)}
  .pill-red{background:#ffebe9;color:var(--red)}
  .pill-blue{background:var(--blue-light);color:var(--blue)}
  /* download links */
  .dl-link{display:inline-flex;align-items:center;gap:4px;color:var(--blue);
           text-decoration:none;font-size:.82rem;border:1px solid var(--blue);
           border-radius:4px;padding:2px 8px;margin-right:6px;white-space:nowrap}
  .dl-link:hover{background:var(--blue-light)}
  .sz{color:var(--gray);font-size:.78rem;display:block;margin-top:1px}
  /* stat grid */
  .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px}
  .stat-box{background:var(--bg);border:1px solid var(--border);
            border-radius:var(--radius);padding:14px 16px}
  .stat-box .val{font-size:1.4rem;font-weight:700;color:var(--blue)}
  .stat-box .lbl{font-size:.8rem;color:var(--gray);margin-top:2px}
  /* spinner */
  .spinner{display:inline-block;width:14px;height:14px;
           border:2px solid var(--border);border-top-color:var(--blue);
           border-radius:50%;animation:spin .6s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  /* buttons */
  .btn{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;
       border-radius:6px;font-size:.85rem;font-weight:500;cursor:pointer;
       border:1px solid transparent;transition:all .15s}
  .btn:disabled{opacity:.5;cursor:default}
  .btn-primary{background:var(--blue);color:#fff;border-color:var(--blue)}
  .btn-primary:hover:not(:disabled){background:var(--blue-dark)}
  .btn-secondary{background:transparent;color:var(--blue);border-color:var(--blue)}
  .btn-secondary:hover:not(:disabled){background:var(--blue-light)}
  .btn-danger{background:transparent;color:var(--red);border-color:var(--red)}
  .btn-danger:hover:not(:disabled){background:#ffebe9}
  .btn-ghost{background:transparent;color:var(--gray);border-color:transparent}
  .btn-ghost:hover{background:var(--bg)}
  .btn-sm{padding:3px 10px;font-size:.8rem}
  /* inputs */
  input[type=text],input[type=number],input[type=password],input[type=time]{
    padding:6px 10px;border:1px solid var(--border);border-radius:6px;
    font-size:.88rem;width:100%;outline:none}
  input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(0,102,204,.15)}
  /* error/info bars */
  .alert{border-radius:var(--radius);padding:10px 14px;font-size:.88rem;margin-bottom:12px}
  .alert-err{background:#ffebe9;border:1px solid #ff8182;color:var(--red)}
  .alert-ok{background:#dafbe1;border:1px solid #4ac26b;color:var(--green)}
  .alert-info{background:var(--blue-light);border:1px solid #84b6f4;color:#0550ae}
  /* modals */
  .backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);
            display:flex;align-items:center;justify-content:center;z-index:100}
  .modal{background:var(--card);border-radius:var(--radius);padding:28px;
         width:100%;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,.22)}
  .modal h3{font-size:1.1rem;font-weight:700;margin-bottom:8px}
  .modal p{color:var(--gray);font-size:.88rem;margin-bottom:16px}
  .modal .field{margin-bottom:12px}
  .modal .field label{display:block;font-size:.82rem;font-weight:600;
                      color:var(--gray);margin-bottom:4px}
  .modal-actions{display:flex;gap:8px;margin-top:16px}
  /* section divider */
  .section-div{display:flex;align-items:center;gap:12px;margin:28px 0 20px}
  .section-div span{font-weight:700;font-size:1rem;white-space:nowrap;color:#24292f}
  .section-div::before,.section-div::after{content:'';flex:1;height:2px;
    background:linear-gradient(to right,var(--blue),var(--border))}
  .section-div::after{background:linear-gradient(to left,var(--blue),var(--border))}
  /* schedule cards */
  .sched-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px}
  .sched-card{border:2px solid var(--border);border-radius:var(--radius);
              padding:12px;cursor:pointer;text-align:center;transition:all .15s;user-select:none}
  .sched-card:hover{border-color:var(--blue);background:var(--blue-light)}
  .sched-card.active{border-color:var(--blue);background:var(--blue-light)}
  .sched-card .sc-name{font-weight:700;font-size:.9rem;margin-bottom:2px}
  .sched-card .sc-desc{font-size:.75rem;color:var(--gray)}
  /* sync log */
  .log-pre{font-family:"Cascadia Code","Consolas","Courier New",monospace;
           font-size:.78rem;line-height:1.5;background:#0d1117;color:#e6edf3;
           padding:14px;border-radius:6px;max-height:320px;overflow-y:auto;
           white-space:pre-wrap;word-break:break-all}
  /* add-form inline */
  .add-form{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;
            padding:14px;background:var(--bg);border-radius:var(--radius);
            border:1px solid var(--border);margin-bottom:12px}
  .add-form .af-field{flex:0 0 180px}
  .add-form .af-field label{display:block;font-size:.8rem;font-weight:600;
                             color:var(--gray);margin-bottom:4px}
  /* action row in table */
  .act{display:flex;gap:6px;flex-wrap:wrap}
  /* pw form */
  .pw-form{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);
           padding:16px;margin-bottom:12px}
  .pw-form .field{margin-bottom:10px}
  .pw-form .field label{display:block;font-size:.8rem;font-weight:600;
                         color:var(--gray);margin-bottom:4px}
  /* pub error */
  #pub-err{display:none;margin-bottom:16px}
</style>
<!-- Inline theme init — runs before paint to prevent flash of wrong theme -->
<script>(function(){
  var t=localStorage.getItem('jama-theme')||'system';
  var dark=(t==='dark')||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
  if(dark) document.documentElement.classList.add('dark');
})();</script>
</head>
<body>

<!-- ═══ HEADER ═══════════════════════════════════════════════════════════ -->
<header>
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0066cc" stroke-width="2">
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M3 5v5c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
    <path d="M3 10v5c0 1.66 4.03 3 9 3s9-1.34 9-3v-5"/>
    <path d="M3 15v4c0 1.66 4.03 3 9 3s9-1.34 9-3v-4"/>
  </svg>
  <h1>Jama Connect Cache Server</h1>
  <span class="badge">LAN</span>
  <div style="margin-left:auto;display:flex;align-items:center;gap:10px">
    <!-- Light / System / Dark toggle -->
    <div class="theme-toggle">
      <button class="theme-btn" id="tb-light"  onclick="setTheme('light')"  title="Light theme">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        Light
      </button>
      <button class="theme-btn" id="tb-system" onclick="setTheme('system')" title="Use system setting">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        System
      </button>
      <button class="theme-btn" id="tb-dark"   onclick="setTheme('dark')"   title="Dark theme">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        Dark
      </button>
    </div>
    <span id="admin-user" style="display:none;font-size:.82rem;color:var(--gray)">Admin</span>
    <button id="admin-btn" class="btn btn-secondary btn-sm" onclick="showLogin()" style="display:none">
      &#128274; Admin
    </button>
  </div>
</header>

<!-- ═══ PUBLIC SECTION ══════════════════════════════════════════════════ -->
<div id="pub-err" class="alert alert-err"></div>
<div class="meta">
  <span id="gen-at">Loading...</span>
  <span id="refresh-ts"></span>
</div>

<div class="card">
  <div class="card-header">
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h11A1.5 1.5 0 0 1 15 3.5v2A1.5 1.5 0 0 1 13.5 7h-11A1.5 1.5 0 0 1 1 5.5v-2Zm0 6A1.5 1.5 0 0 1 2.5 8h11A1.5 1.5 0 0 1 15 9.5v2A1.5 1.5 0 0 1 13.5 13h-11A1.5 1.5 0 0 1 1 11.5v-2Z"/>
    </svg>
    Summary
  </div>
  <div class="card-body">
    <div class="stat-grid">
      <div class="stat-box"><div class="val spinner" id="s-projects"></div><div class="lbl">Projects cached</div></div>
      <div class="stat-box"><div class="val" id="s-items">—</div><div class="lbl">Total items</div></div>
      <div class="stat-box"><div class="val" id="s-size">—</div><div class="lbl">Total data size</div></div>
      <div class="stat-box"><div class="val" id="s-master">—</div><div class="lbl">Master DB</div></div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header">Projects (read-only view)</div>
  <div style="overflow-x:auto">
    <table>
      <thead><tr>
        <th>Project</th><th>Items</th><th>Last Sync</th><th>Status</th><th>Downloads</th>
      </tr></thead>
      <tbody id="pub-proj-tbody">
        <tr><td colspan="5" style="text-align:center;color:var(--gray);padding:24px">
          <span class="spinner"></span> Loading...
        </td></tr>
      </tbody>
    </table>
  </div>
</div>

<div class="card">
  <div class="card-header">Master Database</div>
  <div class="card-body" id="master-info" style="color:var(--gray);font-size:.88rem">Loading...</div>
</div>

<!-- ═══ MODALS ═══════════════════════════════════════════════════════════ -->
<!-- Login modal -->
<div id="login-backdrop" class="backdrop" style="display:none" onclick="closeLogin()">
  <div class="modal" onclick="event.stopPropagation()">
    <h3>&#128274; Admin Login</h3>
    <p>Enter the admin password to manage projects and sync settings.</p>
    <div class="field">
      <label>Password</label>
      <input type="password" id="login-pw" placeholder="Admin password"
             onkeydown="if(event.key==='Enter')doLogin()">
    </div>
    <div id="login-err" class="alert alert-err" style="display:none"></div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="doLogin()">Login</button>
      <button class="btn btn-ghost" onclick="closeLogin()">Cancel</button>
    </div>
  </div>
</div>

<!-- First-run setup modal -->
<div id="setup-backdrop" class="backdrop" style="display:none">
  <div class="modal">
    <h3>&#9989; First-Time Setup</h3>
    <p>Welcome! Set an admin password to manage projects and sync settings.</p>
    <div class="field">
      <label>Choose a password (min 6 characters)</label>
      <input type="password" id="setup-pw" placeholder="New password">
    </div>
    <div class="field">
      <label>Confirm password</label>
      <input type="password" id="setup-pw2" placeholder="Repeat password"
             onkeydown="if(event.key==='Enter')doSetup()">
    </div>
    <div id="setup-err" class="alert alert-err" style="display:none"></div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="doSetup()">Set Password &amp; Continue</button>
    </div>
  </div>
</div>

<!-- ═══ ADMIN PANEL ═══════════════════════════════════════════════════════ -->
<div id="admin-panel" style="display:none">
  <div class="section-div"><span>&#128272; Admin Panel</span></div>

  <!-- Project Management -->
  <div class="card">
    <div class="card-header">
      &#128193; Project Management
      <div class="hdr-actions">
        <button class="btn btn-sm btn-secondary" onclick="doSyncAll()">&#8635; Sync All</button>
        <button class="btn btn-sm btn-primary" onclick="showAddForm()">&#43; Add Project</button>
      </div>
    </div>
    <div class="card-body">
      <!-- Add-project inline form (hidden by default) -->
      <div id="add-form" class="add-form" style="display:none">
        <div class="af-field">
          <label>Jama Project ID</label>
          <input type="number" id="add-pid" placeholder="e.g. 20571"
                 onkeydown="if(event.key==='Enter')doAddProject()">
        </div>
        <button class="btn btn-primary" onclick="doAddProject()">Add &amp; Sync</button>
        <button class="btn btn-ghost" onclick="hideAddForm()">Cancel</button>
      </div>
      <div id="add-result" style="display:none;margin-bottom:10px"></div>
      <div style="overflow-x:auto">
        <table id="admin-proj-table">
          <thead><tr>
            <th>Project</th><th>Items</th><th>Last Sync</th><th>Status</th><th>Schedule</th><th>Actions</th>
          </tr></thead>
          <tbody id="admin-proj-tbody">
            <tr><td colspan="6" style="text-align:center;color:var(--gray);padding:16px">
              <span class="spinner"></span> Loading...
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Sync Log -->
  <div class="card" id="sync-log-card" style="display:none">
    <div class="card-header">
      &#128221; Sync Log
      <div class="hdr-actions">
        <span id="sync-badge"></span>
        <button class="btn btn-sm btn-ghost" onclick="clearLog()">Clear</button>
      </div>
    </div>
    <div class="card-body" style="padding:12px">
      <pre id="sync-log-pre" class="log-pre"></pre>
    </div>
  </div>

  <!-- Browser Image Sync -->
  <div class="card">
    <div class="card-header">
      &#128444; Browser Image Sync
      <div class="hdr-actions">
        <span style="font-size:.78rem;color:var(--green);font-weight:600">&#10003; No credentials stored server-side</span>
        <button class="btn btn-sm btn-secondary" onclick="rebuildDashboard(this)" title="Refresh image counts + regenerate dashboard after a browser sync">
          &#128260; Rebuild Dashboard
        </button>
      </div>
    </div>
    <div class="card-body">

      <!-- Intro row: SSO note + project selector + generate button -->
      <div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px">
        <div style="flex:0 0 220px">
          <label style="display:block;font-size:.8rem;font-weight:600;color:var(--gray);margin-bottom:4px">Project</label>
          <select id="img-pid"
                  style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:.88rem;width:100%">
            <option value="">Select project...</option>
          </select>
        </div>
        <button id="img-gen-btn" class="btn btn-primary" onclick="genImgScript(this)">
          &#128203; Generate &amp; Copy Script
        </button>
      </div>

      <p style="font-size:.82rem;color:var(--gray);margin-bottom:16px">
        Uses your <b>Microsoft SSO session</b> — Jama auto-logs in through your existing
        browser session, no credentials needed. The script only uploads image data,
        never cookies.
      </p>

      <!-- Steps (shown after generate) -->
      <div id="img-steps" style="display:none">

        <!-- Step banners -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
          <div style="border:2px solid var(--green);border-radius:var(--radius);padding:12px;background:#dafbe1">
            <div style="font-size:.75rem;font-weight:700;color:var(--green);margin-bottom:4px">STEP 1 &#10003;</div>
            <div style="font-size:.85rem;font-weight:600">Script copied<br>to clipboard</div>
            <div style="font-size:.75rem;color:var(--green);margin-top:4px">Token: <span id="img-countdown">30:00</span></div>
          </div>
          <div style="border:2px solid var(--blue);border-radius:var(--radius);padding:12px;background:var(--blue-light)">
            <div style="font-size:.75rem;font-weight:700;color:var(--blue);margin-bottom:4px">STEP 2</div>
            <div style="font-size:.85rem;font-weight:600;margin-bottom:8px">Open Jama in browser</div>
            <button class="btn btn-primary btn-sm" onclick="openJama()" style="width:100%">
              &#8599; Open Jama
            </button>
          </div>
          <div style="border:2px solid var(--border);border-radius:var(--radius);padding:12px;background:var(--bg)">
            <div style="font-size:.75rem;font-weight:700;color:var(--gray);margin-bottom:4px">STEP 3</div>
            <div style="font-size:.85rem;color:#24292f">
              Press <kbd style="background:#eee;border:1px solid #ccc;border-radius:3px;padding:1px 5px;font-size:.8rem">F12</kbd>
              &rarr; <b>Console</b><br>
              <kbd style="background:#eee;border:1px solid #ccc;border-radius:3px;padding:1px 5px;font-size:.8rem">Ctrl+V</kbd>
              then
              <kbd style="background:#eee;border:1px solid #ccc;border-radius:3px;padding:1px 5px;font-size:.8rem">Enter</kbd>
            </div>
          </div>
        </div>

        <!-- Script reveal (collapsed by default) -->
        <details style="margin-bottom:8px">
          <summary style="font-size:.82rem;color:var(--gray);cursor:pointer;user-select:none">
            &#128196; Show / copy script manually
          </summary>
          <div style="margin-top:8px">
            <textarea id="img-script-text" readonly class="log-pre"
                      style="width:100%;height:160px;resize:vertical;cursor:text;white-space:pre"></textarea>
            <button class="btn btn-sm btn-secondary" style="margin-top:6px"
                    onclick="copyImgScript(this)">Copy to clipboard</button>
          </div>
        </details>

        <div id="img-upload-ok" class="alert alert-ok" style="display:none;margin-top:8px"></div>

      </div><!-- /img-steps -->

      <div id="img-result" style="display:none;margin-top:8px"></div>
    </div>
  </div>

  <!-- Schedule -->
  <div class="card">
    <div class="card-header">&#9200; Default Auto-Sync Schedule
      <div class="hdr-actions">
        <span style="font-size:.78rem;color:var(--gray)">Fallback for projects without a per-project override</span>
      </div>
    </div>
    <div class="card-body">
      <div class="sched-grid" id="sched-grid">
        <div class="sched-card" data-val="daily" onclick="selectSched('daily')">
          <div class="sc-name">Daily</div>
          <div class="sc-desc">Every 24 h</div>
        </div>
        <div class="sched-card" data-val="biweekly" onclick="selectSched('biweekly')">
          <div class="sc-name">Biweekly</div>
          <div class="sc-desc">Every 3 days</div>
        </div>
        <div class="sched-card" data-val="weekly" onclick="selectSched('weekly')">
          <div class="sc-name">Weekly</div>
          <div class="sc-desc">Every 7 days</div>
        </div>
        <div class="sched-card" data-val="monthly" onclick="selectSched('monthly')">
          <div class="sc-name">Monthly</div>
          <div class="sc-desc">Every 30 days</div>
        </div>
        <div class="sched-card" data-val="never" onclick="selectSched('never')">
          <div class="sc-name">Manual</div>
          <div class="sc-desc">No auto sync</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:12px">
        <label style="font-size:.88rem;color:var(--gray);font-weight:600">
          Sync time (UTC):
          <input type="time" id="sched-time" value="02:00"
                 style="width:auto;margin-left:6px;display:inline-block">
        </label>
        <span id="next-sync-label" style="font-size:.85rem;color:var(--gray)"></span>
      </div>
      <div id="sched-result" style="display:none;margin-bottom:10px"></div>
      <button class="btn btn-primary" onclick="saveSchedule()">Save Schedule</button>
    </div>
  </div>

  <!-- Security -->
  <div class="card">
    <div class="card-header">&#128274; Security</div>
    <div class="card-body">
      <div id="pw-form" class="pw-form" style="display:none">
        <div class="field">
          <label>Current password</label>
          <input type="password" id="curr-pw" placeholder="Current password">
        </div>
        <div class="field">
          <label>New password (min 6 characters)</label>
          <input type="password" id="new-pw" placeholder="New password"
                 onkeydown="if(event.key==='Enter')doChangePw()">
        </div>
        <div id="pw-result" style="display:none;margin-bottom:10px"></div>
        <div class="act">
          <button class="btn btn-primary" onclick="doChangePw()">Update Password</button>
          <button class="btn btn-ghost" onclick="hidePwForm()">Cancel</button>
        </div>
      </div>
      <div class="act">
        <button class="btn btn-secondary" onclick="showPwForm()">Change Password</button>
        <button class="btn btn-danger" onclick="doLogout()">Logout</button>
      </div>
    </div>
  </div>

</div><!-- /admin-panel -->

<script>
// ── utilities ─────────────────────────────────────────────────────────────
function fmtSize(b) {
  if (!b) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso), p = n => String(n).padStart(2,'0');
    return d.toLocaleDateString() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  } catch(_) { return iso; }
}
function agePill(iso) {
  if (!iso) return '<span class="pill pill-amber">Unknown</span>';
  const h = (Date.now() - new Date(iso)) / 3600000;
  if (h < 25) return '<span class="pill pill-green">Fresh</span>';
  if (h < 73) return '<span class="pill pill-amber">Aging (' + Math.round(h) + 'h)</span>';
  return '<span class="pill pill-red">Stale (' + Math.round(h/24) + 'd)</span>';
}
function fmtRelTime(iso) {
  if (!iso) return '';
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return 'any moment';
  const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000);
  if (h > 24) return 'in ' + Math.round(h/24) + ' days';
  if (h) return 'in ' + h + 'h ' + m + 'm';
  return 'in ' + m + 'm';
}
async function api(method, path, body) {
  const opts = { method, headers: {'Content-Type':'application/json'} };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  if (!r.ok) {
    const e = await r.json().catch(() => ({detail: r.statusText}));
    throw new Error(e.detail || r.statusText);
  }
  return r.json();
}
function showAlert(elId, msg, type) {
  const el = document.getElementById(elId);
  el.className = 'alert alert-' + type;
  el.textContent = msg;
  el.style.display = 'block';
}
function hideAlert(elId) { document.getElementById(elId).style.display = 'none'; }

// ── public data ───────────────────────────────────────────────────────────
async function loadPublic() {
  document.getElementById('refresh-ts').textContent = 'Refreshed: ' + new Date().toLocaleTimeString();
  try {
    const r = await fetch('./index.json?_=' + Date.now());
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    hideAlert('pub-err');
    document.getElementById('gen-at').textContent =
      'Generated: ' + fmtDate(d.generated_at) + '  |  Server v' + (d.server_version||'?');
    const projs = Object.values(d.projects || {});
    const totalItems = projs.reduce((s,p) => s+(p.item_count||0), 0);
    const totalBytes = projs.reduce((s,p) => {
      const v = p.variants||{};
      return s + (v.data_only?.size_bytes||0) + (v.images?.size_bytes||0) + (v.with_images?.size_bytes||0);
    }, 0);
    document.getElementById('s-projects').textContent = projs.length;
    document.getElementById('s-projects').className = 'val';
    document.getElementById('s-items').textContent = totalItems.toLocaleString();
    document.getElementById('s-size').textContent = fmtSize(totalBytes);
    document.getElementById('s-master').textContent = fmtSize(d.master_db?.size_bytes);
    // Public projects table
    const tbody = document.getElementById('pub-proj-tbody');
    tbody.innerHTML = projs.length ? projs.map(p => {
      const v = p.variants||{};
      const dlD   = v.data_only   ? `<a class="dl-link" href="${v.data_only.file}" download>&#11123; Data<span class="sz">${fmtSize(v.data_only.size_bytes)}</span></a>` : '';
      const dlImg = v.images      ? `<a class="dl-link" href="${v.images.file}" download>&#11123; Images<span class="sz">${fmtSize(v.images.size_bytes)}${v.images.image_count?' &middot; '+v.images.image_count+' imgs':''}</span></a>` : '';
      const dlAll = v.with_images ? `<a class="dl-link" href="${v.with_images.file}" download>&#11123; +All<span class="sz">${fmtSize(v.with_images.size_bytes)}${v.with_images.image_count?' &middot; '+v.with_images.image_count+' imgs':''}</span></a>` : '';
      return `<tr><td><div class="proj-name">${p.name||'(unnamed)'}</div><div class="proj-id">ID: ${p.id}</div></td><td>${(p.item_count||0).toLocaleString()}</td><td>${fmtDate(p.last_sync)}</td><td>${agePill(p.last_sync)}</td><td>${dlD}${dlImg}${dlAll}</td></tr>`;
    }).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--gray);padding:24px">No projects cached yet</td></tr>';
    // Master DB
    const m = d.master_db||{};
    document.getElementById('master-info').innerHTML =
      `<b>File:</b> <a href="${m.file||'master.db.gz'}">${m.file||'master.db.gz'}</a> &nbsp;
       <b>Size:</b> ${fmtSize(m.size_bytes)} &nbsp; <b>Updated:</b> ${fmtDate(m.updated_at)}`;
  } catch(e) {
    showAlert('pub-err', 'Error loading index.json: ' + e.message, 'err');
  }
}

// ── auth ──────────────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const r = await fetch('/admin/auth-check');
    if (r.status === 404) return; // static server — keep admin-btn hidden
    document.getElementById('admin-btn').style.display = '';
    const d = await r.json();
    if (d.first_run) {
      document.getElementById('setup-backdrop').style.display = 'flex';
    } else if (d.authenticated) {
      onAuthenticated();
    }
  } catch(_) { /* network error — keep admin-btn hidden */ }
}
function showLogin() {
  document.getElementById('login-pw').value = '';
  hideAlert('login-err');
  document.getElementById('login-backdrop').style.display = 'flex';
  setTimeout(() => document.getElementById('login-pw').focus(), 50);
}
function closeLogin() { document.getElementById('login-backdrop').style.display = 'none'; }
async function doLogin() {
  const pw = document.getElementById('login-pw').value;
  if (!pw) return;
  try {
    await api('POST', '/admin/login', {password: pw});
    closeLogin();
    onAuthenticated();
  } catch(e) {
    showAlert('login-err', e.message, 'err');
  }
}
async function doSetup() {
  const pw = document.getElementById('setup-pw').value;
  const pw2 = document.getElementById('setup-pw2').value;
  if (!pw) return;
  if (pw !== pw2) { showAlert('setup-err','Passwords do not match','err'); return; }
  if (pw.length < 6) { showAlert('setup-err','Password must be at least 6 characters','err'); return; }
  try {
    await api('POST', '/admin/setup', {password: pw});
    document.getElementById('setup-backdrop').style.display = 'none';
    onAuthenticated();
  } catch(e) {
    showAlert('setup-err', e.message, 'err');
  }
}
async function doLogout() {
  await api('POST', '/admin/logout').catch(() => {});
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('admin-user').style.display = 'none';
  document.getElementById('admin-btn').textContent = '\uD83D\uDD12 Admin';
  document.getElementById('admin-btn').onclick = showLogin;
}
function onAuthenticated() {
  document.getElementById('admin-btn').style.display = 'none';
  document.getElementById('admin-user').style.display = '';
  document.getElementById('admin-panel').style.display = 'block';
  loadAdminPanel();
}

// ── admin panel ───────────────────────────────────────────────────────────
async function loadAdminPanel() {
  try {
    const d = await api('GET', '/admin/config');
    renderAdminProjects(d.projects);
    updateImgPidDropdown(d.projects);
    setSelectedSched(d.schedule);
    document.getElementById('sched-time').value = d.schedule_time || '02:00';
    const ns = d.next_sync
      ? `Next sync (any project): ${fmtDate(d.next_sync)} (${fmtRelTime(d.next_sync)})`
      : 'No scheduled syncs';
    document.getElementById('next-sync-label').textContent = ns;
  } catch(e) {
    console.error('loadAdminPanel:', e);
  }
}
const SCHED_OPTIONS = [
  {val:'daily',    label:'Daily'},
  {val:'biweekly', label:'Every 3 days'},
  {val:'weekly',   label:'Weekly'},
  {val:'monthly',  label:'Monthly'},
  {val:'never',    label:'Manual only'},
];
function schedOptions(selected) {
  return SCHED_OPTIONS.map(o =>
    `<option value="${o.val}"${o.val===selected?' selected':''}>${o.label}</option>`
  ).join('');
}

function renderAdminProjects(projects) {
  const tbody = document.getElementById('admin-proj-tbody');
  if (!projects || !projects.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray);padding:16px">No projects configured. Add one above.</td></tr>';
    return;
  }
  tbody.innerHTML = projects.map(p => {
    const status = p.synced ? agePill(p.last_sync) : '<span class="pill pill-blue">Not synced</span>';
    const nextLbl = p.next_sync
      ? `<div style="font-size:.72rem;color:var(--gray);margin-top:2px">Next: ${fmtRelTime(p.next_sync)}</div>`
      : '';
    const globalBadge = p.schedule_is_global
      ? `<span style="font-size:.68rem;color:var(--gray);margin-left:4px">(default)</span>`
      : '';
    const schedCell = `
      <div style="display:flex;flex-direction:column;gap:4px;min-width:160px">
        <div style="display:flex;gap:6px;align-items:center">
          <select id="ps-sched-${p.id}"
            style="padding:3px 6px;border:1px solid var(--border);border-radius:4px;font-size:.8rem;flex:1">
            ${schedOptions(p.schedule||'biweekly')}
          </select>
          <input type="time" id="ps-time-${p.id}" value="${p.schedule_time||'02:00'}"
            style="width:90px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;font-size:.8rem">
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <button class="btn btn-sm btn-secondary" style="padding:2px 8px;font-size:.76rem"
            onclick="saveProjectSchedule(${p.id})">Save</button>
          ${globalBadge}
        </div>
        ${nextLbl}
      </div>`;
    return `<tr>
      <td><div class="proj-name">${p.name||'Project '+p.id}</div><div class="proj-id">ID: ${p.id}</div></td>
      <td>${p.item_count!=null ? p.item_count.toLocaleString() : '—'}</td>
      <td>${fmtDate(p.last_sync)}</td>
      <td>${status}</td>
      <td>${schedCell}</td>
      <td><div class="act">
        <button class="btn btn-sm btn-secondary" onclick="doSyncProject(${p.id})">&#8635; Sync</button>
        <button class="btn btn-sm btn-danger" onclick="doRemoveProject(${p.id},'${(p.name||'Project '+p.id).replace(/'/g,"\\'")}')">&#10005; Remove</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ── per-project schedule ──────────────────────────────────────────────────
async function saveProjectSchedule(pid) {
  const sched = document.getElementById(`ps-sched-${pid}`)?.value;
  const time  = document.getElementById(`ps-time-${pid}`)?.value || '02:00';
  if (!sched) return;
  const btn = event.target;
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '...';
  try {
    const d = await api('POST', '/admin/schedule/project', {
      project_id: pid, schedule: sched, schedule_time: time
    });
    btn.textContent = '✓';
    // Refresh the project list so next-sync label and badge update
    setTimeout(async () => {
      btn.disabled = false; btn.textContent = orig;
      const cfg = await api('GET', '/admin/config');
      renderAdminProjects(cfg.projects);
    }, 1000);
  } catch(e) {
    btn.disabled = false; btn.textContent = orig;
    alert('Failed: ' + (e.message || e));
  }
}

// ── project management ────────────────────────────────────────────────────
function showAddForm() {
  document.getElementById('add-form').style.display = 'flex';
  document.getElementById('add-pid').value = '';
  hideAlert('add-result');
  setTimeout(() => document.getElementById('add-pid').focus(), 50);
}
function hideAddForm() {
  document.getElementById('add-form').style.display = 'none';
  hideAlert('add-result');
}
async function doAddProject() {
  const pid = parseInt(document.getElementById('add-pid').value);
  if (!pid || pid <= 0) { showAlert('add-result','Enter a valid project ID','err'); return; }
  try {
    const d = await api('POST', '/admin/projects/add', {project_id: pid});
    showAlert('add-result', d.message, 'ok');
    hideAddForm();
    if (d.syncing) startSyncStream();
    setTimeout(loadAdminPanel, 1000);
  } catch(e) { showAlert('add-result', e.message, 'err'); }
}
async function doRemoveProject(pid, name) {
  if (!confirm(`Remove project "${name}" (ID ${pid}) from sync list?\n\nThis will also delete its .db.gz files from the server.`)) return;
  try {
    const d = await api('POST', '/admin/projects/remove', {project_id: pid});
    loadAdminPanel();
    loadPublic();
  } catch(e) { alert('Error: ' + e.message); }
}
async function doSyncProject(pid) {
  try {
    await api('POST', '/admin/sync/' + pid);
    startSyncStream();
  } catch(e) { alert('Error: ' + e.message); }
}
async function doSyncAll() {
  try {
    await api('POST', '/admin/sync/all');
    startSyncStream();
  } catch(e) { alert('Error: ' + e.message); }
}

// ── sync log SSE ──────────────────────────────────────────────────────────
let _sse = null;
function startSyncStream() {
  if (_sse) { _sse.close(); _sse = null; }
  const card = document.getElementById('sync-log-card');
  const pre = document.getElementById('sync-log-pre');
  const badge = document.getElementById('sync-badge');
  card.style.display = 'block';
  pre.textContent = '';
  badge.innerHTML = '<span class="pill pill-amber">&#9679; Running</span>';
  card.scrollIntoView({behavior:'smooth', block:'nearest'});
  _sse = new EventSource('/admin/sync/stream');
  _sse.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'log') {
      pre.textContent += msg.text + '\n';
      pre.scrollTop = pre.scrollHeight;
    } else if (msg.type === 'done') {
      badge.innerHTML = msg.success
        ? '<span class="pill pill-green">&#10003; Done</span>'
        : '<span class="pill pill-red">&#10007; Failed</span>';
      _sse.close(); _sse = null;
      setTimeout(() => { loadPublic(); loadAdminPanel(); }, 800);
    } else if (msg.type === 'idle') {
      badge.innerHTML = '<span class="pill pill-blue">Idle</span>';
      _sse.close(); _sse = null;
    }
  };
  _sse.onerror = () => {
    badge.innerHTML = '<span class="pill pill-red">Disconnected</span>';
    if (_sse) { _sse.close(); _sse = null; }
  };
}
function clearLog() {
  document.getElementById('sync-log-pre').textContent = '';
  document.getElementById('sync-log-card').style.display = 'none';
}

// ── rebuild dashboard ────────────────────────────────────────────────────
async function rebuildDashboard(btn) {
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Rebuilding…';
  try {
    const d = await api('POST', '/admin/rebuild-index');
    btn.textContent = '✓ Done';
    setTimeout(() => { btn.disabled = false; btn.textContent = orig; }, 2500);
    // Reload the public stats table so the new image counts appear immediately
    await loadStats();
  } catch(e) {
    btn.textContent = '✗ Failed';
    setTimeout(() => { btn.disabled = false; btn.textContent = orig; }, 3000);
    showAlert('img-result', 'Rebuild failed: ' + (e.message || e), 'err');
  }
}

// ── browser image sync ────────────────────────────────────────────────────
let _imgTokenExpiry = null;
let _imgCountdownTimer = null;
let _jamaDomain = 'https://enphase.jamacloud.com';

function updateImgPidDropdown(projects) {
  const sel = document.getElementById('img-pid');
  const curr = sel.value;
  const synced = (projects||[]).filter(p => p.synced);
  sel.innerHTML = '<option value="">Select project...</option>' +
    synced.map(p =>
      `<option value="${p.id}"${p.id==curr?' selected':''}>${p.name||'Project '+p.id} (ID: ${p.id})</option>`
    ).join('');
  // Auto-select if only one project
  if (synced.length === 1 && !curr) sel.value = synced[0].id;
}

async function genImgScript(btn) {
  const pid = document.getElementById('img-pid').value;
  if (!pid) { showAlert('img-result','Select a project first','err'); return; }
  btn.disabled = true; btn.textContent = 'Generating...';
  try {
    const r = await fetch(`/admin/image-sync/script?project_id=${pid}`);
    if (!r.ok) {
      const e = await r.json().catch(()=>({detail:r.statusText}));
      throw new Error(e.detail || r.statusText);
    }
    const script = await r.text();
    // Extract Jama URL from script for "Open Jama" button
    const m = script.match(/Paste into DevTools console on (https?:\/\/[^\s]+)/);
    if (m) _jamaDomain = m[1];

    document.getElementById('img-script-text').value = script;

    // Auto-copy to clipboard
    await navigator.clipboard.writeText(script).catch(() => {
      const ta = document.getElementById('img-script-text');
      ta.select(); document.execCommand('copy');
    });

    // Show steps, start countdown
    document.getElementById('img-steps').style.display = 'block';
    document.getElementById('img-upload-ok').style.display = 'none';
    hideAlert('img-result');
    _imgTokenExpiry = Date.now() + 30 * 60 * 1000;
    _startImgCountdown();

    document.getElementById('img-steps').scrollIntoView({behavior:'smooth',block:'nearest'});
    btn.textContent = '&#10003; Script Copied — Regenerate';
  } catch(e) {
    showAlert('img-result', e.message, 'err');
    btn.textContent = 'Generate & Copy Script';
  }
  btn.disabled = false;
}

function _startImgCountdown() {
  if (_imgCountdownTimer) clearInterval(_imgCountdownTimer);
  _imgCountdownTimer = setInterval(() => {
    const left = Math.max(0, _imgTokenExpiry - Date.now());
    const m = String(Math.floor(left/60000)).padStart(2,'0');
    const s = String(Math.floor((left%60000)/1000)).padStart(2,'0');
    const el = document.getElementById('img-countdown');
    if (el) el.textContent = `${m}:${s}`;
    if (left === 0) { clearInterval(_imgCountdownTimer); _imgCountdownTimer = null; }
  }, 1000);
}

function openJama() {
  window.open(_jamaDomain, '_blank');
}

function copyImgScript(btn) {
  const text = document.getElementById('img-script-text').value;
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy to clipboard', 2000);
  }).catch(() => {
    document.getElementById('img-script-text').select();
    document.execCommand('copy');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy to clipboard', 2000);
  });
}

// ── schedule ──────────────────────────────────────────────────────────────
let _selectedSched = 'biweekly';
function selectSched(val) {
  _selectedSched = val;
  document.querySelectorAll('.sched-card').forEach(c => {
    c.classList.toggle('active', c.dataset.val === val);
  });
}
function setSelectedSched(val) { selectSched(val || 'biweekly'); }
async function saveSchedule() {
  const t = document.getElementById('sched-time').value;
  try {
    const d = await api('POST', '/admin/schedule', {schedule: _selectedSched, schedule_time: t});
    const ns = d.next_sync ? `Next sync: ${fmtDate(d.next_sync)} (${fmtRelTime(d.next_sync)})` : 'No scheduled sync';
    document.getElementById('next-sync-label').textContent = ns;
    showAlert('sched-result', 'Schedule saved: ' + d.label, 'ok');
    setTimeout(() => hideAlert('sched-result'), 3000);
  } catch(e) { showAlert('sched-result', e.message, 'err'); }
}

// ── password change ────────────────────────────────────────────────────────
function showPwForm() {
  document.getElementById('pw-form').style.display = 'block';
  document.getElementById('curr-pw').value = '';
  document.getElementById('new-pw').value = '';
  hideAlert('pw-result');
  setTimeout(() => document.getElementById('curr-pw').focus(), 50);
}
function hidePwForm() {
  document.getElementById('pw-form').style.display = 'none';
  hideAlert('pw-result');
}
async function doChangePw() {
  const curr = document.getElementById('curr-pw').value;
  const nw = document.getElementById('new-pw').value;
  if (!curr || !nw) { showAlert('pw-result','Fill in both fields','err'); return; }
  try {
    const d = await api('POST', '/admin/password', {current: curr, new_password: nw});
    showAlert('pw-result', d.message, 'ok');
    setTimeout(doLogout, 2000);
  } catch(e) { showAlert('pw-result', e.message, 'err'); }
}

// ── theme ─────────────────────────────────────────────────────────────────
const _sysMQ = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(t) {
  const isDark = t === 'dark' || (t === 'system' && _sysMQ.matches);
  document.documentElement.classList.toggle('dark', isDark);
  ['light','system','dark'].forEach(k => {
    const btn = document.getElementById('tb-' + k);
    if (btn) btn.classList.toggle('active', k === t);
  });
}
function setTheme(t) {
  localStorage.setItem('jama-theme', t);
  applyTheme(t);
}
_sysMQ.addEventListener('change', () => {
  const t = localStorage.getItem('jama-theme') || 'system';
  if (t === 'system') applyTheme('system');
});
// Apply saved preference (FOUC already prevented by inline <script> in <head>)
applyTheme(localStorage.getItem('jama-theme') || 'system');

// ── init ──────────────────────────────────────────────────────────────────
loadPublic();
setInterval(loadPublic, 60000);
checkAuth();
</script>
</body>
</html>
"""
    html_path = out_dir / "index.html"
    html_path.write_text(html, encoding="utf-8")


async def main_async(args: argparse.Namespace) -> None:
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    jama_url = os.environ.get("JAMA_URL", "https://enphase.jamacloud.com").rstrip("/")
    client_id = os.environ.get("JAMA_CLIENT_ID", "")
    client_secret = os.environ.get("JAMA_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        logger.error("JAMA_CLIENT_ID and JAMA_CLIENT_SECRET must be set in .env or environment")
        sys.exit(1)

    # Determine which projects to sync
    if args.projects:
        project_ids = [int(p) for p in args.projects]
    else:
        projects_env = os.environ.get("JAMA_PROJECTS", "").strip()
        if projects_env.lower() == "all":
            # Discover all projects from API
            from jama_mcp_v2.api_client import JamaApiClient
            async with JamaApiClient(jama_url, client_id, client_secret) as api:
                projects = await api.get_projects()
                project_ids = [p["id"] for p in projects]
            logger.info("Discovered %d projects from API", len(project_ids))
        else:
            project_ids = [int(p.strip()) for p in projects_env.split(",") if p.strip()]

    if not project_ids:
        logger.error("No projects specified. Set JAMA_PROJECTS in .env or pass --projects")
        sys.exit(1)

    logger.info("Generating caches for %d project(s): %s", len(project_ids), project_ids)
    logger.info("Browser-pasted images synced separately via admin panel Browser Image Sync")

    project_metas = []
    for pid in project_ids:
        try:
            meta = await generate_project(pid, out_dir, jama_url, client_id, client_secret)
            project_metas.append(meta)
        except Exception as e:
            logger.error("Project %d failed: %s", pid, e, exc_info=True)

    # Generate master.db.gz
    master_size = await generate_master_db(project_metas, out_dir)
    logger.info("master.db.gz: %.1f KB", master_size / 1024)

    # Write index.json
    index = {
        "generated_at": _now_iso(),
        "server_version": "1",
        "master_db": {
            "file": "master.db.gz",
            "size_bytes": master_size,
            "updated_at": _now_iso(),
        },
        "projects": {str(m["id"]): m for m in project_metas},
    }
    index_path = out_dir / "index.json"
    index_path.write_text(json.dumps(index, indent=2), encoding="utf-8")
    logger.info("index.json written — %d project(s)", len(project_metas))

    # Write index.html dashboard (fetches index.json dynamically at runtime)
    _write_index_html(out_dir)
    logger.info("index.html written")
    logger.info("=== Cache generation complete ===")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Jama Connect cache databases")
    parser.add_argument("--env", default=".env", help="Path to .env file")
    parser.add_argument("--out", default=os.environ.get("SERVE_DIR", "./data"), help="Output directory")
    parser.add_argument("--projects", nargs="*", type=int, help="Project IDs (overrides JAMA_PROJECTS in .env)")
    args = parser.parse_args()
    load_env(args.env)
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
