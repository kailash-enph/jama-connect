"""Shared service registry — single-init singleton for all backend components.

Both the MCP server (stdio) and the REST API (uvicorn) use this registry
so that services are created exactly once per process.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .api_client import JamaApiClient
    from .attachments import AttachmentManager
    from .cache import JamaCache
    from .exporter import Exporter
    from .progress import ProgressBus
    from .search import SearchEngine
    from .sync import SyncEngine
    from .testing import TestManager
    from .writer import Writer

    # Editor-specific (may not be installed in MCP-only mode)
    try:
        from jama_editor.editor_cache import EditorCache
        from jama_editor.schema_sync import SchemaSync
        from jama_editor.saml_session import JamaWebSession
        from jama_editor.editor_attachments import AttachmentManager as EditorAttachmentManager
    except ImportError:
        pass

logger = logging.getLogger("jama-mcp-v2")

# ---------- Load .env if present ----------

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    _env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    if os.path.isfile(_env_path):
        with open(_env_path) as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _k, _, _v = _line.partition("=")
                    if _k.strip() not in os.environ:
                        os.environ[_k.strip()] = _v.strip().strip('"').strip("'")

# ---------- Auto-load credentials from mcp_config.json if env vars are missing ----------

def _load_credentials_from_mcp_config() -> None:
    """Fall back to mcp_config.json for JAMA_CLIENT_ID / JAMA_CLIENT_SECRET.

    Searches known config file locations:
      - Windsurf:  ~/.codeium/windsurf/mcp_config.json
      - Devin:     ~/AppData/Roaming/devin/mcp_config.json  (Windows)
      - Claude:    ~/.config/claude/mcp_config.json
    Loads env vars from the first 'jama-mcp-v2' or 'jama-connect' entry found.
    """
    if os.environ.get("JAMA_CLIENT_ID") and os.environ.get("JAMA_CLIENT_SECRET"):
        return  # Already set, nothing to do

    import json
    from pathlib import Path

    home = Path.home()
    candidates = [
        home / ".codeium" / "windsurf" / "mcp_config.json",
        home / "AppData" / "Roaming" / "devin" / "mcp_config.json",
        home / ".config" / "claude" / "mcp_config.json",
        home / ".cursor" / "mcp.json",
    ]

    for config_path in candidates:
        if not config_path.exists():
            continue
        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
            servers = data.get("mcpServers", data)
            for key in ("jama-mcp-v2", "jama-connect", "jama"):
                entry = servers.get(key, {})
                env = entry.get("env", {})
                if env.get("JAMA_CLIENT_ID") and env.get("JAMA_CLIENT_SECRET"):
                    for k, v in env.items():
                        if k not in os.environ:
                            os.environ[k] = v
                    logger.info("Loaded Jama credentials from %s [%s]", config_path, key)
                    return
        except Exception:
            continue


_load_credentials_from_mcp_config()

# ---------- Settings from env ----------

JAMA_URL = os.environ.get("JAMA_URL", "https://enphase.jamacloud.com")
CLIENT_ID = os.environ.get("JAMA_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("JAMA_CLIENT_SECRET", "")
CACHE_DIR = os.environ.get("JAMA_CACHE_DIR", "~/.jama-mcp-v2")
REST_PORT = int(os.environ.get("JAMA_REST_PORT", "8765"))
MAX_CONCURRENT = int(os.environ.get("JAMA_MAX_CONCURRENT", "10"))


class ServiceRegistry:
    """Singleton holding all initialized service instances."""

    def __init__(self) -> None:
        # --- MCP / Viewer services ---
        self.api_client: JamaApiClient | None = None
        self.cache: JamaCache | None = None
        self.sync_engine: SyncEngine | None = None
        self.test_manager: TestManager | None = None
        self.writer: Writer | None = None
        self.exporter: Exporter | None = None
        self.search_engine: SearchEngine | None = None
        self.attachment_mgr: AttachmentManager | None = None
        self.progress_bus: ProgressBus | None = None
        self.session_cookie: str = ""  # Browser JSESSIONID for SAML-protected downloads

        # --- Editor services ---
        self.editor_cache: EditorCache | None = None
        self.schema_sync: SchemaSync | None = None
        self.editor_attachment_mgr: EditorAttachmentManager | None = None
        self.web_session: JamaWebSession | None = None
        self.image_cache_dir: str = ""
        self.prefetch_task: asyncio.Task | None = None

        # --- State ---
        self._mcp_initialized = False
        self._editor_initialized = False
        self._start_time: float | None = None

    @property
    def is_mcp_initialized(self) -> bool:
        return self._mcp_initialized

    @property
    def is_editor_initialized(self) -> bool:
        return self._editor_initialized

    @property
    def uptime_seconds(self) -> float:
        if self._start_time is None:
            return 0.0
        import time
        return time.time() - self._start_time

    async def init_mcp_services(self) -> None:
        """Initialize core MCP/Viewer services (API client, cache, sync, etc.)."""
        if self._mcp_initialized:
            logger.info("MCP services already initialized, skipping")
            return

        # Resolve credentials: keyring → env vars → error
        from .credential_store import credential_store
        resolved = credential_store.resolve()
        if resolved:
            cid, csec = resolved
            logger.info("Credentials resolved from: %s", credential_store.source)
        elif CLIENT_ID and CLIENT_SECRET:
            cid, csec = CLIENT_ID, CLIENT_SECRET
            logger.info("Credentials resolved from: env")
        else:
            logger.error("No Jama credentials found (checked: keyring, env vars)")
            raise ValueError("Missing Jama OAuth credentials — configure via /settings/credentials or env vars")

        from .api_client import JamaApiClient
        from .attachments import AttachmentManager
        from .cache import JamaCache
        from .exporter import Exporter
        from .progress import ProgressBus
        from .search import SearchEngine
        from .sync import SyncEngine
        from .testing import TestManager
        from .writer import Writer

        self.api_client = JamaApiClient(JAMA_URL, cid, csec, max_concurrent=MAX_CONCURRENT)
        await self.api_client.open()

        self.cache = JamaCache(CACHE_DIR)
        await self.cache.open()

        self.sync_engine = SyncEngine(self.api_client, self.cache)
        self.test_manager = TestManager(self.api_client, self.cache)
        self.writer = Writer(self.api_client, self.cache)
        self.exporter = Exporter(self.cache)
        self.search_engine = SearchEngine(self.cache)
        self.attachment_mgr = AttachmentManager(self.api_client, self.cache, CACHE_DIR)
        self.progress_bus = ProgressBus()

        self._mcp_initialized = True
        if self._start_time is None:
            import time
            self._start_time = time.time()

        logger.info("MCP services initialized: API=%s, Cache=%s", JAMA_URL, self.cache.db_path)

    async def init_editor_services(self) -> None:
        """Initialize editor-specific services (drafts, schema, web session, image proxy)."""
        if self._editor_initialized:
            logger.info("Editor services already initialized, skipping")
            return

        # Editor services require MCP services to be initialized first
        if not self._mcp_initialized:
            await self.init_mcp_services()

        from jama_editor.editor_cache import EditorCache
        from jama_editor.schema_sync import SchemaSync
        from jama_editor.saml_session import JamaWebSession
        from jama_editor.editor_attachments import AttachmentManager as EditorAttachmentManager

        self.editor_cache = EditorCache(CACHE_DIR)
        await self.editor_cache.open()

        self.schema_sync = SchemaSync(self.api_client)
        self.editor_attachment_mgr = EditorAttachmentManager(self.api_client, self.editor_cache, CACHE_DIR)

        self.web_session = JamaWebSession(JAMA_URL, CACHE_DIR)
        self.image_cache_dir = os.path.join(os.path.expanduser(CACHE_DIR), "image_cache")
        os.makedirs(self.image_cache_dir, exist_ok=True)

        # Try to load a previously persisted web session
        self.web_session.load_persisted_session()
        if self.web_session.is_authenticated:
            logger.info("Loaded persisted web session for image downloads")

        self._editor_initialized = True
        logger.info("Editor services initialized: EditorDB=%s", self.editor_cache.db_path)

    async def init_all(self) -> None:
        """Initialize both MCP and editor services."""
        await self.init_mcp_services()
        await self.init_editor_services()

    async def shutdown_all(self) -> None:
        """Gracefully shut down all services."""
        if self.api_client:
            await self.api_client.close()
            self.api_client = None
        if self.cache:
            await self.cache.close()
            self.cache = None
        if self.editor_cache:
            await self.editor_cache.close()
            self.editor_cache = None
        if self.prefetch_task and not self.prefetch_task.done():
            self.prefetch_task.cancel()
            self.prefetch_task = None
        self.web_session = None
        self.schema_sync = None
        self.editor_attachment_mgr = None
        self.sync_engine = None
        self.test_manager = None
        self.writer = None
        self.exporter = None
        self.search_engine = None
        self.attachment_mgr = None
        self._mcp_initialized = False
        self._editor_initialized = False
        logger.info("All services shut down")


# Module-level singleton
services = ServiceRegistry()
