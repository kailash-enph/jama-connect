"""REST routes for local project database management.

GET  /api/db/status                       — list all local project DBs
GET  /api/db/project/{project_id}         — stats for one project DB
DELETE /api/db/project/{project_id}       — delete a project DB
POST /api/db/project/{project_id}/import  — import a .db.gz by file path
"""

from __future__ import annotations

import gzip
import logging
import shutil
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from .deps import get_cache_manager

router = APIRouter(prefix="/api/db", tags=["db-management"])
logger = logging.getLogger(__name__)


@router.get("/status")
async def get_db_status(mgr=Depends(get_cache_manager)) -> list[dict[str, Any]]:
    """Return stats for every project DB that exists on disk."""
    return await mgr.list_local_projects()


@router.get("/project/{project_id}")
async def get_project_db_status(
    project_id: int,
    mgr=Depends(get_cache_manager),
) -> dict[str, Any]:
    """Return stats for a specific project DB."""
    if not await mgr.has_project_db(project_id):
        raise HTTPException(404, f"No local DB for project {project_id}")
    db = await mgr.get_project_db(project_id)
    return await db.get_stats()


@router.delete("/project/{project_id}")
async def delete_project_db(
    project_id: int,
    mgr=Depends(get_cache_manager),
) -> JSONResponse:
    """Delete the local SQLite DB for a project."""
    deleted = await mgr.delete_project_db(project_id)
    if not deleted:
        raise HTTPException(404, f"No local DB for project {project_id}")
    logger.info("REST: deleted ProjectDb for project %d", project_id)
    return JSONResponse({"ok": True, "project_id": project_id})


@router.post("/project/{project_id}/import")
async def import_project_db_gz(
    project_id: int,
    gz_path: str,
    mgr=Depends(get_cache_manager),
) -> JSONResponse:
    """Decompress and import a .db.gz file as the project's local DB.

    Query param `gz_path` should be the local filesystem path to a .db.gz.
    This is used by the VS Code extension when it has already downloaded a
    .db.gz through another channel (e.g. direct drag-and-drop).
    """
    src = Path(gz_path)
    if not src.exists():
        raise HTTPException(404, f"File not found: {gz_path}")
    if not src.suffix == ".gz":
        raise HTTPException(400, "File must be a .db.gz gzip-compressed SQLite database")

    dest = mgr._project_path(project_id)
    dest.parent.mkdir(parents=True, exist_ok=True)

    try:
        tmp = dest.with_suffix(".db.importing")
        with gzip.open(src, "rb") as f_in, open(tmp, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
        tmp.replace(dest)
    except Exception as e:
        logger.error("Import failed: %s", e)
        raise HTTPException(500, f"Failed to decompress: {e}") from e

    # Open the imported DB so it's immediately available
    db = await mgr.get_project_db(project_id)
    stats = await db.get_stats()
    logger.info("REST: imported project %d from %s (%d items)", project_id, gz_path, stats.get("items_count", 0))
    return JSONResponse({"ok": True, "project_id": project_id, "stats": stats})
