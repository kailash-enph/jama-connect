"""Tests for MCP backend refresh endpoints in server.py.

Run with:  pytest tests/test_mcp_refresh_endpoints.py -v

Verifies that POST /api/{entity}/{id}/refresh fetches from Jama API
and upserts into the SQLite cache.
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))


@pytest.fixture
def mock_mcp_services(monkeypatch):
    """Patch module-level globals in server.py so rest_app works without real Jama."""
    import jama_mcp_v2.server as srv

    mock_api = AsyncMock()
    mock_cache = AsyncMock()
    mock_test_mgr = AsyncMock()

    monkeypatch.setattr(srv, "api_client", mock_api)
    monkeypatch.setattr(srv, "cache", mock_cache)
    monkeypatch.setattr(srv, "test_manager", mock_test_mgr)
    monkeypatch.setattr(srv, "sync_engine", MagicMock())
    monkeypatch.setattr(srv, "writer", MagicMock())
    monkeypatch.setattr(srv, "exporter", MagicMock())
    monkeypatch.setattr(srv, "search_engine", MagicMock())
    monkeypatch.setattr(srv, "attachment_mgr", MagicMock())

    return {
        "api": mock_api,
        "cache": mock_cache,
        "test_mgr": mock_test_mgr,
    }


@pytest.fixture
def mcp_client(mock_mcp_services):
    """Create an httpx test client for the MCP backend rest_app."""
    from httpx import ASGITransport, AsyncClient
    from jama_mcp_v2.server import rest_app

    transport = ASGITransport(app=rest_app)
    return AsyncClient(transport=transport, base_url="http://test")


# ============================================================
# Item Refresh
# ============================================================


class TestRefreshItem:
    @pytest.mark.asyncio
    async def test_refresh_item(self, mcp_client, mock_mcp_services):
        """POST /api/items/{id}/refresh should fetch item and upsert cache."""
        mock_api = mock_mcp_services["api"]
        mock_cache = mock_mcp_services["cache"]

        fresh_item = {
            "id": 42, "version": 5,
            "fields": {"name": "Test", "description": ""},
            "project": 100,
        }
        mock_api.get_item = AsyncMock(return_value=fresh_item)
        mock_cache.upsert_item = AsyncMock()

        async with mcp_client:
            resp = await mcp_client.post("/api/items/42/refresh")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "refreshed"
        assert data["item_id"] == 42

        mock_api.get_item.assert_awaited_once_with(42)
        mock_cache.upsert_item.assert_awaited_once_with(fresh_item)


# ============================================================
# Test Plan Refresh
# ============================================================


class TestRefreshTestPlan:
    @pytest.mark.asyncio
    async def test_refresh_test_plan(self, mcp_client, mock_mcp_services):
        """POST /api/testplans/{id}/refresh should fetch plan and upsert cache."""
        mock_api = mock_mcp_services["api"]
        mock_cache = mock_mcp_services["cache"]

        fresh_plan = {
            "id": 50,
            "fields": {"name": "Plan A", "status": "ACTIVE"},
            "project": {"id": 100},
        }
        mock_api.get_test_plan = AsyncMock(return_value=fresh_plan)
        mock_cache.upsert_test_plan = AsyncMock()

        async with mcp_client:
            resp = await mcp_client.post("/api/testplans/50/refresh")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "refreshed"
        assert data["plan_id"] == 50

        mock_api.get_test_plan.assert_awaited_once_with(50)
        mock_cache.upsert_test_plan.assert_awaited_once_with(fresh_plan, 100)


# ============================================================
# Test Cycle Refresh
# ============================================================


class TestRefreshTestCycle:
    @pytest.mark.asyncio
    async def test_refresh_test_cycle(self, mcp_client, mock_mcp_services):
        """POST /api/testcycles/{id}/refresh should fetch cycle and upsert cache."""
        mock_api = mock_mcp_services["api"]
        mock_cache = mock_mcp_services["cache"]

        fresh_cycle = {
            "id": 60,
            "fields": {"name": "Cycle X", "status": "NOT_RUN"},
            "testPlan": {"id": 50},
        }
        mock_api.get_test_cycle = AsyncMock(return_value=fresh_cycle)
        mock_cache.upsert_test_cycle = AsyncMock()

        async with mcp_client:
            resp = await mcp_client.post("/api/testcycles/60/refresh")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "refreshed"
        assert data["cycle_id"] == 60

        mock_api.get_test_cycle.assert_awaited_once_with(60)
        mock_cache.upsert_test_cycle.assert_awaited_once_with(fresh_cycle, 50)


# ============================================================
# Test Run Refresh
# ============================================================


class TestRefreshTestRun:
    @pytest.mark.asyncio
    async def test_refresh_test_run(self, mcp_client, mock_mcp_services):
        """POST /api/testruns/{id}/refresh should fetch run and upsert cache."""
        mock_api = mock_mcp_services["api"]
        mock_cache = mock_mcp_services["cache"]

        fresh_run = {
            "id": 99,
            "fields": {"status": "PASSED"},
            "testCycle": {"id": 60},
        }
        mock_api.get_test_run = AsyncMock(return_value=fresh_run)
        mock_cache.get_test_run = AsyncMock(return_value={"test_cycle_id": 60})
        mock_cache.upsert_test_run = AsyncMock()

        async with mcp_client:
            resp = await mcp_client.post("/api/testruns/99/refresh")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "refreshed"
        assert data["run_id"] == 99

        mock_api.get_test_run.assert_awaited_once_with(99)
        mock_cache.upsert_test_run.assert_awaited_once_with(fresh_run, 60)


# ============================================================
# Workflow Transition Refresh
# ============================================================


class TestWorkflowTransitionRefreshesCache:
    @pytest.mark.asyncio
    async def test_transition_refreshes_item_cache(self, mcp_client, mock_mcp_services):
        """POST /api/items/{id}/workflowtransitions should refresh item in cache."""
        mock_api = mock_mcp_services["api"]
        mock_cache = mock_mcp_services["cache"]

        mock_api.execute_workflow_transition = AsyncMock(return_value={"status": 200})
        fresh_item = {
            "id": 42, "version": 6,
            "fields": {"name": "Test", "status": "Approved"},
        }
        mock_api.get_item = AsyncMock(return_value=fresh_item)
        mock_cache.upsert_item = AsyncMock()

        async with mcp_client:
            resp = await mcp_client.post(
                "/api/items/42/workflowtransitions",
                json={"transitionId": "trans_1", "comment": "Approving"},
            )

        assert resp.status_code == 200
        mock_api.execute_workflow_transition.assert_awaited_once_with(42, "trans_1", "Approving")
        mock_api.get_item.assert_awaited_once_with(42)
        mock_cache.upsert_item.assert_awaited_once_with(fresh_item)
