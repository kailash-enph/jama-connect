# jama-connect

Unified Jama Connect package — MCP server + REST API + web viewer + VS Code extension.

**Version:** 0.5.5 | **Repo:** [github.com/kailash-enph/jama-connect](https://github.com/kailash-enph/jama-connect)

## Features

- **MCP Server** — Jama integration for Windsurf/Devin (stdio transport)
- **REST API** — FastAPI on localhost:8765 with full Jama CRUD
- **Web Viewer** — pre-built static site at `/viewer` (no Node.js at runtime)
- **VS Code Extension** — rich-text editor for Jama items with TipTap
- **Daemon Mode** — `jama-connect --daemon` runs MCP + REST in one process
- **Cache Seed** — pre-populated Enphase Jama cache (91 projects, 8500+ items) downloaded from SharePoint on first run
- **Devin Symlink** — `jama-post-install` creates junction at `~/.devin/mcp-servers/jama-connect`
- **SQLite Cache** — FTS5 full-text search, schema v3, TTL invalidation
- **Cross-platform** — Windows, macOS, Linux (pure Python, no WSL needed)

## Installation

### End-user (from PyPI or wheel)

```bash
pip install jama-connect

# Then activate — installs extensions + starts daemon:
jama-post-install
```

### Developer (full build from source)

```powershell
# One command: compile extension → run tests → build wheel → pip install
.\client\scripts\build-and-install.ps1

# Script prints this at the end — copy and run:
jama-post-install
```

`build-and-install.ps1` options:
```powershell
-SkipVsix    # Skip vsce packaging (faster when only JS changed)
-SkipTests   # Skip extension + Python tests
-Port N      # Backend port to stop (default: 8765)
```

## CLI Commands

| Command | What it does |
|---|---|
| `jama-connect` | MCP server (stdio) for Windsurf/Devin |
| `jama-rest` | REST API + web viewer (always-on daemon) |
| `jama-post-install` | Stop daemon → install extensions → start daemon |
| `jama-post-install --check` | Check install status without making changes |
| `jama-post-install --no-start` | Install extensions but skip daemon start |

## Running

### Backend (always-on)

`jama-rest` is the primary process. It serves the REST API, web viewer, MCP
server (background thread), and SSE event bus — all on port 8765.

```bash
jama-rest                  # starts and stays running
```

Open http://localhost:8765/viewer in your browser.

`jama-post-install` starts it automatically. To start it again after a reboot:

```bash
jama-rest
# or re-run jama-post-install
```

### MCP for Windsurf/Devin

Add to `mcp_config.json` and point at the running `jama-rest` — no separate
MCP process needed:

```json
{
  "mcpServers": {
    "jama-mcp-v2": {
      "command": "jama-connect",
      "args": []
    }
  }
}
```

### Active Project

All three clients (VS Code extension, web viewer, MCP/AI) share **one active
project**. Change it in any one place and all views update instantly via SSE:

- **VS Code** → Settings panel → Project dropdown
- **Web Viewer** → Project dropdown (top of tree page)
- **AI/MCP** → `jama_set_active_project(project_id=20570)`

## First-Run Cache Seed

On first run (no `~/.jama-mcp-v2/projects/<id>.db` exists), jama-connect will:

1. Check `~/Downloads/`, `~/.jama-mcp-v2/`, cwd, and system temp for `cache_seed.db.gz`
2. If not found, open the SharePoint link in your browser and wait for you to download
3. After download, auto-find and decompress (44 MB → 321 MB)

This gives you instant access to 91 projects and 8500+ items without a full sync.

## MCP Config (for Windsurf/Devin)

```json
{
  "jama-mcp-v2": {
    "command": "jama-connect",
    "args": [],
    "env": {
      "JAMA_URL": "https://enphase.jamacloud.com",
      "JAMA_CLIENT_ID": "your-client-id",
      "JAMA_CLIENT_SECRET": "your-client-secret",
      "JAMA_CACHE_DIR": "~/.jama-mcp-v2",
      "JAMA_REST_PORT": "8765"
    }
  }
}
```

## Credential Auto-Loading

All commands (`jama-connect`, `jama-rest`, `jama-editor`) **automatically find credentials** from your IDE's MCP config — no need to set env vars manually.

Searched in order (first match wins):

| IDE | Config path |
|---|---|
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Devin | `~/AppData/Roaming/devin/mcp_config.json` |
| Claude Desktop | `~/.config/claude/mcp_config.json` |
| Cursor | `~/.cursor/mcp.json` |

Looks for a `jama-mcp-v2`, `jama-connect`, or `jama` entry and reads the `env` block.

If no config is found, set env vars directly:
```bash
set JAMA_CLIENT_ID=your-client-id
set JAMA_CLIENT_SECRET=your-client-secret
```

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `JAMA_URL` | `https://enphase.jamacloud.com` | Jama instance URL |
| `JAMA_CLIENT_ID` | auto from mcp_config | OAuth2 client ID |
| `JAMA_CLIENT_SECRET` | auto from mcp_config | OAuth2 client secret |
| `JAMA_CACHE_DIR` | `~/.jama-mcp-v2` | Cache directory |
| `JAMA_REST_PORT` | `8765` | REST API port |
| `JAMA_MAX_CONCURRENT` | `10` | Jama API concurrency limit |
| `JAMA_CACHE_SERVER_URL` | _(unset)_ | LAN cache server URL (e.g. `http://SERVER:8866`) |

## Development

### Prerequisites
- Python ≥3.12
- Node.js ≥18 (build-time only, for viewer)
- uv (Python package manager)

### Dev Setup
```bash
uv sync                            # install Python deps
cd viewer && npm ci                # install viewer deps
```

### Build & Install (one command)
```powershell
# Full build: extension JS + tests + vsix + wheel + pip install
.\client\scripts\build-and-install.ps1

# Then activate on this machine:
jama-post-install
```

Flags: `-SkipVsix` (no vsce), `-SkipTests` (no tests), `-Port N`

### Build steps individually
```bash
# Extension JS only
cd client/vscode-extension && node esbuild.mjs

# Python wheel only
cd client/backend && uv build

# Extension tests
cd client/vscode-extension && npm test

# Python tests
cd client/backend && uv run pytest tests/ -v
```

### Publish
```bash
twine upload --repository-url http://nz-lnx-01/pypi dist/*
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  jama-rest  (always-on — started by jama-post-install)   │
│                                                          │
│  main thread: Uvicorn :8765                              │
│    /api/*        REST endpoints (ProjectDb)              │
│    /viewer/      Next.js static web viewer               │
│    /api/events   SSE push — active_project_changed       │
│    /settings/*   credentials, project selection          │
│                                                          │
│  background thread: MCP stdio (when AI connects)         │
│    ~40 jama_* tools — uses same ProjectDb/SearchEngine   │
│    exits when AI disconnects; REST stays up              │
│                                                          │
│  shared: ServiceRegistry                                 │
│    CacheManager  → projects/{id}.db  (per-project data)  │
│    SearchEngine  → active project FTS5                   │
│    JamaCache     → cache.db (edit write buffer only)     │
│    JamaApiClient → OAuth2 REST                           │
└──────────────────────────────────────────────────────────┘
       │ HTTP :8765              │ HTTP :8765       │ stdio
       ▼                         ▼                  ▼
 VS Code Extension         Web Viewer          Windsurf/Devin
 (tree + item editor)      (Next.js SPA)       (MCP tools)

Active project changed in any client
  → POST /settings/project/select
  → SSE broadcast: active_project_changed
  → all tree views reload automatically
```

## Files

| Location | Purpose |
|---|---|
| `~/.jama-mcp-v2/projects/<id>.db` | Jama item/test cache |
| `~/.jama-mcp-v2/editor_db.sqlite` | Editor drafts/schema |
| `~/.jama-mcp-v2/logs/` | Service logs |
| `~/.devin/mcp-servers/jama-connect` | Devin symlink/junction |
