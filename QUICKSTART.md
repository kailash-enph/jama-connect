# jama-connect Quick Start

## What is jama-connect?

A unified pip package that bundles:
- **MCP Server** — Jama integration for Windsurf/Claude IDE
- **REST API** — Standalone web server with Jama viewer
- **VS Code Extension** — Rich-text editor for Jama items

## Installation

### From Source (Development)

```bash
cd tools/jama-connect

# Install dependencies
uv sync

# Build the package (viewer + extension + wheel)
.\build-package.ps1

# Install locally
pip install -e .
```

### From Wheel

```bash
pip install dist/jama-connect-0.3.0-py3-none-any.whl
```

## Usage

### 1. MCP Server (for Windsurf)

Update your `mcp_config.json`:

```json
{
  "jama-connect": {
    "command": "jama-connect",
    "env": {
      "JAMA_URL": "https://enphase.jamacloud.com",
      "JAMA_CLIENT_ID": "your-client-id",
      "JAMA_CLIENT_SECRET": "your-client-secret",
      "JAMA_CACHE_DIR": "~/.jama-connect"
    }
  }
}
```

Then use `mcp6_*` tools in Windsurf.

### 2. REST API + Viewer

```bash
jama-rest
```

Open http://localhost:8765/viewer in your browser.

### 3. VS Code Extension

```bash
jama-editor
```

This installs the bundled extension to VS Code.

## Building

### Full Build (All Components)
```bash
.\build-package.ps1
```

### Build Only Viewer
```bash
.\build-package.ps1 -SkipExtension -SkipWheel
```

### Build Only Extension
```bash
.\build-package.ps1 -SkipViewer -SkipWheel
```

### Build Only Wheel
```bash
.\build-package.ps1 -SkipViewer -SkipExtension
```

## Testing

```bash
# Python tests
uv run pytest tests/ -v

# TypeScript tests (extension)
cd vscode-extension
npm run test
```

## Publishing

### To Internal PyPI
```bash
uv build
twine upload --repository-url http://nz-lnx-01/pypi dist/*
```

### To VS Code Marketplace (Future)
```bash
cd vscode-extension
vsce publish
```

## Troubleshooting

### Extension Installation Fails
```
ERROR: VS Code CLI not found
```

**Solution:** Ensure VS Code is installed and `code` is in your PATH.

On Windows, add to PATH:
```
C:\Users\<username>\AppData\Local\Programs\Microsoft VS Code\bin
```

### MCP Server Not Connecting
```
ERROR: 401 Unauthorized
```

**Solution:** Check your Jama credentials in `mcp_config.json`:
- `JAMA_CLIENT_ID` and `JAMA_CLIENT_SECRET` must be valid
- Ensure you're using the correct `JAMA_URL`

### Viewer Not Loading
```
ERROR: Connection refused on localhost:8765
```

**Solution:** Ensure the REST API is running:
```bash
jama-rest
```

## Directory Structure

```
tools/jama-connect/
├── src/                      # Python source code
│   ├── jama_mcp_v2/         # MCP backend + REST API
│   └── jama_editor/         # Editor backend
├── viewer/                  # Next.js viewer app
├── vscode-extension/        # VS Code extension
├── scripts/                 # Installation scripts
├── tests/                   # Python tests
├── pyproject.toml          # Package metadata
├── build-package.ps1       # Build script
└── README.md               # Full documentation
```

## Documentation

- **PACKAGE_STRUCTURE.md** — Detailed package layout and architecture
- **VSCODE_EXTENSION_BUNDLING.md** — How the extension is bundled and installed
- **ARCHITECTURE.md** — Technical architecture and data flow
- **README.md** — User documentation

## Next Steps

1. **Build the package:** `.\build-package.ps1`
2. **Install locally:** `pip install -e .`
3. **Test MCP:** Update `mcp_config.json` and restart Windsurf
4. **Test REST API:** Run `jama-rest` and open http://localhost:8765/viewer
5. **Test Extension:** Run `jama-editor` to install to VS Code

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the detailed documentation in the repo
3. Check logs in `~/.jama-connect/`
