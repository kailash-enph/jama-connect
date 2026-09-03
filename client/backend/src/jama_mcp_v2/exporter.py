"""Export items and trees to Markdown, HTML, or JSON."""

from __future__ import annotations

import json
import logging
from typing import Any

from .cache import JamaCache
from .models import ExportFormat
from .tree import build_tree, flatten_tree

logger = logging.getLogger(__name__)


class Exporter:
    """Exports cached Jama data in various formats."""

    def __init__(self, cache: JamaCache):
        self._cache = cache

    async def export_item(self, item_id: int, fmt: ExportFormat = ExportFormat.MARKDOWN) -> str:
        """Export a single item."""
        item = await self._cache.get_item(item_id)
        if not item:
            return f"Item {item_id} not found in cache."

        if fmt == ExportFormat.JSON:
            return json.dumps(item, indent=2, default=str)
        elif fmt == ExportFormat.HTML:
            return self._item_to_html(item)
        else:
            return self._item_to_md(item)

    async def export_tree(
        self,
        project_id: int,
        root_id: int | None = None,
        fmt: ExportFormat = ExportFormat.MARKDOWN,
    ) -> str:
        """Export a project tree or subtree."""
        items = await self._cache.get_items_by_project(project_id)
        tree = build_tree(items, root_id)
        flat = flatten_tree(tree)

        if fmt == ExportFormat.JSON:
            return json.dumps([n.model_dump() for n in flat], indent=2, default=str)
        elif fmt == ExportFormat.HTML:
            return self._tree_to_html(flat, items)
        else:
            return self._tree_to_md(flat, items)

    # ---------- Markdown ----------

    def _item_to_md(self, item: dict[str, Any]) -> str:
        lines: list[str] = []
        lines.append(f"# {item.get('document_key', '')} — {item.get('name', '')}")
        lines.append("")
        if item.get("description"):
            lines.append(item["description"])
            lines.append("")

        # Fields
        fields_json = item.get("fields_json", "{}")
        if isinstance(fields_json, str):
            fields = json.loads(fields_json)
        else:
            fields = fields_json

        if fields:
            lines.append("## Fields")
            lines.append("")
            for k, v in fields.items():
                if k in ("name", "description"):
                    continue
                lines.append(f"- **{k}**: {v}")
            lines.append("")

        return "\n".join(lines)

    def _tree_to_md(self, flat: list, items: list[dict[str, Any]]) -> str:
        by_id = {i["id"]: i for i in items}
        lines: list[str] = []
        for node in flat:
            indent = "  " * node.level
            prefix = f"{node.section_label} " if node.section_label else ""
            dockey = node.document_key
            name = node.name
            lines.append(f"{indent}- {prefix}**{dockey}** {name}")
        return "\n".join(lines)

    # ---------- HTML ----------

    def _item_to_html(self, item: dict[str, Any]) -> str:
        dockey = item.get("document_key", "")
        name = item.get("name", "")
        desc = item.get("description", "")
        return f"<h1>{dockey} — {name}</h1>\n<div>{desc}</div>"

    def _tree_to_html(self, flat: list, items: list[dict[str, Any]]) -> str:
        lines = ["<ul>"]
        prev_level = 0
        for node in flat:
            diff = node.level - prev_level
            if diff > 0:
                lines.extend(["<ul>"] * diff)
            elif diff < 0:
                lines.extend(["</ul>"] * abs(diff))
            lines.append(f"<li><strong>{node.document_key}</strong> {node.name}</li>")
            prev_level = node.level
        lines.extend(["</ul>"] * (prev_level + 1))
        return "\n".join(lines)
