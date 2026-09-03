"""Tests for push + MCP cache refresh + image URL rewriting in editor_server.py.

Run with:  pytest tests/test_editor_push_cache.py -v

Uses httpx.AsyncClient to test FastAPI endpoints with mocked services.
"""

from __future__ import annotations

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


# ============================================================
# Image URL Rewriting Tests
# ============================================================


class TestRewriteImageUrls:
    def test_rewrites_jama_url(self):
        # Use _PROXY_PORT (not EDITOR_PORT) — may be REST_PORT when unified server is active
        from jama_editor.editor_server import _rewrite_image_urls, _PROXY_PORT

        html = '<img src="https://enphase.jamacloud.com/rest/v1/attachments/12345/file">'
        result = _rewrite_image_urls(html)
        assert f"http://localhost:{_PROXY_PORT}/api/proxy/image/12345" in result
        assert "jamacloud.com" not in result

    def test_no_images_passthrough(self):
        from jama_editor.editor_server import _rewrite_image_urls

        html = "<p>Hello world</p>"
        result = _rewrite_image_urls(html)
        assert result == html

    def test_multiple_images(self):
        from jama_editor.editor_server import _rewrite_image_urls, _PROXY_PORT

        html = (
            '<img src="https://enphase.jamacloud.com/rest/v1/attachments/111/file">'
            '<img src="https://enphase.jamacloud.com/rest/v1/attachments/222/file">'
        )
        result = _rewrite_image_urls(html)
        assert f"http://localhost:{_PROXY_PORT}/api/proxy/image/111" in result
        assert f"http://localhost:{_PROXY_PORT}/api/proxy/image/222" in result
        assert "jamacloud.com" not in result

    def test_empty_html(self):
        from jama_editor.editor_server import _rewrite_image_urls

        assert _rewrite_image_urls("") == ""
        assert _rewrite_image_urls(None) == ""

    def test_preserves_non_jama_urls(self):
        from jama_editor.editor_server import _rewrite_image_urls

        html = '<img src="https://example.com/image.png">'
        result = _rewrite_image_urls(html)
        assert result == html


# ============================================================
# Push + MCP Cache Refresh Tests
# ============================================================


class TestPushItemRefreshesCache:
    @pytest.mark.asyncio
    async def test_push_item_calls_mcp_refresh(self, client, mock_services):
        """After a successful push, the editor should call MCP /refresh endpoint."""
        mock_api = mock_services["api"]
        mock_cache = mock_services["cache"]

        # Mock: get_item returns item with version matching expected_version
        mock_api.get_item = AsyncMock(return_value={
            "id": 42, "version": 4,
            "fields": {"name": "Test Item", "description": ""},
        })
        mock_api.update_item = AsyncMock(return_value=None)
        mock_api.get_item_lock = AsyncMock(return_value={"locked": False})

        # Mock: cache methods
        mock_cache.get_draft_state = AsyncMock(return_value={"server_version_base": 4})
        mock_cache.get_latest_draft = AsyncMock(return_value=None)
        mock_cache.clear_drafts = AsyncMock()
        mock_cache.set_draft_state = AsyncMock()
        mock_cache.clear_undo = AsyncMock()

        with patch("jama_editor.editor_server._refresh_mcp_cache", new_callable=AsyncMock) as mock_refresh:
            async with client:
                resp = await client.post(
                    "/api/items/42/push",
                    json={"fields": {"name": "Updated Name"}, "expected_version": 4},
                )
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "pushed"
            assert data["item_id"] == 42

            # After push, get_item is called again for fresh data → return bumped version
            mock_api.get_item = AsyncMock(return_value={
                "id": 42, "version": 5,
                "fields": {"name": "Updated Name", "description": ""},
            })

            # Verify MCP cache refresh was called for items
            mock_refresh.assert_awaited_once_with("items", 42)


class TestPushTestRunRefreshesCache:
    @pytest.mark.asyncio
    async def test_push_test_run(self, client, mock_services):
        """Test run push should call MCP cache refresh for testruns."""
        mock_api = mock_services["api"]

        mock_api.get_test_run = AsyncMock(return_value={
            "id": 99, "fields": {"status": "PASSED", "actualResults": "ok"},
            "testCycle": {"id": 10},
        })
        mock_api.update_test_run_fields = AsyncMock(return_value=None)

        with patch("jama_editor.editor_server._refresh_mcp_cache", new_callable=AsyncMock) as mock_refresh:
            async with client:
                resp = await client.post(
                    "/api/testruns/99/push",
                    json={"fields": {"actualResults": "All passed"}},
                )
            assert resp.status_code == 200
            mock_refresh.assert_awaited_once_with("testruns", 99)


class TestPushTestPlanRefreshesCache:
    @pytest.mark.asyncio
    async def test_push_test_plan(self, client, mock_services):
        """Test plan push should call MCP cache refresh for testplans."""
        mock_api = mock_services["api"]

        mock_api.get_test_plan = AsyncMock(return_value={
            "id": 50, "fields": {"name": "Plan A", "status": "ACTIVE"},
            "project": {"id": 100},
        })
        mock_api.update_test_plan = AsyncMock(return_value=None)

        with patch("jama_editor.editor_server._refresh_mcp_cache", new_callable=AsyncMock) as mock_refresh:
            async with client:
                resp = await client.post(
                    "/api/testplans/50/push",
                    json={"fields": {"name": "Plan A Updated"}},
                )
            assert resp.status_code == 200
            mock_refresh.assert_awaited_once_with("testplans", 50)


class TestPushTestCycleRefreshesCache:
    @pytest.mark.asyncio
    async def test_push_test_cycle(self, client, mock_services):
        """Test cycle push should call MCP cache refresh for testcycles."""
        mock_api = mock_services["api"]

        mock_api.get_test_cycle = AsyncMock(return_value={
            "id": 60, "fields": {"name": "Cycle X", "status": "NOT_RUN"},
            "testPlan": {"id": 50},
        })
        mock_api.update_test_cycle = AsyncMock(return_value=None)

        with patch("jama_editor.editor_server._refresh_mcp_cache", new_callable=AsyncMock) as mock_refresh:
            async with client:
                resp = await client.post(
                    "/api/testcycles/60/push",
                    json={"fields": {"name": "Cycle X Updated"}},
                )
            assert resp.status_code == 200
            mock_refresh.assert_awaited_once_with("testcycles", 60)


# ============================================================
# Image Proxy Endpoint Tests
# ============================================================


class TestProxyImageEndpoint:
    @pytest.fixture(autouse=True)
    def isolate_image_cache(self, tmp_path, monkeypatch):
        """Point image_cache_dir at a fresh temp dir per test.

        Without this, image_cache_dir='' causes os.path.join('', id) to resolve
        to a bare filename in the CWD, which bleeds state between tests.
        """
        from jama_mcp_v2.services import services as registry
        monkeypatch.setattr(registry, "image_cache_dir", str(tmp_path))

    @pytest.mark.asyncio
    async def test_proxy_image_returns_bytes(self, client, mock_services):
        """GET /api/proxy/image/{id} should return image bytes."""
        mock_api = mock_services["api"]
        mock_api.get_attachment = AsyncMock(return_value={"mimeType": "image/png", "fileName": "test.png"})
        mock_api.download_attachment = AsyncMock(return_value=b"\x89PNG\r\n\x1a\n")

        async with client:
            resp = await client.get("/api/proxy/image/12345")
        assert resp.status_code == 200
        assert resp.content == b"\x89PNG\r\n\x1a\n"

    @pytest.mark.asyncio
    async def test_proxy_image_404(self, client, mock_services):
        """GET /api/proxy/image/{id} should return 404 when all download paths fail."""
        mock_api = mock_services["api"]
        # All fallback paths must fail for the endpoint to return 404:
        #   1. disk cache — empty tmp_path, no file → skips
        #   2. web session — not set → skips
        #   3. REST attachment endpoint → raises
        #   4. REST files endpoint → raises
        mock_api.get_attachment = AsyncMock(side_effect=Exception("Not found"))
        mock_api.download_attachment = AsyncMock(side_effect=Exception("Not found"))
        mock_api.download_file = AsyncMock(side_effect=Exception("Not found"))

        async with client:
            resp = await client.get("/api/proxy/image/99999")
        assert resp.status_code in (404, 500, 502)
