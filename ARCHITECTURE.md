# Jama Editor — Architecture Reference

> **Last updated**: 2026-07-16 — Unified backend: MCP + editor on single port.

---

## 1. System Components

```
┌──────────────────────────────────────────────────────────────────────┐
│  VS Code Extension (jama-editor)                                     │
│  ├── jamaEditor.ts     — WebviewPanel lifecycle, message handler     │
│  ├── editorHtml.ts     — HTML/CSS/JS for TipTap editor webview       │
│  ├── testRunnerTree.ts — Tree view provider for test plans/cycles    │
│  ├── projectTree.ts    — Tree view provider for project items        │
│  ├── api.ts            — ApiClient (→ :8765) + EditorApiClient       │
│  │                       (→ :8765/editor)                            │
│  └── extension.ts      — Command registration, tree providers        │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ HTTP REST
                                ▼
┌──────────────────────────────────────────────────┐
│  Unified Backend (:8765)  — server.py            │
│  ├── /api/*           MCP viewer REST endpoints  │
│  ├── /editor/*        Editor sub-app (mounted)   │
│  │   └── editor_server.py (editor_app)           │
│  │       ├── editor_cache.py                     │
│  │       ├── schema_sync.py                      │
│  │       └── editor_attachments.py               │
│  ├── cache.py         — Shared Jama cache        │
│  ├── sync.py          — Sync engine              │
│  ├── api_client.py    — Shared Jama API client   │
│  ├── services.py      — ServiceRegistry singleton│
│  └── writer.py        — Write-back to Jama       │
│                                                  │
│  cache.db (SQLite)    editor_db.sqlite (SQLite)  │
└───────────────────────────┬──────────────────────┘
                            │ HTTPS (OAuth2)
                            ▼
                  ┌─────────────────────┐
                  │  Jama Connect Cloud │
                  │  REST API v1        │
                  └─────────────────────┘
```

## 2. Databases

| DB | Path | Purpose | Shared by |
|---|---|---|---|
| `cache.db` | `~/.jama-mcp-v2/cache.db` | Project sync cache (items, relationships, test entities). Schema v3 with FTS5. | MCP tools, VS Code ext, Jama Viewer |
| `editor_db.sqlite` | `~/.jama-mcp-v2/editor_db.sqlite` | Editor-only: local drafts, undo stack, schema metadata, workflows | Editor backend only |

## 3. Data Flow — Push & Cache Refresh

### 3.1 Item Push (editor → Jama → cache)

```
Webview  ──push msg──▶  jamaEditor.ts
                          │
                          ▼
                        EditorApiClient.pushToJama(itemId, fields, version)
                          │  POST /api/items/{id}/push
                          ▼
                        editor_server.py
                          ├── api.update_item(id, fields)     →  Jama REST PUT
                          ├── api.get_item(id)                →  fresh data
                          ├── cache.clear_drafts / set_draft_state / clear_undo
                          └── _refresh_mcp_cache("items", id) →  POST :8765/api/items/{id}/refresh
                                                                   │
                                                                   ▼
                                                                 server.py
                                                                   ├── api_client.get_item(id)
                                                                   └── cache.upsert_item(fresh)
                          │
                          ▼  (back in extension)
                        jamaEditor.ts
                          ├── loadItem(panel, id, projectId)  →  refresh webview
                          └── vscode.commands.executeCommand("jamaEditor.refreshTree")
```

### 3.2 Test Run / Plan / Cycle Push

Same pattern as items: editor backend pushes to Jama, fetches fresh, calls
`_refresh_mcp_cache("{entity_type}", {id})` → MCP backend refreshes SQLite cache.
Extension refreshes tree after each push.

### 3.3 Workflow Transition

```
Webview  ──transition msg──▶  jamaEditor.ts
                                │
                                ▼
                              ApiClient.executeWorkflowTransition(id, transitionId, comment)
                                │  POST /api/items/{id}/workflowtransitions
                                ▼
                              server.py (MCP backend)
                                ├── api_client.execute_workflow_transition(...)
                                ├── api_client.get_item(id)        ← NEW: refresh after transition
                                └── cache.upsert_item(fresh)       ← NEW: update cache
                                │
                                ▼  (back in extension)
                              jamaEditor.ts
                                ├── loadItem(panel, id, projectId)
                                └── vscode.commands.executeCommand("jamaEditor.refreshTree")  ← NEW
```

## 4. Image Loading

### 4.1 Problem
Jama descriptions contain `<img src="https://enphase.jamacloud.com/rest/v1/attachments/{id}/file">`
which require OAuth2 or SAML authentication. The VS Code webview cannot supply these credentials.

### 4.2 Solution — On-Demand Proxy Rewrite

```
                        ┌─────────────────────┐
                        │   Jama REST API      │
                        │   (authenticated)     │
                        └─────────┬────────────┘
                                  │  get_attachment + download_attachment
                                  │
                        ┌─────────┴─────────────────┐
                        │ Unified Backend :8765      │
                        │ GET /editor/api/proxy/     │
                        │     image/{attachment_id}  │
                        └─────────┬─────────────────┘
                                  │  image bytes
                                  │
                        ┌─────────┴─────────────────┐
                        │ VS Code Webview            │
                        │ <img src="http://          │
                        │  localhost:8765/editor/api/ │
                        │  proxy/image/12345">       │
                        └───────────────────────────┘
```

**Key components:**

| Component | File | What it does |
|---|---|---|
| `rewriteImageUrls()` | `jamaEditor.ts` | Regex replaces Jama attachment URLs → proxy URLs before rendering |
| `_rewrite_image_urls()` | `editor_server.py` | Server-side equivalent (available for future use) |
| `proxy_image()` | `editor_server.py` | `GET /editor/api/proxy/image/{id}` — fetches from Jama with auth, returns bytes |
| CSP `img-src` | `editorHtml.ts` | Allows `http://localhost:{port}` in Content-Security-Policy (dynamic from config) |
| `importImages` handler | `jamaEditor.ts` | Re-fetches item description and rewrites URLs on-demand (SAML banner button) |

### 4.3 Regex Pattern

```
/https?:\/\/[^"']*?\/rest\/v1\/attachments\/(\d+)\/file/gi
```

Captures the attachment ID and replaces the full URL with:
```
http://localhost:8765/editor/api/proxy/image/{attachmentId}
```

## 5. MCP Backend REST Endpoints — Cache Refresh

| Endpoint | Added | Purpose |
|---|---|---|
| `POST /api/items/{id}/refresh` | ✅ New | Fetch item from Jama, upsert into cache |
| `POST /api/testplans/{id}/refresh` | Existing | Fetch plan from Jama, upsert into cache |
| `POST /api/testcycles/{id}/refresh` | Existing | Fetch cycle from Jama, upsert into cache |
| `POST /api/testruns/{id}/refresh` | Existing | Fetch run from Jama, upsert into cache |

All refresh endpoints follow the same pattern:
1. `api_client.get_{entity}(id)` — fetch fresh from Jama
2. `cache.upsert_{entity}(fresh, parent_id)` — write to SQLite
3. Return `{"status": "refreshed", "{entity}_id": id}`

## 6. Extension Tree Refresh

After any data mutation (push, transition), the extension calls:
```typescript
vscode.commands.executeCommand("jamaEditor.refreshTree");
```

This fires the `jamaEditor.refreshTree` command registered in `extension.ts`, which calls
`treeProvider.refresh()` on both the project tree and test runner tree providers,
triggering a re-fetch from the MCP backend's now-updated cache.

## 7. Test Coverage

### Python (pytest)

| File | Tests | Coverage |
|---|---|---|
| `test_mcp_refresh_endpoints.py` | 5 | Item/plan/cycle/run refresh + workflow transition cache update |
| `test_editor_push_cache.py` | 11 | Image rewrite (5) + push-then-refresh (4) + image proxy (2) |
| `test_editor_server_attachments.py` | Existing | Attachment upload/download/sync |

### TypeScript

| File | Tests | Coverage |
|---|---|---|
| `imageRewrite.test.ts` | 7 | URL rewriting regex, CSP pattern, edge cases |

Run all tests:
```bash
# Python
cd mcp-servers/jama-mcp-v2
python -m pytest tests/ -v

# TypeScript
cd vscode-extensions/jama-editor
npx tsx src/__tests__/imageRewrite.test.ts
```

## 8. Update Process

When modifying any component in this architecture:

1. **Update this document** with the change
2. **Run all tests** to verify no regressions
3. **Check cache refresh flow** — if adding a new push endpoint, ensure it calls `_refresh_mcp_cache()`
4. **Check tree refresh** — if adding a new mutation in `jamaEditor.ts`, add `executeCommand("jamaEditor.refreshTree")`
5. **Check CSP** — if adding new external resource origins, update the CSP in `editorHtml.ts`
