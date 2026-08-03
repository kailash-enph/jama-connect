"""Full-text search over cached items using SQLite FTS5.

Provides:
  - Fast-path exact lookups (item ID, document_key like SET-43 / CMP-12)
  - FTS5 full-text with smart prefix expansion
  - Holistic deep search with upstream/downstream relationship traversal
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from .cache import JamaCache
from .models import SearchResult, UnifiedSearchResult

logger = logging.getLogger(__name__)

# Patterns for fast-path detection
_DOC_KEY_RE = re.compile(r"^[A-Z]{2,6}-\d+$", re.IGNORECASE)    # SET-43, CMP-12, MKT-1
_FULL_DOC_KEY_RE = re.compile(r"^[A-Za-z0-9_]+-[A-Z]{2,6}-\d+$", re.IGNORECASE)  # IQ_BATT_R5-DVT-7257
_ITEM_ID_RE = re.compile(r"^\d{5,}$")                            # bare numeric item ID


class SearchEngine:
    """Wraps the cache's FTS5 search with result formatting and relationship context."""

    def __init__(self, cache: JamaCache):
        self._cache = cache

    # ------------------------------------------------------------------
    # Standard search (lightweight, for viewer/MCP basic calls)
    # ------------------------------------------------------------------

    async def search(
        self,
        query: str,
        project_id: int | None = None,
        limit: int = 50,
    ) -> list[SearchResult]:
        """Search cached items using FTS5 match syntax.

        Supports standard FTS5 queries:
          - Simple: "battery monitor"
          - Phrase: '"test plan"'
          - Boolean: "battery AND NOT obsolete"
          - Prefix: "batt*"
        Also handles fast-path lookups for document keys (SET-43) and item IDs.
        """
        if not query or not query.strip():
            return []

        q = query.strip()

        # Fast-path: exact document_key match (SET-43, IQ_BATT_R5-DVT-7257, etc.)
        if _DOC_KEY_RE.match(q) or _FULL_DOC_KEY_RE.match(q):
            item = await self._cache.get_item_by_document_key(q.upper())
            if item:
                return [self._row_to_result(item, rank=-100.0)]
            # Fall through to FTS if exact match fails (partial key)

        # Fast-path: bare numeric item ID
        if _ITEM_ID_RE.match(q):
            item = await self._cache.get_item(int(q))
            if item:
                return [self._row_to_result(item, rank=-100.0)]

        # FTS5 search
        sanitized = self._sanitize_query(q)
        raw_results = await self._cache.search(sanitized, project_id=project_id, limit=limit)

        return [self._row_to_result(row, query=q) for row in raw_results]

    # ------------------------------------------------------------------
    # Deep search (holistic: includes relationship context)
    # ------------------------------------------------------------------

    async def deep_search(
        self,
        query: str,
        project_id: int | None = None,
        limit: int = 20,
        include_relations: bool = True,
        max_relation_depth: int = 1,
    ) -> list[dict[str, Any]]:
        """Holistic search returning items with upstream/downstream context.

        For each matched item, also returns:
          - upstream_items: items that trace TO this item (parents in traceability)
          - downstream_items: items that this item traces TO (children in traceability)
          - parent: parent item in tree hierarchy
          - children_count: number of children in tree hierarchy
          - fields: parsed custom fields (from fields_json)

        This gives AI and users the full traceability picture in one call.
        """
        if not query or not query.strip():
            return []

        q = query.strip()
        matched_items: list[dict[str, Any]] = []

        # Fast-path: exact document_key or item ID
        if _DOC_KEY_RE.match(q) or _FULL_DOC_KEY_RE.match(q):
            item = await self._cache.get_item_by_document_key(q.upper())
            if item:
                matched_items = [item]
        elif _ITEM_ID_RE.match(q):
            item = await self._cache.get_item(int(q))
            if item:
                matched_items = [item]

        # FTS fallback
        if not matched_items:
            sanitized = self._sanitize_query(q)
            matched_items = await self._cache.search(sanitized, project_id=project_id, limit=limit)

        # Enrich each result with relationships and context
        enriched: list[dict[str, Any]] = []
        for row in matched_items:
            item_id = row["id"]
            entry: dict[str, Any] = {
                "item_id": item_id,
                "project_id": row.get("project_id", 0),
                "document_key": row.get("document_key", ""),
                "name": row.get("name", ""),
                "description": self._strip_html(row.get("description", "")),
                "item_type": row.get("item_type", 0),
                "version": row.get("version", 0),
                "modified_date": row.get("modified_date"),
                "rank": row.get("rank", 0.0),
            }

            # Parse custom fields
            fields_json = row.get("fields_json", "{}")
            try:
                fields = json.loads(fields_json) if isinstance(fields_json, str) else fields_json
            except (json.JSONDecodeError, TypeError):
                fields = {}
            entry["fields"] = self._summarize_fields(fields)

            # Parent item context
            parent_id = row.get("parent_id")
            if parent_id:
                parent = await self._cache.get_item(parent_id)
                entry["parent"] = {
                    "item_id": parent_id,
                    "document_key": parent.get("document_key", "") if parent else "",
                    "name": parent.get("name", "") if parent else "",
                } if parent else {"item_id": parent_id}
            else:
                entry["parent"] = None

            # Children count
            children = await self._cache.get_item_children(item_id)
            entry["children_count"] = len(children)

            # Relationship traversal
            if include_relations:
                upstream = await self._cache.get_item_upstream_relations(item_id)
                downstream = await self._cache.get_item_downstream_relations(item_id)

                entry["upstream_items"] = [
                    {
                        "item_id": r["from_item"],
                        "document_key": r.get("from_document_key", ""),
                        "name": r.get("from_name", ""),
                        "relationship_type": r.get("relationship_type"),
                        "suspect": r.get("suspect", False),
                    }
                    for r in upstream
                ]
                entry["downstream_items"] = [
                    {
                        "item_id": r["to_item"],
                        "document_key": r.get("to_document_key", ""),
                        "name": r.get("to_name", ""),
                        "relationship_type": r.get("relationship_type"),
                        "suspect": r.get("suspect", False),
                    }
                    for r in downstream
                ]

                # Optionally go one more level deep for linked items
                if max_relation_depth > 1:
                    for up in entry["upstream_items"]:
                        up_up = await self._cache.get_item_upstream_relations(up["item_id"])
                        up["upstream_items"] = [
                            {"item_id": r["from_item"],
                             "document_key": r.get("from_document_key", ""),
                             "name": r.get("from_name", "")}
                            for r in up_up
                        ]
                    for dn in entry["downstream_items"]:
                        dn_dn = await self._cache.get_item_downstream_relations(dn["item_id"])
                        dn["downstream_items"] = [
                            {"item_id": r["to_item"],
                             "document_key": r.get("to_document_key", ""),
                             "name": r.get("to_name", "")}
                            for r in dn_dn
                        ]
            else:
                entry["upstream_items"] = []
                entry["downstream_items"] = []

            enriched.append(entry)

        return enriched

    # ------------------------------------------------------------------
    # Unified search (items + test runs + plans + cycles in one query)
    # ------------------------------------------------------------------

    async def unified_search(
        self,
        query: str,
        project_id: int | None = None,
        doc_types: list[str] | None = None,
        limit: int = 50,
    ) -> list[UnifiedSearchResult]:
        """Search across items, test plans, test cycles, and test runs.

        Returns typed results with doc_type indicating what kind of entity matched.
        Supports fast-path lookups for document keys and item IDs (items only).
        """
        if not query or not query.strip():
            return []

        q = query.strip()
        results: list[UnifiedSearchResult] = []

        # Fast-path: exact document_key (items only)
        if _DOC_KEY_RE.match(q) or _FULL_DOC_KEY_RE.match(q):
            item = await self._cache.get_item_by_document_key(q.upper())
            if item:
                return [UnifiedSearchResult(
                    entity_id=item["id"],
                    doc_type="item",
                    project_id=item.get("project_id", 0),
                    name=item.get("name", ""),
                    snippet=self._make_snippet(item.get("description", ""), q),
                    document_key=item.get("document_key", ""),
                    rank=-100.0,
                )]

        # Fast-path: bare numeric item ID
        if _ITEM_ID_RE.match(q):
            item = await self._cache.get_item(int(q))
            if item:
                return [UnifiedSearchResult(
                    entity_id=item["id"],
                    doc_type="item",
                    project_id=item.get("project_id", 0),
                    name=item.get("name", ""),
                    snippet=self._make_snippet(item.get("description", ""), q),
                    document_key=item.get("document_key", ""),
                    rank=-100.0,
                )]

        # Unified FTS search
        sanitized = self._sanitize_query(q)
        raw = await self._cache.unified_search(
            sanitized, project_id=project_id, doc_types=doc_types, limit=limit,
        )

        for row in raw:
            desc = row.get("description", "")
            results.append(UnifiedSearchResult(
                entity_id=row["entity_id"],
                doc_type=row.get("doc_type", "item"),
                project_id=row.get("project_id", 0),
                status=row.get("status", ""),
                name=row.get("name", ""),
                snippet=self._make_snippet(self._strip_html(desc), q),
                document_key=row.get("document_key", ""),
                rank=row.get("rank", 0.0),
            ))

        return results

    async def unified_deep_search(
        self,
        query: str,
        project_id: int | None = None,
        doc_types: list[str] | None = None,
        limit: int = 20,
    ) -> list[UnifiedSearchResult]:
        """Unified search with enriched context for each result.

        For test_run results, adds test_cycle_name, test_plan_name, test_case_id, execution_date.
        For item results, adds parent context and relationship counts.
        """
        base_results = await self.unified_search(
            query, project_id=project_id, doc_types=doc_types, limit=limit,
        )

        enriched: list[UnifiedSearchResult] = []
        for r in base_results:
            entry = r.model_copy()

            if r.doc_type == "test_run":
                # Enrich with test cycle/plan context
                run = await self._cache.get_test_run(r.entity_id)
                if run:
                    entry.test_case_id = run.get("test_case_id")
                    entry.execution_date = run.get("execution_date")
                    cycle_id = run.get("test_cycle_id")
                    if cycle_id:
                        entry.test_cycle_id = cycle_id
                        # Get cycle info
                        cycles = await self._cache._db.execute_fetchall(
                            "SELECT name, test_plan_id FROM test_cycles WHERE id = ?",
                            (cycle_id,),
                        )
                        if cycles:
                            entry.test_cycle_name = cycles[0]["name"]
                            plan_id = cycles[0]["test_plan_id"]
                            entry.test_plan_id = plan_id
                            plans = await self._cache._db.execute_fetchall(
                                "SELECT name FROM test_plans WHERE id = ?",
                                (plan_id,),
                            )
                            if plans:
                                entry.test_plan_name = plans[0]["name"]

            elif r.doc_type == "item":
                # Enrich with parent context
                item = await self._cache.get_item(r.entity_id)
                if item:
                    parent_id = item.get("parent_id")
                    if parent_id:
                        parent = await self._cache.get_item(parent_id)
                        entry.parent = {
                            "item_id": parent_id,
                            "document_key": parent.get("document_key", "") if parent else "",
                            "name": parent.get("name", "") if parent else "",
                        } if parent else {"item_id": parent_id}
                    children = await self._cache.get_item_children(r.entity_id)
                    entry.children_count = len(children)

            elif r.doc_type == "test_plan":
                # Enrich with cycle count
                cycles = (
                    await self._cache.get_test_cycles_for_plan(r.entity_id)
                    if hasattr(self._cache, "get_test_cycles_for_plan")
                    else await self._cache.get_test_cycles(r.entity_id)
                )
                entry.cycle_count = len(cycles) if cycles else 0

            enriched.append(entry)

        return enriched

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _row_to_result(self, row: dict[str, Any], query: str = "", rank: float | None = None) -> SearchResult:
        name = row.get("name", "")
        desc = row.get("description", "")
        snippet = self._make_snippet(desc, query, max_len=200) if desc else name
        return SearchResult(
            item_id=row["id"],
            project_id=row.get("project_id", 0),
            document_key=row.get("document_key", ""),
            name=name,
            snippet=snippet,
            item_type_display="",
            modified_date=row.get("modified_date"),
            rank=rank if rank is not None else row.get("rank", 0.0),
        )

    def _sanitize_query(self, query: str) -> str:
        """Minimal sanitization for FTS5 queries."""
        q = query.strip()

        # Pass through if it contains FTS5 operators
        if any(op in q.upper() for op in ["AND", "OR", "NOT", '"', "*", "NEAR"]):
            return q

        # Handle document key patterns — exact match in document_key column
        if _DOC_KEY_RE.match(q) or _FULL_DOC_KEY_RE.match(q):
            return f'document_key:"{q.upper()}"'

        # Wrap queries containing hyphens in quotes to prevent FTS5 NOT interpretation
        if "-" in q and not q.startswith('"'):
            return f'"{q}"'

        # Otherwise treat as a prefix search on each word
        tokens = q.split()
        if len(tokens) == 1:
            return f"{tokens[0]}*"
        return " ".join(f"{t}*" for t in tokens)

    def _strip_html(self, text: str) -> str:
        """Remove HTML tags and collapse whitespace."""
        clean = re.sub(r"<[^>]+>", " ", text)
        return re.sub(r"\s+", " ", clean).strip()

    def _make_snippet(self, text: str, query: str, max_len: int = 200) -> str:
        """Create a snippet around the first occurrence of query terms."""
        clean = self._strip_html(text)

        if len(clean) <= max_len:
            return clean

        # Find first occurrence of any query term
        lower = clean.lower()
        terms = query.lower().split() if query else []
        pos = len(clean)
        for t in terms:
            idx = lower.find(t.rstrip("*"))
            if 0 <= idx < pos:
                pos = idx

        start = max(0, pos - 50)
        end = min(len(clean), start + max_len)
        snippet = clean[start:end]
        if start > 0:
            snippet = "..." + snippet
        if end < len(clean):
            snippet = snippet + "..."
        return snippet

    def _summarize_fields(self, fields: dict[str, Any]) -> dict[str, Any]:
        """Extract key custom fields, stripping HTML from rich-text values."""
        summary: dict[str, Any] = {}
        for key, value in fields.items():
            if isinstance(value, str):
                # Strip HTML from rich text fields
                if "<" in value and ">" in value:
                    summary[key] = self._strip_html(value)[:500]
                else:
                    summary[key] = value
            elif isinstance(value, dict):
                # Pick list values: {"id": 123, "display": "Active"}
                summary[key] = value.get("display", value.get("name", str(value)))
            elif isinstance(value, list):
                # Multi-select: list of dicts
                if value and isinstance(value[0], dict):
                    summary[key] = [v.get("display", v.get("name", str(v))) for v in value]
                else:
                    summary[key] = value
            elif value is not None:
                summary[key] = value
        return summary
