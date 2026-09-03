# jama-connect Package Build Summary

**Date:** August 3, 2026  
**Status:** ✓ Package structure created and ready for build

## What Was Done

### 1. Created Consolidated Package Structure

Copied all necessary files from original locations to `tools/jama-connect/`:

```
✓ src/                    — Python source (jama_mcp_v2 + jama_editor)
✓ viewer/                 — Next.js viewer app (source)
✓ vscode-extension/       — VS Code extension (source)
✓ scripts/                — Installation scripts
✓ tests/                  — Python test suite
✓ pyproject.toml          — Package metadata + entry points
✓ uv.lock                 — Dependency lock file
```

### 2. Created Build Infrastructure

**Files created:**

- `build-package.ps1` — Automated build script that:
  - Builds Next.js viewer (static export)
  - Builds VS Code extension (VSIX)
  - Creates Python wheel
  - Supports selective builds (`-SkipViewer`, `-SkipExtension`, `-SkipWheel`)

- `pyproject.toml` — Package configuration with three entry points:
  - `jama-connect` — MCP server
  - `jama-rest` — REST API + viewer
  - `jama-editor` — Extension installer

- `.gitignore` — Excludes build artifacts, node_modules, venv, etc.

### 3. Created Documentation

- **QUICKSTART.md** — Get started in 5 minutes
- **PACKAGE_STRUCTURE.md** — Detailed directory layout and architecture
- **VSCODE_EXTENSION_BUNDLING.md** — Strategy for bundling extension in pip package
- **ARCHITECTURE.md** — Technical architecture (copied from original)
- **README.md** — User documentation (copied from original)

## Next Steps

### 1. Build the Package

```bash
cd tools/jama-connect
.\build-package.ps1
```

This will:
1. Install viewer dependencies (`npm ci`)
2. Build Next.js static export (`npm run build`)
3. Install extension dependencies (`npm ci`)
4. Build extension (`npm run compile`)
5. Package extension to VSIX (`npm run package`)
6. Build Python wheel (`uv build`)

### 2. Test Installation

```bash
# Install locally
pip install dist/jama-connect-0.3.0-py3-none-any.whl

# Test MCP
jama-connect --help

# Test REST API
jama-rest

# Test extension installer
jama-editor
```

### 3. Publish to PyPI

```bash
# To internal PyPI
twine upload --repository-url http://nz-lnx-01/pypi dist/*

# To public PyPI (future)
twine upload dist/*
```

## VS Code Extension Bundling Strategy

The package implements **Approach 1: Extension Installer Command**

**How it works:**
1. Extension is built to `.vsix` during package build
2. `.vsix` is included in the wheel
3. `jama-editor` command installs the `.vsix` via `code --install-extension`

**Benefits:**
- ✓ Works offline
- ✓ No external dependencies
- ✓ Users get exact version bundled with pip package
- ✓ Can be upgraded to marketplace distribution later

**Future enhancement:** Hybrid approach with marketplace fallback

See `VSCODE_EXTENSION_BUNDLING.md` for detailed strategy.

## MCP Configuration

Update your `mcp_config.json` to use the new package:

```json
{
  "jama-connect": {
    "command": "jama-connect",
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

## Old Locations (Kept As-Is)

The original files remain in place:
- `mcp-servers/jama-mcp-v2/` — Original MCP backend
- `vscode-extensions/jama-editor/` — Original VS Code extension

These can be deleted once the new package is tested and working.

## File Sizes

```
src/                    1.7 MB  (Python source + viewer static)
viewer/                 533 KB  (Next.js source)
vscode-extension/       1.14 MB (VS Code extension source)
scripts/                31 KB   (Installation scripts)
tests/                  61 KB   (Python tests)
uv.lock                 209 KB  (Dependency lock)
pyproject.toml          1.2 KB  (Package metadata)
```

**Total:** ~3.7 MB (before build artifacts)

## Build Artifacts (After Build)

```
dist/
├── jama-connect-0.3.0-py3-none-any.whl  (~5-10 MB)
└── jama-connect-0.3.0.tar.gz            (~2-3 MB)

vscode-extension/
└── jama-editor-0.3.0.vsix               (~1-2 MB)
```

## Verification Checklist

- [x] Package structure created
- [x] All source files copied
- [x] pyproject.toml configured
- [x] Build script created
- [x] Documentation written
- [ ] Build tested (`.\build-package.ps1`)
- [ ] Installation tested (`pip install dist/*.whl`)
- [ ] MCP server tested (`jama-connect`)
- [ ] REST API tested (`jama-rest`)
- [ ] Extension installer tested (`jama-editor`)
- [ ] Published to internal PyPI

## Commands Reference

```bash
# Build
cd tools/jama-connect
.\build-package.ps1

# Install
pip install dist/jama-connect-0.3.0-py3-none-any.whl

# Run
jama-connect              # MCP server
jama-rest                 # REST API + viewer
jama-editor               # Install VS Code extension

# Test
uv run pytest tests/ -v

# Publish
twine upload --repository-url http://nz-lnx-01/pypi dist/*
```

## Notes

1. **Python version:** Requires Python ≥ 3.12
2. **Node.js:** Required only for building (not at runtime)
3. **VS Code:** Required only for extension installation
4. **Offline support:** MCP and REST API work offline; extension installation requires VS Code CLI
5. **Cross-platform:** Build scripts provided for Windows (PowerShell) and macOS/Linux (bash)

## Support Files

- `QUICKSTART.md` — Quick start guide
- `PACKAGE_STRUCTURE.md` — Detailed structure and architecture
- `VSCODE_EXTENSION_BUNDLING.md` — Extension bundling strategy
- `ARCHITECTURE.md` — Technical architecture
- `README.md` — User documentation
- `BUILD_SUMMARY.md` — This file
