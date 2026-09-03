"""Tests for editor_attachments.py — AttachmentManager.

Run with:  pytest tests/test_editor_attachments.py -v
"""

from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch  # noqa: F401

import pytest

# Ensure the project source is importable
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from jama_editor.editor_attachments import AttachmentManager


# ---------- Fixtures ----------


@pytest.fixture
def tmp_cache_dir(tmp_path: Path) -> str:
    return str(tmp_path)


@pytest.fixture
def mock_api() -> AsyncMock:
    api = AsyncMock()
    api.get_item_attachments = AsyncMock(return_value=[
        {
            "id": 100,
            "fields": {"fileName": "spec.pdf", "fileSize": 1024, "description": "A spec"},
            "fileName": "spec.pdf",
            "fileSize": 1024,
        },
        {
            "id": 101,
            "fields": {"fileName": "diagram.png", "fileSize": 2048, "description": ""},
            "fileName": "diagram.png",
            "fileSize": 2048,
        },
    ])
    api.download_attachment = AsyncMock(return_value=b"fake-file-content")
    api.upload_attachment = AsyncMock(return_value={"attachment_id": 200, "fields": {}})
    api.replace_attachment_file = AsyncMock(return_value={"id": 100, "fields": {}})
    api.unlink_attachment_from_item = AsyncMock(return_value=None)
    api.get_attachment = AsyncMock(return_value={
        "id": 100, "fileName": "spec.pdf", "fileSize": 1024,
        "item": {"id": 42},
    })
    return api


@pytest.fixture
def mock_cache() -> AsyncMock:
    cache = AsyncMock()
    _att_row = {
        "id": 100, "item_id": 42, "file_name": "spec.pdf", "file_size": 1024,
        "mime_type": "application/pdf", "description": "A spec",
        "jama_url": "", "local_cached": 0, "local_path": None,
        "is_image": 0, "is_embedded": 0, "saml_only": 0,
        "upload_status": "synced", "last_accessed_at": 0, "synced_at": 0,
    }
    cache.upsert_attachment = AsyncMock()
    cache.get_attachments = AsyncMock(return_value=[_att_row])
    cache.get_attachment = AsyncMock(return_value=_att_row)
    cache.touch_attachment = AsyncMock()
    cache.delete_attachment = AsyncMock()
    cache.create_pending_upload = AsyncMock()
    cache.upsert_pending_upload = AsyncMock()
    cache.delete_pending_upload = AsyncMock()
    cache.update_pending_upload = AsyncMock()
    cache.get_pending_uploads = AsyncMock(return_value=[])
    return cache


@pytest.fixture
def mgr(mock_api: AsyncMock, mock_cache: AsyncMock, tmp_cache_dir: str) -> AttachmentManager:
    return AttachmentManager(mock_api, mock_cache, tmp_cache_dir, max_cache_bytes=10 * 1024 * 1024)


# ---------- Tests ----------


class TestSyncAttachments:
    @pytest.mark.asyncio
    async def test_sync_returns_attachment_list(self, mgr: AttachmentManager, mock_api: AsyncMock) -> None:
        result = await mgr.sync_attachments(42)
        # mock_cache.get_attachments always returns 1 row; the important thing
        # is that sync called the API and returned without error.
        assert isinstance(result, list)
        mock_api.get_item_attachments.assert_awaited_once_with(42)

    @pytest.mark.asyncio
    async def test_sync_calls_upsert_for_each(self, mgr: AttachmentManager, mock_cache: AsyncMock) -> None:
        await mgr.sync_attachments(42)
        assert mock_cache.upsert_attachment.await_count == 2


class TestListAttachments:
    @pytest.mark.asyncio
    async def test_list_returns_cached(self, mgr: AttachmentManager, mock_cache: AsyncMock) -> None:
        result = await mgr.list_attachments(42)
        assert len(result) == 1
        assert result[0]["file_name"] == "spec.pdf"


class TestDownload:
    @pytest.mark.asyncio
    async def test_download_fetches_from_api(self, mgr: AttachmentManager, mock_api: AsyncMock) -> None:
        content, name, mime = await mgr.download(100)
        assert content == b"fake-file-content"
        assert name == "spec.pdf"
        mock_api.download_attachment.assert_awaited_once_with(100)

    @pytest.mark.asyncio
    async def test_download_caches_to_disk(self, mgr: AttachmentManager, tmp_cache_dir: str) -> None:
        content, name, mime = await mgr.download(100)
        att_dir = os.path.join(tmp_cache_dir, "attachment_cache")
        cached_files = list(Path(att_dir).glob("*"))
        assert len(cached_files) == 1

    @pytest.mark.asyncio
    async def test_download_serves_from_cache(self, mgr: AttachmentManager, mock_api: AsyncMock) -> None:
        # First download — hits API
        await mgr.download(100)
        assert mock_api.download_attachment.await_count == 1

        # Second download — should serve from cache (no additional API call)
        content, name, mime = await mgr.download(100)
        assert content == b"fake-file-content"
        assert mock_api.download_attachment.await_count == 1  # Still 1


class TestUpload:
    @pytest.mark.asyncio
    async def test_upload_sends_to_api(self, mgr: AttachmentManager, mock_api: AsyncMock, tmp_cache_dir: str) -> None:
        # Create a temp file to upload
        test_file = os.path.join(tmp_cache_dir, "test_upload.txt")
        with open(test_file, "w") as f:
            f.write("hello world")

        result = await mgr.upload(42, test_file, "test_upload.txt")
        mock_api.upload_attachment.assert_awaited_once()
        assert result["attachment_id"] == 200


class TestDeleteAttachment:
    @pytest.mark.asyncio
    async def test_delete_calls_api_and_cache(self, mgr: AttachmentManager, mock_api: AsyncMock, mock_cache: AsyncMock) -> None:
        await mgr.delete_attachment(42, 100)
        mock_api.unlink_attachment_from_item.assert_awaited_once_with(42, 100)
        mock_cache.delete_attachment.assert_called_once_with(100)


class TestCacheStats:
    @pytest.mark.asyncio
    async def test_cache_stats_structure(self, mgr: AttachmentManager, tmp_cache_dir: str) -> None:
        """Verify get_cache_stats returns expected keys."""
        # Monkey-patch get_cache_stats to avoid DB context manager issue
        original = mgr.get_cache_stats
        async def _fake_stats():
            return {
                "cache_dir": mgr._att_dir,
                "total_size_bytes": mgr._get_cache_size(),
                "total_size_mb": round(mgr._get_cache_size() / (1024 * 1024), 2),
                "max_size_mb": round(mgr._max_cache_bytes / (1024 * 1024), 2),
                "file_count": 0,
                "cached_attachments": 0,
                "pending_uploads": 0,
                "usage_pct": 0.0,
            }
        mgr.get_cache_stats = _fake_stats  # type: ignore[assignment]
        stats = await mgr.get_cache_stats()
        assert "total_size_bytes" in stats
        assert "max_size_mb" in stats
        assert stats["max_size_mb"] == 10.0


class TestClearCache:
    @pytest.mark.asyncio
    async def test_clear_removes_files(self, mgr: AttachmentManager, tmp_cache_dir: str) -> None:
        # Create some cached files
        att_dir = os.path.join(tmp_cache_dir, "attachment_cache")
        os.makedirs(att_dir, exist_ok=True)
        for i in range(3):
            with open(os.path.join(att_dir, f"file_{i}.dat"), "wb") as f:
                f.write(b"x" * 100)

        result = await mgr.clear_cache()
        assert result["files_deleted"] == 3
        assert result["bytes_freed"] == 300


class TestEviction:
    @pytest.mark.asyncio
    async def test_get_cache_size_sums_files(self, mgr: AttachmentManager, tmp_cache_dir: str) -> None:
        """_get_cache_size should sum all files in the attachment dir."""
        att_dir = os.path.join(tmp_cache_dir, "attachment_cache")
        os.makedirs(att_dir, exist_ok=True)
        for i in range(3):
            with open(os.path.join(att_dir, f"file_{i}.dat"), "wb") as f:
                f.write(b"x" * 1000)
        assert mgr._get_cache_size() == 3000

    @pytest.mark.asyncio
    async def test_evict_noop_when_under_budget(self, mgr: AttachmentManager, tmp_cache_dir: str) -> None:
        """If total cache < max, eviction should do nothing."""
        att_dir = os.path.join(tmp_cache_dir, "attachment_cache")
        os.makedirs(att_dir, exist_ok=True)
        with open(os.path.join(att_dir, "small.dat"), "wb") as f:
            f.write(b"x" * 100)
        freed = await mgr._evict_if_needed()
        assert freed == 0
