# jama-connect Package Structure

This is a consolidated pip package that bundles:
- **MCP Backend** — Jama Connect MCP server (stdio transport)
- **REST API** — FastAPI server with Jama viewer
- **VS Code Extension** — Rich-text editor for Jama items
- **Viewer** — Next.js static web app

## Directory Layout

```
jama-connect/
├── src/
│   ├── jama_mcp_v2/          # MCP backend + REST API
│   │   ├── server.py         # Main entry point (MCP + REST)
│   │   ├── api_client.py     # Jama OAuth2 client
│   │   ├── cache.py          # SQLite cache with FTS5
│   │   ├── sync.py           # Project sync engine
│   │   ├── writer.py         # Write-back to Jama
│   │   ├── editor_server.py  # Editor REST endpoints
│   │   ├── editor_cache.py   # Editor-specific cache
│   │   ├── schema_sync.py    # Schema synchronization
│   │   ├── editor_attachments.py
│   │   └── viewer_static/    # Pre-built Next.js static export
│   │
│   └── jama_editor/          # Editor backend (mounted in REST API)
│       ├── editor_server.py
│       └── ...
│
├── viewer/                   # Next.js viewer app (source)
│   ├── src/
│   ├── package.json
│   └── next.config.js
│
├── vscode-extension/         # VS Code extension (source)
│   ├── src/
│   ├── package.json
│   └── esbuild.mjs
│
├── scripts/
│   ├── install.ps1           # Windows installation
│   ├── install.sh            # macOS/Linux installation
│   ├── build-viewer.ps1      # Build Next.js viewer
│   └── ...
│
├── tests/                    # Python tests
│   ├── test_mcp_tools.py
│   ├── test_editor_push_cache.py
│   └── ...
│
├── pyproject.toml            # Package metadata + entry points
├── build-package.ps1         # Build script (viewer + extension + wheel)
├── README.md                 # User documentation
├── ARCHITECTURE.md           # Technical architecture
└── PACKAGE_STRUCTURE.md      # This file

```

## Entry Points

The package provides three CLI commands:

```bash
# MCP server (for Windsurf/Claude IDE)
jama-connect

# REST API + Viewer (standalone)
jama-rest

# VS Code extension installer/launcher
jama-editor
```

## Building the Package

### Full Build (viewer + extension + wheel)
```powershell
.\build-package.ps1
```

### Build Only Viewer
```powershell
.\build-package.ps1 -SkipExtension -SkipWheel
```

### Build Only Extension
```powershell
.\build-package.ps1 -SkipViewer -SkipWheel
```

### Build Only Wheel
```powershell
.\build-package.ps1 -SkipViewer -SkipExtension
```

## Installation

### From Local Wheel
```bash
pip install dist/jama-connect-0.3.0-py3-none-any.whl
```

### From Internal PyPI
```bash
pip install jama-connect --extra-index-url http://nz-lnx-01/pypi --trusted-host nz-lnx-01
```

## VS Code Extension Distribution

The VS Code extension can be distributed in two ways:

### 1. Bundled in Pip Package
The extension is built and included in the wheel. Users can install it via:
```bash
pip install jama-connect
jama-editor  # Installs the extension to VS Code
```

### 2. Published to VS Code Marketplace
The extension can be published separately to the marketplace:
```bash
cd vscode-extension
vsce publish
```

## Development

### Setup
```bash
uv sync                    # Install Python dependencies
cd viewer && npm ci        # Install viewer dependencies
cd ../vscode-extension && npm ci  # Install extension dependencies
```

### Running Locally
```bash
# MCP mode (for Windsurf)
uv run jama-connect

# REST API + Viewer
uv run jama-rest

# VS Code extension (development mode)
cd vscode-extension
npm run watch
```

## Testing

```bash
# Python tests
uv run pytest tests/ -v

# TypeScript tests
cd vscode-extension
npm run test
```

## Publishing

### To Internal PyPI
```bash
uv build
twine upload --repository-url http://nz-lnx-01/pypi dist/*
```

### To VS Code Marketplace
```bash
cd vscode-extension
vsce publish
```

## MCP Configuration

Add to your Windsurf `mcp_config.json`:

```json
{
  "jama-connect": {
    "command": "python",
    "args": ["-m", "jama_mcp_v2.server"],
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

Or if installed via pip:

```json
{
  "jama-connect": {
    "command": "jama-connect",
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
