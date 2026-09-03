"""Tests for Jama MCP v2 cache schema and FTS index.

Smoke + unit tests run without credentials (in-memory SQLite).
Integration tests require JAMA_CLIENT_ID and JAMA_CLIENT_SECRET.

Uses synchronous sqlite3 to avoid aiosqlite background-thread hangs
on test failure (the aiosqlite connection thread prevents clean exit
when await cache.close() is never reached on the failure path).
"""

import os
import pathlib
import sqlite3
import tempfile

import pytest

pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")

integration = pytest.mark.skipif(
    not (os.getenv("JAMA_CLIENT_ID") and os.getenv("JAMA_CLIENT_SECRET")),
    reason="JAMA_CLIENT_ID and JAMA_CLIENT_SECRET not set",
)


def _open_cache_db():
    """Create a JamaCache, run schema init via subprocess, return sqlite3 conn.
    
    JamaCache.__init__(cache_dir) takes a *directory* and creates cache.db
    inside it. We run schema creation in a separate Python process to avoid
    pytest-asyncio / aiosqlite event-loop conflicts, then open the resulting
    db file with plain sqlite3 in the test process.
    """
    import subprocess
    import sys

    cache_dir = tempfile.mkdtemp()
    db_path = pathlib.Path(cache_dir) / "cache.db"  # JamaCache creates this

    code = (
        "import asyncio\n"
        "from jama_mcp_v2.cache import JamaCache\n"
        "async def go():\n"
        f"    c = JamaCache(r'{cache_dir}')\n"
        "    await c.open()\n"
        "    await c.close()\n"
        "asyncio.run(go())\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True, text=True, timeout=15,
        cwd=str(pathlib.Path(__file__).resolve().parent.parent),
    )
    if result.returncode != 0:
        raise RuntimeError(f"Schema init failed:\n{result.stderr}")

    assert db_path.exists(), f"JamaCache did not create {db_path}"
    assert db_path.stat().st_size > 0, f"DB file is empty (0 bytes)"
    return sqlite3.connect(str(db_path))


# ---------------------------------------------------------------------------
# Unit tests — Cache Schema
# ---------------------------------------------------------------------------

class TestCacheSchema:

    def test_cache_creates_tables(self):
        """JamaCache should create all required tables on open."""
        conn = _open_cache_db()
        tables = [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()]
        conn.close()
        assert "unified_fts_content" in tables
        assert "unified_fts" in tables

    def test_schema_version_is_3(self):
        """Schema version should be 3 (unified FTS)."""
        conn = _open_cache_db()
        row = conn.execute(
            "SELECT value FROM meta WHERE key = 'schema_version'"
        ).fetchone()
        conn.close()
        assert row is not None
        assert row[0] == "3"

    def test_fts_insert_and_query(self):
        """Insert a row into unified FTS content and search via FTS index."""
        conn = _open_cache_db()

        # Insert into the content table
        conn.execute(
            """INSERT INTO unified_fts_content
               (entity_id, doc_type, project_id, status, name, description,
                document_key, extra_text)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (99999, "item", 20570, "active", "BMU Test Requirement",
             "Verify battery management unit", "SET-99999", "")
        )
        # Sync to FTS index (content-synced FTS5 only indexes the
        # columns declared in the USING fts5(...) clause)
        rid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.execute(
            """INSERT INTO unified_fts (rowid, name, description,
               document_key, extra_text)
               VALUES (?, ?, ?, ?, ?)""",
            (rid, "BMU Test Requirement",
             "Verify battery management unit", "SET-99999", "")
        )
        conn.commit()

        rows = conn.execute(
            """SELECT entity_id, name FROM unified_fts_content
               WHERE rowid IN (
                   SELECT rowid FROM unified_fts WHERE unified_fts MATCH 'BMU'
               )"""
        ).fetchall()
        conn.close()

        assert len(rows) >= 1
        assert any(r[0] == 99999 for r in rows)

    def test_meta_table_exists(self):
        """Meta table should exist with schema tracking."""
        conn = _open_cache_db()
        rows = conn.execute("SELECT key, value FROM meta").fetchall()
        conn.close()
        meta = {r[0]: r[1] for r in rows}
        assert "schema_version" in meta


# ---------------------------------------------------------------------------
# Unit tests — Module imports
# ---------------------------------------------------------------------------

class TestImports:

    def test_cache_module_imports(self):
        from jama_mcp_v2.cache import JamaCache
        assert callable(JamaCache)

    def test_api_client_imports(self):
        from jama_mcp_v2.api_client import JamaApiClient
        assert callable(JamaApiClient)

    def test_server_module_imports(self):
        from jama_mcp_v2 import server
        assert hasattr(server, "mcp")

    def test_writer_module_imports(self):
        from jama_mcp_v2 import writer
        assert hasattr(writer, "__name__")


# ---------------------------------------------------------------------------
# Integration tests
# ---------------------------------------------------------------------------

class TestIntegration:

    @integration
    def test_search_live(self):
        conn = _open_cache_db()
        tables = [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()]
        conn.close()
        assert len(tables) > 0
