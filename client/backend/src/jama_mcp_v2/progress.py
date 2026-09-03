"""Progress reporting via Server-Sent Events (SSE) and async event bus."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator

from .models import SyncProgress

logger = logging.getLogger(__name__)


class ProgressBus:
    """Simple async event bus for broadcasting sync progress updates.

    Subscribers receive SyncProgress updates as SSE-formatted strings.
    Multiple consumers can subscribe; each gets their own queue.
    """

    def __init__(self):
        self._subscribers: list[asyncio.Queue[SyncProgress | None]] = []
        self._latest: SyncProgress | None = None

    @property
    def latest(self) -> SyncProgress | None:
        return self._latest

    def publish(self, progress: SyncProgress) -> None:
        """Publish a progress update to all subscribers."""
        self._latest = progress
        for q in self._subscribers:
            try:
                q.put_nowait(progress)
            except asyncio.QueueFull:
                pass  # Drop if subscriber is slow

    async def subscribe(self) -> AsyncIterator[str]:
        """Subscribe to progress events. Yields SSE-formatted strings.

        Usage in FastAPI:
            return EventSourceResponse(progress_bus.subscribe())
        """
        queue: asyncio.Queue[SyncProgress | None] = asyncio.Queue(maxsize=100)
        self._subscribers.append(queue)
        try:
            # Send latest state immediately if available
            if self._latest:
                yield _format_sse(self._latest)

            while True:
                progress = await queue.get()
                if progress is None:
                    break
                yield _format_sse(progress)
        finally:
            self._subscribers.remove(queue)

    def close_all(self) -> None:
        """Signal all subscribers to stop."""
        for q in self._subscribers:
            try:
                q.put_nowait(None)
            except asyncio.QueueFull:
                pass

    def make_callback(self):
        """Create a progress callback function suitable for SyncEngine."""
        def _callback(progress: SyncProgress) -> None:
            self.publish(progress)
        return _callback


def _format_sse(progress: SyncProgress) -> str:
    """Format a SyncProgress as an SSE event string."""
    data = progress.model_dump(mode="json")
    data["progress_pct"] = progress.progress_pct
    return f"data: {json.dumps(data, default=str)}\n\n"
