"""SQLite cache layer with TTL-based invalidation and in-memory LRU."""

from __future__ import annotations

import gzip
import json
import logging
import os
import shutil
import time
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import aiosqlite

logger = logging.getLogger(__name__)

# Default URL for pre-populated Jama cache seed (SharePoint shared link)
# Override via JAMA_CACHE_SEED_URL env var
CACHE_SEED_URL = os.environ.get(
    "JAMA_CACHE_SEED_URL",
    "",  # Set after uploading to SharePoint
)


def download_cache_seed(dest_path: Path, url: str | None = None) -> bool:
    """Download and decompress a gzipped cache seed to dest_path.

    Returns True if successful, False on any failure (network, auth, etc.).
    Never raises — a missing seed is not fatal.
    """
    seed_url = url or CACHE_SEED_URL
    if not seed_url:
        logger.debug("No cache seed URL configured (JAMA_CACHE_SEED_URL)")
        return False

    if dest_path.exists():
        logger.debug("Cache already exists at %s, skipping seed download", dest_path)
        return False

    logger.info("Downloading Jama cache seed from %s ...", seed_url)
    try:
        import urllib.request
        import tempfile

        dest_path.parent.mkdir(parents=True, exist_ok=True)

        # Download to temp file first
        with tempfile.NamedTemporaryFile(delete=False, suffix=".db.gz",
                                         dir=str(dest_path.parent)) as tmp:
            tmp_path = tmp.name
            urllib.request.urlretrieve(seed_url, tmp_path)

        # Decompress
        gz_size = os.path.getsize(tmp_path) / (1024 * 1024)
        logger.info("Downloaded %.1f MB, decompressing...", gz_size)
        with gzip.open(tmp_path, "rb") as f_in:
            with open(str(dest_path), "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)

        os.unlink(tmp_path)
        db_size = os.path.getsize(str(dest_path)) / (1024 * 1024)
        logger.info("Cache seed installed: %.1f MB at %s", db_size, dest_path)
        return True

    except Exception as exc:
        logger.warning("Failed to download cache seed: %s", exc)
        # Clean up partial downloads
        if dest_path.exists():
            dest_path.unlink(missing_ok=True)
        try:
            if 'tmp_path' in locals():
                os.unlink(tmp_path)
        except OSError:
            pass
        return False


def _extract_parent_id(parent: Any) -> int | None:
    """Extract parent project ID from Jama API response.

    Jama returns parent as either:
    - int (project ID directly)
    - dict like {"project": {"id": 123}}
    - None
    """
    if parent is None:
        return None
    if isinstance(parent, int):
        return parent
    if isinstance(parent, dict):
        proj = parent.get("project", parent)
        return proj.get("id") if isinstance(proj, dict) else proj
    return None


SCHEMA_VERSION = 3

SCHEMA_SQL = """
-- Core tables
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    id            INTEGER PRIMARY KEY,
    project_key   TEXT NOT NULL DEFAULT '',
    name          TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    is_folder     INTEGER NOT NULL DEFAULT 0,
    parent_id     INTEGER,
    fields_json   TEXT NOT NULL DEFAULT '{}',
    synced_at     REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
    id              INTEGER PRIMARY KEY,
    project_id      INTEGER NOT NULL,
    item_type       INTEGER NOT NULL DEFAULT 0,
    document_key    TEXT NOT NULL DEFAULT '',
    global_id       TEXT NOT NULL DEFAULT '',
    name            TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    parent_id       INTEGER,
    created_date    TEXT,
    modified_date   TEXT,
    modified_by     INTEGER,
    created_by      INTEGER,
    version         INTEGER NOT NULL DEFAULT 0,
    current_version INTEGER NOT NULL DEFAULT 0,
    fields_json     TEXT NOT NULL DEFAULT '{}',
    resources_json  TEXT NOT NULL DEFAULT '{}',
    location_json   TEXT NOT NULL DEFAULT '{}',
    synced_at       REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_items_project ON items(project_id);
CREATE INDEX IF NOT EXISTS idx_items_parent ON items(parent_id);
CREATE INDEX IF NOT EXISTS idx_items_dockey ON items(document_key);

CREATE TABLE IF NOT EXISTS item_versions (
    item_id        INTEGER NOT NULL,
    version_num    INTEGER NOT NULL,
    fields_json    TEXT NOT NULL DEFAULT '{}',
    description_html TEXT NOT NULL DEFAULT '',
    modified_by    INTEGER,
    modified_date  TEXT,
    created_date   TEXT,
    type           TEXT NOT NULL DEFAULT '',
    version_comment TEXT NOT NULL DEFAULT '',
    cached_at      REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, version_num)
);

CREATE TABLE IF NOT EXISTS versions (
    item_id    INTEGER NOT NULL,
    version    INTEGER NOT NULL,
    synced_at  REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id),
    FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS relationships (
    id               INTEGER PRIMARY KEY,
    project_id       INTEGER NOT NULL,
    from_item        INTEGER NOT NULL,
    to_item          INTEGER NOT NULL,
    relationship_type INTEGER,
    suspect          INTEGER NOT NULL DEFAULT 0,
    synced_at        REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rel_project ON relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_rel_from ON relationships(from_item);
CREATE INDEX IF NOT EXISTS idx_rel_to ON relationships(to_item);

CREATE TABLE IF NOT EXISTS attachments (
    id          INTEGER PRIMARY KEY,
    item_id     INTEGER NOT NULL,
    file_name   TEXT NOT NULL DEFAULT '',
    file_size   INTEGER NOT NULL DEFAULT 0,
    mime_type   TEXT NOT NULL DEFAULT '',
    url         TEXT NOT NULL DEFAULT '',
    local_path  TEXT,
    synced_at   REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_att_item ON attachments(item_id);

-- Test management tables
CREATE TABLE IF NOT EXISTS test_plans (
    id            INTEGER PRIMARY KEY,
    project_id    INTEGER NOT NULL,
    name          TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT '',
    archived      INTEGER NOT NULL DEFAULT 0,
    created_date  TEXT,
    modified_date TEXT,
    fields_json   TEXT NOT NULL DEFAULT '{}',
    synced_at     REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tp_project ON test_plans(project_id);

CREATE TABLE IF NOT EXISTS test_cycles (
    id            INTEGER PRIMARY KEY,
    test_plan_id  INTEGER NOT NULL,
    name          TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    start_date    TEXT,
    end_date      TEXT,
    status        TEXT NOT NULL DEFAULT '',
    created_date  TEXT,
    modified_date TEXT,
    fields_json   TEXT NOT NULL DEFAULT '{}',
    synced_at     REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (test_plan_id) REFERENCES test_plans(id)
);
CREATE INDEX IF NOT EXISTS idx_tc_plan ON test_cycles(test_plan_id);

CREATE TABLE IF NOT EXISTS test_runs (
    id                     INTEGER PRIMARY KEY,
    test_cycle_id          INTEGER NOT NULL,
    test_case_id           INTEGER,
    test_case_version_number INTEGER,
    name                   TEXT NOT NULL DEFAULT '',
    status                 TEXT NOT NULL DEFAULT 'NOT_RUN',
    assigned_to            INTEGER,
    actual_results         TEXT NOT NULL DEFAULT '',
    execution_date         TEXT,
    planned_results        TEXT NOT NULL DEFAULT '',
    fields_json            TEXT NOT NULL DEFAULT '{}',
    synced_at              REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (test_cycle_id) REFERENCES test_cycles(id)
);
CREATE INDEX IF NOT EXISTS idx_tr_cycle ON test_runs(test_cycle_id);
CREATE INDEX IF NOT EXISTS idx_tr_case ON test_runs(test_case_id);

-- Sync log
CREATE TABLE IF NOT EXISTS sync_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    INTEGER NOT NULL,
    started_at    TEXT NOT NULL,
    completed_at  TEXT,
    total_items   INTEGER NOT NULL DEFAULT 0,
    changed_items INTEGER NOT NULL DEFAULT 0,
    new_items     INTEGER NOT NULL DEFAULT 0,
    deleted_items INTEGER NOT NULL DEFAULT 0,
    errors        INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'running',
    message       TEXT NOT NULL DEFAULT ''
);

-- Full-text search (includes fields_json for custom field content)
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
    name,
    description,
    document_key,
    fields_json,
    content=items,
    content_rowid=id
);

-- Unified full-text search across items, test plans, test cycles, test runs
-- doc_type: 'item', 'test_plan', 'test_cycle', 'test_run'
-- entity_id: the primary key in the respective table
-- project_id: for filtering by project
-- status: for test runs (PASSED/FAILED/NOT_RUN etc.), empty for items
-- extra_json: additional searchable text (actual_results, steps, comments)
CREATE TABLE IF NOT EXISTS unified_fts_content (
    rowid         INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id     INTEGER NOT NULL,
    doc_type      TEXT NOT NULL DEFAULT 'item',
    project_id    INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT '',
    name          TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    document_key  TEXT NOT NULL DEFAULT '',
    extra_text    TEXT NOT NULL DEFAULT '',
    UNIQUE(entity_id, doc_type)
);
CREATE INDEX IF NOT EXISTS idx_ufc_entity ON unified_fts_content(entity_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_ufc_project ON unified_fts_content(project_id);

CREATE VIRTUAL TABLE IF NOT EXISTS unified_fts USING fts5(
    name,
    description,
    document_key,
    extra_text,
    content=unified_fts_content,
    content_rowid=rowid
);
"""

REBUILD_FTS_SQL = """
INSERT INTO items_fts(items_fts) VALUES('rebuild');
INSERT INTO unified_fts(unified_fts) VALUES('rebuild');
"""


class JamaCache:
    """Async SQLite cache for Jama data."""

    def __init__(self, cache_dir: str = "~/.jama-mcp-v2"):
        self._cache_dir = Path(os.path.expanduser(cache_dir))
        self._db_path = self._cache_dir / "cache.db"
        self._db: aiosqlite.Connection | None = None
        self._item_lru: dict[int, dict[str, Any]] = {}
        self._lru_max = 1000

    @property
    def db_path(self) -> Path:
        return self._db_path

    # ---------- Lifecycle ----------

    async def open(self) -> None:
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        # Try to seed cache on first run
        if not self._db_path.exists():
            download_cache_seed(self._db_path)
        self._db = await aiosqlite.connect(str(self._db_path))
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.execute("PRAGMA synchronous=NORMAL")
        await self._db.executescript(SCHEMA_SQL)

        # Check schema version and migrate if needed
        rows = await self._db.execute_fetchall(
            "SELECT value FROM meta WHERE key = 'schema_version'"
        )
        old_version = int(rows[0][0]) if rows else 0
        if old_version < SCHEMA_VERSION:
            logger.info("Schema migration %d → %d ...", old_version, SCHEMA_VERSION)

            # Rebuild items_fts
            await self._db.execute("DROP TABLE IF EXISTS items_fts")
            await self._db.executescript(
                """CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
                    name, description, document_key, fields_json,
                    content=items, content_rowid=id
                );"""
            )

            # Create unified FTS tables (new in v3)
            await self._db.execute("DROP TABLE IF EXISTS unified_fts")
            await self._db.execute("DROP TABLE IF EXISTS unified_fts_content")
            await self._db.executescript(
                """CREATE TABLE IF NOT EXISTS unified_fts_content (
                    rowid         INTEGER PRIMARY KEY AUTOINCREMENT,
                    entity_id     INTEGER NOT NULL,
                    doc_type      TEXT NOT NULL DEFAULT 'item',
                    project_id    INTEGER NOT NULL DEFAULT 0,
                    status        TEXT NOT NULL DEFAULT '',
                    name          TEXT NOT NULL DEFAULT '',
                    description   TEXT NOT NULL DEFAULT '',
                    document_key  TEXT NOT NULL DEFAULT '',
                    extra_text    TEXT NOT NULL DEFAULT '',
                    UNIQUE(entity_id, doc_type)
                );
                CREATE INDEX IF NOT EXISTS idx_ufc_entity ON unified_fts_content(entity_id, doc_type);
                CREATE INDEX IF NOT EXISTS idx_ufc_project ON unified_fts_content(project_id);

                CREATE VIRTUAL TABLE IF NOT EXISTS unified_fts USING fts5(
                    name, description, document_key, extra_text,
                    content=unified_fts_content, content_rowid=rowid
                );"""
            )

            # Populate unified_fts_content from existing data
            await self._populate_unified_fts()

            await self._db.executescript(REBUILD_FTS_SQL)
            await self._db.execute(
                "INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)",
                ("schema_version", str(SCHEMA_VERSION)),
            )
        else:
            await self._db.execute(
                "INSERT OR IGNORE INTO meta(key, value) VALUES(?, ?)",
                ("schema_version", str(SCHEMA_VERSION)),
            )
        await self._db.commit()
        logger.info("Cache opened at %s (schema v%d)", self._db_path, SCHEMA_VERSION)

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            self._db = None

    async def __aenter__(self) -> "JamaCache":
        await self.open()
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.close()

    # ---------- LRU helpers ----------

    def _lru_put(self, item_id: int, data: dict[str, Any]) -> None:
        if len(self._item_lru) >= self._lru_max:
            oldest = next(iter(self._item_lru))
            del self._item_lru[oldest]
        self._item_lru[item_id] = data

    def _lru_get(self, item_id: int) -> dict[str, Any] | None:
        return self._item_lru.get(item_id)

    # ---------- Projects ----------

    async def upsert_project(self, project: dict[str, Any]) -> None:
        assert self._db
        await self._db.execute(
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
                project.get("fields", {}).get("name", ""),
                project.get("fields", {}).get("description", ""),
                1 if project.get("isFolder", False) else 0,
                _extract_parent_id(project.get("parent")),
                json.dumps(project.get("fields", {})),
                time.time(),
            ),
        )
        await self._db.commit()

    async def get_projects(self) -> list[dict[str, Any]]:
        assert self._db
        rows = await self._db.execute_fetchall("SELECT * FROM projects ORDER BY name")
        return [dict(r) for r in rows]

    async def get_project(self, project_id: int) -> dict[str, Any] | None:
        assert self._db
        row = await self._db.execute_fetchall(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        )
        return dict(row[0]) if row else None

    # ---------- Items ----------

    async def upsert_item(self, item: dict[str, Any]) -> None:
        assert self._db
        item_id = item["id"]
        fields = item.get("fields", {})
        name = fields.get("name", fields.get("title", ""))
        desc = fields.get("description", "")
        project_id = item.get("project", 0)
        if isinstance(project_id, dict):
            project_id = project_id.get("id", 0)

        parent_id = None
        location = item.get("location", {})
        if location and location.get("parent", {}).get("item"):
            parent_id = location["parent"]["item"]

        now = time.time()
        await self._db.execute(
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
                item_id,
                project_id,
                item.get("itemType", 0),
                item.get("documentKey", ""),
                item.get("globalId", ""),
                name,
                desc,
                parent_id,
                item.get("createdDate"),
                item.get("modifiedDate"),
                item.get("modifiedBy"),
                item.get("createdBy"),
                item.get("version", 0),
                item.get("currentVersion", 0),
                json.dumps(fields),
                json.dumps(item.get("resources", {})),
                json.dumps(location),
                now,
            ),
        )

        # Update versions table
        await self._db.execute(
            """INSERT INTO versions(item_id, version, synced_at) VALUES(?, ?, ?)
               ON CONFLICT(item_id) DO UPDATE SET version=excluded.version, synced_at=excluded.synced_at""",
            (item_id, item.get("version", 0), now),
        )

        # Update unified FTS index
        await self.upsert_unified_fts_entry(
            entity_id=item_id,
            doc_type="item",
            project_id=project_id,
            status="",
            name=name,
            description=desc,
            document_key=item.get("documentKey", ""),
            extra_text=json.dumps(fields),
        )

        self._lru_put(item_id, item)

    async def upsert_items_batch(self, items: list[dict[str, Any]]) -> None:
        """Upsert a batch of items in a single transaction."""
        assert self._db
        for item in items:
            await self.upsert_item(item)
        await self._db.commit()

    async def get_item(self, item_id: int) -> dict[str, Any] | None:
        cached = self._lru_get(item_id)
        if cached:
            return cached
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT * FROM items WHERE id = ?", (item_id,)
        )
        if rows:
            d = dict(rows[0])
            self._lru_put(item_id, d)
            return d
        return None

    async def get_items_by_project(self, project_id: int) -> list[dict[str, Any]]:
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT * FROM items WHERE project_id = ? ORDER BY document_key",
            (project_id,),
        )
        return [dict(r) for r in rows]

    async def get_item_children(self, item_id: int) -> list[dict[str, Any]]:
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT * FROM items WHERE parent_id = ? ORDER BY document_key",
            (item_id,),
        )
        return [dict(r) for r in rows]

    async def get_project_item_ids(self, project_id: int) -> list[int]:
        """Return all item IDs for a project (lightweight, no full row data)."""
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT id FROM items WHERE project_id = ?",
            (project_id,),
        )
        return [r[0] for r in rows]

    async def get_item_count(self, project_id: int) -> int:
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT COUNT(*) as cnt FROM items WHERE project_id = ?",
            (project_id,),
        )
        return rows[0]["cnt"] if rows else 0

    async def get_all_versions(self, project_id: int) -> dict[int, int]:
        """Get {item_id: version} map for a project — used in delta sync."""
        assert self._db
        rows = await self._db.execute_fetchall(
            """SELECT v.item_id, v.version FROM versions v
               JOIN items i ON v.item_id = i.id
               WHERE i.project_id = ?""",
            (project_id,),
        )
        return {r["item_id"]: r["version"] for r in rows}

    async def delete_items(self, item_ids: list[int]) -> None:
        assert self._db
        if not item_ids:
            return
        placeholders = ",".join("?" * len(item_ids))
        await self._db.execute(f"DELETE FROM items WHERE id IN ({placeholders})", item_ids)
        await self._db.execute(f"DELETE FROM versions WHERE item_id IN ({placeholders})", item_ids)
        await self._db.commit()
        for iid in item_ids:
            self._item_lru.pop(iid, None)

    # ---------- Item Versions (on-demand, immutable) ----------

    async def upsert_item_version(self, version_data: dict[str, Any]) -> None:
        assert self._db
        await self._db.execute(
            """INSERT INTO item_versions(item_id, version_num, fields_json, description_html,
                   modified_by, modified_date, created_date, type, version_comment, cached_at)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(item_id, version_num) DO NOTHING""",
            (
                version_data["item_id"],
                version_data["version_num"],
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
        await self._db.commit()

    async def get_item_version(self, item_id: int, version_num: int) -> dict[str, Any] | None:
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT * FROM item_versions WHERE item_id = ? AND version_num = ?",
            (item_id, version_num),
        )
        return dict(rows[0]) if rows else None

    async def get_item_version_list(self, item_id: int) -> list[dict[str, Any]]:
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT * FROM item_versions WHERE item_id = ? ORDER BY version_num DESC",
            (item_id,),
        )
        return [dict(r) for r in rows]

    # ---------- Relationships ----------

    async def upsert_relationship(self, rel: dict[str, Any], project_id: int) -> None:
        assert self._db
        await self._db.execute(
            """INSERT INTO relationships(id, project_id, from_item, to_item, relationship_type, suspect, synced_at)
               VALUES(?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 from_item=excluded.from_item, to_item=excluded.to_item,
                 relationship_type=excluded.relationship_type,
                 suspect=excluded.suspect, synced_at=excluded.synced_at""",
            (
                rel["id"],
                project_id,
                rel.get("fromItem", 0),
                rel.get("toItem", 0),
                rel.get("relationshipType"),
                1 if rel.get("suspect", False) else 0,
                time.time(),
            ),
        )

    async def upsert_relationships_batch(self, rels: list[dict[str, Any]], project_id: int) -> None:
        for r in rels:
            await self.upsert_relationship(r, project_id)
        assert self._db
        await self._db.commit()

    async def get_relationships(self, project_id: int) -> list[dict[str, Any]]:
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT * FROM relationships WHERE project_id = ?", (project_id,)
        )
        return [dict(r) for r in rows]

    async def get_item_upstream_relations(self, item_id: int) -> list[dict[str, Any]]:
        """Get relationships where this item is the downstream (to_item) target."""
        assert self._db
        rows = await self._db.execute_fetchall(
            """SELECT r.*, i.name AS from_name, i.document_key AS from_document_key
               FROM relationships r
               LEFT JOIN items i ON i.id = r.from_item
               WHERE r.to_item = ?""",
            (item_id,),
        )
        return [dict(r) for r in rows]

    async def get_item_downstream_relations(self, item_id: int) -> list[dict[str, Any]]:
        """Get relationships where this item is the upstream (from_item) source."""
        assert self._db
        rows = await self._db.execute_fetchall(
            """SELECT r.*, i.name AS to_name, i.document_key AS to_document_key
               FROM relationships r
               LEFT JOIN items i ON i.id = r.to_item
               WHERE r.from_item = ?""",
            (item_id,),
        )
        return [dict(r) for r in rows]

    async def get_item_by_document_key(self, document_key: str) -> dict[str, Any] | None:
        """Fast exact lookup by document_key (e.g. 'SET-43', 'CMP-12')."""
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT * FROM items WHERE document_key = ? LIMIT 1",
            (document_key,),
        )
        if rows:
            d = dict(rows[0])
            self._lru_put(d["id"], d)
            return d
        return None

    async def get_items_by_document_keys(self, keys: list[str]) -> list[dict[str, Any]]:
        """Batch lookup by document_keys."""
        assert self._db
        if not keys:
            return []
        placeholders = ",".join("?" for _ in keys)
        rows = await self._db.execute_fetchall(
            f"SELECT * FROM items WHERE document_key IN ({placeholders})",
            keys,
        )
        return [dict(r) for r in rows]

    # ---------- Attachments ----------

    async def upsert_attachment(self, att: dict[str, Any], item_id: int) -> None:
        assert self._db
        await self._db.execute(
            """INSERT INTO attachments(id, item_id, file_name, file_size, mime_type, url, local_path, synced_at)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 file_name=excluded.file_name, file_size=excluded.file_size,
                 mime_type=excluded.mime_type, url=excluded.url,
                 local_path=excluded.local_path, synced_at=excluded.synced_at""",
            (
                att["id"],
                item_id,
                att.get("fileName", ""),
                att.get("fileSize", 0),
                att.get("mimeType", ""),
                att.get("url", ""),
                att.get("local_path"),
                time.time(),
            ),
        )
        await self._db.commit()

    async def get_item_attachments(self, item_id: int) -> list[dict[str, Any]]:
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT * FROM attachments WHERE item_id = ?", (item_id,)
        )
        return [dict(r) for r in rows]

    # ---------- Test Plans ----------

    async def upsert_test_plan(self, plan: dict[str, Any], project_id: int) -> None:
        assert self._db
        fields = plan.get("fields", {})
        plan_name = fields.get("name", "")
        plan_desc = fields.get("description", "")
        plan_status = fields.get("status", "")

        await self._db.execute(
            """INSERT INTO test_plans(id, project_id, name, description, status, archived,
                   created_date, modified_date, fields_json, synced_at)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name=excluded.name, description=excluded.description,
                 status=excluded.status, archived=excluded.archived,
                 created_date=excluded.created_date, modified_date=excluded.modified_date,
                 fields_json=excluded.fields_json, synced_at=excluded.synced_at""",
            (
                plan["id"],
                project_id,
                plan_name,
                plan_desc,
                plan_status,
                1 if plan.get("archived", False) else 0,
                plan.get("createdDate"),
                plan.get("modifiedDate"),
                json.dumps(fields),
                time.time(),
            ),
        )

        # Update unified FTS index
        await self.upsert_unified_fts_entry(
            entity_id=plan["id"],
            doc_type="test_plan",
            project_id=project_id,
            status=plan_status,
            name=plan_name,
            description=plan_desc,
            document_key="",
            extra_text=json.dumps(fields),
        )

        await self._db.commit()

    async def get_test_plans(self, project_id: int) -> list[dict[str, Any]]:
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT * FROM test_plans WHERE project_id = ? ORDER BY name",
            (project_id,),
        )
        return [dict(r) for r in rows]

    # ---------- Test Cycles ----------

    async def upsert_test_cycle(self, cycle: dict[str, Any], plan_id: int) -> None:
        assert self._db
        fields = cycle.get("fields", {})
        cycle_name = fields.get("name", "")
        cycle_desc = fields.get("description", "")
        cycle_status = fields.get("status", "")

        await self._db.execute(
            """INSERT INTO test_cycles(id, test_plan_id, name, description, start_date, end_date,
                   status, created_date, modified_date, fields_json, synced_at)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name=excluded.name, description=excluded.description,
                 start_date=excluded.start_date, end_date=excluded.end_date,
                 status=excluded.status, created_date=excluded.created_date,
                 modified_date=excluded.modified_date, fields_json=excluded.fields_json,
                 synced_at=excluded.synced_at""",
            (
                cycle["id"],
                plan_id,
                cycle_name,
                cycle_desc,
                cycle.get("startDate"),
                cycle.get("endDate"),
                cycle_status,
                cycle.get("createdDate"),
                cycle.get("modifiedDate"),
                json.dumps(fields),
                time.time(),
            ),
        )

        # Resolve project_id from the parent test plan
        project_id = 0
        plan_rows = await self._db.execute_fetchall(
            "SELECT project_id FROM test_plans WHERE id = ?", (plan_id,)
        )
        if plan_rows:
            project_id = plan_rows[0]["project_id"]

        # Update unified FTS index
        await self.upsert_unified_fts_entry(
            entity_id=cycle["id"],
            doc_type="test_cycle",
            project_id=project_id,
            status=cycle_status,
            name=cycle_name,
            description=cycle_desc,
            document_key="",
            extra_text=json.dumps(fields),
        )

        await self._db.commit()

    async def get_test_cycles(self, plan_id: int) -> list[dict[str, Any]]:
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT * FROM test_cycles WHERE test_plan_id = ? ORDER BY name",
            (plan_id,),
        )
        return [dict(r) for r in rows]

    # ---------- Test Runs ----------

    async def upsert_test_run(self, run: dict[str, Any], cycle_id: int) -> None:
        assert self._db
        fields = run.get("fields", {})
        run_name = fields.get("name", "")
        run_status = fields.get("testRunStatus", "NOT_RUN")
        actual_results = fields.get("actualResults", "")

        await self._db.execute(
            """INSERT INTO test_runs(id, test_cycle_id, test_case_id, test_case_version_number,
                   name, status, assigned_to, actual_results, execution_date,
                   planned_results, fields_json, synced_at)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 status=excluded.status, assigned_to=excluded.assigned_to,
                 actual_results=excluded.actual_results, execution_date=excluded.execution_date,
                 planned_results=excluded.planned_results, fields_json=excluded.fields_json,
                 synced_at=excluded.synced_at""",
            (
                run["id"],
                cycle_id,
                run.get("testCase", {}).get("id") if isinstance(run.get("testCase"), dict) else run.get("testCase"),
                run.get("testCaseVersionNumber"),
                run_name,
                run_status,
                run.get("assignedTo"),
                actual_results,
                run.get("executionDate"),
                fields.get("plannedResults", ""),
                json.dumps(fields),
                time.time(),
            ),
        )

        # Resolve project_id for unified FTS (cycle → plan → project)
        project_id = 0
        cycle_rows = await self._db.execute_fetchall(
            "SELECT test_plan_id FROM test_cycles WHERE id = ?", (cycle_id,)
        )
        if cycle_rows:
            plan_id = cycle_rows[0]["test_plan_id"]
            plan_rows = await self._db.execute_fetchall(
                "SELECT project_id FROM test_plans WHERE id = ?", (plan_id,)
            )
            if plan_rows:
                project_id = plan_rows[0]["project_id"]

        # Update unified FTS index
        await self.upsert_unified_fts_entry(
            entity_id=run["id"],
            doc_type="test_run",
            project_id=project_id,
            status=run_status,
            name=run_name,
            description=actual_results,
            document_key="",
            extra_text=json.dumps(fields),
        )

        await self._db.commit()

    async def upsert_test_runs_batch(self, runs: list[dict[str, Any]], cycle_id: int) -> None:
        for r in runs:
            await self.upsert_test_run(r, cycle_id)

    async def get_test_runs(self, cycle_id: int) -> list[dict[str, Any]]:
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT * FROM test_runs WHERE test_cycle_id = ? ORDER BY name",
            (cycle_id,),
        )
        return [dict(r) for r in rows]

    async def get_test_run(self, run_id: int) -> dict[str, Any] | None:
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT * FROM test_runs WHERE id = ?", (run_id,)
        )
        return dict(rows[0]) if rows else None

    # ---------- Sync Log ----------

    async def log_sync_start(self, project_id: int) -> int:
        assert self._db
        now = datetime.now(timezone.utc).isoformat()
        cursor = await self._db.execute(
            "INSERT INTO sync_log(project_id, started_at) VALUES(?, ?)",
            (project_id, now),
        )
        await self._db.commit()
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
        assert self._db
        now = datetime.now(timezone.utc).isoformat()
        await self._db.execute(
            """UPDATE sync_log SET completed_at=?, total_items=?, changed_items=?,
               new_items=?, deleted_items=?, errors=?, status=?, message=?
               WHERE id=?""",
            (now, total, changed, new, deleted, errors, status, message, log_id),
        )
        await self._db.commit()

    async def get_last_sync(self, project_id: int) -> dict[str, Any] | None:
        assert self._db
        rows = await self._db.execute_fetchall(
            "SELECT * FROM sync_log WHERE project_id = ? ORDER BY id DESC LIMIT 1",
            (project_id,),
        )
        return dict(rows[0]) if rows else None

    # ---------- FTS Search ----------

    async def rebuild_fts(self) -> None:
        assert self._db
        await self._db.executescript(REBUILD_FTS_SQL)
        logger.info("FTS index rebuilt")

    async def search(self, query: str, project_id: int | None = None, limit: int = 50) -> list[dict[str, Any]]:
        assert self._db
        if project_id:
            rows = await self._db.execute_fetchall(
                """SELECT i.*, rank FROM items_fts f
                   JOIN items i ON f.rowid = i.id
                   WHERE items_fts MATCH ? AND i.project_id = ?
                   ORDER BY rank LIMIT ?""",
                (query, project_id, limit),
            )
        else:
            rows = await self._db.execute_fetchall(
                """SELECT i.*, rank FROM items_fts f
                   JOIN items i ON f.rowid = i.id
                   WHERE items_fts MATCH ?
                   ORDER BY rank LIMIT ?""",
                (query, limit),
            )
        return [dict(r) for r in rows]

    # ---------- Unified FTS ----------

    async def _populate_unified_fts(self) -> None:
        """Populate unified_fts_content from existing items, test_plans, test_cycles, test_runs.

        Called once during schema migration v2 → v3.
        """
        assert self._db
        logger.info("Populating unified FTS index from existing data...")

        # Items
        await self._db.execute(
            """INSERT OR IGNORE INTO unified_fts_content
                   (entity_id, doc_type, project_id, status, name, description, document_key, extra_text)
               SELECT id, 'item', project_id, '', name, description, document_key, fields_json
               FROM items"""
        )

        # Test plans
        await self._db.execute(
            """INSERT OR IGNORE INTO unified_fts_content
                   (entity_id, doc_type, project_id, status, name, description, document_key, extra_text)
               SELECT id, 'test_plan', project_id, status, name, description, '', fields_json
               FROM test_plans"""
        )

        # Test cycles — resolve project_id through test_plans
        await self._db.execute(
            """INSERT OR IGNORE INTO unified_fts_content
                   (entity_id, doc_type, project_id, status, name, description, document_key, extra_text)
               SELECT tc.id, 'test_cycle', COALESCE(tp.project_id, 0), tc.status,
                      tc.name, tc.description, '', tc.fields_json
               FROM test_cycles tc
               LEFT JOIN test_plans tp ON tc.test_plan_id = tp.id"""
        )

        # Test runs — resolve project_id through test_cycles → test_plans
        await self._db.execute(
            """INSERT OR IGNORE INTO unified_fts_content
                   (entity_id, doc_type, project_id, status, name, description, document_key, extra_text)
               SELECT tr.id, 'test_run', COALESCE(tp.project_id, 0), tr.status,
                      tr.name, tr.actual_results, '', tr.fields_json
               FROM test_runs tr
               LEFT JOIN test_cycles tc ON tr.test_cycle_id = tc.id
               LEFT JOIN test_plans tp ON tc.test_plan_id = tp.id"""
        )

        await self._db.commit()
        cnt = await self._db.execute_fetchall("SELECT COUNT(*) as cnt FROM unified_fts_content")
        logger.info("Unified FTS populated with %d entries", cnt[0]["cnt"] if cnt else 0)

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
        """Insert or update a single row in the unified FTS content table and sync the FTS index."""
        assert self._db

        # Check if row already exists
        existing = await self._db.execute_fetchall(
            "SELECT rowid FROM unified_fts_content WHERE entity_id = ? AND doc_type = ?",
            (entity_id, doc_type),
        )

        if existing:
            old_rowid = existing[0]["rowid"]
            # Delete old FTS entry
            await self._db.execute(
                "INSERT INTO unified_fts(unified_fts, rowid, name, description, document_key, extra_text) "
                "VALUES('delete', ?, ?, ?, ?, ?)",
                (old_rowid,
                 (await self._db.execute_fetchall(
                     "SELECT name FROM unified_fts_content WHERE rowid = ?", (old_rowid,)))[0]["name"],
                 (await self._db.execute_fetchall(
                     "SELECT description FROM unified_fts_content WHERE rowid = ?", (old_rowid,)))[0]["description"],
                 (await self._db.execute_fetchall(
                     "SELECT document_key FROM unified_fts_content WHERE rowid = ?", (old_rowid,)))[0]["document_key"],
                 (await self._db.execute_fetchall(
                     "SELECT extra_text FROM unified_fts_content WHERE rowid = ?", (old_rowid,)))[0]["extra_text"],
                 ),
            )
            # Update content row
            await self._db.execute(
                """UPDATE unified_fts_content
                   SET project_id=?, status=?, name=?, description=?, document_key=?, extra_text=?
                   WHERE rowid=?""",
                (project_id, status, name, description, document_key, extra_text, old_rowid),
            )
            # Insert new FTS entry
            await self._db.execute(
                "INSERT INTO unified_fts(rowid, name, description, document_key, extra_text) "
                "VALUES(?, ?, ?, ?, ?)",
                (old_rowid, name, description, document_key, extra_text),
            )
        else:
            # Insert new content row
            cursor = await self._db.execute(
                """INSERT INTO unified_fts_content
                       (entity_id, doc_type, project_id, status, name, description, document_key, extra_text)
                   VALUES(?, ?, ?, ?, ?, ?, ?, ?)""",
                (entity_id, doc_type, project_id, status, name, description, document_key, extra_text),
            )
            new_rowid = cursor.lastrowid
            # Insert FTS entry
            await self._db.execute(
                "INSERT INTO unified_fts(rowid, name, description, document_key, extra_text) "
                "VALUES(?, ?, ?, ?, ?)",
                (new_rowid, name, description, document_key, extra_text),
            )

    async def unified_search(
        self,
        query: str,
        project_id: int | None = None,
        doc_types: list[str] | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Search the unified FTS index across items, test plans, cycles, and runs.

        Returns dicts with: entity_id, doc_type, project_id, status, name, description,
        document_key, extra_text, rank.
        """
        assert self._db

        conditions = ["unified_fts MATCH ?"]
        params: list[Any] = [query]

        if project_id:
            conditions.append("c.project_id = ?")
            params.append(project_id)
        if doc_types:
            placeholders = ",".join("?" for _ in doc_types)
            conditions.append(f"c.doc_type IN ({placeholders})")
            params.extend(doc_types)

        params.append(limit)
        where = " AND ".join(conditions)

        rows = await self._db.execute_fetchall(
            f"""SELECT c.*, f.rank
                FROM unified_fts f
                JOIN unified_fts_content c ON f.rowid = c.rowid
                WHERE {where}
                ORDER BY f.rank
                LIMIT ?""",
            params,
        )
        return [dict(r) for r in rows]

    # ---------- Stats ----------

    async def get_stats(self) -> dict[str, Any]:
        assert self._db
        stats: dict[str, Any] = {}
        for table in ["projects", "items", "relationships", "attachments",
                       "test_plans", "test_cycles", "test_runs", "item_versions",
                       "unified_fts_content"]:
            rows = await self._db.execute_fetchall(f"SELECT COUNT(*) as cnt FROM {table}")
            stats[table] = rows[0]["cnt"] if rows else 0
        stats["db_size_mb"] = round(self._db_path.stat().st_size / (1024 * 1024), 2) if self._db_path.exists() else 0
        return stats
