"""HTTP client for the Jama Connect LAN cache server.

Downloads pre-generated .db.gz files and decompresses them into the
local projects/ directory. Yields SSE-style progress dicts so the
caller can stream status to the client via SseQueue.

Protocol:
  GET {base_url}/index.json       → CacheIndex (projects + variants)
  GET {base_url}/projects/{id}.db.gz   → data_only SQLite + gzip
  GET {base_url}/projects/{id}_with_images.db.gz → with BLOBs
"""

from __future__ import annotations

import asyncio
import gzip
import logging
import shutil
from pathlib import Path
from typing import Any, AsyncIterator

import httpx

logger = logging.getLogger(__name__)

_CHUNK = 256 * 1024   # 256 KB read/decompress chunks
_TIMEOUT = httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=10.0)


class CacheServerError(RuntimeError):
    """Raised when the cache server returns an error or is unreachable."""


async def fetch_index(base_url: str) -> dict[str, Any]:
    """Fetch and return the cache server index.json.

    Raises:
        CacheServerError — if the server is unreachable or returns non-200.
    """
    url = base_url.rstrip("/") + "/index.json"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.json()
    except httpx.HTTPStatusError as e:
        raise CacheServerError(f"Cache server returned {e.response.status_code}: {url}") from e
    except httpx.RequestError as e:
        raise CacheServerError(f"Cache server unreachable at {url}: {e}") from e


async def download_project_db(
    base_url: str,
    project_id: int,
    dest_path: Path,
    variant: str = "data_only",
) -> AsyncIterator[dict[str, Any]]:
    """Download and decompress a project .db.gz, yielding progress events.

    Yields dicts:
        {"phase": "connecting"}
        {"phase": "downloading", "pct": 0-100, "bytes": N, "total": T}
        {"phase": "decompressing"}
        {"phase": "done", "db_path": str}
        {"phase": "error", "message": str}  (final event if something fails)

    Args:
        base_url:    Cache server base URL (e.g. "http://192.168.1.50:8866")
        project_id:  Jama project ID
        dest_path:   Where to write the final .db file
        variant:     "data_only" or "with_images"
    """
    suffix = "_with_images" if variant == "with_images" else ""
    url = f"{base_url.rstrip('/')}/projects/{project_id}{suffix}.db.gz"
    tmp_gz = dest_path.with_suffix(".db.gz.tmp")
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    yield {"phase": "connecting"}
    logger.info("Downloading %s → %s", url, dest_path)

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            async with client.stream("GET", url) as r:
                if r.status_code == 404:
                    raise CacheServerError(
                        f"Project {project_id} variant '{variant}' not found on cache server"
                    )
                r.raise_for_status()

                total = int(r.headers.get("content-length", 0)) or None
                downloaded = 0

                with open(tmp_gz, "wb") as f:
                    async for chunk in r.aiter_bytes(chunk_size=_CHUNK):
                        f.write(chunk)
                        downloaded += len(chunk)
                        pct = int(downloaded * 100 / total) if total else 0
                        yield {
                            "phase": "downloading",
                            "pct": pct,
                            "bytes": downloaded,
                            "total": total,
                        }

        # Decompress
        yield {"phase": "decompressing"}
        logger.info("Decompressing %s → %s", tmp_gz, dest_path)
        await asyncio.to_thread(_decompress_gz, tmp_gz, dest_path)

        yield {"phase": "done", "db_path": str(dest_path)}
        logger.info("Download complete: %s (%.1f MB)", dest_path, dest_path.stat().st_size / 1048576)

    except CacheServerError as e:
        logger.error("Download failed: %s", e)
        yield {"phase": "error", "message": str(e)}
    except httpx.RequestError as e:
        msg = f"Network error: {e}"
        logger.error("Download failed: %s", msg)
        yield {"phase": "error", "message": msg}
    except Exception as e:
        msg = f"Unexpected error: {e}"
        logger.error("Download failed: %s", msg, exc_info=True)
        yield {"phase": "error", "message": msg}
    finally:
        if tmp_gz.exists():
            tmp_gz.unlink(missing_ok=True)


def _decompress_gz(gz_path: Path, dest_path: Path) -> None:
    """Blocking decompress — run with asyncio.to_thread."""
    tmp_out = dest_path.with_suffix(".db.decompressing")
    try:
        with gzip.open(gz_path, "rb") as f_in:
            with open(tmp_out, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
        tmp_out.replace(dest_path)
    except Exception:
        tmp_out.unlink(missing_ok=True)
        raise


async def ping(base_url: str) -> dict[str, Any]:
    """Test connectivity to the cache server. Returns status dict."""
    try:
        index = await fetch_index(base_url)
        projects = index.get("projects", {})
        return {
            "ok": True,
            "url": base_url,
            "project_count": len(projects),
            "generated_at": index.get("generated_at"),
            "master_db": index.get("master_db", {}),
        }
    except CacheServerError as e:
        return {"ok": False, "url": base_url, "error": str(e)}
