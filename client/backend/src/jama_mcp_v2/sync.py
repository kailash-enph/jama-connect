"""Sync engine — fetches items from Jama API and writes to ProjectDb.

Architecture (unified DB, P1 final fix):
  ProjectDb (projects/{id}.db) is the SOLE write target for all sync
  operations. JamaCache (cache.db) is now the edit-action log only
  (undo/redo, key entries) and is NOT written to during sync.

  SyncEngine requires a CacheManager to open the target ProjectDb.
  The JamaCache reference is retained ONLY for log_sync_start/complete
  backward compat during the migration period.

Perf: _sync_items() uses ProjectDb.bulk_write() context manager,
deferring FTS rebuilds to a single operation (~60× speedup).
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

CacheLike = Union["JamaCache", "ProjectDb", "CacheManager"]

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[SyncProgress], None] | None


class SyncEngine:
    """Orchestrates full and incremental sync between Jama API and ProjectDb.

    ProjectDb is the primary and only write target for item data.
    JamaCache is NOT written to during sync — it is the edit-action log only.
    """

    def __init__(
        self,
        api: JamaApiClient,
        cache: "CacheLike",
        batch_size: int = 50,
        cache_manager: "CacheManager | None" = None,
    ):
        self._api = api
        self._cache = cache        # kept only for log_sync_start/complete compat
        self._cache_manager: "CacheManager | None" = cache_manager
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

    async def _get_project_db(self, project_id: int) -> "ProjectDb":
        """Open and return the ProjectDb for the given project.

        Raises RuntimeError if CacheManager is not configured.
        """
        if self._cache_manager is None:
            raise RuntimeError(
                "SyncEngine requires a CacheManager — "
                "configure one in ServiceRegistry.init_mcp_services()"
            )
        return await self._cache_manager.get_project_db(project_id)

    # ---------- Full project sync ----------

    async def sync_project(
        self,
        project_id: int,
        on_progress: ProgressCallback = None,
    ) -> SyncProgress:
        """Full sync of a project: items, relationships, test plans/cycles/runs.

        Writes exclusively to the per-project ProjectDb.
        """
        try:
            project_data = await self._api.get_project(project_id)
        except JamaApiError as e:
            logger.error("Failed to fetch project %d: %s", project_id, e)
            return SyncProgress(state=SyncState.ERROR, message=str(e))

        project_name = project_data.get("fields", {}).get("name", f"Project {project_id}")
        self._reset_progress(project_id, project_name)

        try:
            project_db = await self._get_project_db(project_id)
        except Exception as exc:
            logger.error("Cannot open ProjectDb for project %d: %s", project_id, exc)
            return SyncProgress(state=SyncState.ERROR, message=str(exc))

        log_id = await project_db.log_sync_start(project_id)
        logger.info("Sync started for project %d → %s", project_id, project_db.db_path)

        await project_db.upsert_project(project_data)

        try:
            t0 = time.time()

            # Phase 1: Items
            await self._sync_items(project_id, on_progress, project_db)
            t_items = time.time() - t0
            logger.info("Phase 1 (items): %.1fs", t_items)

            # Phase 2+3: Relationships + Test management in parallel
            t1 = time.time()
            self._progress.message = "Syncing relationships + test management..."
            self._notify(on_progress)
            await asyncio.gather(
                self._sync_relationships(project_id, on_progress, project_db),
                self._sync_test_management(project_id, on_progress, project_db),
            )
            t_parallel = time.time() - t1
            logger.info("Phase 2+3 (rels + tests): %.1fs", t_parallel)

            # Rebuild FTS index
            t2 = time.time()
            self._progress.message = "Rebuilding search index..."
            self._notify(on_progress)
            await project_db.rebuild_fts()
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

        await project_db.log_sync_complete(
            log_id,
            total=self._progress.total_items,
            changed=self._progress.changed_items,
            new=self._progress.new_items,
            deleted=self._progress.deleted_items,
            errors=self._progress.errors,
            status=self._progress.state.value,
            message=self._progress.message,
        )

        # Update SearchEngine if this is the active project
        try:
            from .services import services
            from .settings_api import _settings
            if _settings.active_project_id == project_id and services.search_engine:
                services.search_engine.set_db(project_db)
        except Exception:
            pass  # Non-fatal — SearchEngine update is best-effort

        return self._progress

    async def _sync_items(
        self,
        project_id: int,
        on_progress: ProgressCallback,
        project_db: "ProjectDb",
    ) -> None:
        """Fetch all items, delta-compare against ProjectDb, and upsert changed items."""
        self._progress.message = "Fetching items from Jama..."
        self._notify(on_progress)

        # Delta comparison: get current versions from ProjectDb
        cached_versions = await project_db.get_all_versions(project_id)

        api_items = await self._api.get_items(project_id)
        self._progress.total_items = len(api_items)
        self._progress.message = f"Processing {len(api_items)} items..."
        self._notify(on_progress)

        api_ids: set[int] = set()
        batch: list[dict[str, Any]] = []

        async def _flush(b: list[dict[str, Any]]) -> None:
            await project_db.upsert_items_batch(b)

        async def _run_sync():
            nonlocal batch
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

            if batch:
                await _flush(batch)

        async with project_db.bulk_write():
            await _run_sync()

        # Detect and delete removed items
        deleted_ids = set(cached_versions.keys()) - api_ids
        if deleted_ids:
            self._progress.deleted_items = len(deleted_ids)
            await project_db.delete_items(list(deleted_ids))

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

    async def _sync_relationships(
        self,
        project_id: int,
        on_progress: ProgressCallback,
        project_db: "ProjectDb",
    ) -> None:
        """Sync relationships — writes to ProjectDb only."""
        self._progress.message = "Syncing relationships..."
        self._notify(on_progress)

        try:
            rels = await self._api.get_relationships(project_id)
            await project_db.upsert_relationships_batch(rels, project_id)
            logger.info("Project %d: %d relationships synced", project_id, len(rels))
        except JamaApiError as e:
            logger.warning(
                "Bulk relationships failed for project %d (%s) — "
                "relationships will be fetched on-demand per item",
                project_id, e,
            )

    async def _sync_test_management(
        self,
        project_id: int,
        on_progress: ProgressCallback,
        project_db: "ProjectDb",
    ) -> None:
        """Sync test plans, cycles, and runs — writes to ProjectDb only."""
        self._progress.message = "Syncing test management data..."
        self._notify(on_progress)

        try:
            plans = await self._api.get_test_plans(project_id)

            for plan in plans:
                await project_db.upsert_test_plan(plan)

            # Fetch cycles for all plans concurrently
            async def sync_plan_cycles(plan: dict) -> list[tuple[dict, int]]:
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

            for cycle, plan_id in all_cycles:
                await project_db.upsert_test_cycle(cycle, plan_id)

            # Fetch runs for all cycles concurrently
            async def sync_cycle_runs(cycle: dict, plan_id: int) -> None:
                if self._cancel_event.is_set():
                    raise asyncio.CancelledError()
                try:
                    runs = await self._api.get_test_runs(cycle["id"])
                    await project_db.upsert_test_runs_batch(runs, cycle["id"])
                except JamaApiError as e:
                    logger.warning("Failed to sync test runs for cycle %d: %s", cycle["id"], e)
                    self._progress.errors += 1

            await asyncio.gather(
                *(sync_cycle_runs(c, pid) for c, pid in all_cycles)
            )

            logger.info(
                "Project %d: %d test plans, %d cycles synced",
                project_id, len(plans), len(all_cycles),
            )

        except JamaApiError as e:
            logger.warning("Failed to sync test plans for project %d: %s", project_id, e)
            self._progress.errors += 1

    # ---------- Incremental sync ----------

    async def incremental_sync(
        self,
        project_id: int,
        on_progress: ProgressCallback = None,
    ) -> SyncProgress:
        """Incremental sync — only fetch items modified since last sync.

        Reads the last sync timestamp from ProjectDb.
        Writes exclusively to ProjectDb.
        """
        try:
            project_db = await self._get_project_db(project_id)
        except Exception as exc:
            logger.error("Cannot open ProjectDb for incremental sync %d: %s", project_id, exc)
            return SyncProgress(state=SyncState.ERROR, message=str(exc))

        last_sync = await project_db.get_last_sync(project_id)
        if not last_sync or not last_sync.get("completed_at"):
            logger.info("No previous sync found, doing full sync for project %d", project_id)
            return await self.sync_project(project_id, on_progress)

        raw_since = last_sync["completed_at"]
        try:
            dt = datetime.fromisoformat(raw_since)
            since = dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}+0000"
        except (ValueError, TypeError):
            since = raw_since

        self._reset_progress(project_id)
        log_id = await project_db.log_sync_start(project_id)

        try:
            self._progress.message = f"Fetching items modified since {since}..."
            self._notify(on_progress)

            modified = await self._api.get_abstract_items(project_id, modified_since=since)
            self._progress.total_items = len(modified)

            batch: list[dict[str, Any]] = []
            for item_data in modified:
                if self._cancel_event.is_set():
                    raise asyncio.CancelledError()

                try:
                    full_item = await self._api.get_item(item_data["id"])
                    batch.append(full_item)
                    self._progress.changed_items += 1
                except JamaApiError as e:
                    logger.warning("Failed to fetch item %d: %s", item_data["id"], e)
                    self._progress.errors += 1

                self._progress.processed_items += 1

                if len(batch) >= self._batch_size:
                    await project_db.upsert_items_batch(batch)
                    batch.clear()
                    self._notify(on_progress)

            if batch:
                await project_db.upsert_items_batch(batch)

            await project_db.rebuild_fts()

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
            logger.error("Incremental sync error for project %d: %s", project_id, e, exc_info=True)

        await project_db.log_sync_complete(
            log_id,
            total=self._progress.total_items,
            changed=self._progress.changed_items,
            new=self._progress.new_items,
            deleted=self._progress.deleted_items,
            errors=self._progress.errors,
            status=self._progress.state.value,
            message=self._progress.message,
        )

        # Update SearchEngine if this is the active project
        try:
            from .services import services
            from .settings_api import _settings
            if _settings.active_project_id == project_id and services.search_engine:
                services.search_engine.set_db(project_db)
        except Exception:
            pass

        return self._progress

    def _notify(self, on_progress: ProgressCallback) -> None:
        if on_progress:
            try:
                on_progress(self._progress)
            except Exception:
                pass
