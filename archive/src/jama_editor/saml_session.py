"""Jama web session for downloading inline images from rich-text fields.

Inline images pasted into Jama rich-text editors use web UI URLs
(/attachment/{id}/filename) that require a JSESSIONID cookie — they are
not accessible via the REST API with OAuth tokens.

This module manages a JSESSIONID cookie provided by the user (copied from
browser DevTools). The session is persisted to disk and reused until it
expires (default 8 hours).

How to get the JSESSIONID:
1. Log in to Jama in your browser
2. Press F12 → Application → Cookies → enphase.jamacloud.com
3. Copy the JSESSIONID value
4. Run "Jama: Set Session Cookie" in VS Code and paste it
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

SESSION_FILE = "jama_web_session.json"
SESSION_MAX_AGE_HOURS = 8


class JamaWebSession:
    """Manages a Jama web UI session cookie for image downloads."""

    def __init__(self, jama_url: str, cache_dir: str = "~/.jama-mcp-v2"):
        self._jama_url = jama_url.rstrip("/")
        self._cache_dir = Path(cache_dir).expanduser()
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._session_path = self._cache_dir / SESSION_FILE
        self._cookies: dict[str, str] = {}
        self._authenticated = False
        self._auth_time: float = 0

    @property
    def is_authenticated(self) -> bool:
        if not self._authenticated or not self._cookies.get("JSESSIONID"):
            return False
        elapsed_hours = (time.time() - self._auth_time) / 3600
        return elapsed_hours < SESSION_MAX_AGE_HOURS

    @property
    def cookies(self) -> dict[str, str]:
        return self._cookies.copy()

    def load_persisted_session(self) -> bool:
        """Try to load a previously saved session from disk."""
        if not self._session_path.exists():
            return False
        try:
            data = json.loads(self._session_path.read_text())
            cookies = data.get("cookies", {})
            auth_time = data.get("auth_time", 0)
            elapsed_hours = (time.time() - auth_time) / 3600
            if elapsed_hours >= SESSION_MAX_AGE_HOURS:
                logger.info("Persisted web session expired (%.1f hours old)", elapsed_hours)
                self._session_path.unlink(missing_ok=True)
                return False
            self._cookies = cookies
            self._auth_time = auth_time
            self._authenticated = True
            logger.info("Loaded persisted web session (%.1f hours old)", elapsed_hours)
            return True
        except Exception as e:
            logger.warning("Failed to load persisted session: %s", e)
            return False

    def _persist_session(self) -> None:
        try:
            self._session_path.write_text(json.dumps({
                "cookies": self._cookies,
                "auth_time": self._auth_time,
                "jama_url": self._jama_url,
            }, indent=2))
            logger.info("Persisted web session to %s", self._session_path)
        except Exception as e:
            logger.warning("Failed to persist session: %s", e)

    def set_jsessionid(self, jsessionid: str) -> None:
        """Set the JSESSIONID cookie value provided by the user."""
        self._cookies = {"JSESSIONID": jsessionid.strip()}
        self._authenticated = True
        self._auth_time = time.time()
        self._persist_session()
        logger.info("JSESSIONID set manually, session stored")

    async def validate(self) -> bool:
        """Check if the current session cookie is valid.

        Hits the Jama root URL with no redirects:
        - Valid session   → 302 to /perspective.req (authenticated home)
        - Invalid session → 302 to /login.req or /saml/login
        """
        if not self._cookies.get("JSESSIONID"):
            return False
        try:
            async with httpx.AsyncClient(follow_redirects=False) as client:
                r = await client.get(
                    self._jama_url + "/",
                    cookies=self._cookies,
                    timeout=10,
                )
                location = r.headers.get("location", "")
                valid = r.status_code in (200, 302) and "login" not in location.lower()
                logger.info("Session validate: %d → %s → %s", r.status_code, location, "valid" if valid else "invalid")
                return valid
        except Exception as e:
            logger.warning("Session validation error: %s", e)
            return False

    async def download_web_image(self, attachment_id: int, filename: str = "") -> bytes | None:
        """Download an inline image using the session cookie.

        Args:
            attachment_id: Web UI attachment ID from /attachment/{id}/filename URLs.
            filename: Optional filename for the URL path. Jama requires a filename
                      in the path — /attachment/{id} alone returns 500.

        Returns:
            Image bytes if successful, None otherwise.
        """
        if not self.is_authenticated:
            return None

        # Jama requires a filename in the URL; use the provided one or try common extensions
        filenames = [filename] if filename else ["image.png", "image.jpg", "file.pdf"]
        headers = {"Referer": f"{self._jama_url}/"}

        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                for fname in filenames:
                    url = f"{self._jama_url}/attachment/{attachment_id}/{fname}"
                    r = await client.get(url, cookies=self._cookies, headers=headers, timeout=30)
                    if r.status_code == 200:
                        ct = r.headers.get("content-type", "")
                        if "text/html" in ct and len(r.content) < 2000:
                            logger.warning("Got HTML for attachment %d — session expired?", attachment_id)
                            self._authenticated = False
                            return None
                        return r.content
                # All filenames failed
                logger.debug("Attachment %d: all filename variants failed", attachment_id)
                return None
        except Exception as e:
            logger.error("Error downloading attachment %d: %s", attachment_id, e)
            return None

    async def invalidate(self) -> None:
        self._cookies = {}
        self._authenticated = False
        self._auth_time = 0
        self._session_path.unlink(missing_ok=True)
