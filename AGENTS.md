# AGENTS.md — Jama Connect Development Reference

> **Architecture reference:** See `ARCHITECTURE.md` in this directory for a complete technical
> description of both the client app and the LAN cache server — module maps, data flow diagrams,
> and a prioritised list of technical debt with concrete fix proposals.

## Repository Structure

```
tools/jama-connect/
├── archive/                   # Read-only snapshot of pre-refactor code
├── client/
│   ├── backend/               # Python backend (FastAPI + MCP)
│   │   ├── src/jama_mcp_v2/   # Main Python package
│   │   ├── tests/             # Pytest test suite
│   │   ├── pyproject.toml     # Dependencies (hatchling build)
│   │   └── uv.lock
│   └── vscode-extension/      # VS Code extension
│       ├── src/               # TypeScript source
│       ├── out/               # Compiled JS (generated, gitignore)
│       ├── package.json
│       └── esbuild.mjs        # 3 build targets: extension + tiptap + toolkit
└── server/                    # Docker cache server
    ├── docker-compose.yml     # nginx:alpine on port 8866
    ├── nginx.conf
    ├── .env.example
    └── scripts/
        ├── generate_caches.py # Nightly cache generator
        └── setup_task.ps1     # Windows Task Scheduler setup
```

## Python Backend (`client/backend/`)

### Build & Run
```powershell
cd client/backend
uv sync                          # install deps
python -m jama_mcp_v2.server     # start REST + MCP server on port 8765
```

### Package Layout (`src/jama_mcp_v2/`)
| Module | Purpose |
|--------|---------|
| `server.py` | FastAPI app + MCP tool registration (2866 lines) |
| `services.py` | Singleton ServiceRegistry (holds all initialized instances) |
| `cache.py` | Legacy JamaCache — single-file SQLite (keep for backward compat) |
| `sync.py` | SyncEngine — full + incremental Jama sync |
| `search.py` | SearchEngine — FTS5 + fast-path lookups |
| `testing.py` | TestManager — test plans/cycles/runs |
| `api_client.py` | JamaApiClient — OAuth2 REST client |
| **`db/`** | **New multi-project DB layer (Phase 2)** |
| `db/schema.py` | Schema v4 DDL + migration SQL |
| `db/project_db.py` | ProjectDb — per-project SQLite with bulk_write() |
| `db/master_db.py` | MasterDb — lightweight project list |
| `db/manager.py` | CacheManager — routes reads/writes to correct ProjectDb |
| `db/utils.py` | aiosqlite helpers (fetch_one, fetch_all, executemany_commit) |
| `db/fts.py` | FtsEntry dataclass + builder functions |
| `item_utils.py` | Pure utility functions (normalize, extract IDs) |
| `sse.py` | SSE helpers (SseQueue, sse_response) |
| **`net/`** | **Network layer** |
| `net/cache_server.py` | HTTP client for LAN cache server downloads |
| **`api/`** | **Modular REST route handlers** |
| `api/deps.py` | FastAPI Depends() factories |
| `api/db_mgmt.py` | `/api/db/*` — local DB management |
| `api/cache_server_routes.py` | `/api/cache-server/*` — LAN server integration |
| `settings_api.py` | `/settings/*` — credentials, project selection, cache management |

### Key Architecture Rules
- **`ProjectDb.bulk_write()`** — always use this context manager during full syncs. Defers all FTS index updates to a single rebuild at the end (~60× speedup).
- **`CacheManager`** — new code should use this; `JamaCache` is legacy-only.
- **`services.services`** — the global `ServiceRegistry` singleton in `services.py`.
- **Schema version** — currently v4 (`db/schema.py`). Add new migrations to `MIGRATION_SQL` dict.

### New REST Endpoints (Phase 4)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/db/status` | List all local project DBs |
| GET | `/api/db/project/{id}` | Stats for one project DB |
| DELETE | `/api/db/project/{id}` | Delete a project DB |
| POST | `/api/db/project/{id}/import` | Import a .db.gz file |
| GET | `/api/cache-server/ping` | Test cache server connectivity |
| GET | `/api/cache-server/index` | Fetch cache server index.json |
| POST | `/api/cache-server/url` | Update cache server URL |
| GET | `/api/cache-server/download/{id}` | SSE: download + decompress project DB |

### Performance Fixes Applied
| Bug | Location | Fix |
|-----|---------|-----|
| P1: FTS upsert per item (~59,500 ops) | `project_db.py` + `sync.py` | `bulk_write()` context — single FTS rebuild |
| P2: 4 extra SELECTs per FTS update | `cache.py` | Replaced with `INSERT OR REPLACE` in `db/fts.py` |
| P3: 2 JOINs per test run/cycle | `project_db.py` | `self._project_id` — no JOIN needed |
| P4: Relationship loop (N queries) | `project_db.py` | `executemany_commit()` — 1 call |

### Environment Variables
| Var | Default | Description |
|-----|---------|-------------|
| `JAMA_URL` | `https://enphase.jamacloud.com` | Jama instance URL |
| `JAMA_CLIENT_ID` | — | OAuth2 client ID |
| `JAMA_CLIENT_SECRET` | — | OAuth2 client secret |
| `JAMA_CACHE_DIR` | `~/.jama-mcp-v2` | Cache directory |
| `JAMA_REST_PORT` | `8765` | REST API port |
| `JAMA_CACHE_SERVER_URL` | — | LAN cache server URL (optional) |

## VS Code Extension (`client/vscode-extension/`)

### Build
```powershell
cd client/vscode-extension
npm install
node esbuild.mjs       # builds: out/extension.js, out/webview/tiptap.js, out/webview/toolkit.js
```

### Key Files
| File | Purpose |
|------|---------|
| `src/extension.ts` | Extension entry point, command registration |
| `src/editor/editorHtml.ts` | Item editor webview HTML (toolkit panels) |
| `src/editor/testDetailHtml.ts` | Test detail webview HTML |
| `src/panels/SettingsPanel.ts` | 4-tab settings panel |
| `src/panels/DbManagementPanel.ts` | Project database management panel |
| `src/webview/toolkit-entry.ts` | VS Code webview-ui-toolkit IIFE bundle entry |

### VS Code Commands
| Command | Description |
|---------|-------------|
| `jamaEditor.openItem` | Open item editor panel |
| `jamaEditor.manageProjectDbs` | Open DB management panel |
| `jamaEditor.syncProject` | Sync project to local cache |

### Toolkit Components Used
`<vscode-panels>`, `<vscode-panel-tab>`, `<vscode-panel-view>`, `<vscode-button>`,
`<vscode-text-field>`, `<vscode-text-area>`, `<vscode-dropdown>`, `<vscode-badge>`,
`<vscode-tag>`, `<vscode-progress-ring>`, `<vscode-divider>`

## Server (`server/`)

### Quick Start
```powershell
cd server
cp .env.example .env   # fill in JAMA_CLIENT_ID, JAMA_CLIENT_SECRET, JAMA_PROJECTS

# Generate caches (requires jama-connect installed from client/backend/)
pip install -e ../client/backend/
python scripts/generate_caches.py --out ./data

# Start nginx
docker compose up -d
```

### Output Structure
```
server/data/
├── index.json                              # project list + sizes + timestamps
├── master.db.gz                            # lightweight project metadata DB
└── projects/
    ├── 20570.db.gz                         # data_only variant (no images)
    └── 20570_with_images.db.gz             # with embedded image BLOBs
```

### Three-Tier Cache Strategy
1. **MasterDb** (`master.db.gz`) — downloaded once at startup, used for project list
2. **ProjectDb** (`projects/{id}.db.gz`) — downloaded on demand per project
3. **Legacy cache.db** — existing single-file cache, read-only fallback

## Testing

### Python Backend (`client/backend/`)
```powershell
cd client/backend

# All tests (credentials auto-loaded from mcp_config.json by services.py)
# For the live integration test, env vars must be pre-set at collection time:
$env:JAMA_CLIENT_ID = "6o0bn6dfznibkmw"
$env:JAMA_CLIENT_SECRET = "pcsf1k0va159iisr7btkd9q6v"
uv run pytest tests/ -v

# Unit tests only (no credentials needed)
uv run pytest tests/ -v --ignore=tests/test_cache_schema.py

# Specific test file
uv run pytest tests/test_mcp_tools.py -v
```

#### Python Test Suite Summary (117 tests)
| File | Tests | Coverage |
|------|-------|---------|
| `test_cache_schema.py` | 9 (1 live) | Schema init, FTS, imports, live DB round-trip |
| `test_editor_attachments.py` | 12 | EditorAttachmentManager unit tests |
| `test_editor_push_cache.py` | 11 | Image URL rewrite, MCP cache refresh, proxy endpoint |
| `test_editor_server_attachments.py` | 7 | Attachment REST endpoints |
| `test_generate_caches.py` | 13 | Cache generator: compress, master DB, index.json, load_env, generate_project |
| `test_cache_server_client.py` | 16 | LAN cache HTTP client: fetch_index, ping, decompress, download (mock server) |
| `test_mcp_refresh_endpoints.py` | 5 | Refresh item/plan/cycle/run endpoints |
| `test_mcp_tools.py` | 44 | All MCP tools (mocked Jama API) |

#### Fixture Notes
- `mock_services` patches `jama_mcp_v2.services.services` (the `ServiceRegistry` singleton), **not** `jama_editor.editor_server` module globals (those were removed in the Phase 0 refactor).
- `isolate_image_cache` (in `TestProxyImageEndpoint`) patches `jama_editor.editor_server._SVC_CACHE_DIR` to a fresh `tmp_path` per test, preventing stale-file pollution across tests.

---

### VS Code Extension (`client/vscode-extension/`)

Uses **vitest** with a vscode module mock — runs in Node, no Extension Host required.

```powershell
cd client/vscode-extension
npm test              # vitest run (all tests, single pass)
npm run test:watch    # vitest watch mode (during development)
npm run test:coverage # generate coverage report
```

**RULE: run `npm test` before every build/deploy of the extension. Fix any failures before proceeding.**

#### Extension Test Suite Summary (23 tests)
| File | Tests | What it covers | Bugs caught |
|------|-------|---------------|------------|
| `src/__tests__/imageRewrite.test.ts` | 7 | Image URL rewriting to local proxy | — |
| `src/__tests__/projectTree.test.ts` | 16 | `ProjectSelector` + `ProjectTreeProvider` | All 4 bugs below |

#### Regression Tests — Past Production Bugs
| Bug | Test(s) | PR/commit |
|-----|---------|-----------|
| `treeCache=[]` caused infinite re-fetch when API returned empty | "calls getItemTree exactly once even when API returns []" | be21676 |
| Project switch didn't reload tree (wrong cache guard) | "re-fetches after project switch (cache reset to null)" | be21676 |
| Silent blank tree when project has no local DB | "shows hint item (not blank) when project has no cached data" | be21676 |
| `setProjectById` not available — SettingsPanel couldn't update selector | "setProjectById(): updates selectedId, persists, fires onDidChange" | c2ccee8 |

#### Extension Test Architecture
- **vscode mock**: `src/__tests__/mocks/vscode.ts` — stubs `EventEmitter`, `TreeItem`, `ThemeIcon`, `window`, `commands`, `workspace`
- **vitest config**: `vitest.config.ts` — `alias: { vscode: "...mocks/vscode.ts" }` redirects all `import "vscode"` to the stub
- **No Extension Host needed** — all tree provider logic is pure TypeScript, fully testable in Node

#### When to Add Tests
Add a new test in `src/__tests__/projectTree.test.ts` (or a new file) whenever you:
- Add a new command or button that changes extension state
- Add logic to a tree provider (`getChildren`, `getTreeItem`, cache behaviour)
- Fix a bug — write the regression test **first**, confirm it fails, then fix the code
