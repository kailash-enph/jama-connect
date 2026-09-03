"""Unit tests for Jama MCP v2 tool wrappers (new tools added by megaplan).

Run with:  pytest tests/test_mcp_tools.py -v

Tests each new @mcp.tool() function by mocking the underlying service layer
(api_client, cache, test_manager, attachment_mgr, exporter, writer) and
verifying correct delegation and return values.
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))


@pytest.fixture
def mock_services(monkeypatch):
    """Patch module-level globals in server.py so MCP tools work without real Jama."""
    import jama_mcp_v2.server as srv

    mock_api = AsyncMock()
    mock_cache = AsyncMock()
    mock_test_mgr = AsyncMock()
    mock_writer = AsyncMock()
    mock_exporter = AsyncMock()
    mock_attachment_mgr = AsyncMock()
    mock_search = AsyncMock()
    mock_sync = AsyncMock()

    monkeypatch.setattr(srv, "api_client", mock_api)
    monkeypatch.setattr(srv, "cache", mock_cache)
    monkeypatch.setattr(srv, "test_manager", mock_test_mgr)
    monkeypatch.setattr(srv, "writer", mock_writer)
    monkeypatch.setattr(srv, "exporter", mock_exporter)
    monkeypatch.setattr(srv, "attachment_mgr", mock_attachment_mgr)
    monkeypatch.setattr(srv, "search_engine", mock_search)
    monkeypatch.setattr(srv, "sync_engine", mock_sync)

    return {
        "api": mock_api,
        "cache": mock_cache,
        "test_mgr": mock_test_mgr,
        "writer": mock_writer,
        "exporter": mock_exporter,
        "attachment_mgr": mock_attachment_mgr,
        "search": mock_search,
        "sync": mock_sync,
    }


@pytest.fixture
def ctx():
    """Minimal MCP Context mock."""
    return MagicMock()


# ============================================================
# Tier 1: Item Comments & Activities
# ============================================================


class TestItemComments:
    @pytest.mark.asyncio
    async def test_get_item_comments(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_item_comments

        mock_services["api"].get_item_comments.return_value = [
            {"id": 1, "body": {"text": "Looks good"}},
            {"id": 2, "body": {"text": "Needs revision"}},
        ]
        result = await jama_get_item_comments(ctx, item_id=12345)
        mock_services["api"].get_item_comments.assert_awaited_once_with(12345)
        assert len(result) == 2
        assert result[0]["id"] == 1

    @pytest.mark.asyncio
    async def test_get_item_activities(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_item_activities

        mock_services["api"].get_item_activities.return_value = [
            {"id": 100, "action": "UPDATE", "date": "2025-01-01"}
        ]
        result = await jama_get_item_activities(ctx, item_id=12345)
        mock_services["api"].get_item_activities.assert_awaited_once_with(12345)
        assert len(result) == 1
        assert result[0]["action"] == "UPDATE"


# ============================================================
# Tier 1: Attachments
# ============================================================


class TestAttachments:
    @pytest.mark.asyncio
    async def test_get_item_attachments(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_item_attachments

        mock_services["attachment_mgr"].sync_item_attachments.return_value = [
            {"id": 501, "fileName": "spec.pdf", "fileSize": 1024}
        ]
        result = await jama_get_item_attachments(ctx, item_id=12345)
        mock_services["attachment_mgr"].sync_item_attachments.assert_awaited_once_with(12345)
        assert result[0]["fileName"] == "spec.pdf"

    @pytest.mark.asyncio
    async def test_download_attachment(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_download_attachment

        mock_services["attachment_mgr"].get_attachment_as_base64.return_value = {
            "data": "base64data==",
            "mime_type": "application/pdf",
        }
        result = await jama_download_attachment(ctx, attachment_id=501)
        mock_services["attachment_mgr"].get_attachment_as_base64.assert_awaited_once_with(501)
        assert result["mime_type"] == "application/pdf"


# ============================================================
# Tier 1: Workflow
# ============================================================


class TestWorkflow:
    @pytest.mark.asyncio
    async def test_get_workflow_transitions(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_workflow_transitions

        mock_services["api"].get_workflow_transition_options.return_value = [
            {"id": "t1", "name": "Submit for Review"}
        ]
        result = await jama_get_workflow_transitions(ctx, item_id=12345)
        mock_services["api"].get_workflow_transition_options.assert_awaited_once_with(12345)
        assert result[0]["name"] == "Submit for Review"

    @pytest.mark.asyncio
    async def test_execute_workflow_transition(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_execute_workflow_transition

        mock_services["api"].execute_workflow_transition.return_value = {"status": "In Review"}
        mock_services["api"].get_item.return_value = {"id": 12345, "status": "In Review"}
        result = await jama_execute_workflow_transition(
            ctx, item_id=12345, transition_id="t1", comment="Submitting"
        )
        mock_services["api"].execute_workflow_transition.assert_awaited_once_with(12345, "t1", "Submitting")
        mock_services["cache"].upsert_item.assert_awaited_once()
        assert result["status"] == "In Review"

    @pytest.mark.asyncio
    async def test_execute_workflow_transition_cache_error_swallowed(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_execute_workflow_transition

        mock_services["api"].execute_workflow_transition.return_value = {"status": "ok"}
        mock_services["api"].get_item.side_effect = Exception("network error")
        # Should not raise — cache refresh error is swallowed
        result = await jama_execute_workflow_transition(ctx, item_id=1, transition_id="t1")
        assert result["status"] == "ok"


# ============================================================
# Tier 1: Baselines
# ============================================================


class TestBaselines:
    @pytest.mark.asyncio
    async def test_get_baselines(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_baselines

        mock_services["api"].get_baselines.return_value = [
            {"id": 10, "name": "V1.0 Baseline"}
        ]
        result = await jama_get_baselines(ctx, project_id=20570)
        mock_services["api"].get_baselines.assert_awaited_once_with(20570)
        assert result[0]["name"] == "V1.0 Baseline"

    @pytest.mark.asyncio
    async def test_get_baseline(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_baseline

        mock_services["api"].get_baseline.return_value = {"id": 10, "name": "V1.0 Baseline"}
        result = await jama_get_baseline(ctx, baseline_id=10)
        mock_services["api"].get_baseline.assert_awaited_once_with(10)
        assert result["id"] == 10

    @pytest.mark.asyncio
    async def test_get_baseline_items(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_baseline_items

        mock_services["api"].get_baseline_versioned_items.return_value = [
            {"id": 1001, "version": 3}
        ]
        result = await jama_get_baseline_items(ctx, baseline_id=10)
        mock_services["api"].get_baseline_versioned_items.assert_awaited_once_with(10)
        assert result[0]["version"] == 3


# ============================================================
# Tier 1: Export
# ============================================================


class TestExportTree:
    @pytest.mark.asyncio
    async def test_export_tree_default_format(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_export_tree

        mock_services["exporter"].export_tree.return_value = "# Project\n## Item 1"
        result = await jama_export_tree(ctx, project_id=20570)
        assert "# Project" in result

    @pytest.mark.asyncio
    async def test_export_tree_with_root(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_export_tree

        mock_services["exporter"].export_tree.return_value = "subtree content"
        result = await jama_export_tree(ctx, project_id=20570, root_id=5624954, format="json")
        assert result == "subtree content"


# ============================================================
# Tier 1: Test Management (extended)
# ============================================================


class TestTestManagementExtended:
    @pytest.mark.asyncio
    async def test_get_test_plan_summary(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_test_plan_summary

        mock_services["test_mgr"].get_plan_summary.return_value = {
            "total": 50, "passed": 40, "failed": 5, "blocked": 3, "not_run": 2
        }
        result = await jama_get_test_plan_summary(ctx, plan_id=100)
        mock_services["test_mgr"].get_plan_summary.assert_awaited_once_with(100)
        assert result["total"] == 50

    @pytest.mark.asyncio
    async def test_list_test_groups(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_list_test_groups

        mock_services["test_mgr"].list_test_groups.return_value = [
            {"id": 200, "name": "Functional Tests"}
        ]
        result = await jama_list_test_groups(ctx, plan_id=100)
        mock_services["test_mgr"].list_test_groups.assert_awaited_once_with(100)
        assert result[0]["name"] == "Functional Tests"

    @pytest.mark.asyncio
    async def test_get_test_group_cases(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_test_group_cases

        mock_services["test_mgr"].get_test_group_cases.return_value = [
            {"id": 300, "name": "TC-001"}
        ]
        result = await jama_get_test_group_cases(ctx, group_id=200)
        mock_services["test_mgr"].get_test_group_cases.assert_awaited_once_with(200)
        assert result[0]["id"] == 300


# ============================================================
# Tier 1: Filters
# ============================================================


class TestFilters:
    @pytest.mark.asyncio
    async def test_get_filters(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_filters

        mock_services["api"].get_filters.return_value = [
            {"id": 50, "name": "Open Defects"}
        ]
        result = await jama_get_filters(ctx, project_id=20570)
        mock_services["api"].get_filters.assert_awaited_once_with(20570)
        assert result[0]["name"] == "Open Defects"

    @pytest.mark.asyncio
    async def test_run_filter(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_run_filter

        mock_services["api"].get_filter_results.return_value = [
            {"id": 1001, "name": "Defect A"},
            {"id": 1002, "name": "Defect B"},
        ]
        result = await jama_run_filter(ctx, filter_id=50, project_id=20570)
        mock_services["api"].get_filter_results.assert_awaited_once_with(50, 20570)
        assert len(result) == 2


# ============================================================
# Tier 1: Current User
# ============================================================


class TestCurrentUser:
    @pytest.mark.asyncio
    async def test_get_current_user(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_current_user

        mock_services["api"].get_current_user.return_value = {
            "id": 42, "username": "jdoe", "email": "jdoe@example.com"
        }
        result = await jama_get_current_user(ctx)
        mock_services["api"].get_current_user.assert_awaited_once()
        assert result["username"] == "jdoe"


# ============================================================
# Tier 2: Tags
# ============================================================


class TestTags:
    @pytest.mark.asyncio
    async def test_get_tags(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_tags

        mock_services["api"].get_tags.return_value = [{"id": 1, "name": "safety-critical"}]
        result = await jama_get_tags(ctx, project_id=20570)
        mock_services["api"].get_tags.assert_awaited_once_with(20570)
        assert result[0]["name"] == "safety-critical"

    @pytest.mark.asyncio
    async def test_create_tag(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_create_tag

        mock_services["api"].create_tag.return_value = {"id": 99, "name": "v2.0"}
        result = await jama_create_tag(ctx, project_id=20570, name="v2.0")
        mock_services["api"].create_tag.assert_awaited_once_with(20570, "v2.0")
        assert result["name"] == "v2.0"

    @pytest.mark.asyncio
    async def test_get_item_tags(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_item_tags

        mock_services["api"].get_item_tags.return_value = [{"id": 1, "name": "safety-critical"}]
        result = await jama_get_item_tags(ctx, item_id=12345)
        mock_services["api"].get_item_tags.assert_awaited_once_with(12345)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_add_item_tag(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_add_item_tag

        mock_services["api"].add_item_tag.return_value = {"id": 1}
        result = await jama_add_item_tag(ctx, item_id=12345, tag_id=1)
        mock_services["api"].add_item_tag.assert_awaited_once_with(12345, 1)

    @pytest.mark.asyncio
    async def test_remove_item_tag(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_remove_item_tag

        result = await jama_remove_item_tag(ctx, item_id=12345, tag_id=1)
        mock_services["api"].remove_item_tag.assert_awaited_once_with(12345, 1)
        assert "removed" in result.lower()


# ============================================================
# Tier 2: Item Links
# ============================================================


class TestItemLinks:
    @pytest.mark.asyncio
    async def test_get_item_links(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_item_links

        mock_services["api"].get_item_links.return_value = [
            {"id": 1, "url": "https://jira.example.com/JIRA-123", "description": "Related ticket"}
        ]
        result = await jama_get_item_links(ctx, item_id=12345)
        mock_services["api"].get_item_links.assert_awaited_once_with(12345)
        assert "jira" in result[0]["url"]

    @pytest.mark.asyncio
    async def test_create_item_link(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_create_item_link

        mock_services["api"].create_item_link.return_value = {"id": 5, "url": "https://example.com"}
        result = await jama_create_item_link(ctx, item_id=12345, url="https://example.com", description="test")
        mock_services["api"].create_item_link.assert_awaited_once_with(12345, "https://example.com", "test")
        assert result["url"] == "https://example.com"

    @pytest.mark.asyncio
    async def test_delete_item_link(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_delete_item_link

        result = await jama_delete_item_link(ctx, item_id=12345, link_id=5)
        mock_services["api"].delete_item_link.assert_awaited_once_with(12345, 5)
        assert "deleted" in result.lower()


# ============================================================
# Tier 2: Item Lock
# ============================================================


class TestItemLock:
    @pytest.mark.asyncio
    async def test_get_item_lock(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_item_lock

        mock_services["api"].get_item_lock.return_value = {"locked": True, "lockedBy": {"username": "jdoe"}}
        result = await jama_get_item_lock(ctx, item_id=12345)
        mock_services["api"].get_item_lock.assert_awaited_once_with(12345)
        assert result["locked"] is True

    @pytest.mark.asyncio
    async def test_set_item_lock(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_set_item_lock

        mock_services["api"].set_item_lock.return_value = {"locked": False}
        result = await jama_set_item_lock(ctx, item_id=12345, locked=False)
        mock_services["api"].set_item_lock.assert_awaited_once_with(12345, False)
        assert result["locked"] is False


# ============================================================
# Tier 2: Releases
# ============================================================


class TestReleases:
    @pytest.mark.asyncio
    async def test_get_releases(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_releases

        mock_services["api"].get_releases.return_value = [
            {"id": 10, "name": "v1.0", "releaseDate": "2025-06-01"}
        ]
        result = await jama_get_releases(ctx, project_id=20570)
        mock_services["api"].get_releases.assert_awaited_once_with(20570)
        assert result[0]["name"] == "v1.0"


# ============================================================
# Tier 2: Reviews
# ============================================================


class TestReviews:
    @pytest.mark.asyncio
    async def test_get_reviews(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_reviews

        mock_services["api"].get_reviews.return_value = [
            {"id": 20, "name": "BMU ERD Review", "status": "OPEN"}
        ]
        result = await jama_get_reviews(ctx, project_id=20570)
        mock_services["api"].get_reviews.assert_awaited_once_with(20570)
        assert result[0]["status"] == "OPEN"


# ============================================================
# Tier 3: Item Tree Navigation
# ============================================================


class TestItemTreeNavigation:
    @pytest.mark.asyncio
    async def test_get_item_parent(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_item_parent

        mock_services["api"].get_item_parent.return_value = {"id": 5624954, "name": "L0 Market Reqs"}
        result = await jama_get_item_parent(ctx, item_id=5624955)
        mock_services["api"].get_item_parent.assert_awaited_once_with(5624955)
        assert result["id"] == 5624954

    @pytest.mark.asyncio
    async def test_get_item_location(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_item_location

        mock_services["api"].get_item_location.return_value = {"parent": {"item": 5624954}}
        result = await jama_get_item_location(ctx, item_id=12345)
        mock_services["api"].get_item_location.assert_awaited_once_with(12345)
        assert "parent" in result

    @pytest.mark.asyncio
    async def test_set_item_location(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_set_item_location

        mock_services["api"].set_item_location.return_value = {"parent": {"item": 999}}
        result = await jama_set_item_location(ctx, item_id=12345, parent_item=999)
        mock_services["api"].set_item_location.assert_awaited_once_with(12345, 999, None)

    @pytest.mark.asyncio
    async def test_duplicate_item(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_duplicate_item

        mock_services["api"].duplicate_item.return_value = {"id": 99999, "name": "Copy of Item"}
        result = await jama_duplicate_item(ctx, item_id=12345, include_children=True)
        mock_services["api"].duplicate_item.assert_awaited_once_with(12345, True)
        assert result["id"] == 99999


# ============================================================
# Tier 3: Synced Items
# ============================================================


class TestSyncedItems:
    @pytest.mark.asyncio
    async def test_get_synced_items(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_synced_items

        mock_services["api"].get_synced_items.return_value = [
            {"id": 55555, "syncStatus": "IN_SYNC"}
        ]
        result = await jama_get_synced_items(ctx, item_id=12345)
        mock_services["api"].get_synced_items.assert_awaited_once_with(12345)
        assert result[0]["syncStatus"] == "IN_SYNC"


# ============================================================
# Tier 3: Users
# ============================================================


class TestUsers:
    @pytest.mark.asyncio
    async def test_get_users(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_users

        mock_services["api"].get_users.return_value = [
            {"id": 1, "username": "admin", "active": True},
            {"id": 2, "username": "jdoe", "active": True},
        ]
        result = await jama_get_users(ctx)
        mock_services["api"].get_users.assert_awaited_once()
        assert len(result) == 2


# ============================================================
# Tier 3: Schema & Metadata
# ============================================================


class TestSchemaMetadata:
    @pytest.mark.asyncio
    async def test_get_item_types(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_item_types

        mock_services["api"].get_item_types.return_value = [
            {"id": 89028, "display": "Component", "typeKey": "CMP"}
        ]
        result = await jama_get_item_types(ctx)
        mock_services["api"].get_item_types.assert_awaited_once()
        assert result[0]["typeKey"] == "CMP"

    @pytest.mark.asyncio
    async def test_get_pick_lists(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_pick_lists

        mock_services["api"].get_pick_lists.return_value = [
            {"id": 10, "name": "Priority"}
        ]
        result = await jama_get_pick_lists(ctx)
        mock_services["api"].get_pick_lists.assert_awaited_once()
        assert result[0]["name"] == "Priority"

    @pytest.mark.asyncio
    async def test_get_pick_list_options(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_pick_list_options

        mock_services["api"].get_pick_list_options.return_value = [
            {"id": 1, "name": "High", "value": "HIGH", "default": False},
            {"id": 2, "name": "Medium", "value": "MEDIUM", "default": True},
        ]
        result = await jama_get_pick_list_options(ctx, pick_list_id=10)
        mock_services["api"].get_pick_list_options.assert_awaited_once_with(10)
        assert len(result) == 2


# ============================================================
# Tier 3: User Groups
# ============================================================


class TestUserGroups:
    @pytest.mark.asyncio
    async def test_get_user_groups(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_user_groups

        mock_services["api"].get_user_groups.return_value = [
            {"id": 100, "name": "HW Engineers"}
        ]
        result = await jama_get_user_groups(ctx)
        mock_services["api"].get_user_groups.assert_awaited_once()
        assert result[0]["name"] == "HW Engineers"


# ============================================================
# Tier 3: Project Activities
# ============================================================


class TestProjectActivities:
    @pytest.mark.asyncio
    async def test_get_project_activities(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_project_activities

        mock_services["api"].get_activities.return_value = [
            {"id": 500, "action": "CREATE", "date": "2025-07-01"}
        ]
        result = await jama_get_project_activities(ctx, project_id=20570)
        mock_services["api"].get_activities.assert_awaited_once_with(20570)
        assert result[0]["action"] == "CREATE"


# ============================================================
# Tier 3: Review Details
# ============================================================


class TestReviewDetails:
    @pytest.mark.asyncio
    async def test_get_review_details(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_review_details

        mock_services["api"].get_review.return_value = {"id": 20, "name": "Review A"}
        mock_services["api"].get_review_comments.return_value = [{"id": 1, "text": "Approved"}]
        mock_services["api"].get_review_revisions.return_value = [{"id": 30}]
        mock_services["api"].get_review_revision_progress.return_value = {"approved": 3, "total": 5}

        result = await jama_get_review_details(ctx, review_id=20)

        mock_services["api"].get_review.assert_awaited_once_with(20)
        mock_services["api"].get_review_comments.assert_awaited_once_with(20)
        mock_services["api"].get_review_revisions.assert_awaited_once_with(20)
        mock_services["api"].get_review_revision_progress.assert_awaited_once_with(20, 30)
        assert result["review"]["name"] == "Review A"
        assert len(result["comments"]) == 1
        assert result["latest_progress"]["approved"] == 3

    @pytest.mark.asyncio
    async def test_get_review_details_no_revisions(self, mock_services, ctx):
        from jama_mcp_v2.server import jama_get_review_details

        mock_services["api"].get_review.return_value = {"id": 20}
        mock_services["api"].get_review_comments.return_value = []
        mock_services["api"].get_review_revisions.return_value = []

        result = await jama_get_review_details(ctx, review_id=20)
        assert result["latest_progress"] == {}
        mock_services["api"].get_review_revision_progress.assert_not_awaited()


# ============================================================
# Tool count verification
# ============================================================


class TestToolCount:
    def test_total_mcp_tool_count(self, mock_services):
        """Verify we have at least 65 MCP tools registered."""
        from jama_mcp_v2.server import mcp

        # FastMCP stores tools in _tool_manager._tools dict
        tool_mgr = getattr(mcp, "_tool_manager", None)
        if tool_mgr:
            tools = getattr(tool_mgr, "_tools", {})
            count = len(tools)
        else:
            # Fallback: count @mcp.tool() decorated functions by introspection
            import jama_mcp_v2.server as srv
            count = sum(
                1 for name in dir(srv)
                if name.startswith("jama_") and callable(getattr(srv, name))
            )
        assert count >= 65, f"Expected ≥65 MCP tools, got {count}"
