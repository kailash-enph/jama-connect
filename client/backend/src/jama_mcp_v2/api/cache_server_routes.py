"""REST routes for the LAN cache server integration.

GET  /api/cache-server/index                    — fetch index.json from the LAN server
GET  /api/cache-server/ping                     — test connectivity
POST /api/cache-server/url                      — set / update cache server URL
GET  /api/cache-server/download/{project_id}    — SSE stream: download + decompress project DB
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from ..net.cache_server import CacheServerError, download_project_db, fetch_index, ping
from ..sse import SseQueue, sse_response
from .deps import get_cache_manager, get_initialized_svc

router = APIRouter(prefix="/api/cache-server", tags=["cache-server"])
logger = logging.getLogger(__name__)


def _get_url(svc) -> str:
    url = svc.cache_server_url.strip()
    if not url:
        raise HTTPException(400, "No cache server URL configured — set JAMA_CACHE_SERVER_URL or use POST /api/cache-server/url")
    return url


@router.get("/ping")
async def cache_server_ping(svc=Depends(get_initialized_svc)) -> dict[str, Any]:
    """Test connectivity to the configured cache server."""
    url = _get_url(svc)
    result = await ping(url)
    if not result["ok"]:
        raise HTTPException(502, f"Cache server unreachable: {result.get('error')}")
    return result


@router.get("/index")
async def get_cache_index(svc=Depends(get_initialized_svc)) -> dict[str, Any]:
    """Fetch and return the cache server's index.json."""
    url = _get_url(svc)
    try:
        return await fetch_index(url)
    except CacheServerError as e:
        raise HTTPException(502, str(e)) from e


@router.post("/url")
async def set_cache_server_url(
    url: str = Query(..., description="Cache server base URL, e.g. http://192.168.1.50:8866"),
    svc=Depends(get_initialized_svc),
) -> JSONResponse:
    """Update the in-memory cache server URL (persists until restart).

    For permanent persistence, set JAMA_CACHE_SERVER_URL in the environment.
    """
    url = url.rstrip("/")
    svc.cache_server_url = url
    logger.info("Cache server URL set to: %s", url)
    return JSONResponse({"ok": True, "url": url})


@router.get("/download/{project_id}")
async def download_project(
    project_id: int,
    variant: str = Query(
        "data_only",
        description="'data_only' | 'images' | 'with_images'. "
                    "'images' downloads the cumulative images-only DB ({id}_images.db.gz).",
    ),
    svc=Depends(get_initialized_svc),
    mgr=Depends(get_cache_manager),
):
    """SSE stream: download a project .db.gz from the cache server and decompress it.

    Variant routing:
      "data_only"   → {id}.db.gz          → projects/{id}.db
      "images"      → {id}_images.db.gz   → projects/{id}_images.db
      "with_images" → {id}_with_images.db.gz → projects/{id}.db (merged)

    Yields Server-Sent Events:
        data: {"phase": "connecting"}
        data: {"phase": "downloading", "pct": 45, "bytes": 12345, "total": 27000}
        data: {"phase": "decompressing"}
        data: {"phase": "done", "db_path": "..."}
        data: {"phase": "error", "message": "..."}  (only on failure)

    The VS Code extension's DbManagementPanel listens to this stream to show
    a live progress bar.
    """
    if variant not in ("data_only", "images", "with_images"):
        raise HTTPException(400, f"Invalid variant '{variant}'; must be data_only, images, or with_images")

    url = _get_url(svc)
    # Route the download destination based on variant
    dest = mgr._images_path(project_id) if variant == "images" else mgr._project_path(project_id)

    bus = SseQueue()

    async def _download() -> None:
        try:
            async for event in download_project_db(url, project_id, dest, variant=variant):
                bus.put_nowait(event)
                if event.get("phase") in ("done", "error"):
                    break
            if dest.exists():
                if variant == "images":
                    # Images DB downloaded — log count, no ProjectDb needed
                    count = mgr.images_db_count(project_id)
                    logger.info(
                        "Images DB ready for project %d: %d image(s)", project_id, count
                    )
                else:
                    # Data or merged DB — open immediately so it's ready for queries
                    try:
                        await mgr.get_project_db(project_id)
                    except Exception as e:
                        logger.warning("Failed to open newly downloaded DB: %s", e)
        except Exception as e:
            bus.put_nowait({"phase": "error", "message": str(e)})
        finally:
            bus.close()

    asyncio.create_task(_download())
    return sse_response(bus.stream())
