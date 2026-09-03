"""Server-Sent Events helpers using sse-starlette.

Replaces the 3+ copies of:
    return StreamingResponse(_gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

with a single call to `sse_response(gen)`.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator

from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
}


def sse_response(generator: AsyncIterator[dict[str, Any]]) -> EventSourceResponse:
    """Wrap an async generator of dicts in a properly configured SSE response.

    Each dict from the generator is JSON-serialised as the event data.
    Client disconnect is handled by sse-starlette (generator is cancelled).
    """

    async def _wrapper():
        async for item in generator:
            yield {"data": json.dumps(item)}

    return EventSourceResponse(_wrapper(), headers=_SSE_HEADERS)


class SseQueue:
    """Async queue bridge: put events from one coroutine, stream to client.

    Usage (FastAPI endpoint):
        bus = SseQueue()
        asyncio.create_task(_my_background_task(bus))
        return sse_response(bus.stream())

    The background task calls `bus.put_nowait({"phase": "..."})`
    and `bus.close()` when done.
    """

    _SENTINEL = object()

    def __init__(self, maxsize: int = 256) -> None:
        self._q: asyncio.Queue[Any] = asyncio.Queue(maxsize=maxsize)
        self._closed = False

    def put_nowait(self, data: dict[str, Any]) -> None:
        """Push an event onto the queue (non-blocking)."""
        if self._closed:
            return
        try:
            self._q.put_nowait(data)
        except asyncio.QueueFull:
            logger.warning("SseQueue full — dropping event: %s", data)

    def close(self) -> None:
        """Signal end-of-stream to the consumer."""
        if not self._closed:
            self._closed = True
            try:
                self._q.put_nowait(self._SENTINEL)
            except asyncio.QueueFull:
                pass

    async def stream(self) -> AsyncIterator[dict[str, Any]]:
        """Async generator yielding queued events until close() is called."""
        while True:
            item = await self._q.get()
            if item is self._SENTINEL:
                return
            yield item
