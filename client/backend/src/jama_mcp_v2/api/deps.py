"""FastAPI dependency injection for the Jama Connect REST API.

Replaces the pattern:
    async def some_endpoint():
        if not svc.cache:
            raise HTTPException(503, "Cache not initialized")
        if not svc.api_client:
            raise HTTPException(503, "API client not initialized")
        ...

with typed FastAPI Depends() factories:
    async def some_endpoint(
        cache: JamaCache = Depends(get_cache),
        api:   JamaApiClient = Depends(get_api),
    ): ...
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Depends, HTTPException

if TYPE_CHECKING:
    from ..api_client import JamaApiClient
    from ..cache import JamaCache
    from ..db import CacheManager
    from ..progress import ProgressBus
    from ..search import SearchEngine
    from ..sync import SyncEngine
    from ..testing import TestManager
    from ..writer import Writer


def _get_svc():
    """Lazy import avoids circular imports at module load."""
    from ..services import services
    return services


# ---------------------------------------------------------------------------
# Core dependencies
# ---------------------------------------------------------------------------

async def get_cache() -> "JamaCache":
    svc = _get_svc()
    if not svc.cache:
        raise HTTPException(503, "Jama cache not initialized — call /api/init first")
    return svc.cache


async def get_api() -> "JamaApiClient":
    svc = _get_svc()
    if not svc.api_client:
        raise HTTPException(503, "Jama API client not initialized — call /api/init first")
    return svc.api_client


async def get_sync() -> "SyncEngine":
    svc = _get_svc()
    if not svc.sync_engine:
        raise HTTPException(503, "Sync engine not initialized")
    return svc.sync_engine


async def get_search() -> "SearchEngine":
    svc = _get_svc()
    if not svc.search_engine:
        raise HTTPException(503, "Search engine not initialized")
    return svc.search_engine


async def get_test_manager() -> "TestManager":
    svc = _get_svc()
    if not svc.test_manager:
        raise HTTPException(503, "Test manager not initialized")
    return svc.test_manager


async def get_writer() -> "Writer":
    svc = _get_svc()
    if not svc.writer:
        raise HTTPException(503, "Writer not initialized")
    return svc.writer


async def get_progress_bus() -> "ProgressBus":
    svc = _get_svc()
    if not svc.progress_bus:
        raise HTTPException(503, "Progress bus not initialized")
    return svc.progress_bus


async def get_cache_manager() -> "CacheManager":
    svc = _get_svc()
    if not svc.cache_manager:
        raise HTTPException(503, "CacheManager not initialized")
    return svc.cache_manager


# ---------------------------------------------------------------------------
# Convenience combos (use when you need both cache + api in one endpoint)
# ---------------------------------------------------------------------------

async def get_cache_and_api(
    cache: "JamaCache" = Depends(get_cache),
    api: "JamaApiClient" = Depends(get_api),
) -> tuple["JamaCache", "JamaApiClient"]:
    return cache, api


async def get_initialized_svc():
    """Require MCP services to be initialized; return svc for ad-hoc access."""
    svc = _get_svc()
    if not svc.is_mcp_initialized:
        raise HTTPException(503, "Services not initialized — call /api/init first")
    return svc
