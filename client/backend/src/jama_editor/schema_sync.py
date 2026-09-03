"""On-demand Jama schema fetching with in-memory TTL cache.

Fetches item types, field definitions, pick lists, and workflow transitions
from the Jama REST API. Caches results in memory for 1 hour.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from jama_mcp_v2.api_client import JamaApiClient

logger = logging.getLogger(__name__)

SCHEMA_CACHE_TTL = 3600  # 1 hour


class _CacheEntry:
    __slots__ = ("data", "expires_at")

    def __init__(self, data: Any, ttl: float = SCHEMA_CACHE_TTL):
        self.data = data
        self.expires_at = time.time() + ttl

    @property
    def expired(self) -> bool:
        return time.time() > self.expires_at


class SchemaSync:
    """Provides on-demand schema data from Jama with in-memory caching."""

    def __init__(self, api_client: JamaApiClient):
        self._api = api_client
        self._item_types_cache: _CacheEntry | None = None
        self._field_defs_cache: dict[int, _CacheEntry] = {}  # keyed by item_type_id
        self._pick_list_cache: dict[int, _CacheEntry] = {}  # keyed by pick_list_id
        self._workflow_cache: dict[int, _CacheEntry] = {}  # keyed by item_id

    # ---------- Item Types ----------

    async def get_item_types(self) -> list[dict[str, Any]]:
        """Get all item types. Cached for 1 hour."""
        if self._item_types_cache and not self._item_types_cache.expired:
            return self._item_types_cache.data

        logger.info("Fetching item types from Jama...")
        data = await self._api.get_item_types()
        self._item_types_cache = _CacheEntry(data)
        logger.info("Cached %d item types", len(data))
        return data

    async def get_item_type(self, item_type_id: int) -> dict[str, Any] | None:
        """Get a single item type by ID."""
        types = await self.get_item_types()
        for t in types:
            if t.get("id") == item_type_id:
                return t
        return None

    # ---------- Field Definitions ----------

    async def get_field_definitions(self, item_type_id: int) -> list[dict[str, Any]]:
        """Get field definitions for an item type. Cached per type for 1 hour."""
        cached = self._field_defs_cache.get(item_type_id)
        if cached and not cached.expired:
            return cached.data

        logger.info("Fetching field definitions for item_type=%d...", item_type_id)
        item_type = await self._api.get_item_type(item_type_id)
        fields = item_type.get("fields", []) if item_type else []
        self._field_defs_cache[item_type_id] = _CacheEntry(fields)
        logger.info("Cached %d fields for item_type=%d", len(fields), item_type_id)
        return fields

    # ---------- Pick Lists ----------

    async def get_pick_list_options(self, pick_list_id: int) -> list[dict[str, Any]]:
        """Get options for a pick list. Cached per list for 1 hour."""
        cached = self._pick_list_cache.get(pick_list_id)
        if cached and not cached.expired:
            return cached.data

        logger.info("Fetching pick list options for pick_list=%d...", pick_list_id)
        data = await self._api.get_pick_list_options(pick_list_id)
        self._pick_list_cache[pick_list_id] = _CacheEntry(data)
        logger.info("Cached %d options for pick_list=%d", len(data), pick_list_id)
        return data

    # ---------- Workflows ----------

    async def get_workflow_transitions(self, item_id: int) -> list[dict[str, Any]]:
        """Get available workflow transitions for an item. Cached per item for 1 hour."""
        cached = self._workflow_cache.get(item_id)
        if cached and not cached.expired:
            return cached.data

        logger.info("Fetching workflow transitions for item=%d...", item_id)
        data = await self._api.get_workflow_transition_options(item_id)
        self._workflow_cache[item_id] = _CacheEntry(data)
        logger.info("Cached %d transitions for item=%d", len(data), item_id)
        return data

    # ---------- Cache Management ----------

    def invalidate_all(self) -> None:
        """Clear all cached schema data."""
        self._item_types_cache = None
        self._field_defs_cache.clear()
        self._pick_list_cache.clear()
        self._workflow_cache.clear()
        logger.info("Schema cache invalidated")

    def invalidate_item(self, item_id: int) -> None:
        """Invalidate workflow cache for a specific item."""
        self._workflow_cache.pop(item_id, None)
