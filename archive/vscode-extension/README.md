# Jama Editor — VS Code Extension

Edit Jama Connect items directly in VS Code / Windsurf with a native sidebar tree,
rich-text editor tabs, workflow transitions, comments, and full traceability.

## Features

- **Sidebar TreeView** — Browse synced Jama projects and items
- **Editor Tabs** — Open items in custom WebView tabs with save/revert
- **Backend Auto-Start** — Automatically launches the Python REST backend
- **Workflow Transitions** — Execute transitions from the editor toolbar
- **Comments** — View and post comments inline
- **Search** — Quick search across all synced items
- **Credential Storage** — Securely stores Jama OAuth credentials

## Quick Start

1. Open VS Code or Windsurf
2. The extension auto-starts the Jama backend on activation
3. Click the Jama icon in the Activity Bar to browse projects
4. Click any item to open it in an editor tab
5. Edit fields and click **Save** to write back to Jama

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `jamaEditor.backendPath` | (auto-detect) | Path to jama-mcp-v2 directory |
| `jamaEditor.port` | `8765` | REST API port |
| `jamaEditor.jamaUrl` | `https://enphase.jamacloud.com` | Jama instance URL |
| `jamaEditor.autoStartBackend` | `true` | Auto-start backend on activation |
| `jamaEditor.uvPath` | `uv` | Path to uv executable |

## Commands

| Command | Description |
|---------|-------------|
| `Jama: Start Backend` | Manually start the Python backend |
| `Jama: Stop Backend` | Stop the running backend |
| `Jama: Refresh` | Reload the project tree |
| `Jama: Search Items...` | Full-text search across items |
| `Jama: Set Credentials` | Store Jama OAuth credentials securely |
| `Jama: Sync Project` | Re-sync a project from Jama |

## Development

```bash
cd vscode-extensions/jama-editor
npm install
npm run watch    # esbuild in watch mode
# Press F5 to launch Extension Development Host
```

## Architecture

```
extension.ts          → Entry point: activate/deactivate
backend.ts            → BackendManager: spawns Python FastAPI process
api.ts                → ApiClient: HTTP calls to localhost:8765
tree/projectTree.ts   → TreeDataProvider for sidebar
editor/jamaEditor.ts  → WebView panel manager for editor tabs
editor/editorHtml.ts  → HTML template for editor WebView
utils/config.ts       → Settings reader
```
