"""Unit tests for server/scripts/generate_caches.py.

Tests the cache generator logic (compress, master DB, index.json) with mocked
Jama API — no real network calls required.

The script lives outside the Python package, so we load it via importlib.
"""

from __future__ import annotations

import gzip
import importlib.util
import json
import sqlite3
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from jama_mcp_v2.models import SyncProgress, SyncState

import pytest

# ---------------------------------------------------------------------------
# Import the script as a module (it's not a package — load from filesystem)
# ---------------------------------------------------------------------------

_SCRIPT = (
    Path(__file__).resolve().parent   # tests/
    .parent                           # client/backend/
    .parent                           # client/
    .parent                           # jama-connect/
    / "server" / "scripts" / "generate_caches.py"
)

def _load_script():
    spec = importlib.util.spec_from_file_location("generate_caches", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

gc = _load_script()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_fake_db(path: Path, n_items: int = 5) -> None:
    """Create a minimal SQLite file so _compress_db has something to work with."""
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)")
    con.executemany(
        "INSERT INTO items VALUES (?, ?)",
        [(i, f"Item {i}") for i in range(n_items)],
    )
    con.commit()
    con.close()


# ---------------------------------------------------------------------------
# _compress_db
# ---------------------------------------------------------------------------

class TestCompressDb:
    def test_creates_gz_file(self, tmp_path):
        src = tmp_path / "test.db"
        _make_fake_db(src)
        dst = tmp_path / "test.db.gz"
        gc._compress_db(src, dst)
        assert dst.exists()
        assert dst.stat().st_size > 0

    def test_decompresses_to_valid_sqlite(self, tmp_path):
        src = tmp_path / "test.db"
        _make_fake_db(src, n_items=10)
        dst = tmp_path / "test.db.gz"
        gc._compress_db(src, dst)

        # Decompress and verify
        restored = tmp_path / "restored.db"
        with gzip.open(dst, "rb") as f_in, open(restored, "wb") as f_out:
            f_out.write(f_in.read())
        con = sqlite3.connect(restored)
        rows = con.execute("SELECT COUNT(*) FROM items").fetchone()[0]
        con.close()
        assert rows == 10

    def test_compressed_smaller_than_original(self, tmp_path):
        src = tmp_path / "big.db"
        # Write enough data that compression has something to work with
        _make_fake_db(src, n_items=500)
        dst = tmp_path / "big.db.gz"
        gc._compress_db(src, dst)
        assert dst.stat().st_size < src.stat().st_size


# ---------------------------------------------------------------------------
# generate_master_db
# ---------------------------------------------------------------------------

class TestGenerateMasterDb:
    @pytest.mark.asyncio
    async def test_creates_master_db_gz(self, tmp_path):
        metas = [
            {"id": 100, "name": "Alpha Project", "item_count": 42},
            {"id": 200, "name": "Beta Project",  "item_count": 7},
        ]
        size = await gc.generate_master_db(metas, tmp_path)
        gz_path = tmp_path / "master.db.gz"
        assert gz_path.exists()
        assert size == gz_path.stat().st_size
        assert size > 0

    @pytest.mark.asyncio
    async def test_master_db_contains_projects(self, tmp_path):
        metas = [
            {"id": 10, "name": "Project One", "item_count": 5},
            {"id": 20, "name": "Project Two", "item_count": 99},
        ]
        await gc.generate_master_db(metas, tmp_path)
        gz = tmp_path / "master.db.gz"

        restored = tmp_path / "master.db"
        with gzip.open(gz, "rb") as f_in, open(restored, "wb") as f_out:
            f_out.write(f_in.read())

        con = sqlite3.connect(restored)
        rows = {r[0]: r[1] for r in con.execute("SELECT id, name FROM projects").fetchall()}
        con.close()
        assert rows[10] == "Project One"
        assert rows[20] == "Project Two"

    @pytest.mark.asyncio
    async def test_empty_project_list(self, tmp_path):
        size = await gc.generate_master_db([], tmp_path)
        assert (tmp_path / "master.db.gz").exists()
        assert size > 0  # header exists even with no rows


# ---------------------------------------------------------------------------
# load_env
# ---------------------------------------------------------------------------

class TestLoadEnv:
    def test_loads_key_value_pairs(self, tmp_path, monkeypatch):
        env_file = tmp_path / ".env"
        env_file.write_text(
            "JAMA_URL=https://example.jamacloud.com\n"
            "JAMA_CLIENT_ID=abc123\n"
            "# comment line\n"
            "BAD_LINE\n"
        )
        monkeypatch.delenv("JAMA_URL", raising=False)
        monkeypatch.delenv("JAMA_CLIENT_ID", raising=False)
        import os
        gc.load_env(str(env_file))
        assert os.environ.get("JAMA_URL") == "https://example.jamacloud.com"
        assert os.environ.get("JAMA_CLIENT_ID") == "abc123"

    def test_does_not_overwrite_existing(self, tmp_path, monkeypatch):
        env_file = tmp_path / ".env"
        env_file.write_text("JAMA_URL=from_file\n")
        import os
        monkeypatch.setenv("JAMA_URL", "already_set")
        gc.load_env(str(env_file))
        assert os.environ["JAMA_URL"] == "already_set"

    def test_missing_env_file_no_error(self, tmp_path):
        # Should log a warning and return without raising
        gc.load_env(str(tmp_path / "nonexistent.env"))


# ---------------------------------------------------------------------------
# generate_project (mocked API + DB)
# ---------------------------------------------------------------------------

def _mock_compress_db(src: Path, dst: Path) -> None:
    """Drop-in for gc._compress_db: writes a tiny valid .db.gz regardless of src."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(gzip.compress(b"SQLite format 3\x00" + b"\x00" * 96))


def _setup_generate_mocks(tmp_path: Path, project_id: int, n_items: int = 3):
    """Create required directories + seed the temp DB file that generate_project expects."""
    (tmp_path / "tmp").mkdir(parents=True, exist_ok=True)
    (tmp_path / "projects").mkdir(parents=True, exist_ok=True)
    # generate_project copies db_path → img_db_path before calling _compress_db;
    # seed a real SQLite file so shutil.copy2 has something to read.
    _make_fake_db(tmp_path / "tmp" / f"{project_id}.db", n_items=n_items)


class TestGenerateProject:
    @pytest.mark.asyncio
    async def test_creates_data_only_gz(self, tmp_path):
        """generate_project() should produce projects/{id}.db.gz."""
        mock_api = AsyncMock()
        mock_api.__aenter__ = AsyncMock(return_value=mock_api)
        mock_api.__aexit__ = AsyncMock(return_value=False)
        mock_proj_db = AsyncMock()
        mock_proj_db.open = AsyncMock()
        mock_proj_db.close = AsyncMock()
        mock_proj_db.get_all_items = AsyncMock(return_value=[])
        mock_proj_db.upsert_image_blob = AsyncMock()
        mock_sync = MagicMock()
        mock_sync.sync_project = AsyncMock(return_value=SyncProgress(
            state=SyncState.DONE, project_name="IQ Battery R5", total_items=3,
        ))

        # shutil.copy2(db_path, img_db_path) in generate_project fails if ProjectDb
        # is mocked (never writes the .db file). Patch copy2 in the script's namespace
        # to a no-op — _compress_db is already mocked so img_db_path isn't read.
        with (
            patch("jama_mcp_v2.api_client.JamaApiClient", return_value=mock_api),
            patch("jama_mcp_v2.db.project_db.ProjectDb", return_value=mock_proj_db),
            patch("jama_mcp_v2.sync.SyncEngine", return_value=mock_sync),
            patch.object(gc, "_compress_db", _mock_compress_db),
            patch.object(gc, "_fetch_rest_images", AsyncMock(return_value=0)),
            patch.object(gc.shutil, "copy2", lambda src, dst: None),
        ):
            meta = await gc.generate_project(
                project_id=20570,
                out_dir=tmp_path,
                jama_url="https://test.jamacloud.com",
                client_id="test_id",
                client_secret="test_secret",
                session_cookie=None,
            )

        assert meta["id"] == 20570
        assert meta["name"] == "IQ Battery R5"
        assert meta["item_count"] == 3
        assert "data_only" in meta["variants"]
        assert "with_images" in meta["variants"]

    @pytest.mark.asyncio
    async def test_returns_correct_meta_structure(self, tmp_path):
        """Meta dict must have all required keys for index.json."""
        mock_api = AsyncMock()
        mock_api.__aenter__ = AsyncMock(return_value=mock_api)
        mock_api.__aexit__ = AsyncMock(return_value=False)
        mock_proj_db = AsyncMock()
        mock_proj_db.open = AsyncMock()
        mock_proj_db.close = AsyncMock()
        mock_proj_db.get_all_items = AsyncMock(return_value=[])
        mock_proj_db.upsert_image_blob = AsyncMock()
        mock_sync = MagicMock()
        mock_sync.sync_project = AsyncMock(return_value=SyncProgress(
            state=SyncState.DONE, project_name="Test", total_items=0,
        ))

        with (
            patch("jama_mcp_v2.api_client.JamaApiClient", return_value=mock_api),
            patch("jama_mcp_v2.db.project_db.ProjectDb", return_value=mock_proj_db),
            patch("jama_mcp_v2.sync.SyncEngine", return_value=mock_sync),
            patch.object(gc, "_compress_db", _mock_compress_db),
            patch.object(gc, "_fetch_rest_images", AsyncMock(return_value=0)),
            patch.object(gc.shutil, "copy2", lambda src, dst: None),
        ):
            meta = await gc.generate_project(
                project_id=99,
                out_dir=tmp_path,
                jama_url="https://test.jamacloud.com",
                client_id="id",
                client_secret="secret",
                session_cookie=None,
            )

        required_keys = {"id", "name", "last_sync", "item_count", "variants"}
        assert required_keys.issubset(set(meta.keys()))
        assert meta["variants"]["data_only"]["file"] == "projects/99.db.gz"
        assert meta["variants"]["with_images"]["file"] == "projects/99_with_images.db.gz"


# ---------------------------------------------------------------------------
# _now_iso
# ---------------------------------------------------------------------------

class TestNowIso:
    def test_returns_utc_iso_string(self):
        s = gc._now_iso()
        assert s.endswith("Z")
        assert "T" in s
        assert len(s) == 20  # 2026-01-01T12:00:00Z

    def test_close_to_current_time(self):
        import datetime
        s = gc._now_iso()
        dt = datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
        now = datetime.datetime.now(datetime.timezone.utc)
        diff = abs((now - dt).total_seconds())
        assert diff < 5  # within 5 seconds


# ---------------------------------------------------------------------------
# index.json structure (via main_async with all mocks)
# ---------------------------------------------------------------------------

class TestIndexJson:
    @pytest.mark.asyncio
    async def test_index_json_written(self, tmp_path):
        """main_async should write a valid index.json."""
        import argparse

        args = argparse.Namespace(
            out=str(tmp_path),
            projects=[20570],
        )

        meta_result = {
            "id": 20570,
            "name": "IQ Battery R5",
            "last_sync": gc._now_iso(),
            "item_count": 10,
            "variants": {
                "data_only": {"file": "projects/20570.db.gz", "size_bytes": 1024},
                "with_images": {"file": "projects/20570_with_images.db.gz", "size_bytes": 2048, "image_count": 0},
            },
        }

        with (
            patch.object(gc, "generate_project", AsyncMock(return_value=meta_result)),
            patch.object(gc, "generate_master_db", AsyncMock(return_value=512)),
        ):
            await gc.main_async(args)

        index_path = tmp_path / "index.json"
        assert index_path.exists()
        index = json.loads(index_path.read_text())

        assert "generated_at" in index
        assert "master_db" in index
        assert "projects" in index
        assert "20570" in index["projects"]
        assert index["projects"]["20570"]["name"] == "IQ Battery R5"
