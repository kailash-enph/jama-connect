"""Jama Editor Backend — mountable FastAPI sub-app.

Provides REST endpoints for:
  - Draft management (autosave, list, clear)
  - Undo stack (push, pop, list)
  - Lock/unlock (via Jama API pass-through)
  - Push to Jama (version check + PUT + clear drafts)
  - On-demand schema (item types, fields, pick lists, workflows)
  - Image proxy (SAML web session + REST API fallback)
  - Health check

When running as part of the unified backend, this module is mounted
at /editor/ by server.py. The standalone run_editor() entry point is
kept for backward compatibility.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from jama_mcp_v2.api_client import JamaApiClient
from jama_mcp_v2.services import services, CACHE_DIR as _SVC_CACHE_DIR

from .editor_attachments import AttachmentManager
from .editor_cache import EditorCache
from .saml_session import JamaWebSession
from .schema_sync import SchemaSync

# ---------- Logging ----------

_log_level = os.environ.get("JAMA_LOG_LEVEL", "INFO").upper()
_log_format = "%(asctime)s [%(name)s] %(levelname)s %(message)s"

logging.basicConfig(level=_log_level, format=_log_format, stream=sys.stderr)
logger = logging.getLogger("jama-editor")

# Optional file log for debugging across sessions
_log_dir = os.path.expanduser(os.environ.get("JAMA_CACHE_DIR", "~/.jama-mcp-v2"))
os.makedirs(_log_dir, exist_ok=True)
_file_handler = logging.FileHandler(os.path.join(_log_dir, "editor_server.log"), encoding="utf-8")
_file_handler.setFormatter(logging.Formatter(_log_format))
_file_handler.setLevel(_log_level)
logger.addHandler(_file_handler)

# ---------- Settings from env ----------

JAMA_URL = os.environ.get("JAMA_URL", "https://enphase.jamacloud.com")
CLIENT_ID = os.environ.get("JAMA_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("JAMA_CLIENT_SECRET", "")
CACHE_DIR = os.environ.get("JAMA_CACHE_DIR", "~/.jama-mcp-v2")
EDITOR_PORT = int(os.environ.get("JAMA_EDITOR_PORT", "8766"))
MAX_CONCURRENT = int(os.environ.get("JAMA_MAX_CONCURRENT", "10"))

# ---------- Shared state (delegates to ServiceRegistry) ----------
# Legacy module-level accessors — thin wrappers around the singleton.
# New code should use `services.*` directly.

def _get_api_client() -> JamaApiClient | None:
    return services.api_client

def _get_editor_cache() -> EditorCache | None:
    return services.editor_cache

def _get_schema_sync() -> SchemaSync | None:
    return services.schema_sync

def _get_attachment_mgr() -> AttachmentManager | None:
    return services.editor_attachment_mgr

def _get_web_session() -> JamaWebSession | None:
    return services.web_session

def _get_image_cache_dir() -> str:
    return services.image_cache_dir

# Regex matching Jama image URLs in HTML — same as the extension's JAMA_IMG_RE
# Group 1: REST API attachment/file ID, Group 2: web attachment ID, Group 3: web filename
_JAMA_IMG_RE = re.compile(
    r'https?://[^"\'\s]*?/(?:rest/v1/(?:attachments|files)/(\d+)(?:/file)?|attachment/(\d+)/([^"\'\s\\]+))',
    re.IGNORECASE,
)


async def _init_editor_services() -> None:
    """Initialize editor services via the shared ServiceRegistry."""
    await services.init_editor_services()
    # Kick off background image prefetch if web session is valid
    ws = services.web_session
    if ws and ws.is_authenticated:
        logger.info("Loaded persisted web session — prefetching images")
        services.prefetch_task = asyncio.create_task(_prefetch_all_images())
    else:
        logger.info("No valid web session — use 'Jama: Set Session Cookie' to set JSESSIONID")
    logger.info("Editor services initialized (port=%d)", EDITOR_PORT)


async def _shutdown_editor_services() -> None:
    """Shut down editor services (standalone mode only)."""
    await services.shutdown_all()
    logger.info("Editor services shut down")


# ============================================================
# FastAPI Application
# ============================================================

@asynccontextmanager
async def _standalone_lifespan(application: FastAPI) -> AsyncIterator[None]:
    """Lifespan for standalone mode only (backward compat)."""
    await _init_editor_services()
    yield
    await _shutdown_editor_services()


# Sub-app with NO lifespan — lifecycle managed by parent (server.py)
editor_app = FastAPI(
    title="Jama Editor Backend",
    version="0.2.0",
)

editor_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Backward-compat alias (standalone mode creates a lifespan-enabled wrapper)
app = editor_app


def _cache() -> EditorCache:
    c = services.editor_cache
    if not c:
        raise HTTPException(503, "Editor backend not initialized")
    return c


def _api() -> JamaApiClient:
    c = services.api_client
    if not c:
        raise HTTPException(503, "Editor backend not initialized")
    return c


def _schema() -> SchemaSync:
    c = services.schema_sync
    if not c:
        raise HTTPException(503, "Editor backend not initialized")
    return c


MCP_PORT = int(os.environ.get("JAMA_MCP_PORT", "8765"))


async def _refresh_mcp_cache(entity_type: str, entity_id: int) -> None:
    """Notify the MCP backend (port 8765) to refresh a cached entity after push."""
    import httpx

    url = f"http://127.0.0.1:{MCP_PORT}/api/{entity_type}/{entity_id}/refresh"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url)
            if resp.status_code == 200:
                logger.info("MCP cache refreshed: %s/%d", entity_type, entity_id)
            else:
                logger.warning("MCP cache refresh failed (%d): %s", resp.status_code, resp.text)
    except Exception as e:
        logger.warning("MCP cache refresh error for %s/%d: %s", entity_type, entity_id, e)


EDITOR_PORT_STR = str(EDITOR_PORT)
_REWRITE_IMG_RE = re.compile(
    r'(https?://[^"\']*?/(?:rest/v1/(?:attachments|files)/(\d+)(?:/file)?|attachment/(\d+)/[^"\'\s]*))',
    re.IGNORECASE,
)


def _rewrite_image_urls(html: str | None) -> str:
    """Replace Jama attachment URLs in HTML with editor-backend proxy URLs."""
    if not html:
        return html or ""
    proxy_base = f"http://localhost:{EDITOR_PORT_STR}"
    return _REWRITE_IMG_RE.sub(
        lambda m: f"{proxy_base}/api/proxy/image/{m.group(2) or m.group(3)}",
        html,
    )


# ============================================================
# Health
# ============================================================

@editor_app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "jama-editor",
        "port": EDITOR_PORT,
        "jama_url": JAMA_URL,
        "editor_db": _cache().db_path if services.editor_cache else None,
    }


# ============================================================
# DRAFT ENDPOINTS
# ============================================================

class SaveDraftRequest(BaseModel):
    server_version: int
    fields_json: str = "{}"
    description_html: str = ""
    is_autosave: bool = True
    change_summary: str = ""


@editor_app.get("/api/drafts/dirty")
async def get_dirty_items() -> dict[str, Any]:
    items = await _cache().get_dirty_items()
    return {"count": len(items), "items": items}


@editor_app.post("/api/drafts/{item_id}")
async def save_draft(item_id: int, req: SaveDraftRequest) -> dict[str, Any]:
    version = await _cache().save_draft(
        item_id=item_id,
        server_version=req.server_version,
        fields_json=req.fields_json,
        description_html=req.description_html,
        is_autosave=req.is_autosave,
        change_summary=req.change_summary,
    )
    return {"item_id": item_id, "draft_version": version, "status": "saved"}


@editor_app.get("/api/drafts/{item_id}")
async def get_drafts(item_id: int) -> dict[str, Any]:
    drafts = await _cache().get_drafts(item_id)
    return {"item_id": item_id, "count": len(drafts), "drafts": drafts}


@editor_app.get("/api/drafts/{item_id}/latest")
async def get_latest_draft(item_id: int) -> dict[str, Any]:
    draft = await _cache().get_latest_draft(item_id)
    if not draft:
        raise HTTPException(404, f"No drafts for item {item_id}")
    return draft


@editor_app.delete("/api/drafts/{item_id}")
async def clear_drafts(item_id: int) -> dict[str, Any]:
    count = await _cache().clear_drafts(item_id)
    return {"item_id": item_id, "deleted": count}


@editor_app.get("/api/drafts/{item_id}/state")
async def get_draft_state(item_id: int) -> dict[str, Any]:
    state = await _cache().get_draft_state(item_id)
    if not state:
        raise HTTPException(404, f"No draft state for item {item_id}")
    return state


# ============================================================
# UNDO ENDPOINTS
# ============================================================

class PushUndoRequest(BaseModel):
    field_name: str
    old_value: str | None = None
    new_value: str | None = None


@editor_app.get("/api/undo/{item_id}")
async def get_undo_stack(item_id: int) -> dict[str, Any]:
    stack = await _cache().get_undo_stack(item_id)
    return {"item_id": item_id, "count": len(stack), "stack": stack}


@editor_app.post("/api/undo/{item_id}")
async def push_undo(item_id: int, req: PushUndoRequest) -> dict[str, Any]:
    await _cache().push_undo(item_id, req.field_name, req.old_value, req.new_value)
    return {"status": "pushed", "item_id": item_id, "field_name": req.field_name}


@editor_app.post("/api/undo/{item_id}/pop")
async def pop_undo(item_id: int) -> dict[str, Any]:
    entry = await _cache().pop_undo(item_id)
    if not entry:
        raise HTTPException(404, f"Undo stack empty for item {item_id}")
    return entry


# ============================================================
# LOCK ENDPOINTS (pass-through to Jama API)
# ============================================================

@editor_app.get("/api/items/{item_id}/lock")
async def get_lock(item_id: int) -> dict[str, Any]:
    try:
        data = await _api().get_item_lock(item_id)
        return data
    except Exception as e:
        raise HTTPException(502, f"Jama API error: {e}")


@editor_app.post("/api/items/{item_id}/lock")
async def acquire_lock(item_id: int) -> dict[str, Any]:
    try:
        await _api().set_item_lock(item_id, locked=True)
        await _cache().set_draft_state(item_id, lock_held=True)
        return {"item_id": item_id, "locked": True, "status": "acquired"}
    except Exception as e:
        raise HTTPException(409, f"Could not acquire lock: {e}")


@editor_app.delete("/api/items/{item_id}/lock")
async def release_lock(item_id: int) -> dict[str, Any]:
    try:
        await _api().set_item_lock(item_id, locked=False)
        await _cache().set_draft_state(item_id, lock_held=False)
        return {"item_id": item_id, "locked": False, "status": "released"}
    except Exception as e:
        raise HTTPException(502, f"Could not release lock: {e}")


# ============================================================
# PUSH TO JAMA
# ============================================================

def _coerce_field(new_val: Any, old_val: Any) -> Any:
    """Coerce a form-submitted value to match the server's original type."""
    if new_val is None or old_val is None:
        return new_val
    # Bool check MUST come before int (bool is subclass of int in Python)
    if isinstance(old_val, bool) and isinstance(new_val, str):
        return new_val.lower() in ("true", "1", "yes")
    if isinstance(old_val, bool) and isinstance(new_val, bool):
        return new_val
    # If server value is int and we got a string, convert
    if isinstance(old_val, int) and isinstance(new_val, str):
        try:
            return int(new_val)
        except (ValueError, TypeError):
            return new_val
    # If server value is float
    if isinstance(old_val, float) and isinstance(new_val, str):
        try:
            return float(new_val)
        except (ValueError, TypeError):
            return new_val
    # If server value is a list (multi-select pick list)
    if isinstance(old_val, list) and isinstance(new_val, str):
        # Single value string → wrap in list, coerce to int if items are ints
        if not new_val:
            return []
        parts = [p.strip() for p in new_val.split(",") if p.strip()]
        if old_val and isinstance(old_val[0], int):
            try:
                return [int(p) for p in parts]
            except ValueError:
                return parts
        return parts
    return new_val


class PushRequest(BaseModel):
    fields: dict[str, Any]
    expected_version: int | None = None


@editor_app.post("/api/items/{item_id}/push")
async def push_to_jama(item_id: int, req: PushRequest) -> dict[str, Any]:
    api = _api()
    cache = _cache()

    # Always fetch current item — used for version check AND field validation
    try:
        current_item = await api.get_item(item_id)
    except Exception as e:
        raise HTTPException(502, f"Could not fetch item: {e}")

    # Version conflict check
    if req.expected_version is not None:
        server_version = current_item.get("version", 0)
        if server_version > req.expected_version:
            raise HTTPException(
                409,
                {
                    "error": "version_conflict",
                    "expected": req.expected_version,
                    "server": server_version,
                    "message": f"Item was modified (v{req.expected_version} → v{server_version})",
                },
            )

    # Build safe field set: only include fields that exist AND actually changed.
    # Coerce submitted values to match the server's original type.
    server_fields = current_item.get("fields") or {}
    safe_fields: dict[str, Any] = {}
    for k, new_val in req.fields.items():
        if k not in server_fields:
            continue
        old_val = server_fields[k]
        # Coerce string values to match server type
        coerced = _coerce_field(new_val, old_val)
        # Only include if the value actually changed
        if coerced != old_val:
            safe_fields[k] = coerced

    if not safe_fields:
        logger.info("Push for item %d: no fields changed — skipping API call", item_id)
        return {
            "item_id": item_id,
            "version": current_item.get("version", 0),
            "status": "no_changes",
            "item": current_item,
        }

    logger.info("Push for item %d: sending %d changed fields: %s", item_id, len(safe_fields), list(safe_fields.keys()))

    # Push to Jama
    try:
        await api.update_item(item_id, safe_fields)
    except Exception as e:
        raise HTTPException(502, f"Push to Jama failed: {e}")

    # Fetch fresh item
    try:
        fresh_item = await api.get_item(item_id)
    except Exception as e:
        logger.warning("Push succeeded but refresh failed: %s", e)
        fresh_item = {"id": item_id, "version": (req.expected_version or 0) + 1}

    new_version = fresh_item.get("version", 0)

    # Clear local drafts and update state
    await cache.clear_drafts(item_id)
    await cache.set_draft_state(
        item_id,
        server_version_base=new_version,
        is_dirty=False,
    )
    await cache.clear_undo(item_id)

    # Refresh MCP backend cache so the project tree reflects the push
    await _refresh_mcp_cache("items", item_id)

    logger.info("Pushed item %d to Jama → v%d", item_id, new_version)
    return {
        "item_id": item_id,
        "version": new_version,
        "status": "pushed",
        "item": fresh_item,
    }


# ============================================================
# SCHEMA ENDPOINTS (on-demand from Jama API)
# ============================================================

@editor_app.get("/api/schema/itemtypes")
async def get_item_types() -> dict[str, Any]:
    types = await _schema().get_item_types()
    return {"count": len(types), "itemTypes": types}


@editor_app.get("/api/schema/itemtypes/{item_type_id}/fields")
async def get_field_definitions(item_type_id: int) -> dict[str, Any]:
    fields = await _schema().get_field_definitions(item_type_id)
    return {"itemTypeId": item_type_id, "count": len(fields), "fields": fields}


@editor_app.get("/api/schema/picklists/{pick_list_id}/options")
async def get_pick_list_options(pick_list_id: int) -> dict[str, Any]:
    options = await _schema().get_pick_list_options(pick_list_id)
    return {"pickListId": pick_list_id, "count": len(options), "options": options}


@editor_app.get("/api/schema/workflows/{item_id}")
async def get_workflows(item_id: int) -> dict[str, Any]:
    transitions = await _schema().get_workflow_transitions(item_id)
    return {"itemId": item_id, "count": len(transitions), "transitions": transitions}


def _att() -> AttachmentManager:
    c = services.editor_attachment_mgr
    if not c:
        raise HTTPException(503, "Editor backend not initialized")
    return c


# ============================================================
# ATTACHMENT ENDPOINTS
# ============================================================

@editor_app.get("/api/items/{item_id}/attachments/sync")
async def sync_attachments(item_id: int) -> dict[str, Any]:
    """Sync attachment metadata from Jama and return the list."""
    atts = await _att().sync_attachments(item_id)
    return {"item_id": item_id, "count": len(atts), "attachments": atts}


@editor_app.get("/api/items/{item_id}/attachments/list")
async def list_attachments(item_id: int) -> dict[str, Any]:
    """List cached attachments for an item (no Jama API call)."""
    atts = await _att().list_attachments(item_id)
    return {"item_id": item_id, "count": len(atts), "attachments": atts}


@editor_app.get("/api/attachments/{attachment_id}/download")
async def download_attachment_endpoint(attachment_id: int) -> Any:
    """Download an attachment (serves from cache or fetches from Jama)."""
    from fastapi.responses import Response

    content, file_name, mime_type = await _att().download(attachment_id)
    return Response(
        content=content,
        media_type=mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{file_name}"',
            "Content-Length": str(len(content)),
        },
    )


class ReplaceAttachmentRequest(BaseModel):
    file_path: str
    file_name: str = ""


@editor_app.put("/api/attachments/{attachment_id}/replace")
async def replace_attachment_endpoint(
    attachment_id: int, req: ReplaceAttachmentRequest
) -> dict[str, Any]:
    """Replace an attachment's file content."""
    result = await _att().replace_attachment(
        attachment_id, req.file_path, req.file_name
    )
    return result


@editor_app.delete("/api/items/{item_id}/attachments/{attachment_id}")
async def delete_attachment_endpoint(item_id: int, attachment_id: int) -> dict[str, Any]:
    """Unlink and delete an attachment from an item."""
    await _att().delete_attachment(item_id, attachment_id)
    return {"status": "deleted", "item_id": item_id, "attachment_id": attachment_id}


@editor_app.post("/api/attachments/retry")
async def retry_pending_uploads(item_id: int | None = None) -> dict[str, Any]:
    """Retry any pending uploads that failed or were interrupted."""
    results = await _att().retry_pending_uploads(item_id)
    return {"count": len(results), "results": results}


@editor_app.get("/api/attachments/pending")
async def get_pending_uploads(item_id: int | None = None) -> dict[str, Any]:
    """List pending uploads."""
    pending = await _cache().get_pending_uploads(item_id=item_id)
    return {"count": len(pending), "uploads": pending}


@editor_app.get("/api/attachments/cache/stats")
async def get_cache_stats() -> dict[str, Any]:
    """Get attachment cache usage statistics."""
    return await _att().get_cache_stats()


@editor_app.delete("/api/attachments/cache")
async def clear_attachment_cache() -> dict[str, Any]:
    """Clear all cached attachment files."""
    return await _att().clear_cache()


# ============================================================
# IMAGE PROXY (for TipTap embedded images)
# ============================================================

def _guess_image_mime(content: bytes) -> str:
    """Guess MIME type from file magic bytes."""
    if content[:8] == b'\x89PNG\r\n\x1a\n':
        return "image/png"
    if content[:3] == b'\xff\xd8\xff':
        return "image/jpeg"
    if content[:4] == b'GIF8':
        return "image/gif"
    if content[:4] == b'RIFF' and len(content) > 12 and content[8:12] == b'WEBP':
        return "image/webp"
    if content[:4] == b'<svg' or content[:5] == b'<?xml':
        return "image/svg+xml"
    return "image/png"


def _image_cache_path(attachment_id: int) -> str:
    """Return the on-disk cache path for an image."""
    return os.path.join(services.image_cache_dir, str(attachment_id))


async def _prefetch_all_images() -> None:
    """Background task: scan MCP cache DB for image URLs and download them all.

    Scans `items.description` and `items.fields_json` in the MCP cache DB for
    Jama image attachment URLs, then downloads any that aren't already cached
    to disk using the web session cookie + REST API.
    """
    import aiosqlite

    cache_db = os.path.join(os.path.expanduser(CACHE_DIR), "cache.db")
    if not os.path.exists(cache_db):
        logger.info("Image prefetch: MCP cache DB not found at %s, skipping", cache_db)
        return

    # Collect all unique attachment IDs and their filenames from item HTML
    # Map: attachment_id -> filename (from URL, or empty string)
    attachment_map: dict[int, str] = {}
    try:
        async with aiosqlite.connect(cache_db) as db:
            # Scan item descriptions and custom fields
            async with db.execute("SELECT description, fields_json FROM items") as cursor:
                async for row in cursor:
                    for text in (row[0] or "", row[1] or ""):
                        for m in _JAMA_IMG_RE.finditer(text):
                            aid = int(m.group(1) or m.group(2))
                            fname = (m.group(3) or "").strip()
                            if aid not in attachment_map or fname:
                                attachment_map[aid] = fname

            # Scan test run actual_results and fields (often contain pasted screenshots)
            try:
                async with db.execute("SELECT actual_results, fields_json FROM test_runs") as cursor:
                    async for row in cursor:
                        for text in (row[0] or "", row[1] or ""):
                            for m in _JAMA_IMG_RE.finditer(text):
                                aid = int(m.group(1) or m.group(2))
                                fname = (m.group(3) or "").strip()
                                if aid not in attachment_map or fname:
                                    attachment_map[aid] = fname
            except Exception:
                pass  # test_runs table may not exist yet
    except Exception as e:
        logger.error("Image prefetch: failed to scan cache DB: %s", e)
        return

    if not attachment_map:
        logger.info("Image prefetch: no image URLs found in cached items")
        return

    # Filter out already-cached images
    uncached = [(aid, fn) for aid, fn in attachment_map.items() if not os.path.exists(_image_cache_path(aid))]
    logger.info(
        "Image prefetch: found %d image IDs, %d already cached, %d to download",
        len(attachment_map), len(attachment_map) - len(uncached), len(uncached),
    )

    if not uncached:
        return

    downloaded = 0
    failed = 0
    for aid, fname in uncached:
        ws = services.web_session
        if not (ws and ws.is_authenticated):
            logger.warning("Image prefetch: web session expired mid-prefetch, stopping")
            break
        try:
            file_bytes: bytes | None = None

            # Try web session first (most inline images need this)
            file_bytes = await ws.download_web_image(aid, fname)

            # Fall back to REST API
            ac = services.api_client
            if not file_bytes and ac:
                try:
                    file_bytes = await ac.download_attachment(aid)
                except Exception:
                    pass
            if not file_bytes and ac:
                try:
                    file_bytes = await ac.download_file(aid)
                except Exception:
                    pass

            if file_bytes:
                with open(_image_cache_path(aid), "wb") as f:
                    f.write(file_bytes)
                downloaded += 1
            else:
                failed += 1

            # Small delay to avoid hammering the server
            await asyncio.sleep(0.2)

        except Exception as e:
            logger.debug("Image prefetch: failed to download %d: %s", aid, e)
            failed += 1

    logger.info("Image prefetch complete: %d downloaded, %d failed", downloaded, failed)


@editor_app.get("/api/proxy/image/{attachment_id}")
async def proxy_image(attachment_id: int) -> Any:
    """Proxy an image attachment from Jama, returning binary content.

    Tries (in order):
    1. Local disk cache (instant, no network)
    2. SAML web session: /attachment/{id} (for pasted inline images)
    3. REST API: /rest/v1/attachments/{id}/file (OAuth)
    4. REST API: /rest/v1/files/{id} (OAuth)
    """
    from fastapi.responses import Response

    # 1. Check disk cache first
    cache_path = _image_cache_path(attachment_id)
    if os.path.exists(cache_path):
        file_bytes = open(cache_path, "rb").read()
        mime_type = _guess_image_mime(file_bytes)
        return Response(
            content=file_bytes,
            media_type=mime_type,
            headers={"Cache-Control": "public, max-age=86400", "X-Image-Source": "cache"},
        )

    file_bytes: bytes | None = None
    source = "unknown"

    try:
        # 2. Web session cookie (inline pasted images — most common)
        ws = services.web_session
        if ws and ws.is_authenticated:
            file_bytes = await ws.download_web_image(attachment_id)
            if file_bytes:
                source = "web-session"
                logger.debug("Image %d downloaded via web session (%d bytes)", attachment_id, len(file_bytes))

        # 3. REST API attachment endpoint (OAuth)
        if not file_bytes:
            client = _api()
            try:
                meta = await client.get_attachment(attachment_id)
                file_bytes = await client.download_attachment(attachment_id)
                source = "rest-attachment"
                logger.debug("Image %d downloaded via REST attachment (%d bytes)", attachment_id, len(file_bytes))
            except Exception as e:
                logger.debug("REST attachment %d failed: %s", attachment_id, e)

        # 4. REST API files endpoint (OAuth)
        if not file_bytes:
            client = _api()
            try:
                file_bytes = await client.download_file(attachment_id)
                source = "rest-file"
                logger.debug("Image %d downloaded via REST files (%d bytes)", attachment_id, len(file_bytes))
            except Exception as e:
                logger.debug("REST files %d failed: %s", attachment_id, e)

        if not file_bytes:
            detail = "Attachment not found."
            if not (services.web_session and services.web_session.is_authenticated):
                detail += " No web session — use 'Jama: Set Session Cookie' command to provide JSESSIONID for web UI images."
            raise HTTPException(status_code=404, detail=detail)

        # Cache to disk for future requests
        try:
            with open(cache_path, "wb") as f:
                f.write(file_bytes)
        except Exception as e:
            logger.warning("Failed to cache image %d to disk: %s", attachment_id, e)

        mime_type = _guess_image_mime(file_bytes)
        return Response(
            content=file_bytes,
            media_type=mime_type,
            headers={
                "Cache-Control": "public, max-age=86400",
                "X-Image-Source": source,
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Image proxy error for %d: %s", attachment_id, exc)
        raise HTTPException(status_code=502, detail=f"Failed to proxy image: {exc}")


# ============================================================
# WEB SESSION ENDPOINTS (JSESSIONID for image downloads)
# ============================================================


class SetSessionRequest(BaseModel):
    jsessionid: str


@editor_app.post("/api/session/set")
async def set_session(req: SetSessionRequest) -> dict[str, Any]:
    """Set the JSESSIONID cookie for web UI image downloads.

    User copies this from browser DevTools:
    F12 → Application → Cookies → enphase.jamacloud.com → JSESSIONID
    """
    ws = services.web_session
    if not ws:
        raise HTTPException(status_code=500, detail="Web session manager not initialized")

    ws.set_jsessionid(req.jsessionid)

    valid = await ws.validate()
    if valid:
        # Kick off background prefetch of all images from cached items
        if services.prefetch_task and not services.prefetch_task.done():
            services.prefetch_task.cancel()
        services.prefetch_task = asyncio.create_task(_prefetch_all_images())
        return {"status": "authenticated", "valid": True, "message": "Session cookie is valid — downloading images in background."}
    else:
        return {"status": "set", "valid": False, "message": "Cookie was saved but could not be validated. Images may not load."}


@editor_app.get("/api/session/status")
async def session_status() -> dict[str, Any]:
    """Check web session status."""
    ws = services.web_session
    if not ws:
        return {"authenticated": False}
    return {
        "authenticated": ws.is_authenticated,
        "has_cookie": bool(ws.cookies.get("JSESSIONID")),
    }


@editor_app.post("/api/session/clear")
async def session_clear() -> dict[str, str]:
    """Clear the web session cookie."""
    ws = services.web_session
    if ws:
        await ws.invalidate()
    return {"status": "cleared"}


@editor_app.get("/api/session/prefetch-status")
async def prefetch_status() -> dict[str, Any]:
    """Check image prefetch progress."""
    pt = services.prefetch_task
    if pt is None:
        return {"status": "idle", "message": "No prefetch has been started"}
    if pt.done():
        exc = pt.exception() if not pt.cancelled() else None
        if exc:
            return {"status": "error", "message": str(exc)}
        return {"status": "complete", "message": "All images prefetched"}
    return {"status": "running", "message": "Downloading images in background..."}


@editor_app.post("/api/session/prefetch")
async def trigger_prefetch() -> dict[str, Any]:
    """Manually trigger background image prefetch."""
    ws = services.web_session
    if not ws or not ws.is_authenticated:
        raise HTTPException(status_code=400, detail="No valid web session. Set JSESSIONID first.")
    if services.prefetch_task and not services.prefetch_task.done():
        return {"status": "already_running", "message": "Prefetch is already in progress."}
    services.prefetch_task = asyncio.create_task(_prefetch_all_images())
    return {"status": "started", "message": "Image prefetch started in background."}


@editor_app.delete("/api/images/cache")
async def clear_image_cache() -> dict[str, Any]:
    """Clear all cached images from disk."""
    icd = services.image_cache_dir
    if not icd or not os.path.exists(icd):
        return {"files_deleted": 0, "bytes_freed": 0}
    files_deleted = 0
    bytes_freed = 0
    for f in os.listdir(icd):
        fpath = os.path.join(icd, f)
        if os.path.isfile(fpath):
            bytes_freed += os.path.getsize(fpath)
            os.remove(fpath)
            files_deleted += 1
    logger.info("Image cache cleared: %d files, %d bytes", files_deleted, bytes_freed)
    return {"files_deleted": files_deleted, "bytes_freed": bytes_freed}


class AttachmentUploadRequest(BaseModel):
    file_path: str
    file_name: str = ""


@editor_app.post("/api/items/{item_id}/attachments")
async def upload_attachment(item_id: int, req: AttachmentUploadRequest) -> dict[str, Any]:
    """Upload a local file as an attachment to a Jama item.

    Reads the file from disk (the VS Code extension passes a local path),
    uploads to Jama, and returns the attachment ID for proxy-URL construction.
    """
    import os

    path = req.file_path
    if not os.path.isfile(path):
        raise HTTPException(status_code=400, detail=f"File not found: {path}")

    file_name = req.file_name or os.path.basename(path)
    with open(path, "rb") as f:
        content = f.read()

    # 10 MB limit
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    client = _api()
    try:
        result = await client.upload_attachment(item_id, file_name, content)
        return {
            "attachmentId": result.get("attachment_id"),
            "status": "ok",
            "fileName": file_name,
        }
    except Exception as exc:
        logger.error("Upload attachment error for item %d: %s", item_id, exc)
        raise HTTPException(status_code=502, detail=f"Upload failed: {exc}")


# ============================================================
# TEST ENTITY PUSH ENDPOINTS
# ============================================================


class TestPushRequest(BaseModel):
    fields: dict[str, Any]
    expected_version: int | None = None


@editor_app.get("/api/testplans/{plan_id}/lock")
async def get_test_plan_lock(plan_id: int) -> dict[str, Any]:
    try:
        data = await _api().get_test_plan_lock(plan_id)
        return data
    except Exception as e:
        raise HTTPException(502, f"Jama API error: {e}")


@editor_app.post("/api/testplans/{plan_id}/lock")
async def acquire_test_plan_lock(plan_id: int) -> dict[str, Any]:
    try:
        await _api().set_test_plan_lock(plan_id, locked=True)
        return {"locked": True, "plan_id": plan_id}
    except Exception as e:
        raise HTTPException(409, f"Could not acquire lock: {e}")


@editor_app.delete("/api/testplans/{plan_id}/lock")
async def release_test_plan_lock(plan_id: int) -> dict[str, Any]:
    try:
        await _api().set_test_plan_lock(plan_id, locked=False)
        return {"locked": False, "plan_id": plan_id}
    except Exception as e:
        raise HTTPException(502, f"Could not release lock: {e}")


@editor_app.post("/api/testplans/{plan_id}/push")
async def push_test_plan(plan_id: int, req: TestPushRequest) -> dict[str, Any]:
    api = _api()

    try:
        current = await api.get_test_plan(plan_id)
    except Exception as e:
        raise HTTPException(502, f"Could not fetch test plan: {e}")

    # Version conflict check
    if req.expected_version is not None:
        server_version = current.get("version", 0)
        if server_version > req.expected_version:
            raise HTTPException(409, {
                "error": "version_conflict",
                "expected": req.expected_version,
                "server": server_version,
            })

    # Diff fields
    server_fields = current.get("fields") or {}
    safe_fields: dict[str, Any] = {}
    for k, v in req.fields.items():
        if k in server_fields and v != server_fields[k]:
            safe_fields[k] = v

    if not safe_fields:
        return {"plan_id": plan_id, "version": current.get("version", 0), "status": "no_changes"}

    logger.info("Push test plan %d: %d fields: %s", plan_id, len(safe_fields), list(safe_fields.keys()))

    try:
        await api.update_test_plan(plan_id, safe_fields)
    except Exception as e:
        raise HTTPException(502, f"Push failed: {e}")

    try:
        fresh = await api.get_test_plan(plan_id)
    except Exception:
        fresh = {"id": plan_id}

    f = fresh.get("fields", {})
    normalized = {
        "id": fresh.get("id", plan_id),
        "project_id": fresh.get("project", {}).get("id") if isinstance(fresh.get("project"), dict) else fresh.get("project"),
        "name": f.get("name", ""),
        "status": f.get("status", ""),
        "description": f.get("description", ""),
        "fields_json": json.dumps(f),
    }

    await _refresh_mcp_cache("testplans", plan_id)

    return {"plan_id": plan_id, "version": fresh.get("version", 0), "status": "pushed", "item": normalized}


@editor_app.post("/api/testcycles/{cycle_id}/push")
async def push_test_cycle(cycle_id: int, req: TestPushRequest) -> dict[str, Any]:
    api = _api()

    try:
        current = await api.get_test_cycle(cycle_id)
    except Exception as e:
        raise HTTPException(502, f"Could not fetch test cycle: {e}")

    if req.expected_version is not None:
        server_version = current.get("version", 0)
        if server_version > req.expected_version:
            raise HTTPException(409, {
                "error": "version_conflict",
                "expected": req.expected_version,
                "server": server_version,
            })

    server_fields = current.get("fields") or {}
    safe_fields: dict[str, Any] = {}
    for k, v in req.fields.items():
        if k in server_fields and v != server_fields[k]:
            safe_fields[k] = v

    if not safe_fields:
        return {"cycle_id": cycle_id, "version": current.get("version", 0), "status": "no_changes"}

    logger.info("Push test cycle %d: %d fields: %s", cycle_id, len(safe_fields), list(safe_fields.keys()))

    try:
        await api.update_test_cycle(cycle_id, safe_fields)
    except Exception as e:
        raise HTTPException(502, f"Push failed: {e}")

    try:
        fresh = await api.get_test_cycle(cycle_id)
    except Exception:
        fresh = {"id": cycle_id}

    f = fresh.get("fields", {})
    normalized = {
        "id": fresh.get("id", cycle_id),
        "test_plan_id": fresh.get("testPlan", {}).get("id") if isinstance(fresh.get("testPlan"), dict) else fresh.get("testPlan"),
        "name": f.get("name", ""),
        "status": f.get("status", ""),
        "description": f.get("description", ""),
        "start_date": f.get("startDate"),
        "end_date": f.get("endDate"),
        "fields_json": json.dumps(f),
    }

    await _refresh_mcp_cache("testcycles", cycle_id)

    return {"cycle_id": cycle_id, "version": fresh.get("version", 0), "status": "pushed", "item": normalized}


@editor_app.post("/api/testruns/{run_id}/push")
async def push_test_run(run_id: int, req: TestPushRequest) -> dict[str, Any]:
    api = _api()

    try:
        current = await api.get_test_run(run_id)
    except Exception as e:
        raise HTTPException(502, f"Could not fetch test run: {e}")

    if req.expected_version is not None:
        server_version = current.get("version", 0)
        if server_version > req.expected_version:
            raise HTTPException(409, {
                "error": "version_conflict",
                "expected": req.expected_version,
                "server": server_version,
            })

    server_fields = current.get("fields") or {}
    safe_fields: dict[str, Any] = {}
    for k, v in req.fields.items():
        if k in server_fields and v != server_fields[k]:
            safe_fields[k] = v

    # Jama rejects top-level status on runs with steps — status is derived from step statuses
    has_steps = bool(safe_fields.get("testRunSteps") or server_fields.get("testRunSteps"))
    if has_steps:
        safe_fields.pop("testRunStatus", None)
        safe_fields.pop("status", None)

    if not safe_fields:
        return {"run_id": run_id, "version": current.get("version", 0), "status": "no_changes"}

    logger.info("Push test run %d: %d fields: %s", run_id, len(safe_fields), list(safe_fields.keys()))

    try:
        await api.update_test_run(run_id, fields=safe_fields)
    except Exception as e:
        raise HTTPException(502, f"Push failed: {e}")

    try:
        fresh = await api.get_test_run(run_id)
    except Exception:
        fresh = {"id": run_id}

    # Normalize to cache-row format expected by the VS Code extension
    f = fresh.get("fields", {})
    normalized = {
        "id": fresh.get("id", run_id),
        "test_cycle_id": fresh.get("testCycle", {}).get("id") if isinstance(fresh.get("testCycle"), dict) else fresh.get("testCycle"),
        "test_case_id": fresh.get("testCase", {}).get("id") if isinstance(fresh.get("testCase"), dict) else fresh.get("testCase"),
        "name": f.get("name", ""),
        "status": f.get("testRunStatus", "NOT_RUN"),
        "assigned_to": fresh.get("assignedTo"),
        "actual_results": f.get("actualResults", ""),
        "planned_results": f.get("plannedResults", ""),
        "execution_date": fresh.get("executionDate"),
        "fields_json": json.dumps(f),
    }

    # Refresh MCP cache so tree view picks up the update
    await _refresh_mcp_cache("testruns", run_id)

    return {"run_id": run_id, "version": fresh.get("version", 0), "status": "pushed", "item": normalized}


# ============================================================
# Entry point
# ============================================================

def run_editor() -> None:
    """Start the editor backend server (standalone mode).

    Creates a lifespan-enabled wrapper around editor_app so that
    services are initialized/shutdown properly when running standalone.

    Credentials are auto-loaded from mcp_config.json if env vars are not set.
    """
    import uvicorn

    if not CLIENT_ID or not CLIENT_SECRET:
        print()
        print("ERROR: Jama credentials not found.")
        print()
        print("Credentials are auto-loaded from mcp_config.json (Windsurf/Devin/Claude).")
        print("If none of those exist, set env vars:")
        print("  set JAMA_CLIENT_ID=<your-client-id>")
        print("  set JAMA_CLIENT_SECRET=<your-client-secret>")
        print()
        print("Or use the unified backend (recommended):")
        print("  jama-rest              # REST API + editor + viewer")
        print("  jama-connect --daemon  # MCP + REST API + editor")
        print()
        sys.exit(1)

    standalone_app = FastAPI(
        title="Jama Editor Backend (standalone)",
        version="0.4.0",
        lifespan=_standalone_lifespan,
    )
    standalone_app.mount("/", editor_app)

    logger.info("Starting Jama Editor Backend (standalone) on port %d", EDITOR_PORT)
    uvicorn.run(
        standalone_app,
        host="127.0.0.1",
        port=EDITOR_PORT,
        log_level="info",
    )
