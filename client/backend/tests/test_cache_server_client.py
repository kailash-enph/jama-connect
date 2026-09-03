"""Unit tests for jama_mcp_v2.net.cache_server — the LAN cache server HTTP client.

Uses pytest-httpx to intercept all httpx requests without a real server.
"""

from __future__ import annotations

import gzip
import json
import sqlite3
import tempfile
from pathlib import Path

import pytest
from pytest_httpx import HTTPXMock

from jama_mcp_v2.net.cache_server import (
    CacheServerError,
    _decompress_gz,
    download_project_db,
    fetch_index,
    ping,
)


BASE = "http://jama-cache.local:8866"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_gz_db(n_rows: int = 5) -> bytes:
    """Return gzip-compressed bytes of a minimal valid SQLite database."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        tmp = Path(f.name)
    con = sqlite3.connect(tmp)
    con.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)")
    con.executemany("INSERT INTO items VALUES (?,?)", [(i, f"Item {i}") for i in range(n_rows)])
    con.commit()
    con.close()
    data = tmp.read_bytes()
    tmp.unlink()
    return gzip.compress(data)


FAKE_INDEX = {
    "generated_at": "2026-01-01T00:00:00Z",
    "server_version": "1",
    "master_db": {"file": "master.db.gz", "size_bytes": 512, "updated_at": "2026-01-01T00:00:00Z"},
    "projects": {
        "20570": {
            "id": 20570,
            "name": "IQ Battery R5",
            "item_count": 500,
            "variants": {
                "data_only": {"file": "projects/20570.db.gz", "size_bytes": 1024},
            },
        }
    },
}


# ---------------------------------------------------------------------------
# fetch_index
# ---------------------------------------------------------------------------

class TestFetchIndex:
    @pytest.mark.asyncio
    async def test_returns_parsed_json(self, httpx_mock: HTTPXMock):
        httpx_mock.add_response(
            url=f"{BASE}/index.json",
            json=FAKE_INDEX,
        )
        result = await fetch_index(BASE)
        assert result["projects"]["20570"]["name"] == "IQ Battery R5"

    @pytest.mark.asyncio
    async def test_raises_on_404(self, httpx_mock: HTTPXMock):
        httpx_mock.add_response(url=f"{BASE}/index.json", status_code=404)
        with pytest.raises(CacheServerError, match="404"):
            await fetch_index(BASE)

    @pytest.mark.asyncio
    async def test_raises_on_connection_error(self, httpx_mock: HTTPXMock):
        import httpx
        httpx_mock.add_exception(httpx.ConnectError("refused"))
        with pytest.raises(CacheServerError, match="unreachable"):
            await fetch_index(BASE)

    @pytest.mark.asyncio
    async def test_strips_trailing_slash(self, httpx_mock: HTTPXMock):
        httpx_mock.add_response(url=f"{BASE}/index.json", json=FAKE_INDEX)
        result = await fetch_index(BASE + "/")  # trailing slash
        assert "projects" in result


# ---------------------------------------------------------------------------
# ping
# ---------------------------------------------------------------------------

class TestPing:
    @pytest.mark.asyncio
    async def test_returns_ok_true_on_success(self, httpx_mock: HTTPXMock):
        httpx_mock.add_response(url=f"{BASE}/index.json", json=FAKE_INDEX)
        result = await ping(BASE)
        assert result["ok"] is True
        assert result["project_count"] == 1
        assert result["generated_at"] == "2026-01-01T00:00:00Z"

    @pytest.mark.asyncio
    async def test_returns_ok_false_on_failure(self, httpx_mock: HTTPXMock):
        import httpx
        httpx_mock.add_exception(httpx.ConnectError("timeout"))
        result = await ping(BASE)
        assert result["ok"] is False
        assert "error" in result

    @pytest.mark.asyncio
    async def test_includes_url_in_result(self, httpx_mock: HTTPXMock):
        httpx_mock.add_response(url=f"{BASE}/index.json", json=FAKE_INDEX)
        result = await ping(BASE)
        assert result["url"] == BASE


# ---------------------------------------------------------------------------
# _decompress_gz (sync helper — runs in thread normally)
# ---------------------------------------------------------------------------

class TestDecompressGz:
    def test_decompresses_valid_file(self, tmp_path):
        src = tmp_path / "test.db.gz"
        src.write_bytes(_make_gz_db(10))
        dst = tmp_path / "test.db"
        _decompress_gz(src, dst)
        assert dst.exists()
        con = sqlite3.connect(dst)
        count = con.execute("SELECT COUNT(*) FROM items").fetchone()[0]
        con.close()
        assert count == 10

    def test_cleans_up_on_error(self, tmp_path):
        src = tmp_path / "bad.db.gz"
        src.write_bytes(b"not valid gzip content !!!")
        dst = tmp_path / "bad.db"
        tmp_partial = dst.with_suffix(".db.decompressing")
        with pytest.raises(Exception):
            _decompress_gz(src, dst)
        assert not tmp_partial.exists()
        assert not dst.exists()


# ---------------------------------------------------------------------------
# download_project_db (streaming SSE-like generator)
# ---------------------------------------------------------------------------

class TestDownloadProjectDb:
    @pytest.mark.asyncio
    async def test_yields_done_event_on_success(self, httpx_mock: HTTPXMock, tmp_path):
        gz_bytes = _make_gz_db(5)
        httpx_mock.add_response(
            url=f"{BASE}/projects/20570.db.gz",
            content=gz_bytes,
            headers={"content-length": str(len(gz_bytes))},
        )
        dest = tmp_path / "20570.db"
        events = []
        async for evt in download_project_db(BASE, 20570, dest):
            events.append(evt)

        phases = [e["phase"] for e in events]
        assert "connecting" in phases
        assert "downloading" in phases
        assert "decompressing" in phases
        assert phases[-1] == "done"
        assert dest.exists()

    @pytest.mark.asyncio
    async def test_yields_error_on_404(self, httpx_mock: HTTPXMock, tmp_path):
        httpx_mock.add_response(
            url=f"{BASE}/projects/99999.db.gz",
            status_code=404,
        )
        dest = tmp_path / "99999.db"
        events = []
        async for evt in download_project_db(BASE, 99999, dest):
            events.append(evt)

        last = events[-1]
        assert last["phase"] == "error"
        assert "99999" in last["message"] or "not found" in last["message"].lower()
        assert not dest.exists()

    @pytest.mark.asyncio
    async def test_reports_download_progress(self, httpx_mock: HTTPXMock, tmp_path):
        gz_bytes = _make_gz_db(50)
        httpx_mock.add_response(
            url=f"{BASE}/projects/20570.db.gz",
            content=gz_bytes,
            headers={"content-length": str(len(gz_bytes))},
        )
        dest = tmp_path / "20570.db"
        download_events = []
        async for evt in download_project_db(BASE, 20570, dest):
            if evt["phase"] == "downloading":
                download_events.append(evt)

        assert len(download_events) >= 1
        # Final download event should show 100%
        last_dl = download_events[-1]
        assert last_dl.get("bytes", 0) > 0

    @pytest.mark.asyncio
    async def test_with_images_variant_uses_correct_url(self, httpx_mock: HTTPXMock, tmp_path):
        gz_bytes = _make_gz_db(3)
        httpx_mock.add_response(
            url=f"{BASE}/projects/20570_with_images.db.gz",
            content=gz_bytes,
            headers={"content-length": str(len(gz_bytes))},
        )
        dest = tmp_path / "20570_wi.db"
        events = []
        async for evt in download_project_db(BASE, 20570, dest, variant="with_images"):
            events.append(evt)
        assert events[-1]["phase"] == "done"

    @pytest.mark.asyncio
    async def test_cleans_up_tmp_gz_on_success(self, httpx_mock: HTTPXMock, tmp_path):
        gz_bytes = _make_gz_db(3)
        httpx_mock.add_response(
            url=f"{BASE}/projects/20570.db.gz",
            content=gz_bytes,
            headers={"content-length": str(len(gz_bytes))},
        )
        dest = tmp_path / "20570.db"
        async for _ in download_project_db(BASE, 20570, dest):
            pass
        tmp_gz = dest.with_suffix(".db.gz.tmp")
        assert not tmp_gz.exists(), "Temp .gz file should be cleaned up after success"

    @pytest.mark.asyncio
    async def test_cleans_up_tmp_gz_on_error(self, httpx_mock: HTTPXMock, tmp_path):
        httpx_mock.add_response(url=f"{BASE}/projects/20570.db.gz", status_code=404)
        dest = tmp_path / "20570.db"
        async for _ in download_project_db(BASE, 20570, dest):
            pass
        tmp_gz = dest.with_suffix(".db.gz.tmp")
        assert not tmp_gz.exists(), "Temp .gz file should be cleaned up after error"
