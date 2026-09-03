"""Async Jama Connect REST API client using httpx with OAuth2 client_credentials."""

from __future__ import annotations

import asyncio
import logging
import mimetypes
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class JamaApiError(Exception):
    """Raised when the Jama API returns an error."""

    def __init__(self, status_code: int, message: str, url: str = ""):
        self.status_code = status_code
        self.url = url
        super().__init__(f"Jama API {status_code}: {message} [{url}]")


class JamaApiClient:
    """Async wrapper for Jama Connect REST API v1.

    Features:
      - OAuth2 client_credentials token with auto-refresh
      - Concurrency limiter (asyncio.Semaphore)
      - Exponential backoff on 429 rate-limit
      - Generic paginated GET helper
    """

    TOKEN_URL_SUFFIX = "/rest/oauth/token"
    API_PREFIX = "/rest/v1"

    def __init__(
        self,
        base_url: str,
        client_id: str,
        client_secret: str,
        max_concurrent: int = 10,
        timeout: float = 60.0,
    ):
        self._base_url = base_url.rstrip("/")
        self._client_id = client_id
        self._client_secret = client_secret
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._timeout = timeout

        self._access_token: str | None = None
        self._token_expires_at: float = 0.0

        self._http: httpx.AsyncClient | None = None

    # ---------- Lifecycle ----------

    async def open(self) -> None:
        """Create the underlying httpx client and acquire an initial token."""
        self._http = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=httpx.Timeout(self._timeout, connect=15.0),
            follow_redirects=True,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
        await self._refresh_token()

    async def close(self) -> None:
        if self._http:
            await self._http.aclose()
            self._http = None

    async def __aenter__(self) -> "JamaApiClient":
        await self.open()
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.close()

    # ---------- Token ----------

    async def _refresh_token(self) -> None:
        """Obtain or refresh the OAuth2 access token."""
        assert self._http is not None
        resp = await self._http.post(
            self.TOKEN_URL_SUFFIX,
            data={"grant_type": "client_credentials"},
            auth=(self._client_id, self._client_secret),
            timeout=30.0,
        )
        resp.raise_for_status()
        data = resp.json()
        self._access_token = data["access_token"]
        expires_in = data.get("expires_in", 3600)
        self._token_expires_at = time.time() + expires_in - 60  # refresh 60s early
        logger.info("Jama OAuth token acquired, expires in %ds", expires_in)

    async def _ensure_token(self) -> str:
        if not self._access_token or time.time() >= self._token_expires_at:
            await self._refresh_token()
        return self._access_token  # type: ignore[return-value]

    def _auth_headers(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    # ---------- Low-level request ----------

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: Any = None,
        max_retries: int = 3,
    ) -> httpx.Response:
        """Execute an API request with semaphore, auth, and retry on 429."""
        assert self._http is not None
        url = f"{self.API_PREFIX}{path}"
        token = await self._ensure_token()

        for attempt in range(max_retries):
            async with self._semaphore:
                resp = await self._http.request(
                    method,
                    url,
                    params=params,
                    json=json_body,
                    headers=self._auth_headers(token),
                )

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", str(2 ** attempt)))
                logger.warning("Rate-limited (429), retrying in %ds (attempt %d/%d)", retry_after, attempt + 1, max_retries)
                await asyncio.sleep(retry_after)
                token = await self._ensure_token()
                continue

            if resp.status_code == 401:
                logger.warning("Unauthorized (401), refreshing token")
                await self._refresh_token()
                token = self._access_token  # type: ignore[assignment]
                continue

            if resp.status_code >= 400:
                body = resp.text[:500]
                raise JamaApiError(resp.status_code, body, str(resp.url))

            return resp

        raise JamaApiError(429, f"Rate-limited after {max_retries} retries", url)

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = await self._request("GET", path, params=params)
        return resp.json()

    async def _post(self, path: str, json_body: Any = None) -> Any:
        resp = await self._request("POST", path, json_body=json_body)
        return resp.json()

    async def _put(self, path: str, json_body: Any = None) -> Any:
        resp = await self._request("PUT", path, json_body=json_body)
        if resp.status_code == 204 or not resp.content:
            return {}
        return resp.json()

    async def _patch(self, path: str, json_body: Any = None) -> Any:
        resp = await self._request("PATCH", path, json_body=json_body)
        if resp.status_code == 204 or not resp.content:
            return {}
        return resp.json()

    async def _delete(self, path: str) -> Any:
        resp = await self._request("DELETE", path)
        if resp.status_code == 204:
            return None
        return resp.json()

    async def _post_multipart(
        self,
        path: str,
        *,
        files: dict[str, Any],
        data: dict[str, Any] | None = None,
        max_retries: int = 3,
    ) -> Any:
        """POST multipart/form-data (for attachment uploads)."""
        assert self._http is not None
        url = f"{self.API_PREFIX}{path}"
        token = await self._ensure_token()

        for attempt in range(max_retries):
            headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
            async with self._semaphore:
                resp = await self._http.post(
                    url,
                    files=files,
                    data=data or {},
                    headers=headers,
                )

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", str(2 ** attempt)))
                logger.warning("Rate-limited (429), retrying in %ds", retry_after, attempt + 1, max_retries)
                await asyncio.sleep(retry_after)
                token = await self._ensure_token()
                continue

            if resp.status_code == 401:
                await self._refresh_token()
                token = self._access_token  # type: ignore[assignment]
                continue

            if resp.status_code >= 400:
                body = resp.text[:500]
                raise JamaApiError(resp.status_code, body, str(resp.url))

            return resp.json()

        raise JamaApiError(429, f"Rate-limited after {max_retries} retries", url)

    # ---------- Pagination ----------

    async def _get_all_pages(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        max_results: int | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch all pages of a paginated endpoint.

        Jama pagination uses `startAt` and `maxResults` (default 20, max 50).
        Strategy: fetch page 0 to learn totalResults, then fire all remaining
        pages concurrently (bounded by the semaphore).
        """
        page_size = 50
        p = dict(params or {})
        p["maxResults"] = page_size
        p["startAt"] = 0

        # First page — learn total
        data = await self._get(path, params=p)
        page_info = data.get("meta", {}).get("pageInfo", {})
        first_items = data.get("data", [])
        total = page_info.get("totalResults", len(first_items))

        if max_results:
            total = min(total, max_results)

        if len(first_items) >= total:
            return first_items[:total]

        # Fire remaining pages concurrently
        offsets = list(range(page_size, total, page_size))
        logger.info("Parallel fetch %s: %d items across %d pages (concurrency=%d)",
                     path, total, len(offsets) + 1, self._semaphore._value)

        async def _fetch_page(offset: int) -> list[dict[str, Any]]:
            pp = dict(params or {})
            pp["maxResults"] = page_size
            pp["startAt"] = offset
            d = await self._get(path, params=pp)
            return d.get("data", [])

        page_results = await asyncio.gather(*[_fetch_page(o) for o in offsets])

        results = list(first_items)
        for page_items in page_results:
            results.extend(page_items)

        return results[:total]

    # ---------- Projects ----------

    async def get_projects(self) -> list[dict[str, Any]]:
        return await self._get_all_pages("/projects")

    async def get_project(self, project_id: int) -> dict[str, Any]:
        data = await self._get(f"/projects/{project_id}")
        return data.get("data", data)

    # ---------- Items ----------

    async def get_items(self, project_id: int, max_results: int | None = None) -> list[dict[str, Any]]:
        return await self._get_all_pages(
            "/items",
            params={"project": project_id},
            max_results=max_results,
        )

    async def get_item(self, item_id: int) -> dict[str, Any]:
        data = await self._get(f"/items/{item_id}")
        return data.get("data", data)

    async def get_item_children(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/children")

    async def get_item_parent(self, item_id: int) -> dict[str, Any]:
        data = await self._get(f"/items/{item_id}/parent")
        return data.get("data", data)

    # ---------- Item Activities ----------

    async def get_item_activities(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/activities")

    # ---------- Item Links (hyperlinks) ----------

    async def get_item_links(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/links")

    async def get_item_link(self, item_id: int, link_id: int) -> dict[str, Any]:
        data = await self._get(f"/items/{item_id}/links/{link_id}")
        return data.get("data", data)

    async def create_item_link(self, item_id: int, url: str, description: str = "") -> dict[str, Any]:
        body: dict[str, Any] = {"url": url}
        if description:
            body["description"] = description
        data = await self._post(f"/items/{item_id}/links", json_body=body)
        return data.get("data", data)

    async def update_item_link(self, item_id: int, link_id: int, url: str, description: str = "") -> dict[str, Any]:
        body: dict[str, Any] = {"url": url}
        if description:
            body["description"] = description
        data = await self._put(f"/items/{item_id}/links/{link_id}", json_body=body)
        return data.get("data", data)

    async def delete_item_link(self, item_id: int, link_id: int) -> None:
        await self._delete(f"/items/{item_id}/links/{link_id}")

    # ---------- Item Tags ----------

    async def get_item_tags(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/tags")

    async def get_item_tag(self, item_id: int, tag_id: int) -> dict[str, Any]:
        data = await self._get(f"/items/{item_id}/tags/{tag_id}")
        return data.get("data", data)

    async def add_item_tag(self, item_id: int, tag_id: int) -> dict[str, Any]:
        body = {"tag": tag_id}
        data = await self._post(f"/items/{item_id}/tags", json_body=body)
        return data.get("data", data)

    async def remove_item_tag(self, item_id: int, tag_id: int) -> None:
        await self._delete(f"/items/{item_id}/tags/{tag_id}")

    # ---------- Item Lock ----------

    async def get_item_lock(self, item_id: int) -> dict[str, Any]:
        data = await self._get(f"/items/{item_id}/lock")
        return data.get("data", data)

    async def set_item_lock(self, item_id: int, locked: bool) -> dict[str, Any]:
        body = {"locked": locked}
        data = await self._put(f"/items/{item_id}/lock", json_body=body)
        return data.get("data", data)

    # ---------- Item Location ----------

    async def get_item_location(self, item_id: int) -> dict[str, Any]:
        data = await self._get(f"/items/{item_id}/location")
        return data.get("data", data)

    async def set_item_location(self, item_id: int, parent_item: int | None = None,
                                parent_project: int | None = None) -> dict[str, Any]:
        parent: dict[str, Any] = {}
        if parent_item is not None:
            parent["item"] = parent_item
        if parent_project is not None:
            parent["project"] = parent_project
        body = {"parent": parent}
        data = await self._put(f"/items/{item_id}/location", json_body=body)
        return data.get("data", data)

    async def batch_set_tree_location(self, locations: list[dict[str, Any]]) -> dict[str, Any]:
        """PUT /items/treeLocation — batch move items in tree."""
        data = await self._put("/items/treeLocation", json_body=locations)
        return data.get("data", data)

    # ---------- Item Duplicate ----------

    async def duplicate_item(self, item_id: int, include_children: bool = False) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if include_children:
            body["includeChildren"] = True
        data = await self._post(f"/items/{item_id}/duplicate", json_body=body)
        return data.get("data", data)

    # ---------- Item Synced Items ----------

    async def get_synced_items(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/synceditems")

    async def add_synced_item(self, item_id: int, synced_item_id: int) -> dict[str, Any]:
        body = {"item": synced_item_id}
        data = await self._post(f"/items/{item_id}/synceditems", json_body=body)
        return data.get("data", data)

    async def remove_synced_item(self, item_id: int, synced_item_id: int) -> None:
        await self._delete(f"/items/{item_id}/synceditems/{synced_item_id}")

    async def get_synced_item_status(self, item_id: int, synced_item_id: int) -> dict[str, Any]:
        data = await self._get(f"/items/{item_id}/synceditems/{synced_item_id}/syncstatus")
        return data.get("data", data)

    # ---------- Item Categories ----------

    async def get_item_categories(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/categories")

    async def set_item_categories(self, item_id: int, categories: list[dict[str, Any]]) -> dict[str, Any]:
        data = await self._post(f"/items/{item_id}/categories", json_body=categories)
        return data.get("data", data)

    async def remove_item_categories(self, item_id: int) -> None:
        await self._delete(f"/items/{item_id}/categories")

    async def get_item_baselined_categories(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/baselinedcategories")

    async def get_item_versioned_categories(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/versionedcategories")

    # ---------- Item Attachments (link/unlink existing) ----------

    async def link_attachment_to_item(self, item_id: int, attachment_id: int) -> dict[str, Any]:
        body = {"attachment": attachment_id}
        data = await self._post(f"/items/{item_id}/attachments", json_body=body)
        return data.get("data", data)

    async def unlink_attachment_from_item(self, item_id: int, attachment_id: int) -> None:
        await self._delete(f"/items/{item_id}/attachments/{attachment_id}")

    # ---------- Workflow Transitions ----------

    async def get_workflow_transition_options(self, item_id: int) -> list[dict[str, Any]]:
        data = await self._get(f"/items/{item_id}/workflowtransitionoptions")
        return data.get("data", [])

    async def execute_workflow_transition(self, item_id: int, transition_id: str,
                                          comment: str = "") -> dict[str, Any]:
        body: dict[str, Any] = {"transitionId": transition_id}
        if comment:
            body["comment"] = comment
        data = await self._post(f"/items/{item_id}/workflowtransitions", json_body=body)
        return data.get("data", data)

    # ---------- Bulk Item Operations ----------

    async def bulk_patch_items(self, patches: list[dict[str, Any]]) -> dict[str, Any]:
        """PATCH /items — bulk patch multiple items."""
        data = await self._patch("/items", json_body=patches)
        return data.get("data", data)

    # ---------- Versions ----------

    async def get_item_versions(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/versions")

    async def get_item_version(self, item_id: int, version: int) -> dict[str, Any]:
        data = await self._get(f"/items/{item_id}/versions/{version}")
        return data.get("data", data)

    async def get_item_at_version(self, item_id: int, version: int) -> dict[str, Any]:
        data = await self._get(f"/items/{item_id}/versions/{version}/versioneditem")
        return data.get("data", data)

    # ---------- Abstract Items (batch version check for delta sync) ----------

    async def get_abstract_items(
        self,
        project_id: int,
        item_type: list[int] | None = None,
        modified_since: str | None = None,
        max_results: int | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"project": project_id}
        if item_type:
            params["itemType"] = ",".join(str(t) for t in item_type)
        if modified_since:
            params["modifiedDate"] = f"$gte:{modified_since}"
        return await self._get_all_pages("/abstractitems", params=params, max_results=max_results)

    async def get_abstract_item(self, item_id: int) -> dict[str, Any]:
        data = await self._get(f"/abstractitems/{item_id}")
        return data.get("data", data)

    async def get_abstract_item_versions(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/abstractitems/{item_id}/versions")

    async def get_abstract_item_version(self, item_id: int, version: int) -> dict[str, Any]:
        data = await self._get(f"/abstractitems/{item_id}/versions/{version}")
        return data.get("data", data)

    async def get_abstract_item_at_version(self, item_id: int, version: int) -> dict[str, Any]:
        data = await self._get(f"/abstractitems/{item_id}/versions/{version}/versioneditem")
        return data.get("data", data)

    async def get_abstract_item_versioned_relationships(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/abstractitems/{item_id}/versionedrelationships")

    # ---------- Relationships ----------

    async def get_relationships(self, project_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages("/relationships", params={"project": project_id})

    async def get_item_upstream_relationships(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/upstreamrelationships")

    async def get_item_downstream_relationships(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/downstreamrelationships")

    async def create_relationship(
        self,
        from_item: int,
        to_item: int,
        relationship_type_id: int | None = None,
    ) -> dict[str, Any]:
        """Create a relationship between two items.

        Args:
            from_item: Source (upstream) item ID.
            to_item: Target (downstream) item ID.
            relationship_type_id: Optional relationship type ID. If None, uses the
                                  project default.
        """
        body: dict[str, Any] = {
            "fromItem": from_item,
            "toItem": to_item,
        }
        if relationship_type_id is not None:
            body["relationshipType"] = relationship_type_id
        data = await self._post("/relationships", json_body=body)
        return data.get("data", data)

    async def delete_relationship(self, relationship_id: int) -> None:
        """Delete a relationship by ID."""
        await self._delete(f"/relationships/{relationship_id}")

    async def get_relationship_types(self) -> list[dict[str, Any]]:
        """Get all relationship types available in the workspace."""
        return await self._get_all_pages("/relationshiptypes")

    async def get_item_upstream_related(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/upstreamrelated")

    async def get_item_downstream_related(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/downstreamrelated")

    # ---------- Attachments ----------

    async def get_item_attachments(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/attachments")

    async def upload_attachment(
        self,
        item_id: int,
        file_name: str,
        file_content: bytes,
        description: str = "",
    ) -> dict[str, Any]:
        """Upload a file attachment to an item.

        Jama attachment upload is a two-step process:
        1. POST /items/{id}/attachments with metadata → get attachment ID
        2. PUT /attachments/{id}/file with the binary content
        """
        # Step 1: Create attachment metadata
        body: dict[str, Any] = {"fields": {"name": file_name}}
        if description:
            body["fields"]["description"] = description
        data = await self._post(f"/items/{item_id}/attachments", json_body=body)
        att_meta = data.get("data", data)

        # Extract attachment ID from response
        att_id = att_meta.get("id")
        if not att_id:
            # Jama may return the ID in a headers/location pattern
            location = data.get("headers", {}).get("location", "")
            if location:
                att_id = int(location.rstrip("/").rsplit("/", 1)[-1])
            else:
                raise JamaApiError(500, f"Could not extract attachment ID from response: {data}", f"/items/{item_id}/attachments")

        # Step 2: Upload the file binary
        content_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
        files = {"file": (file_name, file_content, content_type)}
        upload_resp = await self._post_multipart(f"/attachments/{att_id}/file", files=files)

        return {"attachment_id": att_id, "file_name": file_name, "meta": att_meta, "upload": upload_resp}

    async def download_attachment(self, attachment_id: int) -> bytes:
        """Download attachment binary content via /attachments/{id}/file."""
        assert self._http is not None
        token = await self._ensure_token()
        url = f"{self.API_PREFIX}/attachments/{attachment_id}/file"
        headers = {"Authorization": f"Bearer {token}", "Accept": "*/*"}
        async with self._semaphore:
            resp = await self._http.get(
                url,
                headers=headers,
                follow_redirects=True,
            )
        resp.raise_for_status()
        return resp.content

    async def download_file(self, file_id: int) -> bytes:
        """Download an embedded/inline image via /files/{id} endpoint."""
        assert self._http is not None
        token = await self._ensure_token()
        url = f"{self.API_PREFIX}/files/{file_id}"
        headers = {"Authorization": f"Bearer {token}", "Accept": "*/*"}
        async with self._semaphore:
            resp = await self._http.get(
                url,
                headers=headers,
                follow_redirects=True,
            )
        resp.raise_for_status()
        return resp.content

    async def download_url(self, url: str) -> bytes:
        """Download from any Jama URL using OAuth bearer token (for web UI URLs)."""
        assert self._http is not None
        token = await self._ensure_token()
        headers = {"Authorization": f"Bearer {token}", "Accept": "*/*"}
        async with self._semaphore:
            resp = await self._http.get(
                url,
                headers=headers,
                follow_redirects=True,
            )
        resp.raise_for_status()
        return resp.content

    # ---------- Attachment Operations ----------

    async def get_attachment(self, attachment_id: int) -> dict[str, Any]:
        data = await self._get(f"/attachments/{attachment_id}")
        return data.get("data", data)

    async def get_attachment_comments(self, attachment_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/attachments/{attachment_id}/comments")

    async def get_attachment_lock(self, attachment_id: int) -> dict[str, Any]:
        data = await self._get(f"/attachments/{attachment_id}/lock")
        return data.get("data", data)

    async def set_attachment_lock(self, attachment_id: int, locked: bool) -> dict[str, Any]:
        body = {"locked": locked}
        data = await self._put(f"/attachments/{attachment_id}/lock", json_body=body)
        return data.get("data", data)

    async def get_attachment_versions(self, attachment_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/attachments/{attachment_id}/versions")

    async def get_attachment_version(self, attachment_id: int, version: int) -> dict[str, Any]:
        data = await self._get(f"/attachments/{attachment_id}/versions/{version}")
        return data.get("data", data)

    async def get_attachment_at_version(self, attachment_id: int, version: int) -> dict[str, Any]:
        data = await self._get(f"/attachments/{attachment_id}/versions/{version}/versioneditem")
        return data.get("data", data)

    async def replace_attachment_file(self, attachment_id: int, file_name: str,
                                       file_content: bytes) -> dict[str, Any]:
        content_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
        files = {"file": (file_name, file_content, content_type)}
        return await self._post_multipart(f"/attachments/{attachment_id}/file", files=files)

    # ---------- Relationship Type (single) ----------

    async def get_relationship_type(self, type_id: int) -> dict[str, Any]:
        data = await self._get(f"/relationshiptypes/{type_id}")
        return data.get("data", data)

    # ---------- Activities ----------

    async def get_activities(self, project_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages("/activities", params={"project": project_id})

    async def get_activity(self, activity_id: int) -> dict[str, Any]:
        data = await self._get(f"/activities/{activity_id}")
        return data.get("data", data)

    async def get_admin_activity(self) -> list[dict[str, Any]]:
        return await self._get_all_pages("/activities/adminActivity")

    async def get_activity_affected_items(self, activity_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/activities/{activity_id}/affecteditems")

    async def restore_activity(self, activity_id: int) -> dict[str, Any]:
        data = await self._post(f"/activities/{activity_id}/restore")
        return data.get("data", data)

    # ---------- Baselines ----------

    async def get_baselines(self, project_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages("/baselines", params={"project": project_id})

    async def get_baseline(self, baseline_id: int) -> dict[str, Any]:
        data = await self._get(f"/baselines/{baseline_id}")
        return data.get("data", data)

    async def update_baseline(self, baseline_id: int, fields: dict[str, Any]) -> dict[str, Any]:
        data = await self._put(f"/baselines/{baseline_id}", json_body=fields)
        return data.get("data", data)

    async def delete_baseline(self, baseline_id: int) -> None:
        await self._delete(f"/baselines/{baseline_id}")

    async def get_baseline_versioned_items(self, baseline_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/baselines/{baseline_id}/versioneditems")

    async def get_baseline_versioned_item(self, baseline_id: int, item_id: int) -> dict[str, Any]:
        data = await self._get(f"/baselines/{baseline_id}/versioneditems/{item_id}")
        return data.get("data", data)

    async def get_baseline_versioned_relationships(self, baseline_id: int,
                                                     item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(
            f"/baselines/{baseline_id}/versioneditems/{item_id}/versionedrelationships"
        )

    async def get_baseline_review_link(self, baseline_id: int) -> dict[str, Any]:
        data = await self._get(f"/baselines/{baseline_id}/reviewlink")
        return data.get("data", data)

    # ---------- Categories ----------

    async def get_categories(self, project_id: int | None = None,
                              category_name: str | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if project_id is not None:
            params["projectId"] = project_id
        if category_name is not None:
            params["categoryName"] = category_name
        return await self._get_all_pages("/categories", params=params)

    async def create_category(self, path: str) -> dict[str, Any]:
        data = await self._post("/categories", json_body={"path": path})
        return data.get("data", data)

    async def update_category_visibility(self, category_path_id: int,
                                          visible: bool) -> dict[str, Any]:
        body = {"visible": visible}
        data = await self._put(f"/categories/{category_path_id}/visibility", json_body=body)
        return data.get("data", data)

    # ---------- Comments (standalone) ----------

    async def create_comment(self, body_text: str, item_id: int | None = None,
                              in_reply_to: int | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"body": {"text": body_text}}
        if item_id is not None:
            body["location"] = {"item": item_id}
        if in_reply_to is not None:
            body["inReplyTo"] = in_reply_to
        data = await self._post("/comments", json_body=body)
        return data.get("data", data)

    async def get_comment(self, comment_id: int) -> dict[str, Any]:
        data = await self._get(f"/comments/{comment_id}")
        return data.get("data", data)

    async def get_comments(self, root_comments_only: bool = False) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if root_comments_only:
            params["rootCommentsOnly"] = True
        return await self._get_all_pages("/comments", params=params)

    async def get_comment_replies(self, comment_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/comments/{comment_id}/replies")

    # ---------- Projects (CRUD) ----------

    async def create_project(self, fields: dict[str, Any]) -> dict[str, Any]:
        data = await self._post("/projects", json_body={"fields": fields})
        return data.get("data", data)

    async def update_project(self, project_id: int, fields: dict[str, Any]) -> dict[str, Any]:
        data = await self._put(f"/projects/{project_id}", json_body={"fields": fields})
        return data.get("data", data)

    async def get_project_tags(self, project_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/projects/{project_id}/tags")

    async def add_project_attachment(self, project_id: int, attachment_id: int) -> dict[str, Any]:
        body = {"attachment": attachment_id}
        data = await self._post(f"/projects/{project_id}/attachments", json_body=body)
        return data.get("data", data)

    async def add_project_item_type(self, project_id: int, item_type_id: int) -> dict[str, Any]:
        data = await self._put(f"/projects/{project_id}/itemtypes/{item_type_id}")
        return data.get("data", data)

    async def remove_project_item_type(self, project_id: int, item_type_id: int) -> None:
        await self._delete(f"/projects/{project_id}/itemtypes/{item_type_id}")

    # ---------- Relationship Rule Sets ----------

    async def get_relationship_rulesets(self) -> list[dict[str, Any]]:
        return await self._get_all_pages("/relationshiprulesets")

    async def get_relationship_ruleset(self, ruleset_id: int) -> dict[str, Any]:
        data = await self._get(f"/relationshiprulesets/{ruleset_id}")
        return data.get("data", data)

    async def get_relationship_ruleset_projects(self, ruleset_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/relationshiprulesets/{ruleset_id}/projects")

    # ---------- Releases ----------

    async def get_releases(self, project_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages("/releases", params={"project": project_id})

    async def get_release(self, release_id: int) -> dict[str, Any]:
        data = await self._get(f"/releases/{release_id}")
        return data.get("data", data)

    async def create_release(self, project_id: int, fields: dict[str, Any]) -> dict[str, Any]:
        body: dict[str, Any] = {"project": project_id, "fields": fields}
        data = await self._post("/releases", json_body=body)
        return data.get("data", data)

    async def update_release(self, release_id: int, fields: dict[str, Any]) -> dict[str, Any]:
        data = await self._put(f"/releases/{release_id}", json_body={"fields": fields})
        return data.get("data", data)

    # ---------- System Settings ----------

    async def get_cors_domains(self) -> list[dict[str, Any]]:
        data = await self._get("/system/settings/corsdomains")
        return data.get("data", [])

    async def add_cors_domain(self, domain: str) -> dict[str, Any]:
        data = await self._post("/system/settings/corsdomains", json_body={"domain": domain})
        return data.get("data", data)

    # ---------- Review Center (Labs API — read-only) ----------

    LABS_PREFIX = "/rest/labs"

    async def _labs_get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        """GET request against the Jama Labs API (different prefix from /rest/v1)."""
        assert self._http is not None
        token = await self._ensure_token()
        url = f"{self._base_url}{self.LABS_PREFIX}{path}"
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        async with self._semaphore:
            resp = await self._http.get(url, headers=headers, params=params,
                                         follow_redirects=True)
        resp.raise_for_status()
        return resp.json()

    async def get_reviews(self, project_id: int) -> list[dict[str, Any]]:
        data = await self._labs_get("/reviews", params={"project": project_id})
        return data.get("data", [])

    async def get_review(self, review_id: int) -> dict[str, Any]:
        data = await self._labs_get(f"/reviews/{review_id}")
        return data.get("data", data)

    async def get_review_comments(self, review_id: int) -> list[dict[str, Any]]:
        data = await self._labs_get(f"/reviews/{review_id}/comments")
        return data.get("data", [])

    async def get_review_revisions(self, review_id: int) -> list[dict[str, Any]]:
        data = await self._labs_get(f"/reviews/{review_id}/revisions")
        return data.get("data", [])

    async def get_review_revision_participants(self, review_id: int,
                                                revision_id: int) -> list[dict[str, Any]]:
        data = await self._labs_get(f"/reviews/{review_id}/revisions/{revision_id}/participants")
        return data.get("data", [])

    async def get_review_revision_progress(self, review_id: int,
                                            revision_id: int) -> dict[str, Any]:
        data = await self._labs_get(f"/reviews/{review_id}/revisions/{revision_id}/progress")
        return data.get("data", data)

    async def get_review_revision_items(self, review_id: int,
                                         revision_id: int) -> list[dict[str, Any]]:
        data = await self._labs_get(f"/reviews/{review_id}/revisions/{revision_id}/revisionitems")
        return data.get("data", [])

    async def get_review_moderators(self) -> list[dict[str, Any]]:
        data = await self._labs_get("/reviewmoderators")
        return data.get("data", [])

    # ---------- Test Plans ----------

    async def get_test_plans(self, project_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages("/testplans", params={"project": project_id})

    async def get_test_plan(self, plan_id: int) -> dict[str, Any]:
        data = await self._get(f"/testplans/{plan_id}")
        return data.get("data", data)

    async def update_test_plan(self, plan_id: int, fields: dict[str, Any]) -> dict[str, Any]:
        data = await self._put(f"/testplans/{plan_id}", json_body={"fields": fields})
        return data.get("data", data)

    async def patch_test_plan(self, plan_id: int, patches: list[dict[str, Any]]) -> dict[str, Any]:
        data = await self._patch(f"/testplans/{plan_id}", json_body=patches)
        return data.get("data", data)

    async def delete_test_plan(self, plan_id: int) -> None:
        await self._delete(f"/testplans/{plan_id}")

    async def get_test_plan_activities(self, plan_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testplans/{plan_id}/activities")

    async def get_test_plan_attachments(self, plan_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testplans/{plan_id}/attachments")

    async def add_test_plan_attachment(self, plan_id: int, attachment_id: int) -> dict[str, Any]:
        body = {"attachment": attachment_id}
        data = await self._post(f"/testplans/{plan_id}/attachments", json_body=body)
        return data.get("data", data)

    async def remove_test_plan_attachment(self, plan_id: int, attachment_id: int) -> None:
        await self._delete(f"/testplans/{plan_id}/attachments/{attachment_id}")

    async def get_test_plan_links(self, plan_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testplans/{plan_id}/links")

    async def create_test_plan_link(self, plan_id: int, url: str, description: str = "") -> dict[str, Any]:
        body: dict[str, Any] = {"url": url}
        if description:
            body["description"] = description
        data = await self._post(f"/testplans/{plan_id}/links", json_body=body)
        return data.get("data", data)

    async def delete_test_plan_link(self, plan_id: int, link_id: int) -> None:
        await self._delete(f"/testplans/{plan_id}/links/{link_id}")

    async def get_test_plan_tags(self, plan_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testplans/{plan_id}/tags")

    async def add_test_plan_tag(self, plan_id: int, tag_id: int) -> dict[str, Any]:
        body = {"tag": tag_id}
        data = await self._post(f"/testplans/{plan_id}/tags", json_body=body)
        return data.get("data", data)

    async def remove_test_plan_tag(self, plan_id: int, tag_id: int) -> None:
        await self._delete(f"/testplans/{plan_id}/tags/{tag_id}")

    async def get_test_plan_versions(self, plan_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testplans/{plan_id}/versions")

    async def get_test_plan_version(self, plan_id: int, version: int) -> dict[str, Any]:
        data = await self._get(f"/testplans/{plan_id}/versions/{version}")
        return data.get("data", data)

    async def get_test_plan_at_version(self, plan_id: int, version: int) -> dict[str, Any]:
        data = await self._get(f"/testplans/{plan_id}/versions/{version}/versioneditem")
        return data.get("data", data)

    async def get_test_plan_lock(self, plan_id: int) -> dict[str, Any]:
        data = await self._get(f"/testplans/{plan_id}/lock")
        return data.get("data", data)

    async def set_test_plan_lock(self, plan_id: int, locked: bool) -> dict[str, Any]:
        body = {"locked": locked}
        data = await self._put(f"/testplans/{plan_id}/lock", json_body=body)
        return data.get("data", data)

    # ---------- Test Groups ----------

    async def get_test_groups(self, plan_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testplans/{plan_id}/testgroups")

    async def get_test_group(self, group_id: int) -> dict[str, Any]:
        data = await self._get(f"/testgroups/{group_id}")
        return data.get("data", data)

    async def get_test_group_test_cases(self, group_id: int) -> list[dict[str, Any]]:
        """Get the test cases within a specific test group."""
        return await self._get_all_pages(f"/testgroups/{group_id}/testcases")

    # ---------- Test Cycles ----------

    async def get_test_cycles(self, plan_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testplans/{plan_id}/testcycles")

    async def get_test_cycle(self, cycle_id: int) -> dict[str, Any]:
        data = await self._get(f"/testcycles/{cycle_id}")
        return data.get("data", data)

    async def update_test_cycle(self, cycle_id: int, fields: dict[str, Any]) -> dict[str, Any]:
        data = await self._put(f"/testcycles/{cycle_id}", json_body={"fields": fields})
        return data.get("data", data)

    async def delete_test_cycle(self, cycle_id: int) -> None:
        await self._delete(f"/testcycles/{cycle_id}")

    async def get_test_cycle_test_group(self, cycle_id: int, group_id: int) -> dict[str, Any]:
        data = await self._get(f"/testcycles/{cycle_id}/testgroups/{group_id}")
        return data.get("data", data)

    async def get_test_cycle_versions(self, cycle_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testcycles/{cycle_id}/versions")

    async def get_test_cycle_version(self, cycle_id: int, version: int) -> dict[str, Any]:
        data = await self._get(f"/testcycles/{cycle_id}/versions/{version}")
        return data.get("data", data)

    async def get_test_cycle_at_version(self, cycle_id: int, version: int) -> dict[str, Any]:
        data = await self._get(f"/testcycles/{cycle_id}/versions/{version}/versioneditem")
        return data.get("data", data)

    async def create_test_cycle(
        self,
        plan_id: int,
        name: str,
        start_date: str,
        end_date: str,
        test_groups: list[int] | None = None,
        test_run_statuses: list[str] | None = None,
    ) -> dict[str, Any]:
        """Create a new test cycle for a test plan."""
        body: dict[str, Any] = {
            "fields": {"name": name},
            "startDate": start_date,
            "endDate": end_date,
        }
        if test_groups:
            body["testGroupsToInclude"] = test_groups
        if test_run_statuses:
            body["testRunStatusesToInclude"] = test_run_statuses

        data = await self._post(f"/testplans/{plan_id}/testcycles", json_body=body)
        return data.get("data", data)

    # ---------- Test Runs ----------

    async def get_test_runs(self, cycle_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testcycles/{cycle_id}/testruns")

    async def get_test_run(self, run_id: int) -> dict[str, Any]:
        data = await self._get(f"/testruns/{run_id}")
        return data.get("data", data)

    async def update_test_run(
        self,
        run_id: int,
        status: str | None = None,
        actual_results: str | None = None,
        fields: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Update a test run (status, actual results, or arbitrary fields)."""
        body: dict[str, Any] = {"fields": dict(fields) if fields else {}}
        if status is not None:
            body["fields"]["testRunStatus"] = status
        if actual_results is not None:
            body["fields"]["actualResults"] = actual_results

        data = await self._put(f"/testruns/{run_id}", json_body=body)
        return data.get("data", data)

    async def patch_test_run(self, run_id: int, patches: list[dict[str, Any]]) -> dict[str, Any]:
        """Partially update a test run using JSON Patch operations."""
        data = await self._patch(f"/testruns/{run_id}", json_body=patches)
        return data.get("data", data)

    async def delete_test_run(self, run_id: int) -> None:
        await self._delete(f"/testruns/{run_id}")

    async def get_test_run_activities(self, run_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testruns/{run_id}/activities")

    async def get_test_run_attachments(self, run_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testruns/{run_id}/attachments")

    async def add_test_run_attachment(self, run_id: int, attachment_id: int) -> dict[str, Any]:
        body = {"attachment": attachment_id}
        data = await self._post(f"/testruns/{run_id}/attachments", json_body=body)
        return data.get("data", data)

    async def remove_test_run_attachment(self, run_id: int, attachment_id: int) -> None:
        await self._delete(f"/testruns/{run_id}/attachments/{attachment_id}")

    async def get_test_run_links(self, run_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testruns/{run_id}/links")

    async def create_test_run_link(self, run_id: int, url: str, description: str = "") -> dict[str, Any]:
        body: dict[str, Any] = {"url": url}
        if description:
            body["description"] = description
        data = await self._post(f"/testruns/{run_id}/links", json_body=body)
        return data.get("data", data)

    async def delete_test_run_link(self, run_id: int, link_id: int) -> None:
        await self._delete(f"/testruns/{run_id}/links/{link_id}")

    async def get_test_run_tags(self, run_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testruns/{run_id}/tags")

    async def add_test_run_tag(self, run_id: int, tag_id: int) -> dict[str, Any]:
        body = {"tag": tag_id}
        data = await self._post(f"/testruns/{run_id}/tags", json_body=body)
        return data.get("data", data)

    async def remove_test_run_tag(self, run_id: int, tag_id: int) -> None:
        await self._delete(f"/testruns/{run_id}/tags/{tag_id}")

    async def get_test_run_versions(self, run_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testruns/{run_id}/versions")

    async def get_test_run_version(self, run_id: int, version: int) -> dict[str, Any]:
        data = await self._get(f"/testruns/{run_id}/versions/{version}")
        return data.get("data", data)

    async def get_test_run_at_version(self, run_id: int, version: int) -> dict[str, Any]:
        data = await self._get(f"/testruns/{run_id}/versions/{version}/versioneditem")
        return data.get("data", data)

    async def get_test_run_comments(self, run_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/testruns/{run_id}/comments")

    # ---------- Item CRUD ----------

    async def create_item(
        self,
        project_id: int,
        item_type_id: int,
        parent_id: int,
        fields: dict[str, Any],
        location: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "project": project_id,
            "itemType": item_type_id,
            "childItemType": item_type_id,
            "location": location or {"parent": {"item": parent_id}},
            "fields": fields,
        }
        data = await self._post("/items", json_body=body)
        return data.get("data", data)

    async def update_item(self, item_id: int, fields: dict[str, Any]) -> dict[str, Any]:
        # Use PATCH with JSON Patch format — fields are pre-filtered by caller
        if not fields:
            return {"id": item_id}
        patches = [
            {"op": "replace", "path": f"/fields/{k}", "value": v}
            for k, v in fields.items()
        ]
        data = await self._patch(f"/items/{item_id}", json_body=patches)
        return data.get("data", data) if data else {"id": item_id}

    async def patch_item(self, item_id: int, patches: list[dict[str, Any]]) -> dict[str, Any]:
        data = await self._patch(f"/items/{item_id}", json_body=patches)
        return data.get("data", data)

    async def delete_item(self, item_id: int) -> None:
        await self._delete(f"/items/{item_id}")

    # ---------- Item Types ----------

    async def get_item_types(self) -> list[dict[str, Any]]:
        return await self._get_all_pages("/itemtypes")

    async def get_item_type(self, type_id: int) -> dict[str, Any]:
        data = await self._get(f"/itemtypes/{type_id}")
        return data.get("data", data)

    async def get_item_type_image(self, type_id: int) -> bytes:
        """Download item type image."""
        assert self._http is not None
        token = await self._ensure_token()
        url = f"{self.API_PREFIX}/itemtypes/{type_id}/image"
        headers = {"Authorization": f"Bearer {token}", "Accept": "*/*"}
        async with self._semaphore:
            resp = await self._http.get(url, headers=headers, follow_redirects=True)
        resp.raise_for_status()
        return resp.content

    # ---------- Pick Lists ----------

    async def get_pick_lists(self) -> list[dict[str, Any]]:
        return await self._get_all_pages("/picklists")

    async def get_pick_list_options(self, pick_list_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/picklists/{pick_list_id}/options")

    async def get_pick_list_option(self, pick_list_id: int, option_id: int) -> dict[str, Any]:
        data = await self._get(f"/picklists/{pick_list_id}/options/{option_id}")
        return data.get("data", data)

    async def create_pick_list_option(self, pick_list_id: int, name: str,
                                       value: str | None = None,
                                       description: str = "") -> dict[str, Any]:
        body: dict[str, Any] = {"name": name}
        if value is not None:
            body["value"] = value
        if description:
            body["description"] = description
        data = await self._post(f"/picklists/{pick_list_id}/options", json_body=body)
        return data.get("data", data)

    # ---------- Tags ----------

    async def get_tags(self, project_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages("/tags", params={"project": project_id})

    async def get_tagged_items(self, tag_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/tags/{tag_id}/items")

    async def get_tag(self, tag_id: int) -> dict[str, Any]:
        data = await self._get(f"/tags/{tag_id}")
        return data.get("data", data)

    async def create_tag(self, project_id: int, name: str) -> dict[str, Any]:
        body = {"project": project_id, "name": name}
        data = await self._post("/tags", json_body=body)
        return data.get("data", data)

    async def update_tag(self, tag_id: int, name: str) -> dict[str, Any]:
        body = {"name": name}
        data = await self._put(f"/tags/{tag_id}", json_body=body)
        return data.get("data", data)

    async def delete_tag(self, tag_id: int) -> None:
        await self._delete(f"/tags/{tag_id}")

    # ---------- Users ----------

    async def get_users(self) -> list[dict[str, Any]]:
        return await self._get_all_pages("/users")

    async def get_user(self, user_id: int) -> dict[str, Any]:
        data = await self._get(f"/users/{user_id}")
        return data.get("data", data)

    async def get_current_user(self) -> dict[str, Any]:
        data = await self._get("/users/current")
        return data.get("data", data)

    # ---------- User Groups ----------

    async def get_user_groups(self) -> list[dict[str, Any]]:
        return await self._get_all_pages("/usergroups")

    async def get_user_group(self, group_id: int) -> dict[str, Any]:
        data = await self._get(f"/usergroups/{group_id}")
        return data.get("data", data)

    async def create_user_group(self, name: str, description: str = "",
                                 project_id: int | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"name": name}
        if description:
            body["description"] = description
        if project_id is not None:
            body["project"] = project_id
        data = await self._post("/usergroups", json_body=body)
        return data.get("data", data)

    async def update_user_group(self, group_id: int, name: str | None = None,
                                 description: str | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if description is not None:
            body["description"] = description
        data = await self._put(f"/usergroups/{group_id}", json_body=body)
        return data.get("data", data)

    async def delete_user_group(self, group_id: int) -> None:
        await self._delete(f"/usergroups/{group_id}")

    async def get_user_group_users(self, group_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/usergroups/{group_id}/users")

    async def add_user_to_group(self, group_id: int, user_id: int) -> dict[str, Any]:
        body = {"user": user_id}
        data = await self._post(f"/usergroups/{group_id}/users", json_body=body)
        return data.get("data", data)

    async def remove_user_from_group(self, group_id: int, user_id: int) -> None:
        await self._delete(f"/usergroups/{group_id}/users/{user_id}")

    # ---------- Comments ----------

    async def get_item_comments(self, item_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/items/{item_id}/comments")

    async def add_item_comment(self, item_id: int, body_text: str) -> dict[str, Any]:
        body = {"body": {"text": body_text}}
        data = await self._post(f"/items/{item_id}/comments", json_body=body)
        return data.get("data", data)

    # ---------- Filters / Search ----------

    async def get_filters(self, project_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages("/filters", params={"project": project_id})

    async def get_filter_results(self, filter_id: int, project_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"/filters/{filter_id}/results", params={"project": project_id})

    async def get_filter_count(self, filter_id: int, project_id: int) -> int:
        data = await self._get(f"/filters/{filter_id}/count", params={"project": project_id})
        return data.get("data", {}).get("count", 0)
