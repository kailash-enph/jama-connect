"""SQLite wrapper for editor_db.sqlite — schema creation, CRUD for drafts, undo, attachments."""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any

import aiosqlite

logger = logging.getLogger(__name__)

SCHEMA_VERSION = "1"

_SCHEMA_DDL = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ========== META ==========
CREATE TABLE IF NOT EXISTS editor_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ========== LOCAL DRAFTS ==========

CREATE TABLE IF NOT EXISTS local_drafts (
    item_id          INTEGER NOT NULL,
    draft_version    INTEGER NOT NULL,
    server_version   INTEGER NOT NULL,
    fields_json      TEXT NOT NULL DEFAULT '{}',
    description_html TEXT NOT NULL DEFAULT '',
    created_at       REAL NOT NULL DEFAULT 0,
    is_autosave      INTEGER NOT NULL DEFAULT 1,
    change_summary   TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (item_id, draft_version)
);
CREATE INDEX IF NOT EXISTS idx_drafts_item ON local_drafts(item_id);

CREATE TABLE IF NOT EXISTS draft_state (
    item_id               INTEGER PRIMARY KEY,
    current_draft_version INTEGER NOT NULL DEFAULT 0,
    server_version_base   INTEGER NOT NULL DEFAULT 0,
    is_dirty              INTEGER NOT NULL DEFAULT 0,
    opened_at             REAL NOT NULL DEFAULT 0,
    last_autosave_at      REAL NOT NULL DEFAULT 0,
    lock_held             INTEGER NOT NULL DEFAULT 0,
    editor_instance_id    TEXT NOT NULL DEFAULT ''
);

-- ========== UNDO STACK (5 entries per item) ==========

CREATE TABLE IF NOT EXISTS undo_stack (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id     INTEGER NOT NULL,
    field_name  TEXT NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    timestamp   REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_undo_item ON undo_stack(item_id);

-- ========== ATTACHMENT TRACKING ==========

CREATE TABLE IF NOT EXISTS editor_attachments (
    id              INTEGER PRIMARY KEY,
    item_id         INTEGER NOT NULL,
    file_name       TEXT NOT NULL DEFAULT '',
    file_size       INTEGER NOT NULL DEFAULT 0,
    mime_type       TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    jama_url        TEXT NOT NULL DEFAULT '',
    local_cached    INTEGER NOT NULL DEFAULT 0,
    local_path      TEXT,
    is_image        INTEGER NOT NULL DEFAULT 0,
    is_embedded     INTEGER NOT NULL DEFAULT 0,
    saml_only       INTEGER NOT NULL DEFAULT 0,
    upload_status   TEXT NOT NULL DEFAULT 'complete',
    last_accessed_at REAL NOT NULL DEFAULT 0,
    synced_at       REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_eatt_item ON editor_attachments(item_id);

CREATE TABLE IF NOT EXISTS pending_uploads (
    id              TEXT PRIMARY KEY,
    item_id         INTEGER NOT NULL,
    file_name       TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    file_size       INTEGER NOT NULL DEFAULT 0,
    mime_type       TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    embed_after     INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending',
    attachment_id   INTEGER,
    error_message   TEXT,
    created_at      REAL NOT NULL DEFAULT 0,
    updated_at      REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS embedded_images (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id         INTEGER NOT NULL,
    attachment_id   INTEGER NOT NULL,
    jama_url        TEXT NOT NULL,
    local_cached    INTEGER NOT NULL DEFAULT 0,
    saml_only       INTEGER NOT NULL DEFAULT 0,
    width_px        INTEGER,
    height_px       INTEGER,
    synced_at       REAL NOT NULL DEFAULT 0,
    UNIQUE (item_id, attachment_id)
);
CREATE INDEX IF NOT EXISTS idx_emb_item ON embedded_images(item_id);
CREATE INDEX IF NOT EXISTS idx_emb_uncached ON embedded_images(local_cached)
    WHERE local_cached = 0;

-- ========== SYNC/LOG ==========

CREATE TABLE IF NOT EXISTS editor_sync_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_type    TEXT NOT NULL,
    started_at   REAL NOT NULL DEFAULT 0,
    completed_at REAL,
    items_synced INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'running',
    message      TEXT NOT NULL DEFAULT ''
);
"""

MAX_UNDO_DEPTH = 5


class EditorCache:
    """Async SQLite wrapper for editor_db.sqlite."""

    def __init__(self, cache_dir: str = "~/.jama-mcp-v2"):
        self._cache_dir = os.path.expanduser(cache_dir)
        self.db_path = os.path.join(self._cache_dir, "editor_db.sqlite")
        self._db: aiosqlite.Connection | None = None

    # ---------- Lifecycle ----------

    async def open(self) -> None:
        os.makedirs(self._cache_dir, exist_ok=True)
        self._db = await aiosqlite.connect(self.db_path)
        self._db.row_factory = aiosqlite.Row
        await self._ensure_schema()
        logger.info("EditorCache opened: %s", self.db_path)

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            self._db = None
            logger.info("EditorCache closed")

    async def _ensure_schema(self) -> None:
        assert self._db
        # Run schema DDL — all CREATE IF NOT EXISTS, safe to re-run
        for stmt in _SCHEMA_DDL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                await self._db.execute(stmt)
        # Check/set schema version
        async with self._db.execute(
            "SELECT value FROM editor_meta WHERE key = 'schema_version'"
        ) as cursor:
            row = await cursor.fetchone()
        if not row:
            await self._db.execute(
                "INSERT INTO editor_meta (key, value) VALUES ('schema_version', ?)",
                (SCHEMA_VERSION,),
            )
        await self._db.commit()

    @property
    def db(self) -> aiosqlite.Connection:
        assert self._db, "EditorCache not opened"
        return self._db

    # ============================================================
    # DRAFT OPERATIONS
    # ============================================================

    async def save_draft(
        self,
        item_id: int,
        server_version: int,
        fields_json: str,
        description_html: str,
        is_autosave: bool = True,
        change_summary: str = "",
    ) -> int:
        """Save a local draft. Returns the new draft_version number."""
        now = time.time()

        # Get next draft version
        async with self.db.execute(
            "SELECT MAX(draft_version) FROM local_drafts WHERE item_id = ?",
            (item_id,),
        ) as cursor:
            row = await cursor.fetchone()
        next_version = (row[0] or 0) + 1

        await self.db.execute(
            """INSERT INTO local_drafts
               (item_id, draft_version, server_version, fields_json,
                description_html, created_at, is_autosave, change_summary)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                item_id,
                next_version,
                server_version,
                fields_json,
                description_html,
                now,
                1 if is_autosave else 0,
                change_summary,
            ),
        )

        # Update draft_state
        await self.db.execute(
            """INSERT INTO draft_state (item_id, current_draft_version,
                   server_version_base, is_dirty, last_autosave_at)
               VALUES (?, ?, ?, 1, ?)
               ON CONFLICT(item_id) DO UPDATE SET
                   current_draft_version = excluded.current_draft_version,
                   is_dirty = 1,
                   last_autosave_at = excluded.last_autosave_at""",
            (item_id, next_version, server_version, now),
        )
        await self.db.commit()
        logger.debug("Draft saved: item=%d version=%d", item_id, next_version)
        return next_version

    async def get_drafts(self, item_id: int) -> list[dict[str, Any]]:
        """Get all drafts for an item, newest first."""
        async with self.db.execute(
            """SELECT * FROM local_drafts WHERE item_id = ?
               ORDER BY draft_version DESC""",
            (item_id,),
        ) as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def get_latest_draft(self, item_id: int) -> dict[str, Any] | None:
        """Get the most recent draft for an item."""
        async with self.db.execute(
            """SELECT * FROM local_drafts WHERE item_id = ?
               ORDER BY draft_version DESC LIMIT 1""",
            (item_id,),
        ) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else None

    async def clear_drafts(self, item_id: int) -> int:
        """Delete all drafts for an item. Returns count deleted."""
        cursor = await self.db.execute(
            "DELETE FROM local_drafts WHERE item_id = ?", (item_id,)
        )
        await self.db.execute(
            """UPDATE draft_state SET current_draft_version = 0, is_dirty = 0
               WHERE item_id = ?""",
            (item_id,),
        )
        await self.db.commit()
        return cursor.rowcount

    async def get_draft_state(self, item_id: int) -> dict[str, Any] | None:
        """Get the draft_state row for an item."""
        async with self.db.execute(
            "SELECT * FROM draft_state WHERE item_id = ?", (item_id,)
        ) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else None

    async def set_draft_state(
        self,
        item_id: int,
        *,
        server_version_base: int | None = None,
        is_dirty: bool | None = None,
        lock_held: bool | None = None,
        editor_instance_id: str | None = None,
    ) -> None:
        """Update draft_state fields. Creates row if it doesn't exist."""
        now = time.time()
        # Ensure row exists
        await self.db.execute(
            """INSERT INTO draft_state (item_id, opened_at)
               VALUES (?, ?)
               ON CONFLICT(item_id) DO NOTHING""",
            (item_id, now),
        )
        updates: list[str] = []
        params: list[Any] = []
        if server_version_base is not None:
            updates.append("server_version_base = ?")
            params.append(server_version_base)
        if is_dirty is not None:
            updates.append("is_dirty = ?")
            params.append(1 if is_dirty else 0)
        if lock_held is not None:
            updates.append("lock_held = ?")
            params.append(1 if lock_held else 0)
        if editor_instance_id is not None:
            updates.append("editor_instance_id = ?")
            params.append(editor_instance_id)
        if updates:
            params.append(item_id)
            await self.db.execute(
                f"UPDATE draft_state SET {', '.join(updates)} WHERE item_id = ?",
                params,
            )
            await self.db.commit()

    async def get_dirty_items(self) -> list[dict[str, Any]]:
        """Get all items with unsaved changes (for crash recovery)."""
        async with self.db.execute(
            "SELECT * FROM draft_state WHERE is_dirty = 1"
        ) as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def remove_draft_state(self, item_id: int) -> None:
        """Remove draft_state row (on close)."""
        await self.db.execute("DELETE FROM draft_state WHERE item_id = ?", (item_id,))
        await self.db.commit()

    # ============================================================
    # UNDO STACK (max 5 per item)
    # ============================================================

    async def push_undo(
        self, item_id: int, field_name: str, old_value: str | None, new_value: str | None
    ) -> None:
        """Push an undo entry. Trims to MAX_UNDO_DEPTH."""
        now = time.time()
        await self.db.execute(
            """INSERT INTO undo_stack (item_id, field_name, old_value, new_value, timestamp)
               VALUES (?, ?, ?, ?, ?)""",
            (item_id, field_name, old_value, new_value, now),
        )
        # Trim: keep only the newest MAX_UNDO_DEPTH entries per item
        await self.db.execute(
            """DELETE FROM undo_stack WHERE item_id = ? AND id NOT IN (
                   SELECT id FROM undo_stack WHERE item_id = ?
                   ORDER BY id DESC LIMIT ?
               )""",
            (item_id, item_id, MAX_UNDO_DEPTH),
        )
        await self.db.commit()

    async def get_undo_stack(self, item_id: int) -> list[dict[str, Any]]:
        """Get undo stack for an item, newest first."""
        async with self.db.execute(
            """SELECT * FROM undo_stack WHERE item_id = ?
               ORDER BY id DESC""",
            (item_id,),
        ) as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def pop_undo(self, item_id: int) -> dict[str, Any] | None:
        """Pop the most recent undo entry (remove and return it)."""
        async with self.db.execute(
            """SELECT * FROM undo_stack WHERE item_id = ?
               ORDER BY id DESC LIMIT 1""",
            (item_id,),
        ) as cursor:
            row = await cursor.fetchone()
        if not row:
            return None
        entry = dict(row)
        await self.db.execute("DELETE FROM undo_stack WHERE id = ?", (entry["id"],))
        await self.db.commit()
        return entry

    async def clear_undo(self, item_id: int) -> None:
        """Clear entire undo stack for an item."""
        await self.db.execute("DELETE FROM undo_stack WHERE item_id = ?", (item_id,))
        await self.db.commit()

    # ============================================================
    # ATTACHMENT TRACKING
    # ============================================================

    async def upsert_attachment(self, att: dict[str, Any]) -> None:
        """Insert or update an attachment tracking row."""
        now = time.time()
        await self.db.execute(
            """INSERT INTO editor_attachments
               (id, item_id, file_name, file_size, mime_type, description,
                jama_url, local_cached, local_path, is_image, is_embedded,
                saml_only, upload_status, last_accessed_at, synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                   file_name = excluded.file_name,
                   file_size = excluded.file_size,
                   mime_type = excluded.mime_type,
                   description = excluded.description,
                   jama_url = excluded.jama_url,
                   local_cached = excluded.local_cached,
                   local_path = excluded.local_path,
                   is_image = excluded.is_image,
                   is_embedded = excluded.is_embedded,
                   saml_only = excluded.saml_only,
                   upload_status = excluded.upload_status,
                   synced_at = excluded.synced_at""",
            (
                att.get("id"),
                att.get("item_id"),
                att.get("file_name", ""),
                att.get("file_size", 0),
                att.get("mime_type", ""),
                att.get("description", ""),
                att.get("jama_url", ""),
                1 if att.get("local_cached") else 0,
                att.get("local_path"),
                1 if att.get("is_image") else 0,
                1 if att.get("is_embedded") else 0,
                1 if att.get("saml_only") else 0,
                att.get("upload_status", "complete"),
                att.get("last_accessed_at", now),
                now,
            ),
        )
        await self.db.commit()

    async def get_attachments(self, item_id: int) -> list[dict[str, Any]]:
        """Get all attachment rows for an item."""
        async with self.db.execute(
            "SELECT * FROM editor_attachments WHERE item_id = ?", (item_id,)
        ) as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def delete_attachment(self, attachment_id: int) -> None:
        """Remove an attachment tracking row."""
        await self.db.execute(
            "DELETE FROM editor_attachments WHERE id = ?", (attachment_id,)
        )
        await self.db.commit()

    async def touch_attachment(self, attachment_id: int) -> None:
        """Update last_accessed_at for LRU tracking."""
        await self.db.execute(
            "UPDATE editor_attachments SET last_accessed_at = ? WHERE id = ?",
            (time.time(), attachment_id),
        )
        await self.db.commit()

    # ============================================================
    # PENDING UPLOADS
    # ============================================================

    async def create_pending_upload(self, upload: dict[str, Any]) -> None:
        """Create a pending upload entry for crash recovery."""
        now = time.time()
        await self.db.execute(
            """INSERT INTO pending_uploads
               (id, item_id, file_name, file_path, file_size, mime_type,
                description, embed_after, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)""",
            (
                upload["id"],
                upload["item_id"],
                upload["file_name"],
                upload["file_path"],
                upload.get("file_size", 0),
                upload.get("mime_type", ""),
                upload.get("description", ""),
                1 if upload.get("embed_after") else 0,
                now,
                now,
            ),
        )
        await self.db.commit()

    async def update_pending_upload(
        self, upload_id: str, **kwargs: Any
    ) -> None:
        """Update fields on a pending upload."""
        if not kwargs:
            return
        kwargs["updated_at"] = time.time()
        sets = ", ".join(f"{k} = ?" for k in kwargs)
        vals = list(kwargs.values()) + [upload_id]
        await self.db.execute(
            f"UPDATE pending_uploads SET {sets} WHERE id = ?", vals
        )
        await self.db.commit()

    async def get_pending_uploads(
        self, *, item_id: int | None = None, exclude_complete: bool = True
    ) -> list[dict[str, Any]]:
        """Get pending uploads, optionally filtered by item."""
        sql = "SELECT * FROM pending_uploads"
        params: list[Any] = []
        conditions: list[str] = []
        if item_id is not None:
            conditions.append("item_id = ?")
            params.append(item_id)
        if exclude_complete:
            conditions.append("status NOT IN ('complete', 'failed')")
        if conditions:
            sql += " WHERE " + " AND ".join(conditions)
        sql += " ORDER BY created_at DESC"
        async with self.db.execute(sql, params) as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def delete_pending_upload(self, upload_id: str) -> None:
        """Remove a pending upload entry."""
        await self.db.execute("DELETE FROM pending_uploads WHERE id = ?", (upload_id,))
        await self.db.commit()

    # ============================================================
    # EMBEDDED IMAGES
    # ============================================================

    async def upsert_embedded_image(self, img: dict[str, Any]) -> None:
        """Track an embedded image."""
        now = time.time()
        await self.db.execute(
            """INSERT INTO embedded_images
               (item_id, attachment_id, jama_url, local_cached, saml_only,
                width_px, height_px, synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(item_id, attachment_id) DO UPDATE SET
                   jama_url = excluded.jama_url,
                   local_cached = excluded.local_cached,
                   saml_only = excluded.saml_only,
                   width_px = excluded.width_px,
                   height_px = excluded.height_px,
                   synced_at = excluded.synced_at""",
            (
                img["item_id"],
                img["attachment_id"],
                img.get("jama_url", ""),
                1 if img.get("local_cached") else 0,
                1 if img.get("saml_only") else 0,
                img.get("width_px"),
                img.get("height_px"),
                now,
            ),
        )
        await self.db.commit()

    async def get_uncached_images(self, item_id: int) -> list[dict[str, Any]]:
        """Get embedded images that are not cached locally."""
        async with self.db.execute(
            """SELECT * FROM embedded_images
               WHERE item_id = ? AND local_cached = 0""",
            (item_id,),
        ) as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    # ============================================================
    # SYNC LOG
    # ============================================================

    async def log_sync(
        self, sync_type: str, items_synced: int = 0, status: str = "complete", message: str = ""
    ) -> None:
        """Log a sync event."""
        now = time.time()
        await self.db.execute(
            """INSERT INTO editor_sync_log
               (sync_type, started_at, completed_at, items_synced, status, message)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (sync_type, now, now, items_synced, status, message),
        )
        await self.db.commit()
