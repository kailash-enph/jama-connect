"""MasterDb — lightweight project-list database.

Serves two purposes:
  1. Populated by generate_caches.py from the server side (master.db.gz)
  2. Read by CacheManager at startup to populate the project picker

Schema is intentionally minimal — no items, no test data.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

import aiosqlite

from .utils import execute_commit, fetch_all, fetch_one, fetch_scalar

logger = logging.getLogger(__name__)

MASTER_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS projects (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    item_count   INTEGER NOT NULL DEFAULT 0,
    last_sync    REAL NOT NULL DEFAULT 0
);
"""


class MasterDb:
    """Read/write access to master.db — project metadata only."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._db: aiosqlite.Connection | None = None

    @property
    def _conn(self) -> aiosqlite.Connection:
        if self._db is None:
            raise RuntimeError("MasterDb is not open")
        return self._db

    async def open(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._db = await aiosqlite.connect(str(self._path))
        self._db.row_factory = aiosqlite.Row
        await self._db.executescript(MASTER_SCHEMA_SQL)
        await self._db.commit()
        logger.info("MasterDb opened: %s", self._path)

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            self._db = None

    async def __aenter__(self) -> "MasterDb":
        await self.open()
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.close()

    async def upsert_project(self, project_id: int, name: str, description: str = "", item_count: int = 0) -> None:
        await execute_commit(
            self._conn,
            """INSERT INTO projects(id, name, description, item_count, last_sync)
               VALUES(?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name=excluded.name, description=excluded.description,
                 item_count=excluded.item_count, last_sync=excluded.last_sync""",
            project_id, name, description, item_count, time.time(),
        )

    async def get_projects(self) -> list[dict[str, Any]]:
        return await fetch_all(self._conn, "SELECT * FROM projects ORDER BY name")

    async def get_project(self, project_id: int) -> dict[str, Any] | None:
        return await fetch_one(self._conn, "SELECT * FROM projects WHERE id=?", project_id)

    async def project_count(self) -> int:
        return await fetch_scalar(self._conn, "SELECT COUNT(*) FROM projects", default=0)
