"""ProjectDb — per-project SQLite database with bulk-write optimisation.

Key improvements over JamaCache (cache.py):
  - bulk_write() context manager defers all FTS updates to one rebuild
    (~59,500 FTS ops during full sync → 1 rebuild = ~60× speedup)
  - upsert_relationships_batch() uses executemany (not a Python loop)
  - upsert_test_cycle/run() use self._project_id (no JOIN queries)
  - upsert_image_blob() for _with_images variant
  - No assert self._db — raises descriptive RuntimeError instead
"""

from __future__ import annotations

import json
import logging
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator

import aiosqlite

from .fts import (
    UPSERT_FTS_SQL,
    FtsEntry,
    fts_entry_to_row,
    fts_from_item,
    fts_from_test_cycle,
    fts_from_test_plan,
    fts_from_test_run,
)
from .schema import MIGRATION_SQL, REBUILD_FTS_SQL, SCHEMA_SQL, SCHEMA_VERSION
from .utils import execute_commit, executemany_commit, fetch_all, fetch_one, fetch_scalar

logger = logging.getLogger(__name__)

_LRU_MAX = 1000


class ProjectDb:
    """Async SQLite database for a single Jama project."""

    def __init__(self, path: Path, project_id: int) -> None:
        self._path = path
        self._project_id = project_id
        self._db: aiosqlite.Connection | None = None
        self._bulk_mode: bool = False
        # Proper LRU using OrderedDict.move_to_end()
        self._lru: OrderedDict[int, dict[str, Any]] = OrderedDict()

    @property
    def project_id(self) -> int:
        return self._project_id

    @property
    def db_path(self) -> Path:
        return self._path

    @property
    def _conn(self) -> aiosqlite.Connection:
        if self._db is None:
            raise RuntimeError(f"ProjectDb {self._project_id} is not open — call open() first")
        return self._db

    # ---------- Lifecycle ----------

    async def open(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._db = await aiosqlite.connect(str(self._path))
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.execute("PRAGMA synchronous=NORMAL")

        # Check if this is a brand-new DB (no schema_version yet)
        rows = await self._db.execute_fetchall(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='meta'"
        )
        is_fresh = len(rows) == 0

        await self._db.executescript(SCHEMA_SQL)

        if is_fresh:
            # SCHEMA_SQL already creates all tables at the current version —
            # stamp version immediately so _migrate() skips the ALTER TABLE steps.
            await self._db.execute(
                "INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version',?)",
                (str(SCHEMA_VERSION),),
            )
            await self._db.commit()
            logger.info("ProjectDb created fresh at v%d: %s", SCHEMA_VERSION, self._path.name)
        else:
            await self._migrate()

        logger.info("ProjectDb opened: %s (project %d)", self._path.name, self._project_id)

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            self._db = None

    async def __aenter__(self) -> "ProjectDb":
        await self.open()
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.close()

    # ---------- Schema migration ----------

    async def _migrate(self) -> None:
        db = self._conn
        rows = await db.execute_fetchall("SELECT value FROM meta WHERE key='schema_version'")
        old = int(rows[0][0]) if rows else 0
        if old >= SCHEMA_VERSION:
            await db.execute(
                "INSERT OR IGNORE INTO meta(key,value) VALUES('schema_version',?)",
                (str(SCHEMA_VERSION),),
            )
            await db.commit()
            return

        if old == 0:
            # Distinguish a genuine v3→v4 migration from a half-initialised fresh DB:
            # SCHEMA_SQL already creates test_cycles.project_id for brand-new files;
            # if the column exists but schema_version was never stamped (e.g. crash
            # after SCHEMA_SQL but before version write), skip migrations entirely.
            col_rows = await db.execute_fetchall(
                "SELECT name FROM pragma_table_info('test_cycles') WHERE name='project_id'"
            )
            if col_rows:
                logger.info(
                    "ProjectDb %d: v4 schema detected (unstamped) — skipping migration",
                    self._project_id,
                )
                await db.execute(
                    "INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version',?)",
                    (str(SCHEMA_VERSION),),
                )
                await db.commit()
                return

        logger.info("Migrating ProjectDb %d: v%d -> v%d", self._project_id, old, SCHEMA_VERSION)
        for v in range(old + 1, SCHEMA_VERSION + 1):
            if v in MIGRATION_SQL:
                sql = MIGRATION_SQL[v]
                # executescript cannot run inside a transaction
                await db.executescript(sql)
        await db.execute(
            "INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version',?)",
            (str(SCHEMA_VERSION),),
        )
        await db.commit()

    # ---------- Bulk write context ----------

    @asynccontextmanager
    async def bulk_write(self) -> AsyncIterator["ProjectDb"]:
        """Defer FTS rebuilds to end of block for ~60× sync speedup.

        Usage:
            async with db.bulk_write():
                for item in items:
                    await db.upsert_item(item)
                # FTS rebuilt once here
        """
        self._bulk_mode = True
        try:
            yield self
        finally:
            self._bulk_mode = False
            await self._rebuild_fts()
            await self._conn.commit()

    async def _rebuild_fts(self) -> None:
        await self._conn.execute(REBUILD_FTS_SQL)

    # Public alias used by SyncEngine (and tests)
    async def rebuild_fts(self) -> None:
        await self._rebuild_fts()

    # ---------- LRU helpers ----------

    def _lru_put(self, item_id: int, data: dict[str, Any]) -> None:
        if item_id in self._lru:
            self._lru.move_to_end(item_id)
        else:
            if len(self._lru) >= _LRU_MAX:
                self._lru.popitem(last=False)  # remove oldest
            self._lru[item_id] = data

    def _lru_get(self, item_id: int) -> dict[str, Any] | None:
        if item_id in self._lru:
            self._lru.move_to_end(item_id)
            return self._lru[item_id]
        return None

    # ---------- FTS helper ----------

    async def _upsert_fts(self, entry: FtsEntry) -> None:
        """Upsert a single FTS entry (skipped during bulk_mode)."""
        if self._bulk_mode:
            return
        await self._conn.execute(UPSERT_FTS_SQL, fts_entry_to_row(entry))

    # ---------- Projects ----------

    async def upsert_project(self, project: dict[str, Any]) -> None:
        from ..item_utils import extract_parent_id
        fields = project.get("fields", {})
        await self._conn.execute(
            """INSERT INTO projects(id, project_key, name, description, is_folder, parent_id, fields_json, synced_at)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 project_key=excluded.project_key, name=excluded.name,
                 description=excluded.description, is_folder=excluded.is_folder,
                 parent_id=excluded.parent_id, fields_json=excluded.fields_json,
                 synced_at=excluded.synced_at""",
            (
                project["id"],
                project.get("projectKey", ""),
                fields.get("name", ""),
                fields.get("description", ""),
                1 if project.get("isFolder", False) else 0,
                extract_parent_id(project.get("parent")),
                json.dumps(fields),
                time.time(),
            ),
        )
        await self._conn.commit()

    async def get_projects(self) -> list[dict[str, Any]]:
        return await fetch_all(self._conn, "SELECT * FROM projects ORDER BY name")

    async def get_project(self, project_id: int) -> dict[str, Any] | None:
        return await fetch_one(self._conn, "SELECT * FROM projects WHERE id=?", project_id)

    # ---------- Items ----------

    async def upsert_item(self, item: dict[str, Any]) -> None:
        db = self._conn
        item_id = item["id"]
        fields = item.get("fields", {})
        name = fields.get("name", fields.get("title", ""))
        desc = fields.get("description", "")

        project_id = item.get("project", self._project_id)
        if isinstance(project_id, dict):
            project_id = project_id.get("id", self._project_id)

        parent_id: int | None = None
        location = item.get("location", {})
        if location and location.get("parent", {}).get("item"):
            parent_id = location["parent"]["item"]

        now = time.time()
        await db.execute(
            """INSERT INTO items(id, project_id, item_type, document_key, global_id,
                   name, description, parent_id, created_date, modified_date,
                   modified_by, created_by, version, current_version,
                   fields_json, resources_json, location_json, synced_at)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 project_id=excluded.project_id, item_type=excluded.item_type,
                 document_key=excluded.document_key, global_id=excluded.global_id,
                 name=excluded.name, description=excluded.description,
                 parent_id=excluded.parent_id, created_date=excluded.created_date,
                 modified_date=excluded.modified_date, modified_by=excluded.modified_by,
                 created_by=excluded.created_by, version=excluded.version,
                 current_version=excluded.current_version, fields_json=excluded.fields_json,
                 resources_json=excluded.resources_json, location_json=excluded.location_json,
                 synced_at=excluded.synced_at""",
            (
                item_id, project_id, item.get("itemType", 0),
                item.get("documentKey", ""), item.get("globalId", ""),
                name, desc, parent_id,
                item.get("createdDate"), item.get("modifiedDate"),
                item.get("modifiedBy"), item.get("createdBy"),
                item.get("version", 0), item.get("currentVersion", 0),
                json.dumps(fields), json.dumps(item.get("resources", {})),
                json.dumps(location), now,
            ),
        )
        await db.execute(
            """INSERT INTO versions(item_id, version, synced_at) VALUES(?, ?, ?)
               ON CONFLICT(item_id) DO UPDATE SET version=excluded.version, synced_at=excluded.synced_at""",
            (item_id, item.get("version", 0), now),
        )

        await self._upsert_fts(fts_from_item(item, project_id))
        if not self._bulk_mode:
            await db.commit()
        self._lru_put(item_id, item)

    async def upsert_items_batch(self, items: list[dict[str, Any]]) -> None:
        """Upsert a batch of items. Use bulk_write() context for large syncs."""
        for item in items:
            await self.upsert_item(item)
        if not self._bulk_mode:
            await self._conn.commit()

    async def get_item(self, item_id: int) -> dict[str, Any] | None:
        cached = self._lru_get(item_id)
        if cached:
            return cached
        row = await fetch_one(self._conn, "SELECT * FROM items WHERE id=?", item_id)
        if row:
            self._lru_put(item_id, row)
        return row

    async def get_items_by_project(self, project_id: int) -> list[dict[str, Any]]:
        return await fetch_all(
            self._conn,
            "SELECT * FROM items WHERE project_id=? ORDER BY document_key",
            project_id,
        )

    async def get_all_items(self) -> list[dict[str, Any]]:
        """Return all items in this DB (used by generate_caches.py image scan)."""
        return await fetch_all(self._conn, "SELECT * FROM items")

    async def get_item_children(self, item_id: int) -> list[dict[str, Any]]:
        return await fetch_all(
            self._conn,
            "SELECT * FROM items WHERE parent_id=? ORDER BY document_key",
            item_id,
        )

    async def get_item_by_document_key(self, document_key: str) -> dict[str, Any] | None:
        return await fetch_one(
            self._conn,
            "SELECT * FROM items WHERE document_key=? LIMIT 1",
            document_key,
        )

    async def get_item_by_document_key_suffix(self, suffix: str) -> dict[str, Any] | None:
        """Resolve partial doc key (e.g. 'SET-43' matches 'IQ-SET-43')."""
        return await fetch_one(
            self._conn,
            "SELECT * FROM items WHERE document_key LIKE ? LIMIT 1",
            f"%{suffix}",
        )

    async def get_items_by_document_keys(self, keys: list[str]) -> list[dict[str, Any]]:
        if not keys:
            return []
        ph = ",".join("?" for _ in keys)
        return await fetch_all(self._conn, f"SELECT * FROM items WHERE document_key IN ({ph})", *keys)

    async def get_project_item_ids(self, project_id: int) -> list[int]:
        rows = await self._conn.execute_fetchall(
            "SELECT id FROM items WHERE project_id=?", (project_id,)
        )
        return [r[0] for r in rows]

    async def get_item_count(self, project_id: int) -> int:
        return await fetch_scalar(
            self._conn,
            "SELECT COUNT(*) FROM items WHERE project_id=?",
            project_id,
            default=0,
        )

    async def get_all_versions(self, project_id: int) -> dict[int, int]:
        rows = await self._conn.execute_fetchall(
            "SELECT v.item_id, v.version FROM versions v JOIN items i ON v.item_id=i.id WHERE i.project_id=?",
            (project_id,),
        )
        return {r["item_id"]: r["version"] for r in rows}

    async def delete_items(self, item_ids: list[int]) -> None:
        if not item_ids:
            return
        ph = ",".join("?" for _ in item_ids)
        await self._conn.execute(f"DELETE FROM items WHERE id IN ({ph})", item_ids)
        await self._conn.execute(f"DELETE FROM versions WHERE item_id IN ({ph})", item_ids)
        await self._conn.commit()
        for iid in item_ids:
            self._lru.pop(iid, None)

    async def scan_item_descriptions(self, project_id: int) -> list[dict[str, Any]]:
        """Return (id, description) rows for image URL scanning — no full-row load."""
        return await fetch_all(
            self._conn,
            "SELECT id, description FROM items WHERE project_id=?",
            project_id,
        )

    # ---------- Item Versions ----------

    async def upsert_item_version(self, version_data: dict[str, Any]) -> None:
        await self._conn.execute(
            """INSERT INTO item_versions(item_id, version_num, fields_json, description_html,
                   modified_by, modified_date, created_date, type, version_comment, cached_at)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(item_id, version_num) DO NOTHING""",
            (
                version_data["item_id"], version_data["version_num"],
                version_data.get("fields_json", "{}"),
                version_data.get("description_html", ""),
                version_data.get("modified_by"),
                version_data.get("modified_date"),
                version_data.get("created_date"),
                version_data.get("type", ""),
                version_data.get("version_comment", ""),
                time.time(),
            ),
        )
        await self._conn.commit()

    async def get_item_version(self, item_id: int, version_num: int) -> dict[str, Any] | None:
        return await fetch_one(
            self._conn,
            "SELECT * FROM item_versions WHERE item_id=? AND version_num=?",
            item_id, version_num,
        )

    async def get_item_version_list(self, item_id: int) -> list[dict[str, Any]]:
        return await fetch_all(
            self._conn,
            "SELECT * FROM item_versions WHERE item_id=? ORDER BY version_num DESC",
            item_id,
        )

    # ---------- Relationships ----------

    async def upsert_relationships_batch(self, rels: list[dict[str, Any]]) -> None:
        """Single executemany — replaces Python loop (Perf-4: N queries → 1)."""
        now = time.time()
        await executemany_commit(
            self._conn,
            """INSERT INTO relationships(id, project_id, from_item, to_item,
                   relationship_type, suspect, synced_at)
               VALUES(?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 from_item=excluded.from_item, to_item=excluded.to_item,
                 relationship_type=excluded.relationship_type,
                 suspect=excluded.suspect, synced_at=excluded.synced_at""",
            [
                (
                    r["id"], self._project_id,
                    r.get("fromItem", 0), r.get("toItem", 0),
                    r.get("relationshipType"),
                    1 if r.get("suspect", False) else 0,
                    now,
                )
                for r in rels
            ],
        )

    async def get_relationships(self, project_id: int) -> list[dict[str, Any]]:
        return await fetch_all(
            self._conn, "SELECT * FROM relationships WHERE project_id=?", project_id
        )

    async def get_item_upstream_relations(self, item_id: int) -> list[dict[str, Any]]:
        return await fetch_all(
            self._conn,
            """SELECT r.*, i.name AS from_name, i.document_key AS from_document_key
               FROM relationships r LEFT JOIN items i ON i.id=r.from_item
               WHERE r.to_item=?""",
            item_id,
        )

    async def get_item_downstream_relations(self, item_id: int) -> list[dict[str, Any]]:
        return await fetch_all(
            self._conn,
            """SELECT r.*, i.name AS to_name, i.document_key AS to_document_key
               FROM relationships r LEFT JOIN items i ON i.id=r.to_item
               WHERE r.from_item=?""",
            item_id,
        )

    # ---------- Attachments ----------

    async def upsert_attachment(self, att: dict[str, Any], item_id: int) -> None:
        await self._conn.execute(
            """INSERT INTO attachments(id, item_id, file_name, file_size, mime_type, url, local_path, synced_at)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 file_name=excluded.file_name, file_size=excluded.file_size,
                 mime_type=excluded.mime_type, url=excluded.url,
                 local_path=excluded.local_path, synced_at=excluded.synced_at""",
            (
                att["id"], item_id,
                att.get("fileName", ""), att.get("fileSize", 0),
                att.get("mimeType", ""), att.get("url", ""),
                att.get("local_path"), time.time(),
            ),
        )
        await self._conn.commit()

    async def get_item_attachments(self, item_id: int) -> list[dict[str, Any]]:
        return await fetch_all(self._conn, "SELECT * FROM attachments WHERE item_id=?", item_id)

    # ---------- Images (BLOB — _with_images variant) ----------

    async def upsert_image_blob(
        self, attachment_id: int, file_name: str, mime_type: str, data: bytes
    ) -> None:
        await self._conn.execute(
            """INSERT INTO images(attachment_id, file_name, mime_type, data, size_bytes, cached_at)
               VALUES(?, ?, ?, ?, ?, ?)
               ON CONFLICT(attachment_id) DO UPDATE SET
                 mime_type=excluded.mime_type, data=excluded.data,
                 size_bytes=excluded.size_bytes, cached_at=excluded.cached_at""",
            (attachment_id, file_name, mime_type, data, len(data), time.time()),
        )
        await self._conn.commit()

    async def get_image_blob(self, attachment_id: int) -> tuple[str, bytes] | None:
        """Return (mime_type, data) if image is embedded, else None."""
        row = await fetch_one(
            self._conn,
            "SELECT mime_type, data FROM images WHERE attachment_id=?",
            attachment_id,
        )
        if row:
            return row["mime_type"], row["data"]
        return None

    async def has_images_table(self) -> bool:
        count = await fetch_scalar(
            self._conn,
            "SELECT COUNT(*) FROM images LIMIT 1",
            default=0,
        )
        return count is not None

    # ---------- Test Plans ----------

    async def upsert_test_plan(self, plan: dict[str, Any]) -> None:
        """project_id from self._project_id — no JOIN needed."""
        fields = plan.get("fields", {})
        plan_name = fields.get("name", plan.get("name", ""))
        plan_desc = fields.get("description", plan.get("description", ""))
        plan_status = fields.get("status", plan.get("status", ""))

        await self._conn.execute(
            """INSERT INTO test_plans(id, project_id, name, description, status, archived,
                   created_date, modified_date, fields_json, synced_at)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name=excluded.name, description=excluded.description,
                 status=excluded.status, archived=excluded.archived,
                 created_date=excluded.created_date, modified_date=excluded.modified_date,
                 fields_json=excluded.fields_json, synced_at=excluded.synced_at""",
            (
                plan["id"], self._project_id, plan_name, plan_desc, plan_status,
                1 if plan.get("archived", False) else 0,
                plan.get("createdDate"), plan.get("modifiedDate"),
                json.dumps(fields), time.time(),
            ),
        )
        await self._upsert_fts(fts_from_test_plan(plan, self._project_id))
        if not self._bulk_mode:
            await self._conn.commit()

    async def get_test_plans(self, project_id: int) -> list[dict[str, Any]]:
        return await fetch_all(
            self._conn, "SELECT * FROM test_plans WHERE project_id=? ORDER BY name", project_id
        )

    # ---------- Test Cycles ----------

    async def upsert_test_cycle(self, cycle: dict[str, Any], plan_id: int) -> None:
        """project_id from self._project_id — eliminates JOIN to test_plans (Perf-3)."""
        fields = cycle.get("fields", {})
        cycle_name = fields.get("name", cycle.get("name", ""))
        cycle_desc = fields.get("description", cycle.get("description", ""))
        cycle_status = fields.get("status", cycle.get("status", ""))

        await self._conn.execute(
            """INSERT INTO test_cycles(id, test_plan_id, project_id, name, description,
                   start_date, end_date, status, created_date, modified_date, fields_json, synced_at)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 project_id=excluded.project_id,
                 name=excluded.name, description=excluded.description,
                 start_date=excluded.start_date, end_date=excluded.end_date,
                 status=excluded.status, created_date=excluded.created_date,
                 modified_date=excluded.modified_date, fields_json=excluded.fields_json,
                 synced_at=excluded.synced_at""",
            (
                cycle["id"], plan_id, self._project_id,
                cycle_name, cycle_desc,
                cycle.get("startDate"), cycle.get("endDate"), cycle_status,
                cycle.get("createdDate"), cycle.get("modifiedDate"),
                json.dumps(fields), time.time(),
            ),
        )
        await self._upsert_fts(fts_from_test_cycle(cycle, self._project_id, plan_id))
        if not self._bulk_mode:
            await self._conn.commit()

    async def get_test_cycles(self, plan_id: int) -> list[dict[str, Any]]:
        return await fetch_all(
            self._conn, "SELECT * FROM test_cycles WHERE test_plan_id=? ORDER BY name", plan_id
        )

    # ---------- Test Runs ----------

    async def upsert_test_run(self, run: dict[str, Any], cycle_id: int) -> None:
        """project_id from self._project_id — eliminates 2-JOIN chain (Perf-3)."""
        fields = run.get("fields", {})
        run_name = fields.get("name", run.get("name", ""))
        run_status = fields.get("testRunStatus", run.get("status", "NOT_RUN"))
        actual_results = fields.get("actualResults", run.get("actualResults", ""))

        test_case = run.get("testCase")
        tc_id = test_case.get("id") if isinstance(test_case, dict) else test_case

        await self._conn.execute(
            """INSERT INTO test_runs(id, test_cycle_id, project_id, test_case_id,
                   test_case_version_number, name, status, assigned_to, actual_results,
                   execution_date, planned_results, fields_json, synced_at)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 project_id=excluded.project_id,
                 status=excluded.status, assigned_to=excluded.assigned_to,
                 actual_results=excluded.actual_results, execution_date=excluded.execution_date,
                 planned_results=excluded.planned_results, fields_json=excluded.fields_json,
                 synced_at=excluded.synced_at""",
            (
                run["id"], cycle_id, self._project_id, tc_id,
                run.get("testCaseVersionNumber"),
                run_name, run_status, run.get("assignedTo"),
                actual_results, run.get("executionDate"),
                fields.get("plannedResults", ""),
                json.dumps(fields), time.time(),
            ),
        )
        await self._upsert_fts(fts_from_test_run(run, self._project_id, cycle_id))
        if not self._bulk_mode:
            await self._conn.commit()

    async def upsert_test_runs_batch(self, runs: list[dict[str, Any]], cycle_id: int) -> None:
        for r in runs:
            await self.upsert_test_run(r, cycle_id)

    async def get_test_runs(self, cycle_id: int) -> list[dict[str, Any]]:
        return await fetch_all(
            self._conn, "SELECT * FROM test_runs WHERE test_cycle_id=? ORDER BY name", cycle_id
        )

    async def get_test_run(self, run_id: int) -> dict[str, Any] | None:
        return await fetch_one(self._conn, "SELECT * FROM test_runs WHERE id=?", run_id)

    async def update_test_run_status(
        self, run_id: int, status: str, actual_results: str = "", execution_date: str = ""
    ) -> None:
        await execute_commit(
            self._conn,
            """UPDATE test_runs SET status=?, actual_results=?, execution_date=?, synced_at=?
               WHERE id=?""",
            status, actual_results, execution_date or datetime.now(timezone.utc).isoformat(),
            time.time(), run_id,
        )

    # ---------- Sync Log ----------

    async def log_sync_start(self, project_id: int) -> int:
        now = datetime.now(timezone.utc).isoformat()
        cursor = await self._conn.execute(
            "INSERT INTO sync_log(project_id, started_at) VALUES(?, ?)", (project_id, now)
        )
        await self._conn.commit()
        return cursor.lastrowid  # type: ignore[return-value]

    async def log_sync_complete(
        self,
        log_id: int,
        total: int,
        changed: int,
        new: int,
        deleted: int,
        errors: int,
        status: str = "done",
        message: str = "",
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        await execute_commit(
            self._conn,
            """UPDATE sync_log SET completed_at=?, total_items=?, changed_items=?,
               new_items=?, deleted_items=?, errors=?, status=?, message=?
               WHERE id=?""",
            now, total, changed, new, deleted, errors, status, message, log_id,
        )

    async def get_last_sync(self, project_id: int) -> dict[str, Any] | None:
        return await fetch_one(
            self._conn,
            "SELECT * FROM sync_log WHERE project_id=? ORDER BY id DESC LIMIT 1",
            project_id,
        )

    # ---------- Unified FTS ----------

    async def upsert_unified_fts_entry(
        self,
        entity_id: int,
        doc_type: str,
        project_id: int,
        status: str,
        name: str,
        description: str,
        document_key: str,
        extra_text: str,
    ) -> None:
        """Legacy-compatible signature used by search.py and testing.py."""
        entry = FtsEntry(
            entity_id=entity_id,
            doc_type=doc_type,
            project_id=project_id,
            status=status,
            name=name,
            description=description,
            document_key=document_key,
            extra_text=extra_text,
        )
        await self._conn.execute(UPSERT_FTS_SQL, fts_entry_to_row(entry))
        if not self._bulk_mode:
            await self._conn.commit()

    async def populate_unified_fts(self) -> None:
        """Rebuild unified_fts_content from all cached data (used during migration)."""
        db = self._conn
        # Items
        rows = await db.execute_fetchall("SELECT * FROM items")
        for row in rows:
            item = dict(row)
            pid = item.get("project_id", self._project_id)
            entry = FtsEntry(
                entity_id=item["id"],
                doc_type="item",
                project_id=pid,
                status="",
                name=item.get("name", ""),
                description=item.get("description", ""),
                document_key=item.get("document_key", ""),
                extra_text=item.get("fields_json", "{}"),
            )
            await db.execute(UPSERT_FTS_SQL, fts_entry_to_row(entry))

        # Test plans
        rows = await db.execute_fetchall("SELECT * FROM test_plans")
        for row in rows:
            r = dict(row)
            entry = FtsEntry(
                entity_id=r["id"],
                doc_type="test_plan",
                project_id=r.get("project_id", self._project_id),
                status=r.get("status", ""),
                name=r.get("name", ""),
                description=r.get("description", ""),
                document_key="",
                extra_text="",
            )
            await db.execute(UPSERT_FTS_SQL, fts_entry_to_row(entry))

        # Test cycles
        rows = await db.execute_fetchall("SELECT * FROM test_cycles")
        for row in rows:
            r = dict(row)
            entry = FtsEntry(
                entity_id=r["id"],
                doc_type="test_cycle",
                project_id=r.get("project_id", self._project_id),
                status=r.get("status", ""),
                name=r.get("name", ""),
                description=r.get("description", ""),
                document_key="",
                extra_text="",
            )
            await db.execute(UPSERT_FTS_SQL, fts_entry_to_row(entry))

        # Test runs
        rows = await db.execute_fetchall("SELECT * FROM test_runs")
        for row in rows:
            r = dict(row)
            entry = FtsEntry(
                entity_id=r["id"],
                doc_type="test_run",
                project_id=r.get("project_id", self._project_id),
                status=r.get("status", "NOT_RUN"),
                name=r.get("name", ""),
                description=r.get("actual_results", ""),
                document_key="",
                extra_text=r.get("actual_results", ""),
            )
            await db.execute(UPSERT_FTS_SQL, fts_entry_to_row(entry))

        await db.commit()
        await self._rebuild_fts()

    async def get_stats(self) -> dict[str, Any]:
        """Return summary statistics about the database."""
        db = self._conn
        stats: dict[str, Any] = {"project_id": self._project_id, "db_path": str(self._path)}
        for table in ("items", "relationships", "test_plans", "test_cycles", "test_runs", "attachments"):
            try:
                count = await fetch_scalar(db, f"SELECT COUNT(*) FROM {table}", default=0)
                stats[f"{table}_count"] = count
            except Exception:
                stats[f"{table}_count"] = 0
        try:
            stats["image_count"] = await fetch_scalar(db, "SELECT COUNT(*) FROM images", default=0)
            stats["has_images"] = (stats["image_count"] or 0) > 0
        except Exception:
            stats["image_count"] = 0
            stats["has_images"] = False

        last_sync = await self.get_last_sync(self._project_id)
        stats["last_sync"] = last_sync.get("completed_at") if last_sync else None
        stats["db_size_bytes"] = self._path.stat().st_size if self._path.exists() else 0
        return stats
