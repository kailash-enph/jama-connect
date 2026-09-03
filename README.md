# jama-connect

Unified Jama Connect package — MCP server + REST API + web viewer + VS Code extension.

**Version:** 0.5.0 | **Repo:** [github.com/kailash-enph/jama-connect](https://github.com/kailash-enph/jama-connect)

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

```bash
pip install jama-connect
```

Or from wheel:
```bash
pip install dist/jama_connect-0.5.0-py3-none-any.whl
```

### Post-Install

```bash
jama-post-install          # Creates symlink in ~/.devin/mcp-servers/
```

## CLI Commands

| Command | What it does |
|---|---|
| `jama-connect` | MCP server (stdio) for Windsurf/Devin |
| `jama-connect --daemon` | MCP + REST API in one process (recommended) |
| `jama-rest` | REST API + web viewer standalone |
| `jama-editor` | Install VS Code extension |
| `jama-post-install` | Create symlink in `~/.devin/mcp-servers/` |

## Running

### Daemon Mode (recommended for Devin/Windsurf)

Starts both MCP (stdio) and REST API (port 8765) in one process:

```bash
jama-connect --daemon
```

This is what `mcp_config.json` uses — no separate `jama-rest` terminal needed.

### REST API Only

```bash
jama-rest
```

Open http://localhost:8765/viewer in your browser.

### VS Code Extension

```bash
jama-editor                # Installs bundled VSIX to VS Code
```

Then open VS Code → Jama Editor sidebar. Requires `jama-rest` or `jama-connect --daemon` running.

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

### Build
```bash
.\build-package.ps1                # Windows (viewer + extension + wheel)
./build-package.sh                 # macOS/Linux
uv build                           # wheel only
```

### Test
```bash
uv run pytest tests/ -v            # Python tests
cd vscode-extension && npm test    # TypeScript tests
```

### Publish
```bash
twine upload --repository-url http://nz-lnx-01/pypi dist/*
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│         jama-connect (single process)            │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐      │
│  │ MCP stdio│  │ REST API │  │  Static   │      │
│  │ (tools)  │  │ /api/*   │  │  Viewer   │      │
│  │          │  │ /editor/*│  │  /viewer  │      │
│  └──────────┘  └──────────┘  └───────────┘      │
│              ↕                                   │
│     ┌──────────────────────┐                     │
│     │  SQLite cache.db     │                     │
│     │  (FTS5, schema v3)   │                     │
│     │  + editor_db.sqlite  │                     │
│     └──────────────────────┘                     │
│              ↕                                   │
│     ┌──────────────────────┐                     │
│     │  Jama Cloud API      │                     │
│     │  (OAuth2 + httpx)    │                     │
│     └──────────────────────┘                     │
└──────────────────────────────────────────────────┘

Daemon mode: MCP stdio (main thread) + REST API (background thread)
             → one process, shared cache, shared API client
```

## Files

| Location | Purpose |
|---|---|
| `~/.jama-mcp-v2/projects/<id>.db` | Jama item/test cache |
| `~/.jama-mcp-v2/editor_db.sqlite` | Editor drafts/schema |
| `~/.jama-mcp-v2/logs/` | Service logs |
| `~/.devin/mcp-servers/jama-connect` | Devin symlink/junction |
