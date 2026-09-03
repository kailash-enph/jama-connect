"""Attachment management — download/upload with local caching and eviction.

Provides:
  - Lazy download: fetches from Jama on first access, caches to disk
  - Upload: reads a local file, uploads to Jama via two-step API
  - Cache eviction: LRU-based, respects configurable max cache size
  - Pending upload tracking: survives crashes via editor_db
"""

from __future__ import annotations

import logging
import mimetypes
import os
import time
import uuid
from pathlib import Path
from typing import Any

from jama_mcp_v2.api_client import JamaApiClient

from .editor_cache import EditorCache

logger = logging.getLogger("jama-editor.attachments")

# Default max cache size: 500 MB
DEFAULT_MAX_CACHE_BYTES = 500 * 1024 * 1024


class AttachmentManager:
    """Manages item attachments with local caching."""

    def __init__(
        self,
        api: JamaApiClient,
        cache: EditorCache,
        cache_dir: str = "~/.jama-mcp-v2",
        max_cache_bytes: int = DEFAULT_MAX_CACHE_BYTES,
    ):
        self._api = api
        self._cache = cache
        self._att_dir = os.path.join(os.path.expanduser(cache_dir), "attachment_cache")
        self._max_cache_bytes = max_cache_bytes
        os.makedirs(self._att_dir, exist_ok=True)

    # ============================================================
    # LIST attachments for an item (sync from Jama → local DB)
    # ============================================================

    async def sync_attachments(self, item_id: int) -> list[dict[str, Any]]:
        """Fetch attachment metadata from Jama and upsert into local DB."""
        try:
            jama_atts = await self._api.get_item_attachments(item_id)
        except Exception as exc:
            logger.warning("Failed to fetch attachments for item %d: %s", item_id, exc)
            # Fall back to cached
            return await self._cache.get_attachments(item_id)

        for att in jama_atts:
            att_id = att.get("id")
            if not att_id:
                continue
            file_name = att.get("fileName", "")
            mime = mimetypes.guess_type(file_name)[0] or ""
            is_image = mime.startswith("image/") if mime else False
            await self._cache.upsert_attachment({
                "id": att_id,
                "item_id": item_id,
                "file_name": file_name,
                "file_size": att.get("fileSize", 0),
                "mime_type": mime,
                "description": att.get("description", ""),
                "jama_url": att.get("url", ""),
                "is_image": is_image,
            })

        return await self._cache.get_attachments(item_id)

    async def list_attachments(self, item_id: int) -> list[dict[str, Any]]:
        """Get cached attachment list (call sync_attachments first for fresh data)."""
        return await self._cache.get_attachments(item_id)

    # ============================================================
    # DOWNLOAD an attachment (lazy, with local disk cache)
    # ============================================================

    async def download(self, attachment_id: int) -> tuple[bytes, str, str]:
        """Download attachment content. Returns (bytes, filename, mime_type).

        Uses local cache if available; otherwise fetches from Jama.
        """
        # Check local cache first
        local_path = self._local_path(attachment_id)
        if os.path.isfile(local_path):
            await self._cache.touch_attachment(attachment_id)
            with open(local_path, "rb") as f:
                content = f.read()
            # Get metadata from DB
            atts = await self._cache.get_attachments(0)  # need a lookup by ID
            # Simpler: read metadata from Jama
            meta = await self._get_meta(attachment_id)
            return content, meta["file_name"], meta["mime_type"]

        # Fetch from Jama
        try:
            file_bytes = await self._api.download_attachment(attachment_id)
        except Exception as exc:
            logger.error("Download failed for attachment %d: %s", attachment_id, exc)
            raise

        meta = await self._get_meta(attachment_id)

        # Cache to disk
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(file_bytes)

        # Update DB
        await self._cache.upsert_attachment({
            "id": attachment_id,
            "item_id": meta.get("item_id", 0),
            "file_name": meta["file_name"],
            "file_size": len(file_bytes),
            "mime_type": meta["mime_type"],
            "local_cached": True,
            "local_path": local_path,
        })
        await self._cache.touch_attachment(attachment_id)

        # Evict if over budget
        await self._evict_if_needed()

        return file_bytes, meta["file_name"], meta["mime_type"]

    async def _get_meta(self, attachment_id: int) -> dict[str, Any]:
        """Get attachment metadata (from Jama API)."""
        try:
            att = await self._api.get_attachment(attachment_id)
            file_name = att.get("fileName", f"attachment_{attachment_id}")
            mime = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
            return {
                "file_name": file_name,
                "mime_type": mime,
                "item_id": att.get("item", {}).get("id", 0) if isinstance(att.get("item"), dict) else 0,
            }
        except Exception:
            return {
                "file_name": f"attachment_{attachment_id}",
                "mime_type": "application/octet-stream",
                "item_id": 0,
            }

    def _local_path(self, attachment_id: int) -> str:
        """Local cache path for an attachment."""
        return os.path.join(self._att_dir, str(attachment_id))

    # ============================================================
    # UPLOAD an attachment from local file → Jama
    # ============================================================

    async def upload(
        self,
        item_id: int,
        file_path: str,
        file_name: str = "",
        description: str = "",
        embed_after: bool = False,
    ) -> dict[str, Any]:
        """Upload a local file as a Jama attachment.

        1. Creates a pending_upload record (crash recovery)
        2. Reads file from disk
        3. Uploads to Jama (two-step: metadata + binary)
        4. Updates local cache
        5. Marks pending_upload complete
        """
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        if not file_name:
            file_name = os.path.basename(file_path)

        file_size = os.path.getsize(file_path)
        mime = mimetypes.guess_type(file_name)[0] or "application/octet-stream"

        # Create pending upload for crash recovery
        upload_id = str(uuid.uuid4())
        await self._cache.create_pending_upload({
            "id": upload_id,
            "item_id": item_id,
            "file_name": file_name,
            "file_path": file_path,
            "file_size": file_size,
            "mime_type": mime,
            "description": description,
            "embed_after": embed_after,
        })

        try:
            with open(file_path, "rb") as f:
                content = f.read()

            result = await self._api.upload_attachment(
                item_id, file_name, content, description=description
            )
            att_id = result.get("attachment_id")

            # Cache locally
            if att_id:
                local_path = self._local_path(att_id)
                with open(local_path, "wb") as f:
                    f.write(content)

                await self._cache.upsert_attachment({
                    "id": att_id,
                    "item_id": item_id,
                    "file_name": file_name,
                    "file_size": file_size,
                    "mime_type": mime,
                    "description": description,
                    "local_cached": True,
                    "local_path": local_path,
                    "is_image": mime.startswith("image/"),
                    "upload_status": "complete",
                })

            # Mark upload complete
            await self._cache.update_pending_upload(
                upload_id, status="complete", attachment_id=att_id
            )

            logger.info("Uploaded attachment %s → %d for item %d", file_name, att_id or 0, item_id)
            return {
                "attachment_id": att_id,
                "file_name": file_name,
                "file_size": file_size,
                "mime_type": mime,
                "upload_id": upload_id,
            }

        except Exception as exc:
            await self._cache.update_pending_upload(
                upload_id, status="failed", error_message=str(exc)
            )
            logger.error("Upload failed for %s: %s", file_name, exc)
            raise

    # ============================================================
    # DELETE / REPLACE
    # ============================================================

    async def delete_attachment(self, item_id: int, attachment_id: int) -> None:
        """Unlink attachment from item and remove local cache."""
        try:
            await self._api.unlink_attachment_from_item(item_id, attachment_id)
        except Exception as exc:
            logger.warning("Jama unlink failed (may already be gone): %s", exc)

        # Remove local cache
        local_path = self._local_path(attachment_id)
        if os.path.isfile(local_path):
            os.remove(local_path)

        await self._cache.delete_attachment(attachment_id)

    async def replace_attachment(
        self,
        attachment_id: int,
        file_path: str,
        file_name: str = "",
    ) -> dict[str, Any]:
        """Replace an existing attachment's file content."""
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        if not file_name:
            file_name = os.path.basename(file_path)

        with open(file_path, "rb") as f:
            content = f.read()

        result = await self._api.replace_attachment_file(
            attachment_id, file_name, content
        )

        # Update local cache
        local_path = self._local_path(attachment_id)
        with open(local_path, "wb") as f:
            f.write(content)

        mime = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
        await self._cache.upsert_attachment({
            "id": attachment_id,
            "file_name": file_name,
            "file_size": len(content),
            "mime_type": mime,
            "local_cached": True,
            "local_path": local_path,
        })

        return {"attachment_id": attachment_id, "file_name": file_name, "result": result}

    # ============================================================
    # PENDING UPLOAD RECOVERY
    # ============================================================

    async def retry_pending_uploads(self, item_id: int | None = None) -> list[dict[str, Any]]:
        """Retry any pending uploads that didn't complete (crash recovery)."""
        pending = await self._cache.get_pending_uploads(item_id=item_id)
        results: list[dict[str, Any]] = []

        for pu in pending:
            if pu["status"] != "pending":
                continue
            try:
                result = await self.upload(
                    item_id=pu["item_id"],
                    file_path=pu["file_path"],
                    file_name=pu["file_name"],
                    description=pu.get("description", ""),
                    embed_after=bool(pu.get("embed_after")),
                )
                # Clean up the original pending record
                await self._cache.delete_pending_upload(pu["id"])
                results.append({"upload_id": pu["id"], "status": "retried", **result})
            except Exception as exc:
                results.append({"upload_id": pu["id"], "status": "failed", "error": str(exc)})

        return results

    # ============================================================
    # CACHE EVICTION (LRU)
    # ============================================================

    async def _evict_if_needed(self) -> int:
        """Evict oldest cached files if total size exceeds budget. Returns bytes freed."""
        total_size = self._get_cache_size()
        if total_size <= self._max_cache_bytes:
            return 0

        freed = 0
        # Get all cached attachments, sorted by last_accessed_at (oldest first)
        async with self._cache.db.execute(
            """SELECT id, local_path, file_size FROM editor_attachments
               WHERE local_cached = 1
               ORDER BY last_accessed_at ASC"""
        ) as cursor:
            rows = await cursor.fetchall()

        for row in rows:
            if total_size - freed <= self._max_cache_bytes:
                break
            att_id = row[0]
            local_path = row[1]
            file_size = row[2] or 0

            if local_path and os.path.isfile(local_path):
                os.remove(local_path)
                freed += file_size
                logger.debug("Evicted attachment %d (%d bytes)", att_id, file_size)

            # Mark as not cached
            await self._cache.db.execute(
                "UPDATE editor_attachments SET local_cached = 0, local_path = NULL WHERE id = ?",
                (att_id,),
            )

        if freed > 0:
            await self._cache.db.commit()
            logger.info("Cache eviction freed %d bytes", freed)

        return freed

    def _get_cache_size(self) -> int:
        """Total size of all files in the attachment cache directory."""
        total = 0
        for entry in os.scandir(self._att_dir):
            if entry.is_file():
                total += entry.stat().st_size
        return total

    async def get_cache_stats(self) -> dict[str, Any]:
        """Return cache usage statistics."""
        total_size = self._get_cache_size()
        file_count = sum(1 for e in os.scandir(self._att_dir) if e.is_file())

        async with self._cache.db.execute(
            "SELECT COUNT(*) FROM editor_attachments WHERE local_cached = 1"
        ) as cursor:
            row = await cursor.fetchone()
        cached_count = row[0] if row else 0

        async with self._cache.db.execute(
            "SELECT COUNT(*) FROM pending_uploads WHERE status = 'pending'"
        ) as cursor:
            row = await cursor.fetchone()
        pending_count = row[0] if row else 0

        return {
            "cache_dir": self._att_dir,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "max_size_mb": round(self._max_cache_bytes / (1024 * 1024), 2),
            "file_count": file_count,
            "cached_attachments": cached_count,
            "pending_uploads": pending_count,
            "usage_pct": round(total_size / self._max_cache_bytes * 100, 1) if self._max_cache_bytes else 0,
        }

    async def clear_cache(self) -> dict[str, Any]:
        """Delete all cached attachment files and reset DB flags."""
        freed = 0
        count = 0
        for entry in os.scandir(self._att_dir):
            if entry.is_file():
                freed += entry.stat().st_size
                os.remove(entry.path)
                count += 1

        await self._cache.db.execute(
            "UPDATE editor_attachments SET local_cached = 0, local_path = NULL"
        )
        await self._cache.db.commit()

        logger.info("Cleared attachment cache: %d files, %d bytes", count, freed)
        return {"files_deleted": count, "bytes_freed": freed}
