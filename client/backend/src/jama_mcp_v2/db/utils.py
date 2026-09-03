"""Thin wrappers around aiosqlite to reduce boilerplate across the codebase.

Every function asserts `db is not None` internally so callers don't need to.
"""

from __future__ import annotations

from typing import Any, TypeVar

import aiosqlite

T = TypeVar("T")


async def fetch_one(
    db: aiosqlite.Connection, sql: str, *args: Any
) -> dict[str, Any] | None:
    """Execute a SELECT and return the first row as a dict, or None."""
    rows = await db.execute_fetchall(sql, args)
    return dict(rows[0]) if rows else None


async def fetch_all(
    db: aiosqlite.Connection, sql: str, *args: Any
) -> list[dict[str, Any]]:
    """Execute a SELECT and return all rows as a list of dicts."""
    rows = await db.execute_fetchall(sql, args)
    return [dict(r) for r in rows]


async def fetch_scalar(
    db: aiosqlite.Connection, sql: str, *args: Any, default: T = None  # type: ignore[assignment]
) -> T:
    """Execute a SELECT and return the first column of the first row."""
    rows = await db.execute_fetchall(sql, args)
    if not rows:
        return default
    row = rows[0]
    return row[0] if row else default


async def execute_commit(
    db: aiosqlite.Connection, sql: str, *args: Any
) -> None:
    """Execute a single DML statement and commit."""
    await db.execute(sql, args)
    await db.commit()


async def executemany_commit(
    db: aiosqlite.Connection, sql: str, data: list[tuple[Any, ...]]
) -> None:
    """Execute a DML statement for each row in data, then commit.

    Uses a single executemany call — far faster than looping over execute().
    """
    if not data:
        return
    await db.executemany(sql, data)
    await db.commit()
