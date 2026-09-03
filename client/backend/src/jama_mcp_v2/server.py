"""Jama MCP v2 Server — MCP tools (stdio) + Unified FastAPI REST API (HTTP).

Single backend process serving:
  - MCP tools via stdio transport (for Windsurf/Claude)
  - REST API for the Next.js viewer app
  - Editor REST API mounted at /editor/ (drafts, locks, push, schema, images)
  - Health endpoint at /api/health
"""

from __future__ import annotations

import asyncio
import atexit
import json
import logging
import logging.handlers
import os
import re
import signal
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from mcp.server.fastmcp import FastMCP, Context

from .api_client import JamaApiClient
from .attachments import AttachmentManager
from .cache import JamaCache
from .exporter import Exporter
from .models import ExportFormat, SyncState, TestRunStatus
from .progress import ProgressBus
from .search import SearchEngine
from .services import services, JAMA_URL, CLIENT_ID, CLIENT_SECRET, CACHE_DIR, REST_PORT, MAX_CONCURRENT
from .sync import SyncEngine
from .testing import TestManager
from .tree import build_tree, get_ancestors
from .writer import Writer

# ---------- Logging ----------

logging.basicConfig(
    level=os.environ.get("JAMA_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("jama-mcp-v2")

# ---------- Module-level service aliases ----------
# MCP tools and REST routes use bare names (api_client, cache, etc.).
# After init, _rebind_module_aliases() copies from the ServiceRegistry.

api_client: JamaApiClient | None = None
cache: JamaCache | None = None
sync_engine: SyncEngine | None = None
test_manager: TestManager | None = None
writer: Writer | None = None
exporter: Exporter | None = None
search_engine: SearchEngine | None = None
attachment_mgr: AttachmentManager | None = None
progress_bus = ProgressBus()
_session_cookie: str = ""  # Browser JSESSIONID for SAML-protected downloads


def _rebind_module_aliases() -> None:
    """After services.init_mcp_services(), copy refs into module globals
    so that existing `assert cache`, `assert api_client` patterns still work."""
    global api_client, cache, sync_engine, test_manager, writer, exporter
    global search_engine, attachment_mgr, progress_bus
    api_client = services.api_client  # type: ignore[assignment]
    cache = services.cache  # type: ignore[assignment]
    sync_engine = services.sync_engine
    test_manager = services.test_manager
    writer = services.writer
    exporter = services.exporter
    search_engine = services.search_engine
    attachment_mgr = services.attachment_mgr
    progress_bus = services.progress_bus  # type: ignore[assignment]


async def _init_services() -> None:
    """Initialize all MCP services via ServiceRegistry."""
    await services.init_mcp_services()
    _rebind_module_aliases()
    logger.info("Services initialized: API=%s, Cache=%s", JAMA_URL, services.cache.db_path if services.cache else "N/A")


async def _shutdown_services() -> None:
    await services.shutdown_all()
    _rebind_module_aliases()
    logger.info("Services shut down")


# ============================================================
# MCP Server
# ============================================================

@asynccontextmanager
async def mcp_lifespan(server: FastMCP) -> AsyncIterator[dict]:
    """MCP server lifespan — initialize services."""
    await _init_services()
    try:
        yield {
            "api": api_client,
            "cache": cache,
            "sync": sync_engine,
            "test": test_manager,
            "writer": writer,
        }
    finally:
        await _shutdown_services()


mcp = FastMCP("Jama Connect v2", lifespan=mcp_lifespan)


# ---------- MCP Tools: Projects ----------

@mcp.tool()
async def jama_list_projects(ctx: Context) -> list[dict]:
    """List all Jama projects (from cache if available, otherwise from API)."""
    assert cache and api_client
    cached = await cache.get_projects()
    if cached:
        return cached
    projects = await api_client.get_projects()
    for p in projects:
        await cache.upsert_project(p)
    return await cache.get_projects()


@mcp.tool()
async def jama_get_project(ctx: Context, project_id: int) -> dict:
    """Get details for a single Jama project."""
    assert api_client and cache
    data = await api_client.get_project(project_id)
    await cache.upsert_project(data)
    return data


# ---------- MCP Tools: Items ----------

@mcp.tool()
async def jama_get_item(ctx: Context, item_id: int) -> dict:
    """Get a single Jama item by ID."""
    assert cache and api_client
    cached = await cache.get_item(item_id)
    if cached:
        return cached
    data = await api_client.get_item(item_id)
    await cache.upsert_item(data)
    return data


@mcp.tool()
async def jama_get_item_children(ctx: Context, item_id: int) -> list[dict]:
    """Get child items of a Jama item."""
    assert cache
    cached = await cache.get_item_children(item_id)
    if cached:
        return cached
    assert api_client
    children = await api_client.get_item_children(item_id)
    for c in children:
        await cache.upsert_item(c)
    return children


@mcp.tool()
async def jama_get_item_tree(ctx: Context, project_id: int, root_id: int | None = None) -> list[dict]:
    """Get the item tree for a project (or subtree from root_id)."""
    assert cache
    items = await cache.get_items_by_project(project_id)
    tree = build_tree(items, root_id)
    return [n.model_dump() for n in tree]


# ---------- MCP Tools: Relationships ----------

@mcp.tool()
async def jama_get_relationships(ctx: Context, project_id: int) -> list[dict]:
    """Get all relationships for a project."""
    assert cache
    return await cache.get_relationships(project_id)


@mcp.tool()
async def jama_get_item_upstream(ctx: Context, item_id: int) -> list[dict]:
    """Get upstream related items."""
    assert api_client
    return await api_client.get_item_upstream_related(item_id)


@mcp.tool()
async def jama_get_item_downstream(ctx: Context, item_id: int) -> list[dict]:
    """Get downstream related items."""
    assert api_client
    return await api_client.get_item_downstream_related(item_id)


# ---------- MCP Tools: Versions ----------

@mcp.tool()
async def jama_get_item_versions(ctx: Context, item_id: int) -> list[dict]:
    """Get version history for an item (on-demand, cached permanently)."""
    assert cache and api_client
    cached = await cache.get_item_version_list(item_id)
    if cached:
        return cached

    versions = await api_client.get_item_versions(item_id)
    for v in versions:
        version_data = {
            "item_id": item_id,
            "version_num": v.get("versionNumber", v.get("version", 0)),
            "fields_json": json.dumps(v.get("fields", {})),
            "description_html": v.get("fields", {}).get("description", ""),
            "modified_by": v.get("userName", v.get("modifiedBy")),
            "modified_date": v.get("modifiedDate"),
            "created_date": v.get("createdDate"),
            "type": v.get("type", ""),
            "version_comment": v.get("changeDetails", v.get("versionComment", "")),
        }
        await cache.upsert_item_version(version_data)

    return await cache.get_item_version_list(item_id)


@mcp.tool()
async def jama_get_item_at_version(ctx: Context, item_id: int, version: int) -> dict:
    """Get an item snapshot at a specific version number."""
    assert cache and api_client
    cached = await cache.get_item_version(item_id, version)
    if cached:
        return cached

    data = await api_client.get_item_at_version(item_id, version)
    version_data = {
        "item_id": item_id,
        "version_num": version,
        "fields_json": json.dumps(data.get("fields", {})),
        "description_html": data.get("fields", {}).get("description", ""),
        "modified_by": data.get("modifiedBy"),
        "modified_date": data.get("modifiedDate"),
        "created_date": data.get("createdDate"),
        "type": data.get("type", ""),
        "version_comment": data.get("versionComment", ""),
    }
    await cache.upsert_item_version(version_data)
    return version_data


# ---------- MCP Tools: Sync ----------

@mcp.tool()
async def jama_sync_project(ctx: Context, project_id: int) -> dict:
    """Full sync of a Jama project to local cache."""
    assert sync_engine
    result = await sync_engine.sync_project(project_id, on_progress=progress_bus.make_callback())
    return result.model_dump(mode="json")


@mcp.tool()
async def jama_incremental_sync(ctx: Context, project_id: int) -> dict:
    """Incremental sync (only changed items since last sync)."""
    assert sync_engine
    result = await sync_engine.incremental_sync(project_id, on_progress=progress_bus.make_callback())
    return result.model_dump(mode="json")


# ---------- MCP Tools: Search ----------

@mcp.tool()
async def jama_search(ctx: Context, query: str, project_id: int | None = None, limit: int = 20) -> list[dict]:
    """Full-text search over cached items.

    Supports: document keys (SET-43, CMP-12), item IDs, natural language,
    FTS5 operators (AND, OR, NOT, "phrase", prefix*).
    Searches name, description, document_key, and all custom fields.
    Returns lightweight results for quick lookups.

    Use jama_deep_search for holistic results with upstream/downstream
    relationship context, parent info, and parsed custom fields.
    """
    assert search_engine
    # Use unified search to also find test runs, plans, cycles
    results = await search_engine.unified_search(query, project_id=project_id, limit=limit)
    return [r.model_dump(mode="json") for r in results]


@mcp.tool()
async def jama_deep_search(
    ctx: Context,
    query: str,
    project_id: int | None = None,
    limit: int = 10,
    include_relations: bool = True,
    max_relation_depth: int = 1,
) -> list[dict]:
    """Holistic search returning items with full traceability context.

    For each matched item, returns:
      - item details (name, description, document_key, version, custom fields)
      - upstream_items: requirements/items that trace TO this item
      - downstream_items: items this item traces TO (derived requirements, test cases)
      - parent: parent item in tree hierarchy
      - children_count: number of children

    Also searches test runs, test plans, and test cycles. Test run results
    include test_cycle_name, test_plan_name, test_case_id, execution_date,
    and status (PASSED/FAILED/NOT_RUN etc.).

    Use this when you need the full picture of an item's traceability and
    relationships. Searches name, description, document_key, and all custom
    fields in the cache.

    Args:
        query: Search text, document key (SET-43), or item ID (5624955).
        project_id: Limit to a specific project. None = all projects.
        limit: Max results (default 10).
        include_relations: Include upstream/downstream relationships (default True).
        max_relation_depth: 1 = direct relations only, 2 = include relations-of-relations.
    """
    assert search_engine

    # Use unified deep search (covers items + test runs + plans + cycles)
    unified_results = await search_engine.unified_deep_search(
        query, project_id=project_id, limit=limit,
    )

    # For items with include_relations, enrich with traceability
    if include_relations:
        for entry in unified_results:
            if entry.doc_type == "item":
                item_id = entry.entity_id
                upstream = await cache.get_item_upstream_relations(item_id)
                downstream = await cache.get_item_downstream_relations(item_id)
                entry.upstream_items = [
                    {
                        "item_id": r["from_item"],
                        "document_key": r.get("from_document_key", ""),
                        "name": r.get("from_name", ""),
                        "relationship_type": r.get("relationship_type"),
                        "suspect": r.get("suspect", False),
                    }
                    for r in upstream
                ]
                entry.downstream_items = [
                    {
                        "item_id": r["to_item"],
                        "document_key": r.get("to_document_key", ""),
                        "name": r.get("to_name", ""),
                        "relationship_type": r.get("relationship_type"),
                        "suspect": r.get("suspect", False),
                    }
                    for r in downstream
                ]

    return [r.model_dump(mode="json") for r in unified_results]


# ---------- MCP Tools: Test Management ----------

@mcp.tool()
async def jama_list_test_plans(ctx: Context, project_id: int) -> list[dict]:
    """List test plans for a project."""
    assert test_manager
    return await test_manager.list_test_plans(project_id)


@mcp.tool()
async def jama_list_test_cycles(ctx: Context, plan_id: int) -> list[dict]:
    """List test cycles for a test plan."""
    assert test_manager
    return await test_manager.list_test_cycles(plan_id)


@mcp.tool()
async def jama_list_test_runs(ctx: Context, cycle_id: int) -> list[dict]:
    """List test runs for a test cycle."""
    assert test_manager
    return await test_manager.list_test_runs(cycle_id)


@mcp.tool()
async def jama_get_test_summary(ctx: Context, cycle_id: int) -> dict:
    """Get pass/fail summary for a test cycle."""
    assert test_manager
    summary = await test_manager.get_test_summary(cycle_id)
    return summary.model_dump()


@mcp.tool()
async def jama_update_test_run(ctx: Context, run_id: int, status: str, actual_results: str | None = None) -> dict:
    """Update a test run's status (PASSED, FAILED, BLOCKED, NOT_RUN, INPROGRESS)."""
    assert test_manager
    return await test_manager.update_test_run_status(run_id, status, actual_results)


@mcp.tool()
async def jama_create_test_cycle(
    ctx: Context,
    plan_id: int,
    name: str,
    start_date: str,
    end_date: str,
) -> dict:
    """Create a new test cycle for a test plan."""
    assert test_manager
    return await test_manager.create_test_cycle(plan_id, name, start_date, end_date)


# ---------- MCP Tools: Write-back ----------

@mcp.tool()
async def jama_update_item(ctx: Context, item_id: int, fields: dict) -> dict:
    """Update fields on a Jama item (write-back)."""
    assert writer
    return await writer.update_item_fields(item_id, fields)


@mcp.tool()
async def jama_create_item(
    ctx: Context,
    project_id: int,
    item_type_id: int,
    parent_id: int,
    fields: dict,
) -> dict:
    """Create a new item in Jama and add to cache.

    Args:
        project_id: Jama project ID.
        item_type_id: Item type ID (use jama_get_item to see itemType on existing items).
        parent_id: Parent item ID to nest under.
        fields: Dict of field values (e.g. {"name": "My Item", "description": "<p>HTML</p>"}).
    """
    assert writer
    return await writer.create_item(project_id, item_type_id, parent_id, fields)


@mcp.tool()
async def jama_delete_item(ctx: Context, item_id: int) -> str:
    """Delete an item from Jama and remove from cache.

    Args:
        item_id: Jama item ID to delete. This is permanent and cannot be undone.
    """
    assert writer
    await writer.delete_item(item_id)
    return f"Item {item_id} deleted successfully."


@mcp.tool()
async def jama_add_comment(ctx: Context, item_id: int, comment_text: str) -> dict:
    """Add a comment to a Jama item.

    Args:
        item_id: Jama item ID to comment on.
        comment_text: Plain text or HTML comment body.
    """
    assert writer
    return await writer.add_comment(item_id, comment_text)


@mcp.tool()
async def jama_upload_attachment(
    ctx: Context,
    item_id: int,
    file_path: str,
    description: str = "",
) -> dict:
    """Upload a file attachment to a Jama item.

    Args:
        item_id: Jama item ID to attach the file to.
        file_path: Absolute path to the file to upload (e.g. PDF, image, spreadsheet).
        description: Optional description for the attachment.
    """
    assert writer
    return await writer.upload_attachment(item_id, file_path, description)


@mcp.tool()
async def jama_create_relationship(
    ctx: Context,
    from_item: int,
    to_item: int,
    relationship_type_id: int | None = None,
) -> dict:
    """Create a traceability relationship between two Jama items.

    Args:
        from_item: Source (upstream) item ID — the requirement/parent.
        to_item: Target (downstream) item ID — the derived item/test case.
        relationship_type_id: Optional relationship type ID. Use jama_get_relationship_types
                              to list available types. If None, uses the project default.
    """
    assert writer
    return await writer.create_relationship(from_item, to_item, relationship_type_id)


@mcp.tool()
async def jama_delete_relationship(ctx: Context, relationship_id: int) -> str:
    """Delete a traceability relationship from Jama.

    Args:
        relationship_id: Jama relationship ID to delete.
    """
    assert writer
    await writer.delete_relationship(relationship_id)
    return f"Relationship {relationship_id} deleted successfully."


@mcp.tool()
async def jama_get_relationship_types(ctx: Context) -> list[dict]:
    """Get all relationship types available in the Jama workspace."""
    assert api_client
    return await api_client.get_relationship_types()


# ---------- MCP Tools: Export ----------

@mcp.tool()
async def jama_export_item(ctx: Context, item_id: int, format: str = "md") -> str:
    """Export a cached item as Markdown, HTML, or JSON."""
    assert exporter
    fmt = ExportFormat(format)
    return await exporter.export_item(item_id, fmt)


# ---------- MCP Tools: Stats ----------

@mcp.tool()
async def jama_cache_stats(ctx: Context) -> dict:
    """Get cache statistics (item counts, DB size)."""
    assert cache
    return await cache.get_stats()


# ---------- MCP Tools: Item Comments & Activities ----------

@mcp.tool()
async def jama_get_item_comments(ctx: Context, item_id: int) -> list[dict]:
    """Read all comments on a Jama item.

    Use this to see discussion threads, review feedback, and notes left by
    team members on a requirement, test case, or any other Jama item.

    Args:
        item_id: The Jama item ID to get comments for.

    Returns:
        List of comment objects with id, body.text, createdDate, createdBy fields.
        Comments are returned in chronological order.
    """
    assert api_client
    return await api_client.get_item_comments(item_id)


@mcp.tool()
async def jama_get_item_activities(ctx: Context, item_id: int) -> list[dict]:
    """Get the change history / audit trail for a Jama item.

    Shows who changed what and when — field modifications, status transitions,
    relationship additions, attachment uploads, etc.

    Args:
        item_id: The Jama item ID to get activity history for.

    Returns:
        List of activity objects with id, date, action, user, and details of each change.
    """
    assert api_client
    return await api_client.get_item_activities(item_id)


# ---------- MCP Tools: Attachments ----------

@mcp.tool()
async def jama_get_item_attachments(ctx: Context, item_id: int) -> list[dict]:
    """List all attachments on a Jama item.

    Fetches attachment metadata from the Jama API and caches it locally.
    Returns file names, sizes, upload dates, and attachment IDs that can be
    used with jama_download_attachment.

    Args:
        item_id: The Jama item ID to list attachments for.

    Returns:
        List of attachment metadata objects with id, fileName, fileSize, mimeType.
    """
    assert attachment_mgr
    return await attachment_mgr.sync_item_attachments(item_id)


@mcp.tool()
async def jama_download_attachment(ctx: Context, attachment_id: int) -> dict:
    """Download an attachment and return its content as base64.

    Use jama_get_item_attachments first to get the attachment_id, then call
    this tool to retrieve the binary content encoded as base64.

    Args:
        attachment_id: The Jama attachment ID to download.

    Returns:
        Dict with 'data' (base64-encoded content), 'mime_type', and 'size' fields.
    """
    assert attachment_mgr
    return await attachment_mgr.get_attachment_as_base64(attachment_id)


# ---------- MCP Tools: Workflow ----------

@mcp.tool()
async def jama_get_workflow_transitions(ctx: Context, item_id: int) -> list[dict]:
    """Get available workflow transitions for a Jama item.

    Returns the list of workflow steps the item can move to from its current
    state. Use this before jama_execute_workflow_transition to know which
    transitions are valid.

    Args:
        item_id: The Jama item ID to check transitions for.

    Returns:
        List of transition objects with id, name, and targetStatus fields.
    """
    assert api_client
    return await api_client.get_workflow_transition_options(item_id)


@mcp.tool()
async def jama_execute_workflow_transition(
    ctx: Context,
    item_id: int,
    transition_id: str,
    comment: str = "",
) -> dict:
    """Execute a workflow transition on a Jama item.

    Advances the item through its workflow (e.g., Draft → In Review → Approved).
    Use jama_get_workflow_transitions first to get valid transition IDs.

    Args:
        item_id: The Jama item ID to transition.
        transition_id: The transition ID from jama_get_workflow_transitions.
        comment: Optional comment to record with the transition.

    Returns:
        Updated item data after the transition.
    """
    assert api_client and cache
    result = await api_client.execute_workflow_transition(item_id, transition_id, comment)
    try:
        fresh = await api_client.get_item(item_id)
        await cache.upsert_item(fresh)
    except Exception:
        pass
    return result


# ---------- MCP Tools: Baselines ----------

@mcp.tool()
async def jama_get_baselines(ctx: Context, project_id: int) -> list[dict]:
    """List all baselines (snapshots) in a Jama project.

    Baselines capture a frozen snapshot of items at a point in time, used for
    audits, milestone tracking, and regulatory compliance.

    Args:
        project_id: The Jama project ID.

    Returns:
        List of baseline objects with id, name, description, createdDate.
    """
    assert api_client
    return await api_client.get_baselines(project_id)


@mcp.tool()
async def jama_get_baseline(ctx: Context, baseline_id: int) -> dict:
    """Get details of a specific baseline.

    Args:
        baseline_id: The baseline ID.

    Returns:
        Baseline object with id, name, description, project, createdDate, createdBy.
    """
    assert api_client
    return await api_client.get_baseline(baseline_id)


@mcp.tool()
async def jama_get_baseline_items(ctx: Context, baseline_id: int) -> list[dict]:
    """Get the items captured in a baseline snapshot.

    Returns the versioned items as they existed when the baseline was created.
    Useful for comparing current state against a past milestone.

    Args:
        baseline_id: The baseline ID.

    Returns:
        List of versioned item objects frozen at the baseline point in time.
    """
    assert api_client
    return await api_client.get_baseline_versioned_items(baseline_id)


# ---------- MCP Tools: Export ----------

@mcp.tool()
async def jama_export_tree(
    ctx: Context,
    project_id: int,
    root_id: int | None = None,
    format: str = "md",
) -> str:
    """Export a full project or subtree as Markdown, HTML, or JSON.

    Exports the hierarchical item tree from cache. Sync the project first
    (jama_sync_project) to ensure the cache is populated.

    Args:
        project_id: The Jama project ID.
        root_id: Optional root item ID to export a subtree. None exports the full project.
        format: Output format — 'md' (Markdown), 'html', or 'json'. Defaults to 'md'.

    Returns:
        String content in the requested format.
    """
    assert exporter
    fmt = ExportFormat(format)
    return await exporter.export_tree(project_id, root_id, fmt)


# ---------- MCP Tools: Test Management (extended) ----------

@mcp.tool()
async def jama_get_test_plan_summary(ctx: Context, plan_id: int) -> dict:
    """Get aggregated pass/fail statistics across all test cycles in a plan.

    Provides a roll-up view: total runs, passed, failed, blocked, not_run,
    in_progress counts summed across every cycle in the test plan.

    Args:
        plan_id: The Jama test plan ID.

    Returns:
        Dict with total, passed, failed, blocked, not_run, in_progress counts
        and per-cycle breakdown.
    """
    assert test_manager
    return await test_manager.get_plan_summary(plan_id)


@mcp.tool()
async def jama_list_test_groups(ctx: Context, plan_id: int) -> list[dict]:
    """List test groups (sections) within a test plan.

    Test groups organize test cases into logical sections within a plan
    (e.g., 'Functional Tests', 'Regression Tests').

    Args:
        plan_id: The Jama test plan ID.

    Returns:
        List of test group objects with id, name, and ordering info.
    """
    assert test_manager
    return await test_manager.list_test_groups(plan_id)


@mcp.tool()
async def jama_get_test_group_cases(ctx: Context, group_id: int) -> list[dict]:
    """Get test cases belonging to a specific test group.

    Args:
        group_id: The Jama test group ID (from jama_list_test_groups).

    Returns:
        List of test case objects within the group.
    """
    assert test_manager
    return await test_manager.get_test_group_cases(group_id)


# ---------- MCP Tools: Filters ----------

@mcp.tool()
async def jama_get_filters(ctx: Context, project_id: int) -> list[dict]:
    """List saved filters in a Jama project.

    Filters are saved queries that can be executed to find items matching
    specific criteria (e.g., 'Open defects', 'My assigned items').

    Args:
        project_id: The Jama project ID.

    Returns:
        List of filter objects with id, name, and author.
    """
    assert api_client
    return await api_client.get_filters(project_id)


@mcp.tool()
async def jama_run_filter(ctx: Context, filter_id: int, project_id: int) -> list[dict]:
    """Execute a saved Jama filter and return matching items.

    Use jama_get_filters first to discover available filter IDs.

    Args:
        filter_id: The filter ID to execute.
        project_id: The project ID to run the filter against.

    Returns:
        List of item objects matching the filter criteria.
    """
    assert api_client
    return await api_client.get_filter_results(filter_id, project_id)


# ---------- MCP Tools: Current User ----------

@mcp.tool()
async def jama_get_current_user(ctx: Context) -> dict:
    """Get information about the currently authenticated Jama user.

    Returns the user profile for the OAuth client credentials being used,
    including user ID, name, email, and license type.

    Returns:
        User object with id, username, firstName, lastName, email, active, licenseType.
    """
    assert api_client
    return await api_client.get_current_user()


# ---------- MCP Tools: Tags ----------

@mcp.tool()
async def jama_get_tags(ctx: Context, project_id: int) -> list[dict]:
    """List all tags in a Jama project.

    Tags are labels that can be applied to items for categorization
    and filtering (e.g., 'safety-critical', 'deferred', 'v2.0').

    Args:
        project_id: The Jama project ID.

    Returns:
        List of tag objects with id and name.
    """
    assert api_client
    return await api_client.get_tags(project_id)


@mcp.tool()
async def jama_create_tag(ctx: Context, project_id: int, name: str) -> dict:
    """Create a new tag in a Jama project.

    Args:
        project_id: The Jama project ID.
        name: The tag name to create.

    Returns:
        Created tag object with id and name.
    """
    assert api_client
    return await api_client.create_tag(project_id, name)


@mcp.tool()
async def jama_get_item_tags(ctx: Context, item_id: int) -> list[dict]:
    """Get all tags applied to a specific Jama item.

    Args:
        item_id: The Jama item ID.

    Returns:
        List of tag objects with id and name.
    """
    assert api_client
    return await api_client.get_item_tags(item_id)


@mcp.tool()
async def jama_add_item_tag(ctx: Context, item_id: int, tag_id: int) -> dict:
    """Apply a tag to a Jama item.

    Use jama_get_tags to find the tag_id first.

    Args:
        item_id: The Jama item ID to tag.
        tag_id: The tag ID to apply.

    Returns:
        Confirmation of the tag application.
    """
    assert api_client
    return await api_client.add_item_tag(item_id, tag_id)


@mcp.tool()
async def jama_remove_item_tag(ctx: Context, item_id: int, tag_id: int) -> str:
    """Remove a tag from a Jama item.

    Args:
        item_id: The Jama item ID.
        tag_id: The tag ID to remove.

    Returns:
        Confirmation message.
    """
    assert api_client
    await api_client.remove_item_tag(item_id, tag_id)
    return f"Tag {tag_id} removed from item {item_id}."


# ---------- MCP Tools: Item Links (hyperlinks) ----------

@mcp.tool()
async def jama_get_item_links(ctx: Context, item_id: int) -> list[dict]:
    """Get hyperlinks attached to a Jama item.

    These are external URL links (not Jama relationships). For example,
    links to Confluence pages, JIRA tickets, or external specs.

    Args:
        item_id: The Jama item ID.

    Returns:
        List of link objects with id, url, and description.
    """
    assert api_client
    return await api_client.get_item_links(item_id)


@mcp.tool()
async def jama_create_item_link(
    ctx: Context,
    item_id: int,
    url: str,
    description: str = "",
) -> dict:
    """Add a URL hyperlink to a Jama item.

    Args:
        item_id: The Jama item ID.
        url: The URL to link to.
        description: Optional human-readable description of the link.

    Returns:
        Created link object with id, url, description.
    """
    assert api_client
    return await api_client.create_item_link(item_id, url, description)


@mcp.tool()
async def jama_delete_item_link(ctx: Context, item_id: int, link_id: int) -> str:
    """Remove a hyperlink from a Jama item.

    Args:
        item_id: The Jama item ID.
        link_id: The link ID to remove (from jama_get_item_links).

    Returns:
        Confirmation message.
    """
    assert api_client
    await api_client.delete_item_link(item_id, link_id)
    return f"Link {link_id} deleted from item {item_id}."


# ---------- MCP Tools: Item Lock ----------

@mcp.tool()
async def jama_get_item_lock(ctx: Context, item_id: int) -> dict:
    """Check whether a Jama item is locked for editing.

    Args:
        item_id: The Jama item ID.

    Returns:
        Lock status object with locked (bool) and lockedBy user info.
    """
    assert api_client
    return await api_client.get_item_lock(item_id)


@mcp.tool()
async def jama_set_item_lock(ctx: Context, item_id: int, locked: bool) -> dict:
    """Lock or unlock a Jama item.

    Locking prevents other users from editing the item until it is unlocked.

    Args:
        item_id: The Jama item ID.
        locked: True to lock, False to unlock.

    Returns:
        Updated lock status.
    """
    assert api_client
    return await api_client.set_item_lock(item_id, locked)


# ---------- MCP Tools: Releases ----------

@mcp.tool()
async def jama_get_releases(ctx: Context, project_id: int) -> list[dict]:
    """List releases in a Jama project.

    Releases represent version milestones (e.g., 'v1.0', 'v2.0 Beta').

    Args:
        project_id: The Jama project ID.

    Returns:
        List of release objects with id, name, description, releaseDate.
    """
    assert api_client
    return await api_client.get_releases(project_id)


# ---------- MCP Tools: Reviews ----------

@mcp.tool()
async def jama_get_reviews(ctx: Context, project_id: int) -> list[dict]:
    """List Review Center reviews in a Jama project (Labs API).

    Reviews are formal review processes with participants, moderators,
    and approval workflows.

    Args:
        project_id: The Jama project ID.

    Returns:
        List of review objects with id, name, status, and participant info.
    """
    assert api_client
    return await api_client.get_reviews(project_id)


# ---------- MCP Tools: Item Tree Navigation ----------

@mcp.tool()
async def jama_get_item_parent(ctx: Context, item_id: int) -> dict:
    """Get the parent item of a Jama item in the tree hierarchy.

    Args:
        item_id: The Jama item ID.

    Returns:
        Parent item object, or empty dict if the item is a root.
    """
    assert api_client
    return await api_client.get_item_parent(item_id)


@mcp.tool()
async def jama_get_item_location(ctx: Context, item_id: int) -> dict:
    """Get the tree location of a Jama item (parent and project context).

    Args:
        item_id: The Jama item ID.

    Returns:
        Location object with parent item/project references.
    """
    assert api_client
    return await api_client.get_item_location(item_id)


@mcp.tool()
async def jama_set_item_location(
    ctx: Context,
    item_id: int,
    parent_item: int | None = None,
    parent_project: int | None = None,
) -> dict:
    """Move a Jama item to a new location in the tree.

    Specify either parent_item (to move under another item) or
    parent_project (to make it a root item in a project).

    Args:
        item_id: The Jama item ID to move.
        parent_item: Target parent item ID. Mutually exclusive with parent_project.
        parent_project: Target project ID (makes item a root). Mutually exclusive with parent_item.

    Returns:
        Updated location info.
    """
    assert api_client
    return await api_client.set_item_location(item_id, parent_item, parent_project)


@mcp.tool()
async def jama_duplicate_item(
    ctx: Context,
    item_id: int,
    include_children: bool = False,
) -> dict:
    """Duplicate a Jama item, optionally including its children.

    Creates a copy of the item in the same location.

    Args:
        item_id: The Jama item ID to duplicate.
        include_children: If True, also duplicates all child items. Defaults to False.

    Returns:
        The newly created duplicate item.
    """
    assert api_client
    return await api_client.duplicate_item(item_id, include_children)


# ---------- MCP Tools: Synced Items ----------

@mcp.tool()
async def jama_get_synced_items(ctx: Context, item_id: int) -> list[dict]:
    """Get cross-project synced items for a Jama item.

    Synced items are copies linked across projects that stay in sync.

    Args:
        item_id: The Jama item ID.

    Returns:
        List of synced item references with target item IDs and sync status.
    """
    assert api_client
    return await api_client.get_synced_items(item_id)


# ---------- MCP Tools: Users ----------

@mcp.tool()
async def jama_get_users(ctx: Context) -> list[dict]:
    """List all users in the Jama workspace.

    Returns:
        List of user objects with id, username, firstName, lastName, email, active.
    """
    assert api_client
    return await api_client.get_users()


# ---------- MCP Tools: Schema & Metadata ----------

@mcp.tool()
async def jama_get_item_types(ctx: Context) -> list[dict]:
    """List all item types defined in the Jama workspace.

    Item types define the schema for items (e.g., Requirement, Test Case,
    Defect, Risk). Each type has specific fields and workflows.

    Returns:
        List of item type objects with id, display, typeKey, and field definitions.
    """
    assert api_client
    return await api_client.get_item_types()


@mcp.tool()
async def jama_get_pick_lists(ctx: Context) -> list[dict]:
    """List all pick lists defined in the Jama workspace.

    Pick lists define the allowed values for dropdown/select fields
    (e.g., Priority: Low/Medium/High, Status: Draft/Approved).

    Returns:
        List of pick list objects with id, name, description.
    """
    assert api_client
    return await api_client.get_pick_lists()


@mcp.tool()
async def jama_get_pick_list_options(ctx: Context, pick_list_id: int) -> list[dict]:
    """Get the options (allowed values) for a specific pick list.

    Args:
        pick_list_id: The pick list ID (from jama_get_pick_lists).

    Returns:
        List of option objects with id, name, value, description, active, default.
    """
    assert api_client
    return await api_client.get_pick_list_options(pick_list_id)


# ---------- MCP Tools: User Groups ----------

@mcp.tool()
async def jama_get_user_groups(ctx: Context) -> list[dict]:
    """List all user groups in the Jama workspace.

    User groups are used for permission management and workflow assignments.

    Returns:
        List of user group objects with id, name, description, project.
    """
    assert api_client
    return await api_client.get_user_groups()


# ---------- MCP Tools: Project Activities ----------

@mcp.tool()
async def jama_get_project_activities(ctx: Context, project_id: int) -> list[dict]:
    """Get the recent activity feed for a Jama project.

    Shows recent changes across all items in the project — edits, status
    changes, new items, deleted items, etc.

    Args:
        project_id: The Jama project ID.

    Returns:
        List of activity objects with id, date, action, user, item references.
    """
    assert api_client
    return await api_client.get_activities(project_id)


# ---------- MCP Tools: Review Details ----------

@mcp.tool()
async def jama_get_review_details(ctx: Context, review_id: int) -> dict:
    """Get full details of a Review Center review including comments and progress.

    Fetches the review metadata, all comments, all revisions, and the latest
    revision's progress (approval status per participant).

    Args:
        review_id: The Jama review ID (from jama_get_reviews).

    Returns:
        Dict with 'review' (metadata), 'comments' (list), 'revisions' (list),
        and 'latest_progress' (approval progress for the most recent revision).
    """
    assert api_client
    review = await api_client.get_review(review_id)
    comments = await api_client.get_review_comments(review_id)
    revisions = await api_client.get_review_revisions(review_id)
    latest_progress = {}
    if revisions:
        latest_rev_id = revisions[-1].get("id")
        if latest_rev_id:
            latest_progress = await api_client.get_review_revision_progress(review_id, latest_rev_id)
    return {
        "review": review,
        "comments": comments,
        "revisions": revisions,
        "latest_progress": latest_progress,
    }


# ============================================================
# FastAPI REST API (for Next.js viewer)
# ============================================================

# ---------- PID file helpers ----------

def _pid_file_path() -> Path:
    """Return path to the PID file (~/.jama-mcp-v2/backend.pid)."""
    return Path(os.path.expanduser(CACHE_DIR)) / "backend.pid"


def _write_pid_file() -> None:
    """Write current PID to file. Register cleanup on exit."""
    pid_path = _pid_file_path()
    pid_path.parent.mkdir(parents=True, exist_ok=True)
    pid_path.write_text(str(os.getpid()))
    logger.info("PID file written: %s (pid=%d)", pid_path, os.getpid())
    atexit.register(_remove_pid_file)


def _remove_pid_file() -> None:
    """Remove PID file on clean shutdown."""
    try:
        pid_path = _pid_file_path()
        if pid_path.exists():
            pid_path.unlink()
            logger.info("PID file removed.")
    except Exception:
        pass


def _is_port_healthy(port: int, timeout: float = 3.0) -> bool:
    """Check if the backend on the given port responds to /api/health within timeout."""
    import urllib.request
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/health")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


def _is_port_listening(port: int) -> bool:
    """Check if anything is listening on the port (even if not responding)."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _kill_pid(pid: int) -> None:
    """Kill a process by PID. Best-effort, no error on failure."""
    try:
        if sys.platform == "win32":
            os.kill(pid, signal.SIGTERM)
        else:
            os.kill(pid, signal.SIGTERM)
        import time
        time.sleep(2)
        # Force kill if still alive
        try:
            os.kill(pid, signal.SIGKILL if sys.platform != "win32" else signal.SIGTERM)
        except (OSError, ProcessLookupError):
            pass
    except (OSError, ProcessLookupError):
        pass


def _is_process_alive(pid: int) -> bool:
    """Check if a process is still running."""
    if sys.platform == "win32":
        import ctypes
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if handle:
            kernel32.CloseHandle(handle)
            return True
        return False
    else:
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False


def _check_existing_backend(port: int) -> bool:
    """Check if a healthy backend is already running. If so, exit gracefully.

    Returns True if caller should exit (healthy backend exists).
    Returns False if caller should proceed to start.
    Kills zombie backends (listening but not healthy).
    """
    pid_path = _pid_file_path()

    # 1. Check if port is healthy → exit gracefully
    if _is_port_healthy(port):
        old_pid = "unknown"
        if pid_path.exists():
            try:
                old_pid = pid_path.read_text().strip()
            except OSError:
                pass
        print(f"\n  Jama backend already running and healthy on port {port} (PID {old_pid}).")
        print("  No action needed — exiting.\n")
        logger.info("Backend already healthy on port %d (PID %s), exiting.", port, old_pid)
        return True

    # 2. Port is listening but not healthy → zombie, kill it
    if _is_port_listening(port):
        logger.warning("Port %d is listening but not responding — killing zombie process.", port)
        print(f"\n  WARNING: Port {port} is occupied by a zombie process (not responding).")
        # Try to find PID from PID file or netstat
        old_pid = None
        if pid_path.exists():
            try:
                old_pid = int(pid_path.read_text().strip())
            except (ValueError, OSError):
                pass
        if old_pid and _is_process_alive(old_pid):
            logger.info("Killing zombie PID %d...", old_pid)
            print(f"  Killing PID {old_pid}...")
            _kill_pid(old_pid)
        else:
            # PID file doesn't match; try to find via port
            logger.warning("PID file missing or stale; cannot auto-kill zombie on port %d.", port)
            print(f"  Could not identify zombie PID. Manually kill the process on port {port}.")
            print(f"    Windows: netstat -ano | findstr :{port}")
            print(f"    Then:    taskkill /F /PID <pid>\n")
            return True  # Can't proceed, port is blocked

        # Wait for port to free up
        import time
        for _ in range(5):
            if not _is_port_listening(port):
                break
            time.sleep(1)

        if _is_port_listening(port):
            print(f"  ERROR: Port {port} still occupied after kill. Exiting.\n")
            return True

        print("  Zombie killed. Starting fresh backend.\n")
        pid_path.unlink(missing_ok=True)
        return False

    # 3. Port is free, but PID file may be stale → clean up
    if pid_path.exists():
        try:
            old_pid = int(pid_path.read_text().strip())
            if _is_process_alive(old_pid):
                logger.warning("PID %d alive but port %d not listening — killing orphan.", old_pid, port)
                _kill_pid(old_pid)
            pid_path.unlink(missing_ok=True)
            logger.info("Cleaned up stale PID file.")
        except (ValueError, OSError):
            pid_path.unlink(missing_ok=True)

    return False


def _check_stale_pid() -> bool:
    """Legacy wrapper — delegates to _check_existing_backend."""
    return _check_existing_backend(REST_PORT)


# ---------- Log rotation (for service mode) ----------

def _setup_service_logging() -> None:
    """Add rotating file handler for service mode logs."""
    log_dir = Path(os.path.expanduser(CACHE_DIR)) / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "service.log"

    handler = logging.handlers.RotatingFileHandler(
        log_file, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(name)s] %(levelname)s %(message)s"
    ))
    logging.getLogger().addHandler(handler)
    logger.info("Service log file: %s", log_file)


@asynccontextmanager
async def fastapi_lifespan(app: FastAPI):
    """FastAPI lifespan — init MCP + editor services, PID file."""
    # Write PID file
    _write_pid_file()

    try:
        if not services.is_mcp_initialized:
            await _init_services()
    except ValueError as exc:
        logger.warning("REST API starting without Jama backend: %s", exc)
        logger.warning("Set JAMA_CLIENT_ID and JAMA_CLIENT_SECRET to enable data access")

    # Initialize editor services (drafts, schema, image proxy)
    try:
        if services.is_mcp_initialized and not services.is_editor_initialized:
            from jama_editor.editor_server import _init_editor_services
            await _init_editor_services()
    except Exception as exc:
        logger.warning("Editor services unavailable: %s", exc)

    yield
    _remove_pid_file()
    await _shutdown_services()


rest_app = FastAPI(
    title="Jama Unified Backend",
    version="0.5.0",
    lifespan=fastapi_lifespan,
)
rest_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount settings API router
from .settings_api import settings_router
rest_app.include_router(settings_router)

# Mount new modular API routers (Phase 4 split)
from .api.db_mgmt import router as db_mgmt_router
from .api.cache_server_routes import router as cache_server_router
rest_app.include_router(db_mgmt_router)
rest_app.include_router(cache_server_router)

# Mount editor sub-app at /editor/
try:
    from jama_editor.editor_server import editor_app
    rest_app.mount("/editor", editor_app)
    logger.info("Editor routes mounted at /editor/")
except ImportError:
    logger.info("jama_editor not available — editor routes disabled")

# Mount pre-built static viewer at /viewer (if available)
_viewer_dir = Path(__file__).resolve().parent / "viewer_static"
if _viewer_dir.is_dir():
    from starlette.staticfiles import StaticFiles
    rest_app.mount("/viewer", StaticFiles(directory=str(_viewer_dir), html=True), name="viewer")
    logger.info("Static viewer mounted at /viewer from %s", _viewer_dir)
else:
    logger.info("No pre-built viewer found at %s — /viewer not available", _viewer_dir)


# ---------- REST: Health ----------

@rest_app.get("/api/health")
async def api_health():
    """Unified health endpoint for the backend."""
    from .credential_store import credential_store
    return {
        "status": "ok",
        "service": "jama-unified-backend",
        "version": "0.5.0",
        "port": REST_PORT,
        "jama_url": JAMA_URL,
        "mcp_initialized": services.is_mcp_initialized,
        "editor_initialized": services.is_editor_initialized,
        "uptime_seconds": round(services.uptime_seconds, 1),
        "cache_db": services.cache.db_path if services.cache else None,
        "credentials_configured": credential_store.is_configured or bool(
            os.environ.get("JAMA_CLIENT_ID") and os.environ.get("JAMA_CLIENT_SECRET")
        ),
    }


# ---------- REST: Projects ----------

@rest_app.get("/api/projects")
async def api_projects():
    assert cache and api_client
    cached = await cache.get_projects()
    if cached:
        logger.debug("Returning %d cached projects", len(cached))
        return cached
    logger.info("No cached projects, fetching from Jama API...")
    projects = await api_client.get_projects()
    logger.info("Fetched %d projects from API, caching...", len(projects))
    for p in projects:
        await cache.upsert_project(p)
    result = await cache.get_projects()
    logger.info("Returning %d projects after cache", len(result))
    return result


@rest_app.get("/api/projects/{project_id}")
async def api_project(project_id: int):
    assert cache
    p = await cache.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found in cache")
    return p


# ---------- REST: Items ----------

@rest_app.get("/api/projects/{project_id}/items")
async def api_items(project_id: int):
    assert cache
    return await cache.get_items_by_project(project_id)


@rest_app.get("/api/items/resolve")
async def api_resolve_item(key: str = Query(..., description="Document key (SET-43) or numeric Jama item ID")):
    """Resolve a document key or item ID to a full item.

    Accepts: SET-43, IQ_BATT_R5-SET-43, CMP-12, or numeric ID 5624955.
    Short keys (SET-43) are matched via suffix (%-SET-43).
    """
    assert cache
    k = key.strip()

    # Try exact document_key first (e.g. IQ_BATT_R5-SET-43)
    item = await cache.get_item_by_document_key(k)
    if item:
        return item

    # Try suffix match for short keys (SET-43 → %-SET-43)
    if not item and "-" in k and not k[0].isdigit():
        assert cache._db
        rows = await cache._db.execute_fetchall(
            "SELECT * FROM items WHERE document_key LIKE ? LIMIT 1",
            (f"%-{k}",),
        )
        if rows:
            item = dict(rows[0])
            if "fields_json" in item:
                import json as _json
                try:
                    item["fields"] = _json.loads(item["fields_json"])
                except Exception:
                    pass
            return item

    # Try as numeric item ID
    try:
        item = await cache.get_item(int(k))
    except (ValueError, TypeError):
        item = None
    if not item:
        raise HTTPException(404, f"Item not found for key '{key}'")
    return item


@rest_app.get("/api/items/{item_id}")
async def api_item(item_id: int, live: bool = Query(False)):
    assert cache
    if live and api_client:
        try:
            raw = await api_client.get_item(item_id)
            await cache.upsert_item(raw)
            # Evict LRU so get_item reads the normalized row from SQLite
            cache._item_lru.pop(item_id, None)
            item = await cache.get_item(item_id)
            if item:
                return item
        except Exception:
            pass  # Fall back to cache
    item = await cache.get_item(item_id)
    if not item:
        raise HTTPException(404, "Item not found in cache")
    return item


@rest_app.get("/api/items/{item_id}/children")
async def api_item_children(item_id: int, live: bool = Query(False)):
    assert cache
    if live and api_client:
        try:
            children = await api_client.get_item_children(item_id)
            for child in children:
                await cache.upsert_item(child)
        except Exception:
            pass  # Fall back to cache
    return await cache.get_item_children(item_id)


@rest_app.get("/api/items/{item_id}/ancestors")
async def api_item_ancestors(item_id: int, project_id: int = Query(...)):
    assert cache
    items = await cache.get_items_by_project(project_id)
    return get_ancestors(items, item_id)


# ---------- REST: Tree ----------

@rest_app.get("/api/projects/{project_id}/tree")
async def api_tree(project_id: int, root_id: int | None = None):
    assert cache
    items = await cache.get_items_by_project(project_id)
    tree = build_tree(items, root_id)
    return [n.model_dump() for n in tree]


# ---------- REST: Versions ----------

@rest_app.get("/api/items/{item_id}/versions")
async def api_item_versions(item_id: int):
    assert cache and api_client
    cached = await cache.get_item_version_list(item_id)
    if cached:
        return cached
    versions = await api_client.get_item_versions(item_id)
    for v in versions:
        vd = {
            "item_id": item_id,
            "version_num": v.get("versionNumber", v.get("version", 0)),
            "fields_json": json.dumps(v.get("fields", {})),
            "description_html": v.get("fields", {}).get("description", ""),
            "modified_by": v.get("userName", v.get("modifiedBy")),
            "modified_date": v.get("modifiedDate"),
            "created_date": v.get("createdDate"),
            "type": v.get("type", ""),
            "version_comment": v.get("changeDetails", v.get("versionComment", "")),
        }
        await cache.upsert_item_version(vd)
    return await cache.get_item_version_list(item_id)


@rest_app.get("/api/items/{item_id}/versions/{version_num}")
async def api_item_at_version(item_id: int, version_num: int):
    assert cache and api_client
    cached = await cache.get_item_version(item_id, version_num)
    if cached:
        return cached
    data = await api_client.get_item_at_version(item_id, version_num)
    vd = {
        "item_id": item_id,
        "version_num": version_num,
        "fields_json": json.dumps(data.get("fields", {})),
        "description_html": data.get("fields", {}).get("description", ""),
        "modified_by": data.get("modifiedBy"),
        "modified_date": data.get("modifiedDate"),
        "created_date": data.get("createdDate"),
        "type": data.get("type", ""),
        "version_comment": data.get("versionComment", ""),
    }
    await cache.upsert_item_version(vd)
    return vd


# ---------- REST: Relationships ----------

@rest_app.get("/api/projects/{project_id}/relationships")
async def api_relationships(project_id: int):
    assert cache
    return await cache.get_relationships(project_id)


async def _resolve_relationships(rels: list[dict], direction: str) -> list[dict]:
    """Resolve relationship list into items the frontend can display.

    Each relationship has fromItem / toItem IDs.  For 'upstream' we want
    the fromItem details; for 'downstream' we want the toItem details.
    """
    assert cache
    results = []
    for r in rels:
        target_id = r.get("fromItem") if direction == "upstream" else r.get("toItem")
        if not target_id:
            continue
        # Try local cache first, then fall back to live API
        item = await cache.get_item(target_id)
        if item:
            results.append({
                "id": item["id"],
                "documentKey": item.get("document_key", ""),
                "name": item.get("name", ""),
                "project": item.get("project_id"),
                "relationshipType": r.get("relationshipType"),
                "suspect": r.get("suspect", False),
            })
        elif api_client:
            try:
                live = await api_client.get_item(target_id)
                fields = live.get("fields", {})
                results.append({
                    "id": live.get("id", target_id),
                    "documentKey": live.get("documentKey", fields.get("documentKey", "")),
                    "name": fields.get("name", ""),
                    "project": live.get("project"),
                    "relationshipType": r.get("relationshipType"),
                    "suspect": r.get("suspect", False),
                })
            except Exception:
                results.append({"id": target_id, "documentKey": "", "name": f"Item {target_id}", "relationshipType": r.get("relationshipType"), "suspect": r.get("suspect", False)})
    return results


@rest_app.get("/api/items/{item_id}/upstream")
async def api_upstream(item_id: int):
    assert api_client
    rels = await api_client.get_item_upstream_relationships(item_id)
    return await _resolve_relationships(rels, "upstream")


@rest_app.get("/api/items/{item_id}/downstream")
async def api_downstream(item_id: int):
    assert api_client
    rels = await api_client.get_item_downstream_relationships(item_id)
    return await _resolve_relationships(rels, "downstream")


# ---------- REST: Attachments ----------

@rest_app.get("/api/items/{item_id}/attachments")
async def api_attachments(item_id: int):
    assert cache
    return await cache.get_item_attachments(item_id)


@rest_app.get("/api/attachments/{attachment_id}/base64")
async def api_attachment_base64(attachment_id: int):
    assert attachment_mgr
    return await attachment_mgr.get_attachment_as_base64(attachment_id)


def _looks_like_image(content: bytes) -> bool:
    """Check if content starts with known image magic bytes."""
    return (
        content[:8] == b'\x89PNG\r\n\x1a\n'  # PNG
        or content[:2] == b'\xff\xd8'          # JPEG
        or content[:4] == b'GIF8'              # GIF
        or content[:4] == b'RIFF'              # WebP
        or content[:4] == b'<svg'              # SVG
        or content[:2] == b'BM'                # BMP
    )


@rest_app.get("/api/proxy/jama-image")
async def api_proxy_jama_image(url: str = Query(...)):
    """Serve a Jama image from local cache, or redirect to the original URL.

    Flow:
    1. If cached locally at ~/.jama-mcp-v2/attachments/{id}/, serve from disk.
    2. Try downloading via REST API (/attachments, /files endpoints).
    3. If all API methods fail (SAML-only images), redirect to the original
       Jama URL — the browser's active Jama session will handle auth.
    """
    import re as _re
    from pathlib import Path
    from fastapi.responses import FileResponse, JSONResponse

    m = _re.search(r'/(?:attachment|attachments)/(\d+)', url)
    if not m:
        return JSONResponse(status_code=400, content={"error": "Could not extract attachment ID from URL"})

    att_id = int(m.group(1))
    file_name = url.rstrip("/").rsplit("/", 1)[-1] if "/" in url else f"attachment_{att_id}"

    # 1. Check local cache
    cache_dir = Path(os.path.expanduser(CACHE_DIR)) / "attachments" / str(att_id)
    cached_files = list(cache_dir.glob("*")) if cache_dir.is_dir() else []
    if cached_files:
        logger.debug("Serving cached image %d from %s", att_id, cached_files[0])
        return FileResponse(
            cached_files[0],
            headers={"Cache-Control": "public, max-age=604800"},
        )

    # 2. Try REST API download (works for /rest/v1/attachments/{id}/file)
    if api_client:
        for method_name, method in [
            ("attachments", api_client.download_attachment),
            ("files", api_client.download_file),
        ]:
            try:
                content = await method(att_id)
                if len(content) > 100 and _looks_like_image(content):  # real image, not error page
                    cache_dir.mkdir(parents=True, exist_ok=True)
                    local_path = cache_dir / file_name
                    local_path.write_bytes(content)
                    logger.info("Cached image %d via /%s -> %s (%d bytes)", att_id, method_name, local_path, len(content))
                    return FileResponse(local_path, headers={"Cache-Control": "public, max-age=604800"})
            except Exception:
                pass

    # 3. Not cached and REST API can't fetch — return placeholder SVG
    original_url = url if url.startswith("http") else f"https://enphase.jamacloud.com{url}"
    logger.info("Image %d not in cache and not downloadable via API: %s", att_id, original_url)
    placeholder_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80" viewBox="0 0 400 80">
      <rect width="400" height="80" rx="8" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1"/>
      <text x="200" y="32" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#6b7280">Image not cached (SAML-protected)</text>
      <text x="200" y="52" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#9ca3af">ID: {att_id} — Use Import Images to cache</text>
    </svg>'''
    return Response(
        content=placeholder_svg.encode(),
        media_type="image/svg+xml",
        headers={"Cache-Control": "no-cache"},
    )


@rest_app.post("/api/proxy/jama-image/cache")
async def api_cache_jama_image(request: Request, url: str = Query(...)):
    """Cache an image that was fetched by the browser.

    The frontend POSTs the raw image bytes after loading from Jama via
    the browser's SAML session. Saves locally so future GETs serve from disk.
    """
    import re as _re
    from pathlib import Path
    from fastapi.responses import JSONResponse

    m = _re.search(r'/(?:attachment|attachments)/(\d+)', url)
    if not m:
        return JSONResponse(status_code=400, content={"error": "Could not extract attachment ID"})

    att_id = int(m.group(1))
    file_name = url.rstrip("/").rsplit("/", 1)[-1] if "/" in url else f"attachment_{att_id}"

    body = await request.body()
    if not body or len(body) < 100:
        return JSONResponse(status_code=400, content={"error": "No image data or too small"})

    cache_dir = Path(os.path.expanduser(CACHE_DIR)) / "attachments" / str(att_id)
    cache_dir.mkdir(parents=True, exist_ok=True)
    local_path = cache_dir / file_name
    local_path.write_bytes(body)
    logger.info("Browser-cached image %d -> %s (%d bytes)", att_id, local_path, len(body))
    return {"status": "cached", "attachment_id": att_id, "size": len(body), "path": str(local_path)}


@rest_app.get("/api/proxy/jama-image/uncached")
async def api_list_uncached_images():
    """Return a list of all embedded image URLs in cached items that aren't locally cached."""
    from pathlib import Path
    assert cache

    # Scan all items for embedded image URLs
    uncached = []
    pattern = re.compile(
        r'(?:https?://[^"\'\s]*jamacloud\.com)?/(?:attachment|rest/v1/attachments)/(\d+)/([^"\'\s]*)'
    )
    rows = await cache._db.execute("SELECT id, description FROM items WHERE description IS NOT NULL")
    async for row in rows:
        item_id, desc = row
        if not desc:
            continue
        for m in pattern.finditer(desc):
            att_id = int(m.group(1))
            file_name = m.group(2) or f"attachment_{att_id}"
            cache_dir = Path(os.path.expanduser(CACHE_DIR)) / "attachments" / str(att_id)
            cached_files = list(cache_dir.glob("*")) if cache_dir.exists() else []
            if not cached_files:
                original_url = m.group(0)
                if not original_url.startswith("http"):
                    original_url = f"https://enphase.jamacloud.com{original_url}"
                uncached.append({
                    "attachment_id": att_id,
                    "file_name": file_name,
                    "url": original_url,
                    "item_id": item_id,
                })
    return {"uncached": uncached, "count": len(uncached)}


# ---------- REST: Search ----------

@rest_app.get("/api/search")
async def api_search(q: str = Query(...), project_id: int | None = None, limit: int = 50):
    assert search_engine
    # Use unified search to cover items + test runs + plans + cycles
    results = await search_engine.unified_search(q, project_id=project_id, limit=limit)
    return [r.model_dump(mode="json") for r in results]


@rest_app.get("/api/search/deep")
async def api_deep_search(
    q: str = Query(...),
    project_id: int | None = None,
    limit: int = 20,
    include_relations: bool = True,
    max_relation_depth: int = 1,
):
    """Holistic search with upstream/downstream relationship context.
    Covers items, test runs, test plans, and test cycles."""
    assert search_engine
    results = await search_engine.unified_deep_search(
        q,
        project_id=project_id,
        limit=limit,
    )
    return [r.model_dump(mode="json") for r in results]


# ---------- REST: Test Management ----------

@rest_app.get("/api/projects/{project_id}/testplans")
async def api_test_plans(project_id: int, live: bool = Query(False)):
    assert test_manager
    return await test_manager.list_test_plans(project_id, use_cache=not live)


@rest_app.get("/api/testplans/{plan_id}/cycles")
async def api_test_cycles(plan_id: int, live: bool = Query(False)):
    assert test_manager
    return await test_manager.list_test_cycles(plan_id, use_cache=not live)


@rest_app.get("/api/testcycles/{cycle_id}/runs")
async def api_test_runs(cycle_id: int, live: bool = Query(False)):
    assert test_manager
    return await test_manager.list_test_runs(cycle_id, use_cache=not live)


@rest_app.get("/api/testcycles/{cycle_id}/summary")
async def api_test_summary(cycle_id: int, live: bool = Query(False)):
    assert test_manager
    if live:
        # Force-refresh runs first so summary reflects latest
        await test_manager.list_test_runs(cycle_id, use_cache=False)
    s = await test_manager.get_test_summary(cycle_id)
    return s.model_dump()


@rest_app.get("/api/testplans/{plan_id}/summary")
async def api_plan_summary(plan_id: int, live: bool = Query(False)):
    assert test_manager
    if live:
        # Force-refresh cycles and their runs so summary is fresh
        cycles = await test_manager.list_test_cycles(plan_id, use_cache=False)
        for c in cycles:
            await test_manager.list_test_runs(c["id"], use_cache=False)
    return await test_manager.get_plan_summary(plan_id)


@rest_app.put("/api/testruns/{run_id}")
async def api_update_test_run(run_id: int, body: dict):
    assert test_manager
    status = body.get("status")
    results = body.get("actual_results")
    return await test_manager.update_test_run_status(run_id, status, results)


@rest_app.post("/api/testplans/{plan_id}/refresh")
async def api_refresh_test_plan(plan_id: int):
    """Force-refresh a single test plan in the cache from Jama API."""
    assert api_client and cache
    fresh = await api_client.get_test_plan(plan_id)
    project_id = fresh.get("project", {}).get("id") if isinstance(fresh.get("project"), dict) else (fresh.get("project") or 0)
    await cache.upsert_test_plan(fresh, project_id)
    return {"status": "refreshed", "plan_id": plan_id}


@rest_app.post("/api/testcycles/{cycle_id}/refresh")
async def api_refresh_test_cycle(cycle_id: int):
    """Force-refresh a single test cycle in the cache from Jama API."""
    assert api_client and cache
    fresh = await api_client.get_test_cycle(cycle_id)
    plan_id = fresh.get("testPlan", {}).get("id") if isinstance(fresh.get("testPlan"), dict) else (fresh.get("testPlan") or 0)
    await cache.upsert_test_cycle(fresh, plan_id)
    return {"status": "refreshed", "cycle_id": cycle_id}


@rest_app.post("/api/testruns/{run_id}/refresh")
async def api_refresh_test_run(run_id: int):
    """Force-refresh a single test run in the cache from Jama API."""
    assert api_client and cache
    fresh = await api_client.get_test_run(run_id)
    cached = await cache.get_test_run(run_id)
    cycle_id = cached["test_cycle_id"] if cached else 0
    if not cycle_id:
        tc = fresh.get("testCycle")
        cycle_id = tc.get("id") if isinstance(tc, dict) else (tc or 0)
    if cycle_id:
        await cache.upsert_test_run(fresh, cycle_id)
    return {"status": "refreshed", "run_id": run_id, "cycle_id": cycle_id}


@rest_app.post("/api/items/{item_id}/refresh")
async def api_refresh_item(item_id: int):
    """Force-refresh a single item in the cache from Jama API."""
    assert api_client and cache
    fresh = await api_client.get_item(item_id)
    await cache.upsert_item(fresh)
    return {"status": "refreshed", "item_id": item_id}


@rest_app.post("/api/testplans/{plan_id}/cycles")
async def api_create_test_cycle(plan_id: int, body: dict):
    assert test_manager
    return await test_manager.create_test_cycle(
        plan_id,
        name=body["name"],
        start_date=body["start_date"],
        end_date=body["end_date"],
        test_groups=body.get("test_groups"),
    )


# ---------- REST: Session Cookie ----------

@rest_app.post("/api/session-cookie")
async def api_set_session_cookie(request: Request):
    """Store a Jama browser session cookie for SAML-protected downloads."""
    global _session_cookie
    body = await request.json()
    cookie = body.get("cookie", "").strip()
    if not cookie:
        return Response(status_code=400, content="Missing 'cookie' field")
    # Normalize: accept raw JSESSIONID value or full cookie header
    if "=" not in cookie:
        cookie = f"JSESSIONID={cookie}"
    _session_cookie = cookie
    logger.info("Session cookie stored (%d chars)", len(cookie))
    return {"status": "stored", "length": len(cookie)}


@rest_app.get("/api/session-cookie")
async def api_get_session_cookie():
    """Check if a session cookie is stored."""
    return {"has_cookie": bool(_session_cookie), "length": len(_session_cookie)}


@rest_app.post("/api/images/bulk-import")
async def api_bulk_import_images():
    """Download all uncached embedded images using the stored session cookie."""
    import httpx
    from pathlib import Path
    from fastapi.responses import JSONResponse

    if not _session_cookie:
        return JSONResponse(status_code=400, content={"error": "No session cookie stored. POST /api/session-cookie first."})
    assert cache

    # Get uncached list
    pattern = re.compile(
        r'(?:https?://[^"\'\s]*jamacloud\.com)?/(?:attachment|rest/v1/attachments)/(\d+)/([^"\'\s]*)'
    )
    rows = await cache._db.execute("SELECT id, description FROM items WHERE description IS NOT NULL")
    uncached: list[tuple[int, str, str]] = []  # (att_id, file_name, url)
    seen_ids: set[int] = set()
    async for row in rows:
        item_id, desc = row
        if not desc:
            continue
        for m in pattern.finditer(desc):
            att_id = int(m.group(1))
            if att_id in seen_ids:
                continue
            file_name = m.group(2) or f"attachment_{att_id}"
            cache_dir = Path(os.path.expanduser(CACHE_DIR)) / "attachments" / str(att_id)
            if cache_dir.exists() and list(cache_dir.glob("*")):
                continue
            original_url = m.group(0)
            if not original_url.startswith("http"):
                original_url = f"https://enphase.jamacloud.com{original_url}"
            uncached.append((att_id, file_name, original_url))
            seen_ids.add(att_id)

    if not uncached:
        return {"status": "done", "downloaded": 0, "failed": 0, "message": "All images already cached"}

    logger.info("Bulk importing %d uncached images with session cookie", len(uncached))
    ok = 0
    fail = 0
    async with httpx.AsyncClient() as http:
        sem = asyncio.Semaphore(5)
        async def dl(att_id: int, file_name: str, url: str):
            nonlocal ok, fail
            async with sem:
                try:
                    r = await http.get(
                        url,
                        headers={
                            "Cookie": _session_cookie,
                            "Accept": "image/*, */*",
                            "User-Agent": "jama-mcp-v2/0.2.0",
                        },
                        follow_redirects=True,
                        timeout=30,
                    )
                    ct = r.headers.get("content-type", "")
                    if r.status_code == 200 and len(r.content) > 100 and ("image" in ct or _looks_like_image(r.content)):
                        d = Path(os.path.expanduser(CACHE_DIR)) / "attachments" / str(att_id)
                        d.mkdir(parents=True, exist_ok=True)
                        (d / file_name).write_bytes(r.content)
                        ok += 1
                    else:
                        fail += 1
                except Exception:
                    fail += 1

        await asyncio.gather(*(dl(a, f, u) for a, f, u in uncached))

    msg = f"Downloaded {ok}, failed {fail} out of {len(uncached)}"
    logger.info("Bulk import: %s", msg)
    return {"status": "done", "downloaded": ok, "failed": fail, "total": len(uncached), "message": msg}


# ---------- REST: Sync ----------

@rest_app.post("/api/sync/{project_id}")
async def api_sync(project_id: int, incremental: bool = False):
    assert sync_engine
    cb = progress_bus.make_callback()
    if incremental:
        asyncio.create_task(sync_engine.incremental_sync(project_id, on_progress=cb))
    else:
        asyncio.create_task(sync_engine.sync_project(project_id, on_progress=cb))
    return {"status": "started", "project_id": project_id}


@rest_app.get("/api/sync/progress")
async def api_sync_progress():
    """SSE endpoint for real-time sync progress."""
    return StreamingResponse(
        progress_bus.subscribe(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@rest_app.get("/api/sync/{project_id}/last")
async def api_last_sync(project_id: int):
    assert cache
    return await cache.get_last_sync(project_id)


# ---------- REST: Write-back ----------

@rest_app.put("/api/items/{item_id}")
async def api_update_item(item_id: int, body: dict):
    assert writer
    fields = body.get("fields", body)
    return await writer.update_item_fields(item_id, fields)


@rest_app.post("/api/items")
async def api_create_item(body: dict):
    assert writer
    return await writer.create_item(
        project_id=body["project_id"],
        item_type_id=body["item_type_id"],
        parent_id=body["parent_id"],
        fields=body.get("fields", {}),
    )


@rest_app.delete("/api/items/{item_id}")
async def api_delete_item(item_id: int):
    assert writer
    await writer.delete_item(item_id)
    return {"status": "deleted", "item_id": item_id}


@rest_app.post("/api/items/{item_id}/comments")
async def api_add_comment(item_id: int, body: dict):
    if not writer:
        raise HTTPException(503, "Writer not initialized")
    text = body.get("text", body.get("body", ""))
    if not text:
        raise HTTPException(400, "Comment text is required")
    try:
        return await writer.add_comment(item_id, text)
    except Exception as e:
        raise HTTPException(502, f"Failed to add comment: {e}")


@rest_app.post("/api/relationships")
async def api_create_relationship(body: dict):
    assert writer
    return await writer.create_relationship(
        from_item=body["from_item"],
        to_item=body["to_item"],
        relationship_type_id=body.get("relationship_type_id"),
    )


@rest_app.delete("/api/relationships/{relationship_id}")
async def api_delete_relationship(relationship_id: int):
    assert writer
    await writer.delete_relationship(relationship_id)
    return {"status": "deleted", "relationship_id": relationship_id}


@rest_app.get("/api/relationshiptypes")
async def api_relationship_types():
    assert api_client
    return await api_client.get_relationship_types()


# ---------- REST: Export ----------

@rest_app.get("/api/items/{item_id}/export")
async def api_export_item(item_id: int, format: str = "md"):
    assert exporter
    fmt = ExportFormat(format)
    content = await exporter.export_item(item_id, fmt)
    return {"content": content, "format": format}


@rest_app.get("/api/projects/{project_id}/export")
async def api_export_tree(project_id: int, format: str = "md", root_id: int | None = None):
    assert exporter
    fmt = ExportFormat(format)
    content = await exporter.export_tree(project_id, root_id, fmt)
    return {"content": content, "format": format}


# ---------- REST: Stats ----------

@rest_app.get("/api/stats")
async def api_stats():
    assert cache
    return await cache.get_stats()


# ---------- REST: Workflow Transitions ----------

@rest_app.get("/api/items/{item_id}/workflowtransitions")
async def api_workflow_options(item_id: int):
    assert api_client
    return await api_client.get_workflow_transition_options(item_id)


@rest_app.post("/api/items/{item_id}/workflowtransitions")
async def api_workflow_execute(item_id: int, body: dict):
    assert api_client and cache
    result = await api_client.execute_workflow_transition(
        item_id, body["transitionId"], body.get("comment", "")
    )
    # Refresh cache after transition changes item status/workflow state
    try:
        fresh = await api_client.get_item(item_id)
        await cache.upsert_item(fresh)
    except Exception as e:
        logger.warning("Cache refresh after transition failed for item %d: %s", item_id, e)
    return result


# ---------- REST: Item Sub-endpoints ----------

@rest_app.get("/api/items/{item_id}/activities")
async def api_item_activities(item_id: int):
    assert api_client
    return await api_client.get_item_activities(item_id)


@rest_app.get("/api/items/{item_id}/links")
async def api_item_links(item_id: int):
    assert api_client
    return await api_client.get_item_links(item_id)


@rest_app.post("/api/items/{item_id}/links")
async def api_create_item_link(item_id: int, body: dict):
    assert api_client
    return await api_client.create_item_link(item_id, body["url"], body.get("description", ""))


@rest_app.delete("/api/items/{item_id}/links/{link_id}")
async def api_delete_item_link(item_id: int, link_id: int):
    assert api_client
    await api_client.delete_item_link(item_id, link_id)
    return {"status": "deleted"}


@rest_app.get("/api/items/{item_id}/tags")
async def api_item_tags(item_id: int):
    assert api_client
    return await api_client.get_item_tags(item_id)


@rest_app.post("/api/items/{item_id}/tags")
async def api_add_item_tag(item_id: int, body: dict):
    assert api_client
    return await api_client.add_item_tag(item_id, body["tag"])


@rest_app.delete("/api/items/{item_id}/tags/{tag_id}")
async def api_remove_item_tag(item_id: int, tag_id: int):
    assert api_client
    await api_client.remove_item_tag(item_id, tag_id)
    return {"status": "deleted"}


@rest_app.get("/api/items/{item_id}/lock")
async def api_item_lock(item_id: int):
    assert api_client
    return await api_client.get_item_lock(item_id)


@rest_app.put("/api/items/{item_id}/lock")
async def api_set_item_lock(item_id: int, body: dict):
    assert api_client
    return await api_client.set_item_lock(item_id, body["locked"])


@rest_app.get("/api/items/{item_id}/location")
async def api_item_location(item_id: int):
    assert api_client
    return await api_client.get_item_location(item_id)


@rest_app.put("/api/items/{item_id}/location")
async def api_set_item_location(item_id: int, body: dict):
    assert api_client
    parent = body.get("parent", {})
    return await api_client.set_item_location(
        item_id, parent_item=parent.get("item"), parent_project=parent.get("project")
    )


@rest_app.post("/api/items/{item_id}/duplicate")
async def api_duplicate_item(item_id: int, body: dict = {}):
    assert api_client
    return await api_client.duplicate_item(item_id, body.get("includeChildren", False))


@rest_app.get("/api/items/{item_id}/synceditems")
async def api_synced_items(item_id: int):
    assert api_client
    return await api_client.get_synced_items(item_id)


@rest_app.get("/api/items/{item_id}/comments")
async def api_item_comments(item_id: int):
    assert api_client
    return await api_client.get_item_comments(item_id)


# ---------- REST: Attachments ----------

@rest_app.get("/api/attachments/{attachment_id}")
async def api_attachment_meta(attachment_id: int):
    assert api_client
    return await api_client.get_attachment(attachment_id)


@rest_app.get("/api/attachments/{attachment_id}/comments")
async def api_attachment_comments(attachment_id: int):
    assert api_client
    return await api_client.get_attachment_comments(attachment_id)


@rest_app.get("/api/attachments/{attachment_id}/lock")
async def api_attachment_lock(attachment_id: int):
    assert api_client
    return await api_client.get_attachment_lock(attachment_id)


@rest_app.put("/api/attachments/{attachment_id}/lock")
async def api_set_attachment_lock(attachment_id: int, body: dict):
    assert api_client
    return await api_client.set_attachment_lock(attachment_id, body["locked"])


@rest_app.get("/api/attachments/{attachment_id}/versions")
async def api_attachment_versions(attachment_id: int):
    assert api_client
    return await api_client.get_attachment_versions(attachment_id)


# ---------- REST: Activities ----------

@rest_app.get("/api/projects/{project_id}/activities")
async def api_activities(project_id: int):
    assert api_client
    return await api_client.get_activities(project_id)


@rest_app.get("/api/activities/{activity_id}")
async def api_activity(activity_id: int):
    assert api_client
    return await api_client.get_activity(activity_id)


@rest_app.get("/api/activities/{activity_id}/affecteditems")
async def api_activity_affected(activity_id: int):
    assert api_client
    return await api_client.get_activity_affected_items(activity_id)


@rest_app.post("/api/activities/{activity_id}/restore")
async def api_restore_activity(activity_id: int):
    assert api_client
    return await api_client.restore_activity(activity_id)


# ---------- REST: Baselines ----------

@rest_app.get("/api/projects/{project_id}/baselines")
async def api_baselines(project_id: int):
    assert api_client
    return await api_client.get_baselines(project_id)


@rest_app.get("/api/baselines/{baseline_id}")
async def api_baseline(baseline_id: int):
    assert api_client
    return await api_client.get_baseline(baseline_id)


@rest_app.get("/api/baselines/{baseline_id}/versioneditems")
async def api_baseline_items(baseline_id: int):
    assert api_client
    return await api_client.get_baseline_versioned_items(baseline_id)


@rest_app.delete("/api/baselines/{baseline_id}")
async def api_delete_baseline(baseline_id: int):
    assert api_client
    await api_client.delete_baseline(baseline_id)
    return {"status": "deleted"}


# ---------- REST: Releases ----------

@rest_app.get("/api/projects/{project_id}/releases")
async def api_releases(project_id: int):
    assert api_client
    return await api_client.get_releases(project_id)


@rest_app.get("/api/releases/{release_id}")
async def api_release(release_id: int):
    assert api_client
    return await api_client.get_release(release_id)


@rest_app.post("/api/releases")
async def api_create_release(body: dict):
    assert api_client
    return await api_client.create_release(body["project"], body.get("fields", {}))


@rest_app.put("/api/releases/{release_id}")
async def api_update_release(release_id: int, body: dict):
    assert api_client
    return await api_client.update_release(release_id, body.get("fields", body))


# ---------- REST: Tags ----------

@rest_app.get("/api/projects/{project_id}/tags")
async def api_tags(project_id: int):
    assert api_client
    return await api_client.get_tags(project_id)


@rest_app.post("/api/tags")
async def api_create_tag(body: dict):
    assert api_client
    return await api_client.create_tag(body["project"], body["name"])


@rest_app.put("/api/tags/{tag_id}")
async def api_update_tag(tag_id: int, body: dict):
    assert api_client
    return await api_client.update_tag(tag_id, body["name"])


@rest_app.delete("/api/tags/{tag_id}")
async def api_delete_tag(tag_id: int):
    assert api_client
    await api_client.delete_tag(tag_id)
    return {"status": "deleted"}


# ---------- REST: Comments (standalone) ----------

@rest_app.post("/api/comments")
async def api_create_comment(body: dict):
    assert api_client
    return await api_client.create_comment(
        body_text=body.get("text", body.get("body", "")),
        item_id=body.get("item_id"),
        in_reply_to=body.get("in_reply_to"),
    )


@rest_app.get("/api/comments/{comment_id}/replies")
async def api_comment_replies(comment_id: int):
    assert api_client
    return await api_client.get_comment_replies(comment_id)


# ---------- REST: User Groups ----------

@rest_app.get("/api/usergroups")
async def api_user_groups():
    assert api_client
    return await api_client.get_user_groups()


@rest_app.get("/api/usergroups/{group_id}")
async def api_user_group(group_id: int):
    assert api_client
    return await api_client.get_user_group(group_id)


@rest_app.get("/api/usergroups/{group_id}/users")
async def api_user_group_users(group_id: int):
    assert api_client
    return await api_client.get_user_group_users(group_id)


# ---------- REST: Users ----------

@rest_app.get("/api/users")
async def api_users():
    assert api_client
    return await api_client.get_users()


@rest_app.get("/api/users/current")
async def api_current_user():
    assert api_client
    return await api_client.get_current_user()


@rest_app.get("/api/users/{user_id}")
async def api_user(user_id: int):
    assert api_client
    return await api_client.get_user(user_id)


# ---------- REST: Filters ----------

@rest_app.get("/api/projects/{project_id}/filters")
async def api_filters(project_id: int):
    assert api_client
    return await api_client.get_filters(project_id)


@rest_app.get("/api/filters/{filter_id}/results")
async def api_filter_results(filter_id: int, project: int = 0):
    assert api_client
    return await api_client.get_filter_results(filter_id, project)


@rest_app.get("/api/filters/{filter_id}/count")
async def api_filter_count(filter_id: int, project: int = 0):
    assert api_client
    return {"count": await api_client.get_filter_count(filter_id, project)}


# ---------- REST: Review Center (Labs) ----------

@rest_app.get("/api/projects/{project_id}/reviews")
async def api_reviews(project_id: int):
    assert api_client
    return await api_client.get_reviews(project_id)


@rest_app.get("/api/reviews/{review_id}")
async def api_review(review_id: int):
    assert api_client
    return await api_client.get_review(review_id)


@rest_app.get("/api/reviews/{review_id}/comments")
async def api_review_comments(review_id: int):
    assert api_client
    return await api_client.get_review_comments(review_id)


@rest_app.get("/api/reviews/{review_id}/revisions")
async def api_review_revisions(review_id: int):
    assert api_client
    return await api_client.get_review_revisions(review_id)


@rest_app.get("/api/reviews/{review_id}/revisions/{revision_id}/progress")
async def api_review_revision_progress(review_id: int, revision_id: int):
    assert api_client
    return await api_client.get_review_revision_progress(review_id, revision_id)


# ---------- REST: Test Plan Sub-endpoints ----------

@rest_app.put("/api/testplans/{plan_id}")
async def api_update_test_plan(plan_id: int, body: dict):
    assert api_client
    return await api_client.update_test_plan(plan_id, body.get("fields", body))


@rest_app.delete("/api/testplans/{plan_id}")
async def api_delete_test_plan(plan_id: int):
    assert api_client
    await api_client.delete_test_plan(plan_id)
    return {"status": "deleted"}


@rest_app.get("/api/testplans/{plan_id}/attachments")
async def api_test_plan_attachments(plan_id: int):
    assert api_client
    return await api_client.get_test_plan_attachments(plan_id)


@rest_app.get("/api/testplans/{plan_id}/links")
async def api_test_plan_links(plan_id: int):
    assert api_client
    return await api_client.get_test_plan_links(plan_id)


@rest_app.get("/api/testplans/{plan_id}/tags")
async def api_test_plan_tags(plan_id: int):
    assert api_client
    return await api_client.get_test_plan_tags(plan_id)


@rest_app.get("/api/testplans/{plan_id}/versions")
async def api_test_plan_versions(plan_id: int):
    assert api_client
    return await api_client.get_test_plan_versions(plan_id)


# ---------- REST: Test Cycle Sub-endpoints ----------

@rest_app.put("/api/testcycles/{cycle_id}")
async def api_update_test_cycle(cycle_id: int, body: dict):
    assert api_client
    return await api_client.update_test_cycle(cycle_id, body.get("fields", body))


@rest_app.delete("/api/testcycles/{cycle_id}")
async def api_delete_test_cycle(cycle_id: int):
    assert api_client
    await api_client.delete_test_cycle(cycle_id)
    return {"status": "deleted"}


@rest_app.get("/api/testcycles/{cycle_id}/versions")
async def api_test_cycle_versions(cycle_id: int):
    assert api_client
    return await api_client.get_test_cycle_versions(cycle_id)


# ---------- REST: Test Run Sub-endpoints ----------

@rest_app.delete("/api/testruns/{run_id}")
async def api_delete_test_run(run_id: int):
    assert api_client
    await api_client.delete_test_run(run_id)
    return {"status": "deleted"}


@rest_app.get("/api/testruns/{run_id}/attachments")
async def api_test_run_attachments(run_id: int):
    assert api_client
    return await api_client.get_test_run_attachments(run_id)


@rest_app.get("/api/testruns/{run_id}/links")
async def api_test_run_links(run_id: int):
    assert api_client
    return await api_client.get_test_run_links(run_id)


@rest_app.get("/api/testruns/{run_id}/tags")
async def api_test_run_tags(run_id: int):
    assert api_client
    return await api_client.get_test_run_tags(run_id)


@rest_app.get("/api/testruns/{run_id}/versions")
async def api_test_run_versions(run_id: int):
    assert api_client
    return await api_client.get_test_run_versions(run_id)


@rest_app.get("/api/testruns/{run_id}/comments")
async def api_test_run_comments(run_id: int):
    assert api_client
    return await api_client.get_test_run_comments(run_id)


# ---------- REST: Pick Lists & Item Types ----------

@rest_app.get("/api/picklists")
async def api_pick_lists():
    assert api_client
    return await api_client.get_pick_lists()


@rest_app.get("/api/picklists/{pick_list_id}/options")
async def api_pick_list_options(pick_list_id: int):
    assert api_client
    return await api_client.get_pick_list_options(pick_list_id)


@rest_app.get("/api/itemtypes")
async def api_item_types():
    assert api_client
    return await api_client.get_item_types()


@rest_app.get("/api/itemtypes/{type_id}")
async def api_item_type(type_id: int):
    assert api_client
    return await api_client.get_item_type(type_id)


# ---------- REST: Relationship Rulesets ----------

@rest_app.get("/api/relationshiprulesets")
async def api_relationship_rulesets():
    assert api_client
    return await api_client.get_relationship_rulesets()


# ============================================================
# Entry Points
# ============================================================

def main():
    """Entry point for MCP transport. With --daemon, also starts REST API."""
    import argparse
    parser = argparse.ArgumentParser(description="Jama Connect MCP Server")
    parser.add_argument("--daemon", action="store_true",
                        help="Also start REST API server in background (port from JAMA_REST_PORT)")
    parser.add_argument("--port", type=int, default=REST_PORT,
                        help="REST API port when using --daemon (default: 8765)")
    args = parser.parse_args()

    if not CLIENT_ID or not CLIENT_SECRET:
        logger.error("JAMA_CLIENT_ID and JAMA_CLIENT_SECRET must be set.")
        print("\nERROR: JAMA_CLIENT_ID and JAMA_CLIENT_SECRET environment variables are required.", file=sys.stderr)
        sys.exit(1)

    if args.daemon:
        # Check if a healthy backend already exists → exit gracefully
        if _check_existing_backend(args.port):
            sys.exit(0)
        logger.info("Starting Jama Connect (daemon mode): MCP + REST on port %d ...", args.port)
        _setup_service_logging()
        _start_daemon(args.port)
    else:
        logger.info("Starting Jama MCP v2 server (stdio)...")
        mcp.run(transport="stdio")


def _start_daemon(port: int = REST_PORT) -> None:
    """Run MCP stdio server + REST API in the same asyncio event loop."""
    import threading
    import uvicorn

    # Start REST API in a background thread
    config = uvicorn.Config(rest_app, host="127.0.0.1", port=port, log_level="info")
    rest_server = uvicorn.Server(config)

    rest_thread = threading.Thread(target=rest_server.run, daemon=True, name="jama-rest")
    rest_thread.start()
    logger.info("REST API thread started on port %d", port)

    # Run MCP in the main thread (stdio blocks until client disconnects)
    try:
        mcp.run(transport="stdio")
    finally:
        logger.info("MCP server exited, shutting down REST API...")
        rest_server.should_exit = True
        rest_thread.join(timeout=5)
        logger.info("Daemon shutdown complete")


def run_rest():
    """Entry point for REST API only (used by the viewer app)."""
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="Jama Connect REST API")
    parser.add_argument("--port", type=int, default=REST_PORT, help="REST API port (default: 8765)")
    args = parser.parse_args()
    port = args.port

    # Check if a healthy backend already exists → exit gracefully
    if _check_existing_backend(port):
        sys.exit(0)

    # Setup file-based logging for service mode
    _setup_service_logging()

    logger.info("Starting Jama MCP v2 REST API on port %d (localhost only)...", port)
    uvicorn.run(rest_app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Jama MCP v2 Server")
    parser.add_argument("--rest-only", action="store_true", help="Run REST API only (no MCP)")
    parser.add_argument("--daemon", action="store_true", help="Run MCP + REST API together")
    parser.add_argument("--port", type=int, default=REST_PORT, help="REST API port")
    args = parser.parse_args()

    if args.rest_only:
        REST_PORT = args.port
        run_rest()
    elif args.daemon:
        _check_stale_pid()
        _setup_service_logging()
        _start_daemon(args.port)
    else:
        main()
