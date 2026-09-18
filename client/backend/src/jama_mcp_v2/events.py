"""Global SSE event bus.

Any backend component can push an event:
    from .events import event_bus
    await event_bus.push("active_project_changed", {"project_id": 123, "project_name": "..."})

All connected SSE clients (VS Code extension, web viewer, MCP tools watching
/api/events) receive the event immediately.

Event types:
  active_project_changed  — {project_id, project_name}
  sync_started            — {project_id, project_name}
  sync_progress           — {project_id, percent, message}
  sync_complete           — {project_id, project_name, items}
  sync_error              — {project_id, message}
  item_updated            — {item_id, document_key}  (write-back complete)
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


class EventBus:
    """Singleton pub/sub for SSE.  Thread-safe via asyncio queue per subscriber."""

    def __init__(self) -> None:
        # Each connected SSE client gets its own asyncio.Queue
        self._subscribers: list[asyncio.Queue[str]] = []

    def _subscribe(self) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue(maxsize=50)
        self._subscribers.append(q)
        logger.debug("SSE subscriber added (total=%d)", len(self._subscribers))
        return q

    def _unsubscribe(self, q: asyncio.Queue[str]) -> None:
        try:
            self._subscribers.remove(q)
            logger.debug("SSE subscriber removed (total=%d)", len(self._subscribers))
        except ValueError:
            pass

    async def push(self, event_type: str, data: dict[str, Any]) -> None:
        """Broadcast an event to all connected SSE clients."""
        payload = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
        dead: list[asyncio.Queue[str]] = []
        for q in list(self._subscribers):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                # Slow subscriber — drop and remove
                dead.append(q)
        for q in dead:
            self._unsubscribe(q)
        if self._subscribers:
            logger.debug("Event %r pushed to %d subscribers", event_type, len(self._subscribers))

    async def stream(self):
        """Async generator — yield SSE frames as they arrive.

        Usage (FastAPI route):
            from fastapi.responses import StreamingResponse
            from .events import event_bus

            @app.get("/api/events")
            async def sse_events():
                return StreamingResponse(event_bus.stream(), media_type="text/event-stream",
                                         headers={"Cache-Control": "no-cache",
                                                  "X-Accel-Buffering": "no"})
        """
        q = self._subscribe()
        # Send a heartbeat immediately so the client knows it's connected
        yield "event: connected\ndata: {}\n\n"
        try:
            while True:
                try:
                    # 30-second keepalive heartbeat
                    payload = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield payload
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            self._unsubscribe(q)


# Module-level singleton — import this everywhere
event_bus = EventBus()
