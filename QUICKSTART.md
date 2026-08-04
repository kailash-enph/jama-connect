# jama-connect Quick Start

## What is jama-connect?

One pip package that gives you:
- **MCP Server** — Jama integration for Windsurf/Devin (stdio)
- **REST API** — FastAPI web server with Jama viewer (port 8765)
- **VS Code Extension** — rich-text editor for Jama items
- **Daemon Mode** — MCP + REST in a single process
- **Cache Seed** — pre-populated Enphase data on first run

## Install

```bash
pip install jama-connect

# Create symlink for Devin
jama-post-install
```

## First Run — Cache Seed

On first run, if no `~/.jama-connect/cache.db` exists:

1. jama-connect checks `~/Downloads/` for `cache_seed.db.gz`
2. If not found, opens your browser to the SharePoint download link
3. Download the file (44 MB), press ENTER
4. Seed is auto-decompressed → 321 MB cache with 91 projects, 8500+ items

After seeding, you have instant access — no full sync needed.

## Usage

### For Windsurf/Devin (recommended)

Add to `mcp_config.json`:

```json
{
  "jama-mcp-v2": {
    "command": "jama-connect",
    "args": ["--daemon"],
    "env": {
      "JAMA_URL": "https://enphase.jamacloud.com",
      "JAMA_CLIENT_ID": "your-client-id",
      "JAMA_CLIENT_SECRET": "your-client-secret",
      "JAMA_CACHE_DIR": "~/.jama-connect",
      "JAMA_REST_PORT": "8765"
    }
  }
}
```

`--daemon` starts both MCP and REST API in one process. No separate terminal needed.

### Browse Jama in Browser

```bash
jama-rest
```

Open http://localhost:8765/viewer

Credentials are **auto-loaded** from your `mcp_config.json` — no env vars needed.

### VS Code Extension

The editor backend is built into `jama-rest` and `jama-connect --daemon`.

1. Start the backend: `jama-rest` or `jama-connect --daemon`
2. Open VS Code → click the **Jama Editor** icon in the activity bar

The `jama-editor` command installs the VSIX to VS Code (only needed once).

## All Commands

| Command | Purpose |
|---|---|
| `jama-connect` | MCP server only (stdio) |
| `jama-connect --daemon` | MCP + REST API in one process |
| `jama-rest` | REST API + viewer standalone |
| `jama-editor` | Install VS Code extension |
| `jama-post-install` | Create Devin symlink |
| `jama-post-install --check` | Verify symlink exists |

## Troubleshooting

### Jama Editor sidebar is empty
The VS Code extension needs the REST backend running.
- Use `jama-connect --daemon` (if using Devin)
- Or run `jama-rest` in a terminal

### 401 Unauthorized
Credentials are auto-loaded from `mcp_config.json` (Windsurf, Devin, Claude, Cursor).
If no config exists, set env vars: `set JAMA_CLIENT_ID=... && set JAMA_CLIENT_SECRET=...`

### Port 8765 already in use
Another instance is running. Kill it:
```bash
# Windows
taskkill /F /IM jama-connect.exe
# Linux/macOS
pkill -f jama-connect
```

### Symlink creation fails on Windows
Requires Developer Mode or admin privileges. `jama-post-install` falls back to Windows junction (no admin needed).

## Files

| Location | Purpose |
|---|---|
| `~/.jama-connect/cache.db` | Jama item/test cache (321 MB with seed) |
| `~/.jama-connect/editor_db.sqlite` | Editor drafts and schema |
| `~/.jama-connect/logs/` | Service logs |
| `~/.devin/mcp-servers/jama-connect` | Devin symlink/junction |

## Documentation

- **README.md** — Full documentation and architecture
- **ARCHITECTURE.md** — Data flow diagrams, image proxy, push flow
- **PACKAGE_STRUCTURE.md** — Source tree and build layout
- **VSCODE_EXTENSION_BUNDLING.md** — How the extension is bundled

## Support

1. Check logs in `~/.jama-connect/logs/`
2. Review [README.md](README.md) for detailed architecture
3. File issues at [github.com/kailash-enph/jama-connect](https://github.com/kailash-enph/jama-connect/issues)
