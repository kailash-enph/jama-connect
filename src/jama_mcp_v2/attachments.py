"""Attachment and embedded image management."""

from __future__ import annotations

import base64
import logging
import re
from pathlib import Path
from typing import Any

from .api_client import JamaApiClient, JamaApiError
from .cache import JamaCache

logger = logging.getLogger(__name__)

# Regex for Jama embedded image URLs: /rest/v1/attachments/{id}/file
EMBEDDED_IMAGE_RE = re.compile(r'/rest/v1/attachments/(\d+)/file')


class AttachmentManager:
    """Downloads and caches attachments, replaces embedded image URLs with local paths."""

    def __init__(self, api: JamaApiClient, cache: JamaCache, cache_dir: str = "~/.jama-mcp-v2"):
        self._api = api
        self._cache = cache
        self._files_dir = Path(cache_dir).expanduser() / "attachments"
        self._files_dir.mkdir(parents=True, exist_ok=True)

    async def sync_item_attachments(self, item_id: int) -> list[dict[str, Any]]:
        """Fetch and cache attachment metadata for an item."""
        attachments = await self._api.get_item_attachments(item_id)
        for att in attachments:
            await self._cache.upsert_attachment(att, item_id)
        return attachments

    async def download_attachment(self, attachment_id: int, file_name: str = "") -> Path:
        """Download an attachment to local cache, return local path."""
        local_dir = self._files_dir / str(attachment_id)
        local_dir.mkdir(parents=True, exist_ok=True)

        if not file_name:
            file_name = f"attachment_{attachment_id}"

        local_path = local_dir / file_name
        if local_path.exists():
            return local_path

        try:
            content = await self._api.download_attachment(attachment_id)
            local_path.write_bytes(content)
            logger.info("Downloaded attachment %d -> %s (%d bytes)", attachment_id, local_path, len(content))
            return local_path
        except JamaApiError as e:
            logger.error("Failed to download attachment %d: %s", attachment_id, e)
            raise

    async def resolve_embedded_images(self, html: str) -> str:
        """Replace embedded Jama image URLs in HTML with base64 data URIs.

        This allows the viewer to render images without proxying to Jama.
        """
        matches = EMBEDDED_IMAGE_RE.findall(html)
        if not matches:
            return html

        for att_id_str in set(matches):
            att_id = int(att_id_str)
            try:
                content = await self._api.download_attachment(att_id)
                # Guess mime type from content
                mime = _guess_mime(content)
                b64 = base64.b64encode(content).decode("ascii")
                data_uri = f"data:{mime};base64,{b64}"
                # Replace all occurrences of this attachment URL
                pattern = f"/rest/v1/attachments/{att_id}/file"
                html = html.replace(pattern, data_uri)
                logger.debug("Embedded image %d resolved (%d bytes)", att_id, len(content))
            except Exception as e:
                logger.warning("Failed to resolve embedded image %d: %s", att_id, e)

        return html

    async def get_attachment_as_base64(self, attachment_id: int) -> dict[str, str]:
        """Download attachment and return as base64 with mime type."""
        content = await self._api.download_attachment(attachment_id)
        mime = _guess_mime(content)
        b64 = base64.b64encode(content).decode("ascii")
        return {"mime_type": mime, "data": b64, "size": len(content)}


def _guess_mime(content: bytes) -> str:
    """Guess MIME type from file magic bytes."""
    if content[:8] == b'\x89PNG\r\n\x1a\n':
        return "image/png"
    if content[:2] == b'\xff\xd8':
        return "image/jpeg"
    if content[:4] == b'GIF8':
        return "image/gif"
    if content[:4] == b'%PDF':
        return "application/pdf"
    if content[:2] in (b'PK', b'\x50\x4b'):
        return "application/zip"
    return "application/octet-stream"
