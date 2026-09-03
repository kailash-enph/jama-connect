"""Tests for attachment REST endpoints in editor_server.py.

Run with:  pytest tests/test_editor_server_attachments.py -v

Uses httpx.AsyncClient to test FastAPI endpoints with mocked services.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))


@pytest.fixture
def mock_services(monkeypatch):
    """Patch ServiceRegistry so the editor app works without real Jama credentials."""
    from jama_mcp_v2.services import services as registry

    mock_api = AsyncMock()
    mock_cache = MagicMock()
    mock_schema = MagicMock()
    mock_att = MagicMock()

    # Patch the ServiceRegistry singleton — editor_server reads these via services.*
    monkeypatch.setattr(registry, "api_client", mock_api)
    monkeypatch.setattr(registry, "editor_cache", mock_cache)
    monkeypatch.setattr(registry, "schema_sync", mock_schema)
    monkeypatch.setattr(registry, "editor_attachment_mgr", mock_att)

    return {
        "api": mock_api,
        "cache": mock_cache,
        "schema": mock_schema,
        "att": mock_att,
    }


@pytest.fixture
def client(mock_services):
    """Create an httpx test client for the FastAPI app."""
    from httpx import ASGITransport, AsyncClient
    from jama_editor.editor_server import app

    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


class TestSyncEndpoint:
    @pytest.mark.asyncio
    async def test_sync_attachments(self, client, mock_services):
        mock_services["att"].sync_attachments = AsyncMock(return_value=[
            {"id": 1, "file_name": "a.pdf", "file_size": 100}
        ])
        async with client:
            resp = await client.get("/api/items/42/attachments/sync")
        assert resp.status_code == 200
        data = resp.json()
        assert data["item_id"] == 42
        assert data["count"] == 1


class TestListEndpoint:
    @pytest.mark.asyncio
    async def test_list_attachments(self, client, mock_services):
        mock_services["att"].list_attachments = AsyncMock(return_value=[
            {"id": 1, "file_name": "a.pdf"}
        ])
        async with client:
            resp = await client.get("/api/items/42/attachments/list")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 1


class TestDownloadEndpoint:
    @pytest.mark.asyncio
    async def test_download(self, client, mock_services):
        mock_services["att"].download = AsyncMock(
            return_value=(b"file-bytes", "report.pdf", "application/pdf")
        )
        async with client:
            resp = await client.get("/api/attachments/100/download")
        assert resp.status_code == 200
        assert resp.content == b"file-bytes"
        assert "report.pdf" in resp.headers.get("content-disposition", "")


class TestDeleteEndpoint:
    @pytest.mark.asyncio
    async def test_delete(self, client, mock_services):
        mock_services["att"].delete_attachment = AsyncMock(return_value=None)
        async with client:
            resp = await client.delete("/api/items/42/attachments/100")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "deleted"


class TestCacheStatsEndpoint:
    @pytest.mark.asyncio
    async def test_cache_stats(self, client, mock_services):
        mock_services["att"].get_cache_stats = AsyncMock(return_value={
            "cache_dir": "/tmp", "total_size_bytes": 5000, "total_size_mb": 0.005,
            "max_size_mb": 500, "file_count": 2, "cached_attachments": 2,
            "pending_uploads": 0, "usage_pct": 0.001,
        })
        async with client:
            resp = await client.get("/api/attachments/cache/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_size_bytes" in data


class TestClearCacheEndpoint:
    @pytest.mark.asyncio
    async def test_clear(self, client, mock_services):
        mock_services["att"].clear_cache = AsyncMock(return_value={
            "files_deleted": 5, "bytes_freed": 10000
        })
        async with client:
            resp = await client.delete("/api/attachments/cache")
        assert resp.status_code == 200
        data = resp.json()
        assert data["files_deleted"] == 5


class TestRetryEndpoint:
    @pytest.mark.asyncio
    async def test_retry(self, client, mock_services):
        mock_services["att"].retry_pending_uploads = AsyncMock(return_value=[
            {"id": 1, "status": "completed"}
        ])
        async with client:
            resp = await client.post("/api/attachments/retry")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 1
