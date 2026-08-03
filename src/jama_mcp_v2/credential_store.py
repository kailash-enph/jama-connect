"""Credential store — OS keyring wrapper for Jama API credentials.

Uses Windows Credential Manager (via ``keyring``) to securely store
OAuth2 client_id and client_secret.  Falls back gracefully when the
``keyring`` package is not installed.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger("jama-mcp-v2")

SERVICE_NAME = "jama-mcp-v2"
_KEY_CLIENT_ID = "client_id"
_KEY_CLIENT_SECRET = "client_secret"


class CredentialStore:
    """Read/write Jama OAuth credentials from the OS keyring."""

    def __init__(self) -> None:
        self._available: bool | None = None

    @property
    def is_available(self) -> bool:
        """True if the ``keyring`` package is importable and functional."""
        if self._available is None:
            try:
                import keyring  # noqa: F401
                self._available = True
            except ImportError:
                self._available = False
                logger.debug("keyring package not installed — credential store unavailable")
        return self._available

    # ------ read ------

    def get_client_id(self) -> str | None:
        if not self.is_available:
            return None
        import keyring
        return keyring.get_password(SERVICE_NAME, _KEY_CLIENT_ID)

    def get_client_secret(self) -> str | None:
        if not self.is_available:
            return None
        import keyring
        return keyring.get_password(SERVICE_NAME, _KEY_CLIENT_SECRET)

    # ------ write ------

    def set_client_id(self, value: str) -> None:
        if not self.is_available:
            raise RuntimeError("keyring package not installed")
        import keyring
        keyring.set_password(SERVICE_NAME, _KEY_CLIENT_ID, value)

    def set_client_secret(self, value: str) -> None:
        if not self.is_available:
            raise RuntimeError("keyring package not installed")
        import keyring
        keyring.set_password(SERVICE_NAME, _KEY_CLIENT_SECRET, value)

    def set_credentials(self, client_id: str, client_secret: str) -> None:
        self.set_client_id(client_id)
        self.set_client_secret(client_secret)

    # ------ delete ------

    def clear(self) -> None:
        if not self.is_available:
            return
        import keyring
        try:
            keyring.delete_password(SERVICE_NAME, _KEY_CLIENT_ID)
        except keyring.errors.PasswordDeleteError:
            pass
        try:
            keyring.delete_password(SERVICE_NAME, _KEY_CLIENT_SECRET)
        except keyring.errors.PasswordDeleteError:
            pass

    # ------ status ------

    @property
    def is_configured(self) -> bool:
        return bool(self.get_client_id() and self.get_client_secret())

    @property
    def source(self) -> str:
        """Return the credential source: 'keyring', 'env', or 'none'."""
        if self.is_configured:
            return "keyring"
        if os.environ.get("JAMA_CLIENT_ID") and os.environ.get("JAMA_CLIENT_SECRET"):
            return "env"
        return "none"

    def resolve(self) -> tuple[str, str] | None:
        """Return (client_id, client_secret) from best available source.

        Priority: keyring → environment variables → None.
        """
        cid = self.get_client_id()
        csec = self.get_client_secret()
        if cid and csec:
            return cid, csec
        cid = os.environ.get("JAMA_CLIENT_ID", "")
        csec = os.environ.get("JAMA_CLIENT_SECRET", "")
        if cid and csec:
            return cid, csec
        return None


# Module-level singleton
credential_store = CredentialStore()
