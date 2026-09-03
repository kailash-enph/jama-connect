"""FTS5 entry dataclass and builder functions for the unified_fts index.

Each `fts_from_*` function converts a raw Jama API response or a DB row
into an `FtsEntry` that can be upserted into `unified_fts_content`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class FtsEntry:
    """A single row in the unified_fts_content table."""

    entity_id: int
    doc_type: str          # 'item' | 'test_plan' | 'test_cycle' | 'test_run'
    project_id: int
    status: str
    name: str
    description: str
    document_key: str
    extra_text: str        # fields_json for items; actual_results for runs


def fts_from_item(item: dict[str, Any], project_id: int) -> FtsEntry:
    """Build an FtsEntry from a Jama API item response."""
    fields = item.get("fields", {})
    name = fields.get("name", fields.get("title", ""))
    desc = fields.get("description", "")
    return FtsEntry(
        entity_id=item["id"],
        doc_type="item",
        project_id=project_id,
        status="",
        name=name,
        description=desc,
        document_key=item.get("documentKey", ""),
        extra_text=json.dumps(fields),
    )


def fts_from_item_row(row: dict[str, Any]) -> FtsEntry:
    """Build an FtsEntry from a cached DB row (already normalized)."""
    return FtsEntry(
        entity_id=row["id"],
        doc_type="item",
        project_id=row.get("project_id", 0),
        status="",
        name=row.get("name", ""),
        description=row.get("description", ""),
        document_key=row.get("document_key", ""),
        extra_text=row.get("fields_json", "{}"),
    )


def fts_from_test_plan(plan: dict[str, Any], project_id: int) -> FtsEntry:
    """Build an FtsEntry from a Jama test plan API response."""
    fields = plan.get("fields", {})
    name = fields.get("name", plan.get("name", ""))
    desc = fields.get("description", plan.get("description", ""))
    return FtsEntry(
        entity_id=plan["id"],
        doc_type="test_plan",
        project_id=project_id,
        status=plan.get("status", fields.get("status", "")),
        name=name,
        description=desc,
        document_key="",
        extra_text="",
    )


def fts_from_test_cycle(
    cycle: dict[str, Any], project_id: int, plan_id: int
) -> FtsEntry:
    """Build an FtsEntry from a Jama test cycle API response."""
    fields = cycle.get("fields", {})
    name = fields.get("name", cycle.get("name", ""))
    desc = fields.get("description", cycle.get("description", ""))
    return FtsEntry(
        entity_id=cycle["id"],
        doc_type="test_cycle",
        project_id=project_id,
        status=cycle.get("status", ""),
        name=name,
        description=desc,
        document_key="",
        extra_text=f"plan:{plan_id}",
    )


def fts_from_test_run(
    run: dict[str, Any], project_id: int, cycle_id: int
) -> FtsEntry:
    """Build an FtsEntry from a Jama test run API response."""
    fields = run.get("fields", {})
    name = fields.get("name", run.get("name", ""))
    desc = fields.get("description", run.get("actualResults", ""))
    actual = run.get("actualResults", fields.get("actualResults", ""))
    return FtsEntry(
        entity_id=run["id"],
        doc_type="test_run",
        project_id=project_id,
        status=run.get("status", "NOT_RUN"),
        name=name,
        description=desc,
        document_key="",
        extra_text=actual,
    )


UPSERT_FTS_SQL = """
INSERT INTO unified_fts_content(
    entity_id, doc_type, project_id, status,
    name, description, document_key, extra_text
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(entity_id, doc_type) DO UPDATE SET
    project_id=excluded.project_id,
    status=excluded.status,
    name=excluded.name,
    description=excluded.description,
    document_key=excluded.document_key,
    extra_text=excluded.extra_text
"""


def fts_entry_to_row(entry: FtsEntry) -> tuple:
    """Convert an FtsEntry to a tuple suitable for SQL parameter binding."""
    return (
        entry.entity_id,
        entry.doc_type,
        entry.project_id,
        entry.status,
        entry.name,
        entry.description,
        entry.document_key,
        entry.extra_text,
    )
