"""Pydantic data models for Jama MCP v2."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ---------- Enums ----------

class TestRunStatus(str, Enum):
    PASSED = "PASSED"
    FAILED = "FAILED"
    BLOCKED = "BLOCKED"
    NOT_RUN = "NOT_RUN"
    INPROGRESS = "INPROGRESS"


class SyncState(str, Enum):
    IDLE = "idle"
    SYNCING = "syncing"
    ERROR = "error"
    DONE = "done"


class ExportFormat(str, Enum):
    MARKDOWN = "md"
    HTML = "html"
    JSON = "json"


# ---------- Core Jama Models ----------

class JamaProject(BaseModel):
    id: int
    project_key: str = ""
    name: str = ""
    description: str = ""
    is_folder: bool = False
    parent_id: int | None = None
    created_date: datetime | None = None
    modified_date: datetime | None = None
    fields: dict[str, Any] = Field(default_factory=dict)


class JamaItemType(BaseModel):
    id: int
    type_key: str = ""
    display: str = ""
    display_plural: str = ""
    category: str = ""
    widget: str = ""
    image: str = ""


class JamaItem(BaseModel):
    id: int
    project_id: int
    item_type: int = 0
    document_key: str = ""
    global_id: str = ""
    name: str = ""
    description: str = ""
    parent_id: int | None = None
    created_date: datetime | None = None
    modified_date: datetime | None = None
    modified_by: int | None = None
    created_by: int | None = None
    lock: dict[str, Any] | None = None
    version: int = 0
    current_version: int = 0
    fields: dict[str, Any] = Field(default_factory=dict)
    resources: dict[str, Any] = Field(default_factory=dict)
    child_item_type: int | None = None
    location: dict[str, Any] = Field(default_factory=dict)


class JamaItemVersion(BaseModel):
    """Snapshot of an item at a specific version number (immutable after creation)."""
    item_id: int
    version_num: int
    fields_json: str = "{}"
    description_html: str = ""
    modified_by: int | None = None
    modified_date: datetime | None = None
    created_date: datetime | None = None
    type: str = ""
    version_comment: str = ""


class JamaRelationship(BaseModel):
    id: int
    project_id: int
    from_item: int
    to_item: int
    relationship_type: int | None = None
    suspect: bool = False


class JamaAttachment(BaseModel):
    id: int
    item_id: int
    file_name: str = ""
    file_size: int = 0
    mime_type: str = ""
    url: str = ""
    local_path: str | None = None


# ---------- Test Management ----------

class JamaTestPlan(BaseModel):
    id: int
    project_id: int
    name: str = ""
    description: str = ""
    status: str = ""
    archived: bool = False
    created_date: datetime | None = None
    modified_date: datetime | None = None
    fields: dict[str, Any] = Field(default_factory=dict)


class JamaTestGroup(BaseModel):
    id: int
    test_plan_id: int
    name: str = ""
    description: str = ""
    sort_order: int = 0


class JamaTestCycle(BaseModel):
    id: int
    test_plan_id: int
    name: str = ""
    description: str = ""
    start_date: datetime | None = None
    end_date: datetime | None = None
    status: str = ""
    created_date: datetime | None = None
    modified_date: datetime | None = None
    fields: dict[str, Any] = Field(default_factory=dict)


class JamaTestRun(BaseModel):
    id: int
    test_cycle_id: int
    test_case_id: int | None = None
    test_case_version_number: int | None = None
    test_group: dict[str, Any] | None = None
    name: str = ""
    status: TestRunStatus = TestRunStatus.NOT_RUN
    assigned_to: int | None = None
    actual_results: str = ""
    execution_date: datetime | None = None
    planned_results: str = ""
    fields: dict[str, Any] = Field(default_factory=dict)


class TestSummary(BaseModel):
    """Aggregated pass/fail/blocked/not_run counts."""
    total: int = 0
    passed: int = 0
    failed: int = 0
    blocked: int = 0
    not_run: int = 0
    in_progress: int = 0

    @property
    def pass_rate(self) -> float:
        executed = self.passed + self.failed
        return (self.passed / executed * 100) if executed > 0 else 0.0


# ---------- Tree / Navigation ----------

class TreeNode(BaseModel):
    id: int
    name: str = ""
    document_key: str = ""
    item_type: int = 0
    item_type_display: str = ""
    parent_id: int | None = None
    has_children: bool = False
    level: int = 0
    section_label: str = ""
    children: list[TreeNode] = Field(default_factory=list)


# ---------- Sync / Progress ----------

class SyncProgress(BaseModel):
    state: SyncState = SyncState.IDLE
    project_id: int | None = None
    project_name: str = ""
    total_items: int = 0
    processed_items: int = 0
    changed_items: int = 0
    new_items: int = 0
    deleted_items: int = 0
    errors: int = 0
    message: str = ""
    started_at: datetime | None = None
    completed_at: datetime | None = None

    @property
    def progress_pct(self) -> float:
        return (self.processed_items / self.total_items * 100) if self.total_items > 0 else 0.0


class VersionInfo(BaseModel):
    """Lightweight version metadata for an item."""
    version_num: int
    modified_by: int | None = None
    modified_date: datetime | None = None
    version_comment: str = ""
    is_current: bool = False


class SyncLogEntry(BaseModel):
    id: int | None = None
    project_id: int
    started_at: datetime
    completed_at: datetime | None = None
    total_items: int = 0
    changed_items: int = 0
    new_items: int = 0
    deleted_items: int = 0
    errors: int = 0
    status: str = "running"
    message: str = ""


# ---------- Search ----------

class SearchResult(BaseModel):
    item_id: int
    project_id: int
    document_key: str = ""
    name: str = ""
    snippet: str = ""
    item_type_display: str = ""
    modified_date: datetime | None = None
    rank: float = 0.0


class UnifiedSearchResult(BaseModel):
    """Search result from the unified FTS index spanning items, test runs, plans, cycles."""
    entity_id: int
    doc_type: str = "item"
    project_id: int = 0
    status: str = ""
    name: str = ""
    snippet: str = ""
    document_key: str = ""
    rank: float = 0.0
    # Additional context populated by deep search
    test_cycle_id: int | None = None
    test_cycle_name: str = ""
    test_plan_id: int | None = None
    test_plan_name: str = ""
    test_case_id: int | None = None
    execution_date: datetime | None = None
    # Item enrichment
    parent: dict[str, Any] | None = None
    children_count: int = 0
    upstream_items: list[dict[str, Any]] = Field(default_factory=list)
    downstream_items: list[dict[str, Any]] = Field(default_factory=list)
    # Test plan enrichment
    cycle_count: int = 0


# ---------- API Settings ----------

class JamaSettings(BaseModel):
    """Configuration for the Jama MCP v2 server."""
    jama_url: str = "https://enphase.jamacloud.com"
    client_id: str = ""
    client_secret: str = ""
    cache_dir: str = "~/.jama-mcp-v2"
    rest_port: int = 8765
    max_concurrent: int = 3
    sync_batch_size: int = 50
    cache_ttl_hours: int = 24
    log_level: str = "INFO"
