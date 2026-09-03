"""Write-back module — update items and test runs on Jama then refresh cache."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from .api_client import JamaApiClient, JamaApiError
from .cache import JamaCache

logger = logging.getLogger(__name__)


class Writer:
    """Applies changes to Jama and refreshes the local cache."""

    def __init__(self, api: JamaApiClient, cache: JamaCache):
        self._api = api
        self._cache = cache

    async def update_item_fields(self, item_id: int, fields: dict[str, Any]) -> dict[str, Any]:
        """Update specific fields on a Jama item, then refresh cache.

        Args:
            item_id: Jama item ID.
            fields: Dict of field names/values to update (e.g. {"name": "New Name", "description": "<p>HTML</p>"}).

        Returns:
            The refreshed item from the API.
        """
        logger.info("Updating item %d fields: %s", item_id, list(fields.keys()))
        await self._api.update_item(item_id, fields)

        # Fetch fresh copy and update cache
        fresh = await self._api.get_item(item_id)
        await self._cache.upsert_item(fresh)
        logger.info("Item %d updated and cache refreshed", item_id)
        return fresh

    async def update_item_description(self, item_id: int, description_html: str) -> dict[str, Any]:
        """Update just the description field (rich text HTML)."""
        return await self.update_item_fields(item_id, {"description": description_html})

    async def update_item_name(self, item_id: int, name: str) -> dict[str, Any]:
        """Update just the name/title field."""
        return await self.update_item_fields(item_id, {"name": name})

    async def create_item(
        self,
        project_id: int,
        item_type_id: int,
        parent_id: int,
        fields: dict[str, Any],
    ) -> dict[str, Any]:
        """Create a new item in Jama and add to cache."""
        logger.info("Creating item in project %d under parent %d", project_id, parent_id)
        result = await self._api.create_item(project_id, item_type_id, parent_id, fields)
        # result typically contains the new item's location header or ID
        if isinstance(result, dict) and "id" in result:
            fresh = await self._api.get_item(result["id"])
            await self._cache.upsert_item(fresh)
            return fresh
        return result

    async def delete_item(self, item_id: int) -> None:
        """Delete an item from Jama and remove from cache."""
        logger.info("Deleting item %d", item_id)
        await self._api.delete_item(item_id)
        await self._cache.delete_items([item_id])
        logger.info("Item %d deleted", item_id)

    async def add_comment(self, item_id: int, comment_text: str) -> dict[str, Any]:
        """Add a comment to an item."""
        logger.info("Adding comment to item %d", item_id)
        return await self._api.add_item_comment(item_id, comment_text)

    async def update_test_run(
        self,
        run_id: int,
        status: str | None = None,
        actual_results: str | None = None,
    ) -> dict[str, Any]:
        """Update a test run status and/or actual results."""
        logger.info("Updating test run %d: status=%s", run_id, status)
        result = await self._api.update_test_run(run_id, status=status, actual_results=actual_results)

        # Refresh cache
        fresh = await self._api.get_test_run(run_id)
        cached = await self._cache.get_test_run(run_id)
        cycle_id = cached["test_cycle_id"] if cached else 0
        if cycle_id:
            await self._cache.upsert_test_run(fresh, cycle_id)

        return result

    async def upload_attachment(
        self,
        item_id: int,
        file_path: str,
        description: str = "",
    ) -> dict[str, Any]:
        """Upload a file attachment to a Jama item.

        Args:
            item_id: Jama item ID.
            file_path: Absolute path to the file to upload.
            description: Optional description for the attachment.

        Returns:
            Dict with attachment_id, file_name, and upload metadata.
        """
        p = Path(file_path)
        if not p.is_file():
            raise FileNotFoundError(f"File not found: {file_path}")

        logger.info("Uploading attachment '%s' to item %d (%d bytes)", p.name, item_id, p.stat().st_size)
        file_content = p.read_bytes()
        result = await self._api.upload_attachment(item_id, p.name, file_content, description)

        # Refresh attachment cache for this item
        try:
            attachments = await self._api.get_item_attachments(item_id)
            for att in attachments:
                await self._cache.upsert_attachment(att, item_id)
        except Exception as e:
            logger.warning("Failed to refresh attachment cache for item %d: %s", item_id, e)

        logger.info("Attachment uploaded: id=%s, file=%s", result.get("attachment_id"), p.name)
        return result

    async def create_relationship(
        self,
        from_item: int,
        to_item: int,
        relationship_type_id: int | None = None,
    ) -> dict[str, Any]:
        """Create a traceability relationship between two items.

        Args:
            from_item: Source (upstream) item ID.
            to_item: Target (downstream) item ID.
            relationship_type_id: Optional relationship type ID.

        Returns:
            The created relationship data from Jama.
        """
        logger.info("Creating relationship: %d -> %d (type=%s)", from_item, to_item, relationship_type_id)
        result = await self._api.create_relationship(from_item, to_item, relationship_type_id)

        # Try to refresh cache for both items' relationships
        for item_id in (from_item, to_item):
            try:
                item = await self._api.get_item(item_id)
                project_id = item.get("project")
                if project_id:
                    rel_data = {
                        "id": result.get("id", 0),
                        "fromItem": from_item,
                        "toItem": to_item,
                        "relationshipType": result.get("relationshipType"),
                        "suspect": result.get("suspect", False),
                    }
                    await self._cache.upsert_relationship(rel_data, project_id)
                    break
            except Exception as e:
                logger.warning("Failed to cache relationship for item %d: %s", item_id, e)

        return result

    async def delete_relationship(self, relationship_id: int) -> None:
        """Delete a relationship from Jama.

        Args:
            relationship_id: Jama relationship ID.
        """
        logger.info("Deleting relationship %d", relationship_id)
        await self._api.delete_relationship(relationship_id)
        logger.info("Relationship %d deleted", relationship_id)
