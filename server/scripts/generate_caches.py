#!/usr/bin/env python3
"""Nightly cache generator for the Jama Connect LAN cache server.

Connects to the Jama REST API, syncs all project data to SQLite databases,
optionally fetches inline images using a JSESSIONID cookie, and compresses
everything to .db.gz files served by nginx.

Usage:
    python generate_caches.py [--env .env] [--out ./data] [--projects 20570 20571]

Requirements:
    pip install jama-connect  (from client/backend/)
    OR: add client/backend/src to PYTHONPATH

Environment variables (from .env or shell):
    JAMA_URL            Jama instance URL
    JAMA_CLIENT_ID      OAuth2 client ID
    JAMA_CLIENT_SECRET  OAuth2 client secret
    JAMA_SESSION_COOKIE JSESSIONID cookie (optional, for pasted images)
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


async def fetch_all_images(
    project_id: int, items: list[dict], session_cookie: str, jama_url: str
) -> dict[int, tuple[str, str, bytes]]:
    """Fetch browser-pasted inline images using JSESSIONID cookie.
    
    Returns dict mapping attachment_id -> (filename, mime_type, bytes).
    """
    try:
        import httpx
    except ImportError:
        logger.warning("httpx not available — skipping image fetch")
        return {}

    IMG_RE = re.compile(
        r'https?://[^"\'\s]*?/(?:rest/v1/(?:attachments|files)/(\d+)(?:/file)?'
        r'|attachment/(\d+)/([^"\'\s\\]+))',
    )

    # Collect all unique (att_id, filename) pairs
    web_ids: dict[int, str] = {}  # web attachment ID -> filename
    rest_ids: set[int] = set()    # REST attachment IDs (fetched via API instead)

    for item in items:
        desc = item.get("description", "") or item.get("fields_json", "")
        for m in IMG_RE.finditer(desc):
            if m.group(1):
                rest_ids.add(int(m.group(1)))
            elif m.group(2):
                att_id = int(m.group(2))
                fname = m.group(3) or "image.png"
                if att_id not in web_ids:
                    web_ids[att_id] = fname

    results: dict[int, tuple[str, str, bytes]] = {}
    if not web_ids and not rest_ids:
        return results

    logger.info("  Images: %d web-pasted, %d REST-API (project %d)", len(web_ids), len(rest_ids), project_id)

    # Fetch web-pasted images via JSESSIONID
    if web_ids and session_cookie:
        headers = {
            "Cookie": f"JSESSIONID={session_cookie}",
            "Referer": f"{jama_url}/",
        }
        async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=30) as client:
            for att_id, fname in web_ids.items():
                url = f"{jama_url}/attachment/{att_id}/{fname}"
                try:
                    r = await client.get(url)
                    if r.status_code == 200:
                        ct = r.headers.get("content-type", "image/png")
                        if "text/html" not in ct:
                            results[att_id] = (fname, ct, r.content)
                        else:
                            logger.debug("  Web image %d: got HTML — session may be expired", att_id)
                    else:
                        logger.debug("  Web image %d: HTTP %d", att_id, r.status_code)
                except Exception as e:
                    logger.debug("  Web image %d error: %s", att_id, e)

    logger.info(
        "  Fetched %d/%d web images (session %s)",
        len(results), len(web_ids),
        "OK" if session_cookie else "not provided",
    )
    return results


async def generate_project(
    project_id: int,
    out_dir: Path,
    jama_url: str,
    client_id: str,
    client_secret: str,
    session_cookie: str | None,
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

    # --- Pass 2: fetch images and embed in with_images variant ---
    img_db_path = tmp_dir / f"{project_id}_with_images.db"
    shutil.copy2(db_path, img_db_path)

    proj_db2 = ProjectDb(img_db_path, project_id)
    await proj_db2.open()
    try:
        # Get all items for image URL scanning
        all_items = await proj_db2.get_all_items()

        # Fetch REST-API images via OAuth Bearer token (no session needed)
        rest_count = await _fetch_rest_images(proj_db2, all_items, jama_url, client_id, client_secret)

        # Fetch web-pasted images via JSESSIONID (optional)
        web_images = {}
        if session_cookie:
            web_images = await fetch_all_images(project_id, all_items, session_cookie, jama_url)
            for att_id, (fname, mime, data) in web_images.items():
                await proj_db2.upsert_image_blob(att_id, fname, mime, data)

        total_images = rest_count + len(web_images)
        logger.info(
            "  Images: %d REST + %d web-pasted = %d total",
            rest_count, len(web_images), total_images,
        )
    finally:
        await proj_db2.close()

    # Export with_images variant
    with_images_path = projects_dir / f"{project_id}_with_images.db.gz"
    _compress_db(img_db_path, with_images_path)
    with_images_size = with_images_path.stat().st_size
    logger.info("  with_images: %s (%.1f MB)", with_images_path.name, with_images_size / 1024 / 1024)

    # Cleanup temp files (rename-to-trash if Windows locks prevent deletion)
    _remove_db(db_path)
    _remove_db(img_db_path)

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


async def main_async(args: argparse.Namespace) -> None:
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    jama_url = os.environ.get("JAMA_URL", "https://enphase.jamacloud.com").rstrip("/")
    client_id = os.environ.get("JAMA_CLIENT_ID", "")
    client_secret = os.environ.get("JAMA_CLIENT_SECRET", "")
    session_cookie = os.environ.get("JAMA_SESSION_COOKIE", "").strip() or None

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
    if session_cookie:
        logger.info("JSESSIONID provided — will fetch web-pasted images")
    else:
        logger.info("No JSESSIONID — only REST-API images will be embedded")

    project_metas = []
    for pid in project_ids:
        try:
            meta = await generate_project(pid, out_dir, jama_url, client_id, client_secret, session_cookie)
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
