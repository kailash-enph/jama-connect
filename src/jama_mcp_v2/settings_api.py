"""Settings API — /settings/* REST endpoints for configuration management.

Provides credential management (OS keyring), session cookie handling,
project selection, server control, and cache management.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from .credential_store import credential_store
from .services import CACHE_DIR, JAMA_URL, services

logger = logging.getLogger("jama-mcp-v2")

settings_router = APIRouter(prefix="/settings", tags=["settings"])

# ---------- Settings data model ----------

SETTINGS_PATH = Path(os.path.expanduser(CACHE_DIR)) / "settings.json"


@dataclass
class BackendSettings:
    jama_url: str = "https://enphase.jamacloud.com"
    active_project_id: int | None = None
    active_project_name: str = ""
    rest_port: int = 8765
    max_concurrent: int = 3
    auto_sync_on_start: bool = False
    theme: str = "system"


def _load_settings() -> BackendSettings:
    if SETTINGS_PATH.exists():
        try:
            data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
            return BackendSettings(**{k: v for k, v in data.items() if k in BackendSettings.__dataclass_fields__})
        except Exception as exc:
            logger.warning("Failed to load settings.json: %s", exc)
    return BackendSettings(jama_url=JAMA_URL)


def _save_settings(s: BackendSettings) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(asdict(s), indent=2), encoding="utf-8")


_settings = _load_settings()


# ============================================================
# Settings CRUD
# ============================================================

@settings_router.get("")
async def get_settings():
    """Return current settings (secrets masked)."""
    return {
        **asdict(_settings),
        "credentials": {
            "configured": credential_store.is_configured or bool(
                os.environ.get("JAMA_CLIENT_ID") and os.environ.get("JAMA_CLIENT_SECRET")
            ),
            "source": credential_store.source,
        },
    }


@settings_router.put("")
async def update_settings(request: Request):
    """Update settings.json."""
    global _settings
    body = await request.json()
    for key in ("jama_url", "active_project_id", "active_project_name",
                "rest_port", "max_concurrent", "auto_sync_on_start", "theme"):
        if key in body:
            setattr(_settings, key, body[key])
    _save_settings(_settings)
    return asdict(_settings)


# ============================================================
# Credentials
# ============================================================

@settings_router.get("/credentials")
async def get_credential_status():
    """Check credential configuration status."""
    cid = credential_store.get_client_id()
    return {
        "configured": credential_store.is_configured or bool(
            os.environ.get("JAMA_CLIENT_ID") and os.environ.get("JAMA_CLIENT_SECRET")
        ),
        "source": credential_store.source,
        "client_id_hint": f"****{cid[-4:]}" if cid and len(cid) >= 4 else None,
        "keyring_available": credential_store.is_available,
    }


@settings_router.post("/credentials")
async def set_credentials(request: Request):
    """Store client_id + client_secret in OS keyring."""
    body = await request.json()
    cid = body.get("client_id", "").strip()
    csec = body.get("client_secret", "").strip()
    if not cid or not csec:
        return JSONResponse(status_code=400, content={"error": "client_id and client_secret are required"})
    try:
        credential_store.set_credentials(cid, csec)
        logger.info("Credentials stored in OS keyring")
        return {"status": "stored", "source": "keyring"}
    except RuntimeError as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


@settings_router.delete("/credentials")
async def clear_credentials():
    """Clear stored credentials from OS keyring."""
    credential_store.clear()
    logger.info("Credentials cleared from OS keyring")
    return {"status": "cleared"}


@settings_router.post("/credentials/test")
async def test_credentials(request: Request):
    """Test credentials against Jama OAuth endpoint."""
    body = await request.json()
    cid = body.get("client_id", "").strip()
    csec = body.get("client_secret", "").strip()

    # If not provided, try current credentials
    if not cid or not csec:
        resolved = credential_store.resolve()
        if not resolved:
            return JSONResponse(status_code=400, content={"error": "No credentials provided or stored"})
        cid, csec = resolved

    import httpx
    jama_url = _settings.jama_url or JAMA_URL
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{jama_url}/rest/oauth/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": cid,
                    "client_secret": csec,
                },
                timeout=15.0,
            )
            if resp.status_code == 200:
                token_data = resp.json()
                return {
                    "status": "success",
                    "message": "Authentication successful",
                    "expires_in": token_data.get("expires_in"),
                }
            else:
                return JSONResponse(
                    status_code=401,
                    content={"status": "failed", "message": f"OAuth error: {resp.status_code} {resp.text[:200]}"},
                )
    except httpx.HTTPError as exc:
        return JSONResponse(
            status_code=502,
            content={"status": "failed", "message": f"Connection error: {exc}"},
        )


# ============================================================
# Session (JSESSIONID)
# ============================================================

@settings_router.get("/session")
async def get_session_status():
    """Get JSESSIONID session status."""
    has = bool(services.session_cookie)
    # Check editor web session if available
    ws = services.web_session
    return {
        "valid": has or (ws is not None and ws.is_authenticated),
        "has_cookie": has,
        "cookie_length": len(services.session_cookie),
        "web_session_authenticated": ws.is_authenticated if ws else False,
    }


@settings_router.post("/session")
async def set_session(request: Request):
    """Set JSESSIONID (replaces /api/session-cookie)."""
    body = await request.json()
    cookie = body.get("cookie", "").strip()
    if not cookie:
        return JSONResponse(status_code=400, content={"error": "cookie is required"})
    # Normalize: accept raw JSESSIONID value or full cookie header
    if "=" not in cookie:
        cookie = f"JSESSIONID={cookie}"
    services.session_cookie = cookie
    logger.info("Session cookie stored via /settings/session (%d chars)", len(cookie))
    return {"status": "stored", "length": len(cookie)}


@settings_router.delete("/session")
async def clear_session():
    """Clear session cookie."""
    services.session_cookie = ""
    if services.web_session:
        services.web_session.clear_session()
    logger.info("Session cleared via /settings/session")
    return {"status": "cleared"}


# ============================================================
# Projects
# ============================================================

@settings_router.get("/projects")
async def list_projects():
    """List available Jama projects."""
    if not services.cache:
        return JSONResponse(status_code=503, content={"error": "Backend not initialized"})
    cached = await services.cache.get_projects()
    if cached:
        return cached
    if services.api_client:
        projects = await services.api_client.get_projects()
        for p in projects:
            await services.cache.upsert_project(p)
        return projects
    return []


@settings_router.post("/project/select")
async def select_project(request: Request):
    """Set active project and optionally trigger sync."""
    global _settings
    body = await request.json()
    pid = body.get("project_id")
    if not pid:
        return JSONResponse(status_code=400, content={"error": "project_id is required"})
    _settings.active_project_id = pid
    _settings.active_project_name = body.get("project_name", "")
    _save_settings(_settings)

    # Optionally trigger sync
    if body.get("sync", False) and services.sync_engine:
        asyncio.create_task(services.sync_engine.sync_project(pid))
        return {"status": "selected_and_syncing", "project_id": pid}
    return {"status": "selected", "project_id": pid}


# ============================================================
# Server control
# ============================================================

@settings_router.post("/server/restart")
async def restart_server():
    """Graceful restart — re-init all services."""
    try:
        await services.shutdown_all()
        await services.init_all()
        # Rebind module-level aliases in server.py
        from . import server as srv
        srv._rebind_module_aliases()
        return {"status": "restarted"}
    except Exception as exc:
        logger.exception("Restart failed")
        return JSONResponse(status_code=500, content={"error": str(exc)})


@settings_router.post("/server/stop")
async def stop_server():
    """Graceful shutdown."""
    logger.info("Shutdown requested via /settings/server/stop")
    await services.shutdown_all()

    # Schedule process exit after response is sent
    async def _delayed_exit():
        await asyncio.sleep(0.5)
        os._exit(0)

    asyncio.create_task(_delayed_exit())
    return {"status": "shutting_down"}


# ============================================================
# Cache
# ============================================================

@settings_router.get("/cache")
async def get_cache_stats():
    """Cache stats + disk usage."""
    if not services.cache:
        return JSONResponse(status_code=503, content={"error": "Cache not initialized"})
    stats = await services.cache.get_stats()
    # Add disk usage
    db_path = Path(services.cache.db_path)
    stats["db_size_bytes"] = db_path.stat().st_size if db_path.exists() else 0
    return stats


@settings_router.post("/cache/clear")
async def clear_cache():
    """Clear cache database."""
    if not services.cache:
        return JSONResponse(status_code=503, content={"error": "Cache not initialized"})
    await services.cache.clear_all()
    logger.info("Cache cleared via /settings/cache/clear")
    return {"status": "cleared"}


# ============================================================
# SSE Status Stream
# ============================================================

@settings_router.get("/status")
async def status_stream():
    """SSE stream: backend health, sync state, session validity."""
    async def _generate() -> AsyncIterator[str]:
        while True:
            data = {
                "backend": "running",
                "uptime_seconds": round(services.uptime_seconds, 1),
                "mcp_initialized": services.is_mcp_initialized,
                "editor_initialized": services.is_editor_initialized,
                "credentials": {
                    "configured": credential_store.is_configured or bool(
                        os.environ.get("JAMA_CLIENT_ID") and os.environ.get("JAMA_CLIENT_SECRET")
                    ),
                    "source": credential_store.source,
                },
                "session": {
                    "valid": bool(services.session_cookie) or (
                        services.web_session is not None and services.web_session.is_authenticated
                    ),
                },
                "active_project": {
                    "id": _settings.active_project_id,
                    "name": _settings.active_project_name,
                } if _settings.active_project_id else None,
                "cache_stats": None,
            }
            # Add cache stats if available
            if services.cache:
                try:
                    stats = await services.cache.get_stats()
                    data["cache_stats"] = stats
                except Exception:
                    pass

            yield f"event: status\ndata: {json.dumps(data)}\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
