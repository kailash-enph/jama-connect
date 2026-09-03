"""Delta sync engine — fetches items from Jama and upserts into cache.

Perf-1/2: _sync_items() now uses ProjectDb.bulk_write() context manager,
deferring all FTS updates until end of the item phase — ~60× speedup on
full syncs (~59,500 individual FTS upserts → 1 rebuild).
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Callable, Union

from .api_client import JamaApiClient, JamaApiError
from .models import SyncProgress, SyncState

if TYPE_CHECKING:
    from .cache import JamaCache
    from .db import CacheManager, ProjectDb

# Accept both old JamaCache and new ProjectDb / CacheManager
CacheLike = Union["JamaCache", "ProjectDb", "CacheManager"]

logger = logging.getLogger(__name__)

# Type for progress callback
ProgressCallback = Callable[[SyncProgress], None] | None


class SyncEngine:
    """Orchestrates full and incremental sync between Jama API and local cache."""

    def __init__(
        self,
        api: JamaApiClient,
        cache: "CacheLike",
        batch_size: int = 50,
    ):
        self._api = api
        self._cache = cache
        self._batch_size = batch_size
        self._progress = SyncProgress()
        self._cancel_event = asyncio.Event()

    @property
    def progress(self) -> SyncProgress:
        return self._progress

    def cancel(self) -> None:
        self._cancel_event.set()

    def _reset_progress(self, project_id: int, project_name: str = "") -> None:
        self._progress = SyncProgress(
            state=SyncState.SYNCING,
            project_id=project_id,
            project_name=project_name,
            started_at=datetime.now(timezone.utc),
        )
        self._cancel_event.clear()

    # ---------- Full project sync ----------

    async def sync_project(
        self,
        project_id: int,
        on_progress: ProgressCallback = None,
    ) -> SyncProgress:
        """Full sync of a project: items, relationships, test plans/cycles/runs."""
        # Get project info
        try:
            project_data = await self._api.get_project(project_id)
        except JamaApiError as e:
            logger.error("Failed to fetch project %d: %s", project_id, e)
            return SyncProgress(state=SyncState.ERROR, message=str(e))

        project_name = project_data.get("fields", {}).get("name", f"Project {project_id}")
        self._reset_progress(project_id, project_name)
        log_id = await self._cache.log_sync_start(project_id)

        # Upsert project
        await self._cache.upsert_project(project_data)

        try:
            t0 = time.time()

            # Phase 1: Items (must complete first — sequential pagination)
            await self._sync_items(project_id, on_progress)
            t_items = time.time() - t0
            logger.info("Phase 1 (items): %.1fs", t_items)

            # Phase 2+3: Relationships + Test management in parallel
            t1 = time.time()
            self._progress.message = "Syncing relationships + test management..."
            self._notify(on_progress)
            await asyncio.gather(
                self._sync_relationships(project_id, on_progress),
                self._sync_test_management(project_id, on_progress),
            )
            t_parallel = time.time() - t1
            logger.info("Phase 2+3 (rels + tests): %.1fs", t_parallel)

            # Rebuild FTS index
            t2 = time.time()
            self._progress.message = "Rebuilding search index..."
            self._notify(on_progress)
            await self._cache.rebuild_fts()
            t_fts = time.time() - t2

            total_time = time.time() - t0
            self._progress.state = SyncState.DONE
            self._progress.completed_at = datetime.now(timezone.utc)
            self._progress.message = (
                f"Sync complete in {total_time:.0f}s "
                f"(items {t_items:.0f}s, rels+tests {t_parallel:.0f}s, fts {t_fts:.0f}s)"
            )
            logger.info("Sync total: %.1fs", total_time)
            self._notify(on_progress)

        except asyncio.CancelledError:
            self._progress.state = SyncState.ERROR
            self._progress.message = "Sync cancelled"
            logger.warning("Sync cancelled for project %d", project_id)
        except Exception as e:
            self._progress.state = SyncState.ERROR
            self._progress.errors += 1
            self._progress.message = f"Sync error: {e}"
            logger.error("Sync error for project %d: %s", project_id, e, exc_info=True)

        await self._cache.log_sync_complete(
            log_id,
            total=self._progress.total_items,
            changed=self._progress.changed_items,
            new=self._progress.new_items,
            deleted=self._progress.deleted_items,
            errors=self._progress.errors,
            status=self._progress.state.value,
            message=self._progress.message,
        )

        return self._progress

    async def _sync_items(self, project_id: int, on_progress: ProgressCallback) -> None:
        """Fetch all items and do delta comparison.

        Perf-1/2: Wraps all upserts in ProjectDb.bulk_write() when the cache
        supports it. This defers FTS index updates from per-item to a single
        rebuild at the end — ~60× faster on full syncs.
        """
        self._progress.message = "Fetching items from Jama..."
        self._notify(on_progress)

        # Get current cached versions for delta
        cached_versions = await self._cache.get_all_versions(project_id)

        # Fetch all items from API
        api_items = await self._api.get_items(project_id)
        self._progress.total_items = len(api_items)
        self._progress.message = f"Processing {len(api_items)} items..."
        self._notify(on_progress)

        api_ids: set[int] = set()
        batch: list[dict[str, Any]] = []

        # Use bulk_write() context if the cache supports it (ProjectDb / CacheManager)
        # Falls back to direct calls for legacy JamaCache
        bulk_ctx = getattr(self._cache, "bulk_write", None)

        async def _flush(b: list[dict[str, Any]]) -> None:
            await self._cache.upsert_items_batch(b)

        if bulk_ctx is not None:
            ctx_manager = bulk_ctx()
        else:
            from contextlib import asynccontextmanager

            @asynccontextmanager
            async def _noop():
                yield self._cache

            ctx_manager = _noop()

        async with ctx_manager:
            for item in api_items:
                if self._cancel_event.is_set():
                    raise asyncio.CancelledError()

                item_id = item["id"]
                api_ids.add(item_id)
                api_version = item.get("version", 0)

                cached_ver = cached_versions.get(item_id)
                if cached_ver is None:
                    self._progress.new_items += 1
                    batch.append(item)
                elif cached_ver != api_version:
                    self._progress.changed_items += 1
                    batch.append(item)

                self._progress.processed_items += 1

                if len(batch) >= self._batch_size:
                    await _flush(batch)
                    batch.clear()
                    self._notify(on_progress)

            # Flush remaining batch inside the bulk_write context
            if batch:
                await _flush(batch)

        # Detect deletions
        deleted_ids = set(cached_versions.keys()) - api_ids
        if deleted_ids:
            self._progress.deleted_items = len(deleted_ids)
            await self._cache.delete_items(list(deleted_ids))

        self._progress.message = (
            f"Items: {self._progress.new_items} new, "
            f"{self._progress.changed_items} changed, "
            f"{self._progress.deleted_items} deleted"
        )
        self._notify(on_progress)
        logger.info(
            "Project %d: %d items (%d new, %d changed, %d deleted)",
            project_id, len(api_items),
            self._progress.new_items,
            self._progress.changed_items,
            self._progress.deleted_items,
        )

    async def _sync_relationships(self, project_id: int, on_progress: ProgressCallback) -> None:
        """Sync relationships for a project.

        Uses the bulk /relationships endpoint. If it fails (newer Jama versions
        require ``lastId`` cursor), relationships are skipped during sync and
        fetched on-demand per-item in the viewer.
        """
        self._progress.message = "Syncing relationships..."
        self._notify(on_progress)

        try:
            rels = await self._api.get_relationships(project_id)
            await self._cache.upsert_relationships_batch(rels, project_id)
            logger.info("Project %d: %d relationships synced", project_id, len(rels))
        except JamaApiError as e:
            logger.warning(
                "Bulk relationships failed for project %d (%s) — "
                "relationships will be fetched on-demand per item",
                project_id, e,
            )

    async def _sync_test_management(self, project_id: int, on_progress: ProgressCallback) -> None:
        """Sync test plans, cycles, and runs — with concurrent fetching."""
        self._progress.message = "Syncing test management data..."
        self._notify(on_progress)

        try:
            plans = await self._api.get_test_plans(project_id)

            # Upsert all plans first.
            # ProjectDb.upsert_test_plan() uses self._project_id internally;
            # legacy JamaCache.upsert_test_plan() accepts (plan, project_id).
            for plan in plans:
                try:
                    await self._cache.upsert_test_plan(plan)
                except TypeError:
                    await self._cache.upsert_test_plan(plan, project_id)  # legacy shim

            # Fetch cycles for ALL plans concurrently
            async def sync_plan_cycles(plan: dict) -> list[tuple[dict, int]]:
                """Returns list of (cycle, plan_id) tuples."""
                if self._cancel_event.is_set():
                    raise asyncio.CancelledError()
                try:
                    cycles = await self._api.get_test_cycles(plan["id"])
                    return [(c, plan["id"]) for c in cycles]
                except JamaApiError as e:
                    logger.warning("Failed to sync test cycles for plan %d: %s", plan["id"], e)
                    self._progress.errors += 1
                    return []

            cycle_results = await asyncio.gather(
                *(sync_plan_cycles(p) for p in plans)
            )
            all_cycles = [item for sublist in cycle_results for item in sublist]

            # Upsert all cycles
            for cycle, plan_id in all_cycles:
                await self._cache.upsert_test_cycle(cycle, plan_id)

            # Fetch runs for ALL cycles concurrently
            async def sync_cycle_runs(cycle: dict, plan_id: int) -> None:
                if self._cancel_event.is_set():
                    raise asyncio.CancelledError()
                try:
                    runs = await self._api.get_test_runs(cycle["id"])
                    await self._cache.upsert_test_runs_batch(runs, cycle["id"])
                except JamaApiError as e:
                    logger.warning("Failed to sync test runs for cycle %d: %s", cycle["id"], e)
                    self._progress.errors += 1

            await asyncio.gather(
                *(sync_cycle_runs(c, pid) for c, pid in all_cycles)
            )

            logger.info("Project %d: %d test plans, %d cycles synced", project_id, len(plans), len(all_cycles))

        except JamaApiError as e:
            logger.warning("Failed to sync test plans for project %d: %s", project_id, e)
            self._progress.errors += 1

    # ---------- Incremental sync ----------

    async def incremental_sync(
        self,
        project_id: int,
        on_progress: ProgressCallback = None,
    ) -> SyncProgress:
        """Incremental sync — only fetch items modified since last sync."""
        last_sync = await self._cache.get_last_sync(project_id)
        if not last_sync or not last_sync.get("completed_at"):
            logger.info("No previous sync found, doing full sync for project %d", project_id)
            return await self.sync_project(project_id, on_progress)

        # Jama API requires ISO 8601: yyyy-MM-dd'T'HH:mm:ss.SSSZ
        raw_since = last_sync["completed_at"]
        from datetime import datetime, timezone
        try:
            dt = datetime.fromisoformat(raw_since)
            since = dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}+0000"
        except (ValueError, TypeError):
            since = raw_since
        self._reset_progress(project_id)
        log_id = await self._cache.log_sync_start(project_id)

        try:
            self._progress.message = f"Fetching items modified since {since}..."
            self._notify(on_progress)

            modified = await self._api.get_abstract_items(project_id, modified_since=since)
            self._progress.total_items = len(modified)

            batch: list[dict[str, Any]] = []
            for item_data in modified:
                if self._cancel_event.is_set():
                    raise asyncio.CancelledError()

                # Fetch full item detail
                try:
                    full_item = await self._api.get_item(item_data["id"])
                    batch.append(full_item)
                    self._progress.changed_items += 1
                except JamaApiError as e:
                    logger.warning("Failed to fetch item %d: %s", item_data["id"], e)
                    self._progress.errors += 1

                self._progress.processed_items += 1

                if len(batch) >= self._batch_size:
                    await self._cache.upsert_items_batch(batch)
                    batch.clear()
                    self._notify(on_progress)

            if batch:
                await self._cache.upsert_items_batch(batch)

            # Rebuild FTS
            await self._cache.rebuild_fts()

            self._progress.state = SyncState.DONE
            self._progress.completed_at = datetime.now(timezone.utc)
            self._progress.message = f"Incremental: {self._progress.changed_items} items updated"
            self._notify(on_progress)

        except asyncio.CancelledError:
            self._progress.state = SyncState.ERROR
            self._progress.message = "Sync cancelled"
        except Exception as e:
            self._progress.state = SyncState.ERROR
            self._progress.errors += 1
            self._progress.message = f"Incremental sync error: {e}"
            logger.error("Incremental sync error: %s", e, exc_info=True)

        await self._cache.log_sync_complete(
            log_id,
            total=self._progress.total_items,
            changed=self._progress.changed_items,
            new=self._progress.new_items,
            deleted=self._progress.deleted_items,
            errors=self._progress.errors,
            status=self._progress.state.value,
            message=self._progress.message,
        )

        return self._progress

    # ---------- Multi-project sync ----------

    async def sync_multiple_projects(
        self,
        project_ids: list[int],
        on_progress: ProgressCallback = None,
    ) -> list[SyncProgress]:
        """Sync multiple projects sequentially."""
        results: list[SyncProgress] = []
        for pid in project_ids:
            result = await self.sync_project(pid, on_progress)
            results.append(result)
        return results

    # ---------- Helpers ----------

    def _notify(self, callback: ProgressCallback) -> None:
        if callback:
            callback(self._progress)
