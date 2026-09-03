"""Shared utility functions for normalizing Jama API responses.

All functions are pure (no I/O, no async) so they can be used from any layer.
"""

from __future__ import annotations

import json
import re
from typing import Any

_ATT_ID_RE = re.compile(r"/(?:attachment|attachments)/(\d+)")


def extract_attachment_id(url: str) -> int | None:
    """Extract an attachment ID from a Jama web or REST image URL.

    Handles both:
    - Web UI URL: /attachment/{id}/filename
    - REST API URL: /rest/v1/attachments/{id}/file

    Returns the integer ID, or None if not found.
    """
    m = _ATT_ID_RE.search(url)
    return int(m.group(1)) if m else None


def extract_nested_id(data: Any, *keys: str) -> int | None:
    """Safely extract a numeric ID from a nested dict.

    Example:
        extract_nested_id(item, "project", "id")  # item["project"]["id"]
    """
    val = data
    for key in keys:
        if not isinstance(val, dict):
            return None
        val = val.get(key)
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def extract_parent_id(parent: Any) -> int | None:
    """Extract parent project ID from Jama API response.

    Jama returns parent as:
    - int (project ID directly)
    - dict like {"project": {"id": 123}} or {"id": 123}
    - None
    """
    if parent is None:
        return None
    if isinstance(parent, int):
        return parent
    if isinstance(parent, dict):
        proj = parent.get("project", parent)
        if isinstance(proj, dict):
            v = proj.get("id")
        else:
            v = proj
        try:
            return int(v) if v is not None else None
        except (TypeError, ValueError):
            return None
    return None


def normalize_api_version(item_id: int, version_num: int, data: dict) -> dict:
    """Normalize a Jama version API response to a consistent dict.

    Replaces the 4 identical version-dict constructions that were spread
    across server.py (jama_get_item_versions, jama_get_item_at_version,
    api_item_versions, api_item_at_version).
    """
    fields = data.get("fields", {})
    return {
        "item_id": item_id,
        "version_num": version_num or data.get("versionNumber", data.get("version", 0)),
        "fields_json": json.dumps(fields),
        "description_html": fields.get("description", ""),
        "modified_by": data.get("userName", data.get("modifiedBy")),
        "modified_date": data.get("modifiedDate"),
        "created_date": data.get("createdDate"),
        "type": data.get("type", ""),
        "version_comment": data.get("changeDetails", data.get("versionComment", "")),
    }


def normalize_item_row(row: dict) -> dict:
    """Add a parsed 'fields' dict to a raw DB row from the items table.

    The DB stores fields as JSON string; REST consumers want a dict.
    Also adds computed convenience keys.
    """
    result = dict(row)
    raw_fields = result.get("fields_json", "{}")
    try:
        result["fields"] = json.loads(raw_fields) if isinstance(raw_fields, str) else raw_fields
    except (json.JSONDecodeError, TypeError):
        result["fields"] = {}

    # Parse location_json if present
    raw_loc = result.get("location_json", "{}")
    try:
        result["location"] = json.loads(raw_loc) if isinstance(raw_loc, str) else raw_loc
    except (json.JSONDecodeError, TypeError):
        result["location"] = {}

    # Parse resources_json if present
    raw_res = result.get("resources_json", "{}")
    try:
        result["resources"] = json.loads(raw_res) if isinstance(raw_res, str) else raw_res
    except (json.JSONDecodeError, TypeError):
        result["resources"] = {}

    return result


def normalize_item_type_name(item_type_id: int, item_types: dict[int, dict]) -> str:
    """Return display name for an item type, or empty string if unknown."""
    t = item_types.get(item_type_id)
    return t.get("display", t.get("name", "")) if t else ""
