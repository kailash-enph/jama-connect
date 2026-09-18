# Jama Connect — Architecture Reference

This document describes the full implementation of `tools/jama-connect`: what every component
does, how data flows between them, where the design is solid, and a prioritised list of concrete
improvements. It is intended as the primary technical reference for anyone maintaining or
extending this tool.

---

## 1. System Map

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         Developer's Machine                               │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  VS Code / Windsurf / Devin IDE                                  │    │
│  │                                                                  │    │
│  │  ┌─────────────────────┐   webview msgs   ┌──────────────────┐  │    │
│  │  │  jama-editor        │◄────────────────►│  SettingsPanel   │  │    │
│  │  │  VS Code Extension  │                  │  DbMgmtPanel     │  │    │
│  │  │  (TypeScript)       │   REST API       │  ItemEditor      │  │    │
│  │  │  port: n/a          │◄────────────────►│  TestDetail      │  │    │
│  │  └────────┬────────────┘  localhost:8765  └──────────────────┘  │    │
│  │           │ spawns child process                                  │    │
│  │           ▼                                                       │    │
│  │  ┌────────────────────────────────────────────────────────────┐  │    │
│  │  │  Jama Backend Process  (Python / FastAPI + MCP)            │  │    │
│  │  │  jama-rest  OR  python -m jama_mcp_v2  --rest-only         │  │    │
│  │  │                                                             │  │    │
│  │  │  port 8765:                                                 │  │    │
│  │  │    GET/POST  /api/*         — items, projects, search       │  │    │
│  │  │    GET/POST  /settings/*    — credentials, project select   │  │    │
│  │  │    GET/POST  /api/db/*      — local DB management           │  │    │
│  │  │    GET/POST  /api/cache-server/*  — LAN cache integration   │  │    │
│  │  │    GET/POST  /editor/*      — editor drafts, images, schema │  │    │
│  │  │    GET       /viewer/*      — static Next.js viewer (opt.)  │  │    │
│  │  │                                                             │  │    │
│  │  │  stdio (MCP transport for Windsurf/Claude):                 │  │    │
│  │  │    jama_list_projects, jama_search, jama_sync_project, ...  │  │    │
│  │  └───────────┬────────────┬────────────────────────────────────┘  │    │
│  │              │            │                                        │    │
│  │    ~/.jama-mcp-v2/       LAN (optional)                           │    │
│  │    cache.db (legacy)      │                                        │    │
│  │    projects/*.db (new)    │                                        │    │
│  └───────────────────────────┼────────────────────────────────────────┘   │
│                              │                                             │
│  ┌───────────────────────────▼────────────────────────────────────────┐   │
│  │  LAN Cache Server (Docker)                                         │   │
│  │                                                                    │   │
│  │  nginx:8866  ──► static .db.gz / index.json / index.html          │   │
│  │  nginx:8866  ──► /admin/*  /api/*  →  FastAPI:8867                │   │
│  │                                                                    │   │
│  │  FastAPI:8867  (cache_server.py)                                   │   │
│  │    admin panel, auth, sync trigger, image upload, scheduler        │   │
│  │    spawns: generate_caches.py (subprocess)                         │   │
│  │                                                                    │   │
│  │  /data/ volume:                                                    │   │
│  │    index.json, master.db.gz, projects/{id}.db.gz                  │   │
│  └───────────────────────────┬────────────────────────────────────────┘   │
│                              │                                             │
└──────────────────────────────┼─────────────────────────────────────────────┘
                               │ HTTPS  OAuth2
                               ▼
                    ┌──────────────────┐
                    │  Jama Cloud      │
                    │  enphase.        │
                    │  jamacloud.com   │
                    │  /rest/v1/*      │
                    └──────────────────┘
```

**Three user personas:**

| Persona | Entry point | Primary path |
|---|---|---|
| AI assistant user | Windsurf / Claude Desktop | `jama-connect` (stdio MCP) |
| Developer | VS Code / Devin IDE | `jama-rest` + extension |
| Team admin | Browser → `http://localhost:8866` | LAN cache server admin panel |

---

## 2. Client App — Python Backend

### 2a. Module Map

| File | Lines | KB | Role |
|---|---|---|---|
| `server.py` | 2140 | 90 | **God file**: MCP tools, REST routes, PID management, startup logic |
| `api_client.py` | ~1100 | 55 | httpx async OAuth2 client, pagination, rate-limit backoff |
| `cache.py` | 1104 | 47 | **Legacy** single-file SQLite cache (`JamaCache`) |
| `db/project_db.py` | ~670 | 33 | **New** per-project SQLite (`ProjectDb`), `bulk_write()` |
| `db/manager.py` | ~250 | 12 | `CacheManager` — pool of `ProjectDb` instances |
| `db/schema.py` | ~220 | 9 | Schema v4 DDL + `MIGRATION_SQL` dict |
| `db/fts.py` | ~100 | 4 | FTS5 entry dataclass and builder functions |
| `sync.py` | ~390 | 16 | Full + incremental sync engine |
| `search.py` | ~440 | 18 | FTS5 search + relationship enrichment |
| `services.py` | ~270 | 10 | `ServiceRegistry` singleton |
| `settings_api.py` | ~270 | 11 | `/settings/*` REST routes |
| `api/db_mgmt.py` | ~160 | 6 | `/api/db/*` routes |
| `api/cache_server_routes.py` | ~120 | 5 | `/api/cache-server/*` routes |
| `models.py` | ~180 | 7 | Pydantic models |
| `testing.py` | ~150 | 6 | `TestManager` (plans / cycles / runs) |
| `writer.py` | ~170 | 7 | `Writer` (create / update / delete items) |
| `exporter.py` | ~90 | 4 | Markdown / HTML / JSON export |
| `attachments.py` | ~100 | 4 | Attachment download + base64 |
| `credential_store.py` | ~90 | 4 | OS keyring wrapper |
| `post_install.py` | ~630 | 25 | `jama-post-install` setup CLI |
| `tree.py` | ~100 | 4 | `build_tree()` helper |
| `progress.py` | ~60 | 2 | `ProgressBus` (SSE fan-out) |
| `sse.py` | ~60 | 2 | SSE response helpers |
| `item_utils.py` | ~100 | 4 | Field normalisation utilities |

### 2b. Process Modes and Startup

The backend can run in two modes from the same codebase:

```
jama-connect               → MCP stdio mode (for Windsurf / Claude)
jama-rest [--port N]       → REST-only mode (for VS Code extension)
python -m jama_mcp_v2      → both modes (default for development)
```

**Startup sequence (REST mode):**
```
main()
  └─ _check_existing_backend(port)
       ├─ port healthy?  → print "already running", exit 0
       ├─ port listening but unhealthy?  → kill zombie, continue
       └─ port free?  → continue
  └─ _write_pid_file()
  └─ uvicorn.run(rest_app, ...)
       └─ fastapi_lifespan()
            ├─ _init_services()
            │    └─ services.init_mcp_services()
            │         ├─ credential_store.resolve()   (keyring → env → mcp_config.json)
            │         ├─ JamaApiClient(url, id, secret)
            │         ├─ JamaCache(cache_dir)         (legacy)
            │         ├─ CacheManager(cache_dir)       (new)
            │         ├─ SyncEngine, TestManager, Writer, Exporter, SearchEngine
            │         └─ _rebind_module_aliases()
            └─ _init_editor_services()  (optional, requires jama_editor package)
```

**MCP mode startup:**
```
mcp.run()
  └─ mcp_lifespan()
       └─ _init_services()   (same as above)
```

### 2c. ServiceRegistry (`services.py`)

A singleton that owns all service instances. Both process modes share the same initialization path.

```python
services = ServiceRegistry()  # module-level singleton

services.api_client     # JamaApiClient (httpx)
services.cache          # JamaCache (legacy)
services.cache_manager  # CacheManager (new)
services.sync_engine    # SyncEngine
services.test_manager   # TestManager
services.writer         # Writer
services.exporter       # Exporter
services.search_engine  # SearchEngine (hardwired to JamaCache)
services.attachment_mgr # AttachmentManager
services.progress_bus   # ProgressBus
```

**Design smell:** After `init_mcp_services()`, `server.py` calls `_rebind_module_aliases()` which copies all references into module-level globals (`cache`, `api_client`, etc.). This means every MCP tool in `server.py` accesses services via module globals, not via `services.*`. The same state lives in two places simultaneously.

### 2d. API Client (`api_client.py`)

Clean design. Key features:

- `httpx.AsyncClient` with `base_url`, connection limits (20 max, 10 keepalive)
- OAuth2 `client_credentials` token auto-refreshed 60 s before expiry
- `asyncio.Semaphore(max_concurrent)` — default 10 concurrent API calls
- `_get_paginated(path)` — handles Jama's `startIndex`/`resultCount` pagination automatically
- Exponential backoff: 1 s → 2 s → 4 s on HTTP 429 / 503
- `JamaApiError(status_code, message, url)` — typed exception

Nothing structurally wrong here. Only improvement is adding a configurable per-call timeout (currently global).

### 2e. Cache Layer — The Dual-Track Problem

This is the most significant architectural issue in the backend.

**Legacy track — `JamaCache` (`cache.py`, 47 KB):**
- Single SQLite file: `~/.jama-mcp-v2/cache.db`
- All projects mixed in one file
- FTS5 table: `items_fts` (per-row upsert, slow on large syncs)
- Used by: **all 40+ MCP tools**, `SearchEngine`, `SyncEngine`, `TestManager`
- Schema v3 (no per-project isolation, no `doc_type` column)

**New track — `ProjectDb` / `CacheManager` (`db/`, schema v4):**
- Per-project SQLite files: `~/.jama-mcp-v2/projects/{id}.db`
- `bulk_write()` context manager defers FTS rebuilds (60× speedup during full sync)
- FTS5 table: `unified_fts` with `doc_type` column (item / test_plan / test_cycle / test_run)
- `CacheManager` opens `ProjectDb` instances lazily on first access
- Used by: **REST `/api/db/*` routes**, VS Code extension tree/DB panel, LAN server downloads

**The gap:** Sync writes to `JamaCache`. The extension reads from `ProjectDb`. They are separate files. A full sync via MCP tool (`jama_sync_project`) does NOT update the `ProjectDb` file. Conversely, a project DB downloaded from the LAN cache server lands in `projects/{id}.db` and is NOT visible to any MCP search tool. The two caches can hold different versions of the same data indefinitely.

**Data flow diagram:**
```
jama_sync_project (MCP)         cache_server download (extension)
        │                                   │
        ▼                                   ▼
  JamaCache                          ProjectDb
  cache.db                           projects/20570.db
        │                                   │
        ▼                                   ▼
  jama_search (MCP)              GET /api/projects/20570/tree (REST)
  jama_deep_search (MCP)         GET /api/db/status (REST)
  jama_list_test_plans (MCP)     Tree view in extension
                                 DB Management panel
```

### 2f. Sync Engine (`sync.py`)

- `sync_project(project_id)` — full sync: items → relationships → test plans/cycles/runs
- `incremental_sync(project_id)` — only items modified since last sync timestamp
- Uses `JamaCache` for writes (legacy track only)
- Batch size: 50 items per API page (configurable)
- Progress callbacks → `ProgressBus` → SSE stream for viewer progress bar
- Cancel: `asyncio.Event` checked between batches

**Missing:** `SyncEngine` has no path to write into `ProjectDb`. Syncing via MCP or the viewer "Sync" button never populates the per-project DB files the extension reads.

### 2g. MCP Tools (`server.py`, lines 120–1270)

40+ `@mcp.tool()` async functions organised by domain:

| Domain | Tools | Notes |
|---|---|---|
| Projects | `jama_list_projects`, `jama_get_project` | Cache-first |
| Items | `jama_get_item`, `jama_get_item_children`, `jama_get_item_tree` | Cache-first |
| Versions | `jama_get_item_versions`, `jama_get_item_at_version` | On-demand cached |
| Sync | `jama_sync_project`, `jama_incremental_sync` | Writes to legacy cache |
| Search | `jama_search`, `jama_deep_search` | FTS5 on legacy cache |
| Test mgmt | `jama_list_test_plans/cycles/runs`, `jama_get_test_summary`, `jama_update_test_run`, `jama_create_test_cycle` | Mix of cache + live API |
| Write-back | `jama_update_item`, `jama_create_item`, `jama_delete_item`, `jama_add_comment` | Live API + cache upsert |
| Attachments | `jama_get_item_attachments`, `jama_download_attachment`, `jama_upload_attachment` | Live API |
| Relationships | `jama_get_relationships`, `jama_create_relationship`, `jama_delete_relationship` | Cache + live |
| Workflow | `jama_get_workflow_transitions`, `jama_execute_workflow_transition` | Live API |
| Baselines | `jama_get_baselines`, `jama_get_baseline`, `jama_get_baseline_items` | Live API |
| Tags | `jama_get_tags`, `jama_create_tag`, `jama_get_item_tags`, `jama_add_item_tag`, `jama_remove_item_tag` | Live API |
| Links | `jama_get_item_links`, `jama_create_item_link`, `jama_delete_item_link` | Live API |
| Locks | `jama_get_item_lock`, `jama_set_item_lock` | Live API |
| Releases | `jama_get_releases` | Live API |
| Reviews | `jama_get_reviews`, `jama_get_review_details` | Live API (Labs) |
| Navigation | `jama_get_item_parent`, `jama_get_item_location`, `jama_set_item_location`, `jama_duplicate_item` | Live API |
| Schema | `jama_get_item_types`, `jama_get_pick_lists`, `jama_get_pick_list_options` | Live API |
| Users | `jama_get_users`, `jama_get_user_groups`, `jama_get_current_user` | Live API |
| Export | `jama_export_item`, `jama_export_tree` | Cache |
| Stats | `jama_cache_stats` | Cache |

**Pattern used by every tool:**
```python
@mcp.tool()
async def jama_get_item(ctx: Context, item_id: int) -> dict:
    assert cache and api_client   # ← raises AssertionError if not initialized
    cached = await cache.get_item(item_id)
    if cached:
        return cached
    data = await api_client.get_item(item_id)
    await cache.upsert_item(data)
    return data
```

### 2h. REST API Route Map

```
/api/health                    GET   → {status, version, uptime, ...}
/api/projects                  GET   → list[Project]  (from JamaCache)
/api/projects/{id}/tree        GET   → list[TreeNode] (from JamaCache)
/api/items/{id}                GET   → Item  (cache-first)
/api/items/{id}/children       GET   → list[Item]
/api/items/{id}/comments       GET/POST
/api/items/{id}/attachments    GET
/api/items/{id}/upstream       GET
/api/items/{id}/downstream     GET
/api/items                     POST  → create item
/api/items/{id}                PUT   → update item
/api/items/{id}                DELETE → delete item
/api/test-plans/{id}           GET   → TestPlan (live=false uses cache)
/api/test-cycles/{id}          GET   → list[TestCycle]
/api/test-runs/{id}            GET   → list[TestRun]
/api/test-runs/{id}            PUT   → update run status
/api/sync/{id}                 POST  → trigger full sync (SSE progress)
/api/search                    GET   → FTS5 search

/settings/credentials          GET/POST
/settings/server               GET
/settings/server/stop          POST
/settings/project/{id}         POST  → set active project

/api/db/status                 GET   → list of local ProjectDb files
/api/db/project/{id}           GET   → stats for one ProjectDb
/api/db/project/{id}           DELETE → delete ProjectDb
/api/db/project/{id}/import    POST  → import .db.gz
/api/cache-server/ping         GET
/api/cache-server/index        GET
/api/cache-server/url          POST
/api/cache-server/download/{id} GET  → SSE stream: download + decompress

/editor/*                      → jama_editor sub-app (optional package)
/viewer/*                      → static Next.js app (pre-built, optional)
```

### 2i. Credential Resolution Chain

```
credential_store.resolve()
  1. keyring.get_password("jama-mcp-v2", "client_id")   (Windows Credential Manager)
  2. env: JAMA_CLIENT_ID + JAMA_CLIENT_SECRET
  3. Auto-scan mcp_config.json:
       ~/.codeium/windsurf/mcp_config.json
       ~/AppData/Roaming/devin/mcp_config.json
       ~/.config/claude/mcp_config.json
       ~/.cursor/mcp.json
  4. ValueError → startup fails gracefully with a clear error message
```

---

## 3. Client App — VS Code Extension

### 3a. Module Map

| File | Lines | KB | Role |
|---|---|---|---|
| `editorHtml.ts` | ~1100 | 45 | Single function → 1500-line HTML string for item editor |
| `testDetailHtml.ts` | ~720 | 28 | HTML generators for test plan/cycle/run detail panels |
| `api.ts` | ~600 | 24 | TypeScript REST client (`ApiClient`, `EditorApiClient`) |
| `jamaEditor.ts` | ~590 | 23 | `JamaEditorProvider` — custom editor for `.jama-item` docs |
| `extension.ts` | ~570 | 22 | `activate()`, command registration, global wiring |
| `SettingsPanel.ts` | ~500 | 20 | Sidebar webview: 4-tab settings / status panel |
| `DbManagementPanel.ts` | ~370 | 15 | Editor webview: DB download, delete, status |
| `backend.ts` | ~346 | 11 | `BackendManager` — child process lifecycle |
| `projectTree.ts` | ~210 | 8 | `ProjectSelector` + `ProjectTreeProvider` |
| `testRunnerTree.ts` | ~170 | 7 | `TestRunnerTreeProvider` |
| `config.ts` | ~40 | 2 | Config helpers (`getConfig()`, `getApiBaseUrl()`) |
| `jamaRichtextConfig.ts` | ~43 | 2 | TipTap editor configuration |

### 3b. Activation Sequence

```
activate(context)
  ├─ ApiClient()                         ← REST client pointing to localhost:8765
  ├─ BackendManager()                    ← manages python child process
  │    └─ auto-start if configured
  ├─ ProjectSelector(api, context)       ← shared project selection state
  │    └─ init() → loads project list, restores last project from workspaceState
  ├─ ProjectTreeProvider(api, selector)  ← "Projects & Items" tree view
  ├─ TestRunnerTreeProvider(api, selector) ← "Test Plans & Runs" tree view
  ├─ JamaEditorProvider(api, uri)        ← custom editor for item files
  ├─ SettingsPanel(extensionUri)         ← sidebar "Settings & Status" webview
  └─ register commands (16 commands)
```

### 3c. BackendManager (`backend.ts`)

Manages the Python backend as a child process.

```
start()
  ├─ check /api/health → if healthy, mark running and return
  ├─ commandExists("jama-rest") → use pip-installed binary (preferred)
  │   OR fall back to: uv run python -m jama_mcp_v2 --rest-only
  ├─ spawn(cmd, args, { env: {...process.env, JAMA_URL, JAMA_REST_PORT, JAMA_CACHE_SERVER_URL} })
  ├─ pipe stdout/stderr → output channel "Jama Backend"
  └─ waitForReady(port, 30_000) → poll /api/health every 1 s

Health check (every 30 s):
  ├─ GET /api/health → if fails:
  │    ├─ SIGKILL lingering process
  │    └─ start() again (auto-restart)

stop()
  ├─ POST /settings/server/stop (graceful REST shutdown)
  └─ fallback: SIGTERM → wait 5 s → SIGKILL

offerServiceInstall()
  └─ optional: install as Windows Task Scheduler / macOS Launch Agent
     (opens a terminal and sends the PS1/shell command — not programmatic)
```

**Known issue:** `commandExists()` calls `execSync` synchronously in the extension startup path. On slow machines or networked drives, this can briefly freeze the IDE.

### 3d. ProjectSelector

The shared state object that coordinates both tree views.

```
ProjectSelector
  _selectedId: number | undefined
  _selectedName: string
  _projects: JamaProject[]
  _onDidChange: EventEmitter<number | undefined>

  init()            → load projects from API, restore last ID from workspaceState
  pickProject()     → showQuickPick (all non-folder projects), update state
  setProjectById()  → direct set from SettingsPanel "Set Active" button
  refreshProjects() → re-fetch project list

Both tree providers subscribe to onDidChange:
  selector.onDidChange(() => { this.treeCache = null; this._onDidChangeTreeData.fire(); })
```

**Limitation:** QuickPick shows ALL projects including those without a local DB. Selecting an unsynced project shows a hint item ("No items cached — open DB Manager"), not a blank tree. This was fixed this session.

### 3e. Tree Providers

**ProjectTreeProvider:**
```
treeCache: JamaTreeNode[] | null
  null  = not yet fetched (fetch on next getChildren)
  []    = fetched, project has no cached items → show hint item
  [...] = items available

getChildren(undefined) → root:
  if !projectId → "Select a project..." prompt item
  if treeCache === null → fetch GET /api/projects/{id}/tree
  if treeCache.length === 0 → return hint item (cloud-download icon, opens DB Manager)
  → map treeCache to JamaTreeItem[]

getChildren(element) → children:
  → findNode(treeCache, element.itemId)  (in-memory lookup)
  → map node.children to JamaTreeItem[]
```

Note: `item_type_display` in API responses is always `""`. Icon selection in `getItemIcon()` always falls back to `symbol-misc`. All tree items look identical regardless of type.

**TestRunnerTreeProvider:**
```
getChildren(undefined) → root: getTestPlans(projectId, live=true)
getChildren(plan)      → getTestCycles(plan.id, live=true)
getChildren(cycle)     → getTestRuns(cycle.id, live=true)
```
Live API calls — works for any project, no local DB required.

### 3f. Panels (Webview Architecture)

All panels use the VS Code Webview API. HTML is generated as template literals inside TypeScript — there is no separate HTML/CSS/JS source. This is the dominant maintainability problem in the extension.

**SettingsPanel:**
- Sidebar webview (`type: "webview"` in `package.json`)
- 4 tabs: Credentials | Status | Projects | Cache
- Polls backend every 10 s while visible: `_fetchAll()` → 4 parallel REST calls
- Messages: `setCredentials`, `setProject`, `reloadTree`, `clearCache`, `syncProject`
- After `setProject`: calls `jamaEditor.setActiveProjectById` command → updates `ProjectSelector` → fires `onDidChange` → trees reload

**DbManagementPanel:**
- Full editor panel (not sidebar)
- Shows all local `ProjectDb` files with item counts and sync timestamps
- Download: `GET /api/cache-server/download/{id}` SSE stream → progress bar
- Delete: `DELETE /api/db/project/{id}`
- Auto-configures cache server URL from VS Code settings on `getStatus`

### 3g. Item Editor (`jamaEditor.ts`, `editorHtml.ts`)

- Custom `CustomEditorProvider` opening `.jama-item` virtual URIs
- HTML is a single 45 KB function in `editorHtml.ts` — ~1500 lines of template literals
- TipTap rich-text editor bundled in `out/webview/tiptap.js` (~2 MB)
- VS Code Webview UI Toolkit for form controls (dropdowns, buttons, progress-ring)
- Lock/unlock item before editing (`jama_set_item_lock`)
- Draft auto-save to local storage
- Push changes to Jama via `PUT /api/items/{id}`

### 3h. Build Pipeline

```
esbuild.mjs → 3 build targets:
  1. src/extension.ts         → out/extension.js          (~137 KB)
  2. src/webview/tiptap-entry → out/webview/tiptap.js     (~2 MB)
  3. src/webview/toolkit-entry → out/webview/toolkit.js   (~120 KB)

Tests:
  vitest (Node, no Extension Host)
  vscode module → mocked via src/__tests__/mocks/vscode.ts
  npm test → 23 tests, 2 files
```

### 3i. Extension Test Coverage

| File | Tests | Covers |
|---|---|---|
| `imageRewrite.test.ts` | 7 | URL rewriting utility |
| `projectTree.test.ts` | 16 | ProjectSelector + ProjectTreeProvider |

**Not covered (zero tests):** `BackendManager`, `SettingsPanel`, `DbManagementPanel`, `JamaEditorProvider`, `TestRunnerTreeProvider`, `ApiClient`, all HTML generators.

---

## 4. LAN Cache Server

### 4a. Docker Architecture

```
docker-compose.yml
  api:    build context = jama-connect/ root
          Dockerfile = server/Dockerfile
          port 8867 (internal only)
          volumes: /data (persistent), ./.env (read-only)
          restart: unless-stopped

  nginx:  image nginx:alpine
          port 8866:80 (external)
          volumes: nginx.conf, /data (read-only)
          healthcheck: wget /index.json
          depends_on: api
          restart: unless-stopped
```

nginx routes:
```
/admin/*    → proxy_pass http://api:8867
/api/*      → proxy_pass http://api:8867
/*          → serve static from /data (*.db.gz, index.json, index.html)
```

`Host` header forwarding uses `$http_host` (preserves port) — critical for the browser image sync script which generates upload URLs using the server's reported base URL.

### 4b. `cache_server.py` — Responsibility Map

One file, 1069 lines, covering:

| Responsibility | Lines (approx.) |
|---|---|
| Config load/save (server_config.json) | 1–120 |
| Session auth (SHA-256 password, token dict) | 120–200 |
| Sync trigger + SSE log streaming | 200–380 |
| Per-project scheduler (asyncio background task) | 380–480 |
| Admin panel HTML + embedded JS/CSS | 480–780 |
| Browser image sync (token + upload endpoint) | 780–900 |
| Dashboard rebuild (`_rebuild_index_json`) | 900–980 |
| Admin project management CRUD | 980–1069 |

Config persistence: flat JSON file `server_config.json`:
```json
{
  "admin_password_hash": "sha256:...",
  "projects": [20570],
  "schedule": "biweekly",
  "schedule_time": "02:00",
  "project_schedules": {
    "20570": {"schedule": "daily", "schedule_time": "03:00"}
  }
}
```

### 4c. `generate_caches.py` — Sync Pipeline

Standalone script (1283 lines, no class structure):

```
main()
  ├─ load_env(.env)
  ├─ JamaApiClient(url, id, secret)
  ├─ for each project_id:
  │    ├─ ProjectDb(projects/{id}.db)
  │    ├─ SyncEngine.sync_project(id)  → items + relationships + test plans/cycles/runs
  │    ├─ embed_rest_images()           → OAuth-accessible attachment images → BLOB
  │    ├─ gzip → {id}.db.gz
  │    └─ generate {id}_with_images.db.gz (optional, larger)
  ├─ MasterDb  → master.db.gz
  └─ _write_index_json()  → index.json (project list, item counts, file sizes)
```

The script is also invoked as a subprocess by `cache_server.py` when a sync is triggered from the admin panel. Output lines are streamed to the admin panel via SSE.

### 4d. Deployment

```powershell
# Build distributable zip (self-contained, ~1.5 MB)
cd tools/jama-connect
python server/build_zip.py
# → server/dist/jama-cache-server-0.5.3.zip

# Deploy on any machine with Docker
unzip jama-cache-server-0.5.3.zip
cd jama-cache-server-0.5.3
cp .env.example .env   # fill in JAMA_CLIENT_ID, JAMA_CLIENT_SECRET
docker compose up -d --build
# Dashboard: http://localhost:8866
```

The zip bundles a pre-built `jama_connect-*.whl` wheel so the Docker image doesn't need PyPI during `docker build`.

---

## 5. Technical Debt — Prioritised

### P1 — Dual cache tracks with no migration path ~~*(highest risk)*~~ **RESOLVED**

**Was:** `JamaCache` and `ProjectDb` ran in parallel. MCP tools read `cache.db`; extension read `projects/{id}.db`. Data diverged silently.

**Resolution (commit `7521df5`):** `ProjectDb` is now the single source of truth for ALL reads and writes:
- `SyncEngine` writes ONLY to `ProjectDb`. `JamaCache` is no longer written during sync.
- All REST endpoints (`/api/projects/{id}/tree`, `/api/items/*`, `/api/projects/{id}/relationships`) read from `ProjectDb` exclusively.
- All MCP tool handlers (`jama_get_item`, `jama_get_item_tree`, `jama_get_relationships`, etc.) read from `ProjectDb`.
- `SearchEngine` rewritten to query `ProjectDb`'s `unified_fts` FTS5 table; `JamaCache` import removed.
- `ServiceRegistry.set_active_project(pid)` opens the `ProjectDb` and updates `SearchEngine` on every project switch.
- `JamaCache` (`cache.db`) is now the edit-action log only (undo/redo, user key entries during write-back).

---

### P2 — `server.py` is a 2140-line god file *(maintainability)*

**Problem:** MCP tools, inline REST routes (`/api/projects/*`, `/api/items/*`, `/api/health`), PID management (`_kill_pid`, `_check_existing_backend`), log rotation setup, and lifespan hooks all live in one file. Adding a REST endpoint and adding an MCP tool both require editing this file.

**Fix:** Split into:
- `mcp/tools/*.py` — one file per domain (projects, items, search, test_mgmt, etc.)
- `api/items.py`, `api/projects.py` — routers for inline REST routes
- `startup.py` — PID management, zombie detection, log rotation

**Effort:** Medium (refactor only, no behavior change, but tests must pass throughout).

---

### P3 — MCP tools use `assert` for guard checks ~~*(reliability)*~~ **RESOLVED**

**Was:** Every tool began with `assert cache and api_client`, raising `AssertionError` on uninitialized services.

**Fix:** Replace `assert` with:
```python
if not cache or not api_client:
    raise ToolError("Jama services not initialized. Check credentials in Settings.")
```
Or use a `@require_services` decorator.

**Effort:** Low (systematic find/replace + decorator pattern, ~1 hour).

---

### P4 — `cache_server.py` and `generate_caches.py` are flat monoliths *(maintainability)*

**Problem:** 1069 + 1283 = 2352 lines of flat procedural code. No classes, no separation of auth vs sync vs HTML. Hard to test (the server tests are currently zero — all 13 `test_generate_caches.py` tests cover a separate pure-function subset).

**Fix:** Extract classes:
- `AdminAuth` (session management)
- `SyncController` (trigger, SSE log, scheduler)
- `AdminHtmlGenerator` (or convert to Jinja2 templates)
- `GenerateCachesRunner` class wrapping the script logic

**Effort:** Large (high risk of regression, needs test harness first).

---

### P5 — Admin sessions lost on container restart ~~*(UX)*~~ **RESOLVED**

**Was:** `_sessions` was a module-level dict, lost on every restart.

**Fix (simple):** Persist sessions to a `sessions` SQLite table in the data volume.
**Fix (better):** Replace session tokens with signed JWTs (no server state needed).

**Effort:** Low (2–3 hours).

---

### P6 — Admin password uses SHA-256 ~~*(security)*~~ **RESOLVED**

**Was:** SHA-256 fast hash — trivially brute-forced.

**Fix:** Replace with `bcrypt` or `argon2-cffi`:
```python
import bcrypt
stored = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
valid  = bcrypt.checkpw(pw.encode(), stored.encode())
```

**Effort:** Low (30 min, but requires adding a dependency to the Docker image).

---

### P7 — `SearchEngine` is hardwired to `JamaCache` ~~*(feature gap)*~~ **RESOLVED**

**Was:** `SearchEngine` could only search `cache.db`; ProjectDb items were invisible to MCP search tools.

**Resolution (commit `7521df5`):** `SearchEngine` now takes a `ProjectDb | None`, queries `unified_fts` directly on the active project's DB. `JamaCache` import removed entirely. Scoped to the active project (search is always within the selected project, not cross-project).

---

### P8 — All panel HTML is template literals in TypeScript *(maintainability)*

**Problem:** `SettingsPanel.ts`, `DbManagementPanel.ts`, `editorHtml.ts`, `testDetailHtml.ts` produce HTML as template literal strings inside TypeScript methods. `editorHtml.ts` alone is 45 KB. There is no separation between logic and view. CSS lives inline. JS functions live inline. No linting applies to embedded HTML/CSS/JS.

**Fix options:**
- Migrate panels to separate `.html` + `.css` + `.js` loaded as static resources (VS Code supports `webview.asWebviewUri`)
- Use a build-time template compiler (e.g. generate HTML from JSX via a separate esbuild step)

**Effort:** Large. The panels are deeply entangled. Best done panel by panel during feature work.

---

### P9 — Backend test coverage gaps *(quality)*

**Not covered at all (Python):**

| Module | Why it matters |
|---|---|
| `sync.py` | The sync engine has had multiple bugs (deadlock on `executescript`, zombie processes) |
| `search.py` | FTS5 query sanitisation and fast-path detection are untested |
| `settings_api.py` | Credential save/load, project selection persistence |
| `api_client.py` | OAuth token refresh, pagination, rate-limit backoff |
| `tree.py` | `build_tree()` is used by every tree endpoint |
| `writer.py` | Write-back operations to Jama |
| `credential_store.py` | Keyring fallback chain |

**Not covered at all (TypeScript):**
`BackendManager`, `SettingsPanel`, `DbManagementPanel`, `JamaEditorProvider`, `TestRunnerTreeProvider`, `ApiClient`

**Fix:** Add tests incrementally, starting with the modules that have had production bugs (sync.py, tree.py).

**Effort:** Ongoing. Each module needs 2–4 hours.

---

### P10 — `item_type_display` is always empty ~~*(UX)*~~ **RESOLVED**

**Was:** Tree endpoint returned `"item_type_display": ""` for all items — all showed the same icon.

**Resolution:** Tree endpoint now fetches item types from Jama API once per process lifetime via an in-memory map and populates `item_type_display` on every node.

---

### P11 — `post_install.py` is 25 KB of untested platform heuristics *(fragility)*

**Problem:** Platform detection, Windows registry junction creation, multiple Python `site-packages` scanning, zip extraction, `code.cmd` resolution — all procedural with no tests. Breaks silently on new Python versions, new VS Code install paths, or non-standard environments.

**Fix:** Refactor into a class with injectable dependencies. Add unit tests by mocking filesystem and subprocess calls.

**Effort:** Medium (1 day).

---

### P12 — CORS is `allow_origins=["*"]` *(security)*

**Problem:** The FastAPI backend accepts cross-origin requests from any origin. This is intentional for LAN-only use (the extension webview origin isn't `localhost`), but the backend also accepts write operations (create/update/delete items, update test runs). A malicious page visited by the user could make these requests.

**Fix:** Restrict to known origins:
```python
allow_origins=["vscode-webview:", "http://localhost:*", "https://localhost:*"]
```
Or use an explicit allowlist and add a CSRF token for state-changing operations.

**Document the current model explicitly** in the README as an interim justification even if the full fix is deferred.

**Effort:** Low for documentation; Medium for a proper fix (requires testing all webview origins).

---

## 6. Robustness Roadmap

### Completed

| Item | What | Commit |
|---|---|---|
| **P1** | Unified DB: `ProjectDb` is sole data store; `JamaCache` is edit log only | `7521df5` |
| **P3** | `assert` guards → `_need()` helper raising `HTTPException(503)` | `7c1ad92` |
| **P5** | Admin sessions persisted to `sessions.db` (SQLite) | `7c1ad92` |
| **P6** | bcrypt password hashing (work factor 12) with SHA-256 fallback | `7c1ad92` |
| **P7** | `SearchEngine` rewritten to query `ProjectDb` FTS5 | `7521df5` |
| **P10** | `item_type_display` populated from Jama API item-types map | `7c1ad92` |

### Remaining — Short-term (days)

| Item | What | Files |
|---|---|---|
| P9 | Add tests for `sync.py`, `tree.py`, `search.py`, `api_client.py` | `tests/` |
| P12 | Restrict CORS origins; document interim model | `server.py` |

### Remaining — Medium-term (weeks)

| Item | What | Files |
|---|---|---|
| P2 | Extract inline REST routes from `server.py` into `api/` routers | `server.py`, `api/*.py` |
| P4 | Refactor `cache_server.py` + `generate_caches.py` into classes | `server/` |
| P8 | Migrate extension panels to external HTML/CSS resources | `src/panels/`, `src/editor/` |

### Remaining — Long-term (months)

| Item | What | Files |
|---|---|---|
| P11 | Refactor + test `post_install.py` | `post_install.py` |
| — | Deprecate `JamaCache` entirely; repurpose as proper edit-action log with schema | `cache.py` |

---

## 7. Development Workflows

### Build and test — Python backend

```powershell
cd tools/jama-connect/client/backend

# Install (editable)
pip install -e . --legacy-peer-deps
# or:
uv sync

# Run unit tests only (no Jama credentials needed)
uv run pytest tests/ -v --ignore=tests/test_cache_schema.py

# Run all tests (set credentials first)
$env:JAMA_CLIENT_ID = "..."
$env:JAMA_CLIENT_SECRET = "..."
uv run pytest tests/ -v

# Start REST server (development)
jama-rest --port 8765
```

### Build and test — VS Code extension

```powershell
cd tools/jama-connect/client/vscode-extension

npm install

# Run unit tests (REQUIRED before every build)
npm test

# Build
node esbuild.mjs

# Copy to installed extension directories
.\scripts\build_extension.ps1   # compiles + copies to .vscode/ and .devin/

# Or manually:
Copy-Item out/extension.js   ~/.vscode/extensions/enphase.jama-editor-0.1.0/out/
Copy-Item out/extension.js   ~/.devin/extensions/enphase.jama-editor-0.1.0/out/
# Then: Ctrl+Shift+P → Developer: Reload Window
```

### Build and test — LAN cache server

```powershell
cd tools/jama-connect/server

cp .env.example .env   # fill in credentials and project IDs

# Start
docker compose up -d --build

# View logs
docker compose logs -f api

# Generate caches manually
docker exec jama-cache-api python /app/scripts/generate_caches.py --out /data

# Build distributable zip
cd ..
python server/build_zip.py
# → server/dist/jama-cache-server-0.5.3.zip
```

### How to add a new MCP tool correctly

1. Add the function to `server.py` (or, better, to the correct domain file once P2 is done)
2. Use `ToolError` instead of `assert` for guard checks (once P3 is done)
3. Write at least one test in `tests/test_mcp_tools.py` using the `mock_services` fixture
4. Document the tool's docstring following the established pattern (Args + Returns)

### How to add a new REST endpoint correctly

1. Determine the correct router (`api/db_mgmt.py`, `api/cache_server_routes.py`, `settings_api.py`, or a new file)
2. Add the route handler to that router — do NOT add inline routes to `server.py`
3. Add the corresponding TypeScript method to `api.ts`
4. Add an integration test or a mock-server test

### Rule: run `npm test` before every extension build/deploy

```
RULE: npm test must pass before copying out/ to any installed extension directory.
      Fix failures before proceeding. Never skip.
```

See `AGENTS.md` for the full test suite documentation.
