"""REST routes for local project database management.

GET  /api/db/status                             — list all local project DBs (+ images DB status)
GET  /api/db/project/{project_id}               — stats for one project DB
DELETE /api/db/project/{project_id}             — delete a project DB (+ its images DB)
POST /api/db/project/{project_id}/import        — import a .db.gz by file path

Images-DB specific (manages the separate {id}_images.db):
GET  /api/db/project/{project_id}/images        — images DB stats (count, size)
DELETE /api/db/project/{project_id}/images      — delete only the images DB
POST /api/db/project/{project_id}/images/import — import a {id}_images.db.gz
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
    """Delete the local SQLite DB for a project (and its images DB if present)."""
    deleted = await mgr.delete_project_db(project_id)
    if not deleted:
        raise HTTPException(404, f"No local DB for project {project_id}")
    # Also delete the separate images DB if it exists
    await mgr.delete_images_db(project_id)
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


# ── Images DB endpoints ────────────────────────────────────────────────────────


@router.get("/project/{project_id}/images")
async def get_images_db_status(
    project_id: int,
    mgr=Depends(get_cache_manager),
) -> dict[str, Any]:
    """Return stats for the separate images DB ({project_id}_images.db)."""
    if not mgr.has_images_db(project_id):
        raise HTTPException(404, f"No images DB for project {project_id}")
    path = mgr._images_path(project_id)
    count = mgr.images_db_count(project_id)
    return {
        "project_id": project_id,
        "path": str(path),
        "size_bytes": path.stat().st_size,
        "image_count": count,
    }


@router.delete("/project/{project_id}/images")
async def delete_images_db(
    project_id: int,
    mgr=Depends(get_cache_manager),
) -> JSONResponse:
    """Delete only the separate images DB (leaves the project data DB intact)."""
    deleted = await mgr.delete_images_db(project_id)
    if not deleted:
        raise HTTPException(404, f"No images DB for project {project_id}")
    logger.info("REST: deleted images DB for project %d", project_id)
    return JSONResponse({"ok": True, "project_id": project_id})


@router.post("/project/{project_id}/images/import")
async def import_images_db_gz(
    project_id: int,
    gz_path: str,
    mgr=Depends(get_cache_manager),
) -> JSONResponse:
    """Decompress and import a {id}_images.db.gz as the project's images DB.

    Query param `gz_path` should be the local filesystem path to a .db.gz.
    This endpoint is used when the images .db.gz has been downloaded through
    another channel (e.g. manual download, drag-and-drop into the VS Code panel).
    """
    src = Path(gz_path)
    if not src.exists():
        raise HTTPException(404, f"File not found: {gz_path}")
    if src.suffix != ".gz":
        raise HTTPException(400, "File must be a .db.gz gzip-compressed SQLite database")

    dest = mgr._images_path(project_id)
    dest.parent.mkdir(parents=True, exist_ok=True)

    try:
        tmp = dest.with_suffix(".db.importing")
        with gzip.open(src, "rb") as f_in, open(tmp, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
        tmp.replace(dest)
    except Exception as e:
        logger.error("Images import failed: %s", e)
        raise HTTPException(500, f"Failed to decompress: {e}") from e

    count = mgr.images_db_count(project_id)
    logger.info("REST: imported images DB for project %d — %d images", project_id, count)
    return JSONResponse({"ok": True, "project_id": project_id, "image_count": count})
