"""Tree building and traversal for Jama item hierarchies."""

from __future__ import annotations

import logging
from typing import Any

from .models import TreeNode

logger = logging.getLogger(__name__)


def build_tree(items: list[dict[str, Any]], root_id: int | None = None) -> list[TreeNode]:
    """Build a tree of TreeNodes from a flat list of cached items.

    Args:
        items: List of item dicts (from cache.get_items_by_project).
        root_id: If provided, only build the subtree under this item.

    Returns:
        List of root-level TreeNodes with children populated.
    """
    by_id: dict[int, dict[str, Any]] = {item["id"]: item for item in items}
    children_map: dict[int | None, list[int]] = {}

    for item in items:
        pid = item.get("parent_id")
        children_map.setdefault(pid, []).append(item["id"])

    def _build(item_id: int, level: int, section_prefix: str) -> TreeNode:
        item = by_id[item_id]
        child_ids = children_map.get(item_id, [])
        # Sort children by document_key for consistent ordering
        child_ids.sort(key=lambda cid: by_id[cid].get("document_key", ""))

        child_nodes: list[TreeNode] = []
        for idx, cid in enumerate(child_ids, 1):
            child_label = f"{section_prefix}.{idx}" if section_prefix else str(idx)
            child_nodes.append(_build(cid, level + 1, child_label))

        return TreeNode(
            id=item_id,
            name=item.get("name", ""),
            document_key=item.get("document_key", ""),
            item_type=item.get("item_type", 0),
            parent_id=item.get("parent_id"),
            has_children=len(child_nodes) > 0,
            level=level,
            section_label=section_prefix,
            children=child_nodes,
        )

    if root_id is not None:
        if root_id not in by_id:
            return []
        return [_build(root_id, 0, "")]

    # Build from all root items (those with no parent or parent not in the set)
    root_ids = children_map.get(None, [])
    # Also include items whose parent_id is not in our set
    for item in items:
        pid = item.get("parent_id")
        if pid is not None and pid not in by_id and item["id"] not in root_ids:
            root_ids.append(item["id"])

    root_ids.sort(key=lambda rid: by_id[rid].get("document_key", ""))

    roots: list[TreeNode] = []
    for idx, rid in enumerate(root_ids, 1):
        roots.append(_build(rid, 0, str(idx)))

    return roots


def flatten_tree(nodes: list[TreeNode]) -> list[TreeNode]:
    """Flatten a tree into a pre-order list (depth-first)."""
    result: list[TreeNode] = []

    def _walk(node: TreeNode) -> None:
        result.append(node)
        for child in node.children:
            _walk(child)

    for n in nodes:
        _walk(n)
    return result


def find_node(nodes: list[TreeNode], item_id: int) -> TreeNode | None:
    """Find a node by item_id in the tree."""
    for node in nodes:
        if node.id == item_id:
            return node
        found = find_node(node.children, item_id)
        if found:
            return found
    return None


def get_ancestors(items: list[dict[str, Any]], item_id: int) -> list[dict[str, Any]]:
    """Get the ancestor chain from root to the given item (exclusive)."""
    by_id = {item["id"]: item for item in items}
    ancestors: list[dict[str, Any]] = []
    current = by_id.get(item_id)
    while current and current.get("parent_id"):
        parent = by_id.get(current["parent_id"])
        if parent:
            ancestors.insert(0, parent)
            current = parent
        else:
            break
    return ancestors


def get_subtree_ids(items: list[dict[str, Any]], root_id: int) -> list[int]:
    """Get all item IDs in the subtree rooted at root_id (inclusive)."""
    children_map: dict[int, list[int]] = {}
    for item in items:
        pid = item.get("parent_id")
        if pid is not None:
            children_map.setdefault(pid, []).append(item["id"])

    result: list[int] = []

    def _collect(iid: int) -> None:
        result.append(iid)
        for cid in children_map.get(iid, []):
            _collect(cid)

    _collect(root_id)
    return result
