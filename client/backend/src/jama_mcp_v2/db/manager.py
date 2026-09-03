"""CacheManager — routes DB operations to the correct ProjectDb.

Replaces the global JamaCache singleton with a multi-project architecture:
  - One ProjectDb per project (opened on first access, kept open)
  - One MasterDb for project metadata
  - Backward-compatible shim interface so server.py/sync.py can adopt gradually

Three-tier cache strategy:
  1. MasterDb (master.db.gz from cache server) — project list, item counts
  2. ProjectDb (projects/{id}.db or {id}.db.gz from cache server) — full project data
  3. Legacy JamaCache (cache.db) — read-only fallback for existing data
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from .master_db import MasterDb
from .project_db import ProjectDb

logger = logging.getLogger(__name__)


class CacheManager:
    """Manages a pool of ProjectDb instances, one per project."""

    def __init__(self, cache_dir: Path, master_db_path: Path | None = None) -> None:
        self._cache_dir = cache_dir
        self._projects_dir = cache_dir / "projects"
        self._master_path = master_db_path or cache_dir / "master.db"
        self._dbs: dict[int, ProjectDb] = {}
        self._master: MasterDb | None = None
        self._lock = asyncio.Lock()

    # ---------- Lifecycle ----------

    async def open(self) -> None:
        """Open master DB; project DBs are opened lazily on first access."""
        self._projects_dir.mkdir(parents=True, exist_ok=True)
        self._master = MasterDb(self._master_path)
        await self._master.open()
        logger.info("CacheManager ready — projects dir: %s", self._projects_dir)

    async def close(self) -> None:
        for db in self._dbs.values():
            await db.close()
        self._dbs.clear()
        if self._master:
            await self._master.close()
            self._master = None

    async def __aenter__(self) -> "CacheManager":
        await self.open()
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.close()

    # ---------- Project DB access ----------

    def _project_path(self, project_id: int) -> Path:
        return self._projects_dir / f"{project_id}.db"

    async def get_project_db(self, project_id: int) -> ProjectDb:
        """Return an open ProjectDb for this project; create if needed."""
        async with self._lock:
            if project_id not in self._dbs:
                path = self._project_path(project_id)
                db = ProjectDb(path, project_id)
                await db.open()
                self._dbs[project_id] = db
                logger.info("Opened ProjectDb %d at %s", project_id, path)
            return self._dbs[project_id]

    async def has_project_db(self, project_id: int) -> bool:
        """Return True if a local DB exists for this project (opened or on disk)."""
        if project_id in self._dbs:
            return True
        return self._project_path(project_id).exists()

    async def list_local_projects(self) -> list[dict[str, Any]]:
        """Return metadata for all projects that have local DB files."""
        result = []
        for path in sorted(self._projects_dir.glob("*.db")):
            try:
                pid = int(path.stem)
            except ValueError:
                continue
            db = await self.get_project_db(pid)
            stats = await db.get_stats()
            result.append(stats)
        return result

    async def delete_project_db(self, project_id: int) -> bool:
        """Close and delete a project's DB file. Returns True if deleted."""
        async with self._lock:
            if project_id in self._dbs:
                await self._dbs[project_id].close()
                del self._dbs[project_id]
        path = self._project_path(project_id)
        if path.exists():
            path.unlink()
            logger.info("Deleted ProjectDb for project %d", project_id)
            return True
        return False

    # ---------- MasterDb access ----------

    @property
    def master(self) -> MasterDb:
        if self._master is None:
            raise RuntimeError("CacheManager not opened")
        return self._master

    async def get_all_projects(self) -> list[dict[str, Any]]:
        """Merge master DB project list with local DB status."""
        master_projects = await self.master.get_projects()
        local_set = {p["project_id"] for p in await self.list_local_projects()}
        for p in master_projects:
            p["has_local_db"] = p["id"] in local_set
        return master_projects

    # ---------- Unified search across project DBs ----------

    async def unified_search(
        self,
        query: str,
        project_id: int | None = None,
        doc_types: list[str] | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Search one or all project DBs using unified FTS5."""
        if project_id:
            if not await self.has_project_db(project_id):
                return []
            db = await self.get_project_db(project_id)
            return await _search_one(db, query, project_id, doc_types, limit)

        # Search all open project DBs and merge by rank
        results: list[dict[str, Any]] = []
        for pid in list(self._dbs):
            db = self._dbs[pid]
            rows = await _search_one(db, query, None, doc_types, limit)
            results.extend(rows)
        # Sort by rank (lower = better in FTS5), truncate
        results.sort(key=lambda r: r.get("rank", 0))
        return results[:limit]

    # ---------- Backward-compatible shim methods ----------
    # These match the JamaCache interface so server.py/sync.py can migrate gradually.

    async def upsert_project(self, project: dict[str, Any]) -> None:
        pid = project["id"]
        db = await self.get_project_db(pid)
        await db.upsert_project(project)
        # Mirror lightweight metadata to master DB
        fields = project.get("fields", {})
        name = fields.get("name", f"Project {pid}")
        await self.master.upsert_project(pid, name)

    async def get_project(self, project_id: int) -> dict[str, Any] | None:
        if not await self.has_project_db(project_id):
            return await self.master.get_project(project_id)
        db = await self.get_project_db(project_id)
        return await db.get_project(project_id)

    async def get_projects(self) -> list[dict[str, Any]]:
        return await self.master.get_projects()

    async def upsert_item(self, item: dict[str, Any]) -> None:
        pid = item.get("project", 0)
        if isinstance(pid, dict):
            pid = pid.get("id", 0)
        db = await self.get_project_db(pid)
        await db.upsert_item(item)

    async def get_item(self, item_id: int) -> dict[str, Any] | None:
        # Try all open DBs
        for db in self._dbs.values():
            row = await db.get_item(item_id)
            if row:
                return row
        return None

    async def upsert_relationships_batch(self, rels: list[dict[str, Any]], project_id: int) -> None:
        db = await self.get_project_db(project_id)
        await db.upsert_relationships_batch(rels)

    async def log_sync_start(self, project_id: int) -> int:
        db = await self.get_project_db(project_id)
        return await db.log_sync_start(project_id)

    async def log_sync_complete(self, log_id: int, project_id: int, **kwargs: Any) -> None:
        db = await self.get_project_db(project_id)
        await db.log_sync_complete(log_id, **kwargs)


async def _search_one(
    db: ProjectDb,
    query: str,
    project_id: int | None,
    doc_types: list[str] | None,
    limit: int,
) -> list[dict[str, Any]]:
    """Run a unified FTS search against a single ProjectDb."""
    conditions = ["unified_fts MATCH ?"]
    params: list[Any] = [query]

    if project_id:
        conditions.append("c.project_id = ?")
        params.append(project_id)
    if doc_types:
        ph = ",".join("?" for _ in doc_types)
        conditions.append(f"c.doc_type IN ({ph})")
        params.extend(doc_types)

    params.append(limit)
    where = " AND ".join(conditions)

    rows = await db._conn.execute_fetchall(
        f"""SELECT c.*, f.rank
            FROM unified_fts f
            JOIN unified_fts_content c ON f.rowid = c.rowid
            WHERE {where}
            ORDER BY f.rank
            LIMIT ?""",
        params,
    )
    return [dict(r) for r in rows]
