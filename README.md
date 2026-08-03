# Jama MCP v2

Unified Jama Connect backend — MCP tools + REST API + built-in viewer.

**Features:**
- **Async API client** (httpx, OAuth2 client_credentials)
- **SQLite cache** with FTS5 full-text search and TTL invalidation
- **MCP tools** for Windsurf/Claude IDE integration (stdio transport)
- **REST API** (FastAPI on localhost:8765)
- **Built-in viewer** — pre-built static site served at `/viewer` (no Node.js needed at runtime)
- **Editor** — VS Code extension with rich-text editing, drafts, and push-back
- **Multi-project** support, test management, delta sync, write-back
- **Cross-platform** — Windows + macOS (login service auto-start)

## Installation (End Users)

### Windows
```powershell
.\scripts\install.ps1
```

### macOS
```bash
./scripts/install.sh
```

Both scripts: check Python ≥3.12, install from internal PyPI (`nz-lnx-01`), optionally install login service.

### Manual Install
```bash
pip install jama-mcp-v2 --extra-index-url http://nz-lnx-01/pypi --trusted-host nz-lnx-01
```

## Running

```bash
# Installed via pip — use the CLI entry point:
jama-rest                          # REST API + viewer on port 8765

# Development mode via uv:
uv run python -m jama_mcp_v2 --rest-only --port 8765

# MCP mode (for Windsurf — stdin/stdout):
jama-mcp-v2
```

Open http://localhost:8765/viewer in your browser.

## Login Service (Auto-Start)

| Platform | Mechanism | Install | Uninstall |
|----------|-----------|---------|-----------|
| Windows | Task Scheduler | `.\scripts\install-service.ps1` | `.\scripts\install-service.ps1 -Uninstall` |
| macOS | launchd agent | `./scripts/install-service.sh` | `./scripts/install-service.sh --uninstall` |

The VS Code extension also offers to install the login service on first activation.

## Development

### Prerequisites
- Python ≥3.12
- Node.js ≥18 (build-time only, for viewer)
- uv (Python package manager)

### Dev Setup
```bash
uv sync                            # install Python deps
cd jama-viewer && npm ci           # install viewer deps
```

### Build Viewer (static export)
```bash
./scripts/build-viewer.sh          # macOS/Linux
.\scripts\build-viewer.ps1         # Windows
```
This runs `next build` with `output: 'export'` and copies `jama-viewer/out/` → `src/jama_mcp_v2/viewer_static/`.

### Build Wheel
```bash
# After building viewer:
uv build                           # creates dist/jama_mcp_v2-0.2.0-py3-none-any.whl
```

### Publish
```bash
twine upload --repository-url http://nz-lnx-01/pypi dist/*
```

## MCP Config (for Windsurf)

```json
{
  "jama": {
    "command": "uv",
    "args": ["run", "--directory", "<path>/jama-mcp-v2", "jama-mcp-v2"],
    "env": {
      "JAMA_URL": "https://enphase.jamacloud.com",
      "JAMA_CLIENT_ID": "...",
      "JAMA_CLIENT_SECRET": "...",
      "JAMA_CACHE_DIR": "~/.jama-mcp-v2",
      "JAMA_REST_PORT": "8765"
    }
  }
}
```

## Architecture

```
┌─────────────────────────────────────────────┐
│         jama-mcp-v2 (single process)        │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ MCP stdio│  │ REST API │  │  Static   │ │
│  │ (tools)  │  │ /api/*   │  │  Viewer   │ │
│  │          │  │ /editor/*│  │  /viewer  │ │
│  └──────────┘  └──────────┘  └───────────┘ │
│              ↕                              │
│     ┌──────────────────────┐                │
│     │  SQLite cache.db     │                │
│     │  (FTS5, schema v3)   │                │
│     └──────────────────────┘                │
│              ↕                              │
│     ┌──────────────────────┐                │
│     │  Jama Cloud API      │                │
│     │  (OAuth2 + httpx)    │                │
│     └──────────────────────┘                │
└─────────────────────────────────────────────┘
```
