# Jama Connect User Manual

> **Version:** 0.5.0 | **Package:** jama-connect | **Author:** Enphase Energy — Hardware Engineering AI Tools

---

## Table of Contents

1. [Overview](#overview)
2. [What is Jama Connect?](#what-is-jama-connect)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Getting Started](#getting-started)
6. [Components](#components)
7. [Command Reference](#command-reference)
8. [MCP Tools Reference](#mcp-tools-reference)
9. [Web Viewer Guide](#web-viewer-guide)
10. [VS Code Extension](#vs-code-extension)
11. [Troubleshooting](#troubleshooting)
12. [Advanced Topics](#advanced-topics)
13. [FAQ](#faq)

---

## Overview

**jama-connect** is a unified Python package that provides comprehensive integration with Jama Connect for requirements management, test management, and traceability. It combines four powerful components into a single pip-installable package:

- **MCP Server** — Model Context Protocol integration for AI assistants (Windsurf, Devin, Claude Desktop)
- **REST API** — FastAPI web server with full Jama CRUD operations
- **Web Viewer** — Pre-built React UI for browsing, searching, and managing Jama data
- **VS Code Extension** — Rich-text editor for creating and editing Jama items

### Key Features

✅ **Unified Installation** — One `pip install` gets everything  
✅ **Daemon Mode** — MCP + REST API in a single process  
✅ **Multi-Project DB** — Per-project SQLite (schema v4) with bulk FTS rebuild for fast sync  
✅ **LAN Cache Server** — Download pre-synced project DBs from a local nginx server in seconds  
✅ **Offline Search** — SQLite FTS5 full-text search across items, test plans, cycles, and runs  
✅ **Auto-Credentials** — Reads from your IDE's MCP config automatically  
✅ **Cross-Platform** — Windows, macOS, Linux (pure Python, no WSL needed)  
✅ **Zero Runtime Dependencies** — Viewer is pre-built static HTML/JS (no Node.js at runtime)

---

## What is Jama Connect?

[Jama Connect](https://www.jamasoftware.com/) is a requirements management and test management platform used by engineering teams to:

- Define and organize product requirements (L0 Market → L1 System → L2 Engineering → L3 Functional)
- Trace requirements to design artifacts, test cases, and verification results
- Manage test plans, test cycles, and test runs
- Track changes, approvals, and compliance

**jama-connect** brings Jama data into your local development environment with:

- **Fast offline search** — no waiting for cloud API responses
- **AI integration** — query requirements and tests from Windsurf/Devin chat
- **Rich editing** — TipTap-based WYSIWYG editor in VS Code
- **Batch operations** — sync entire projects in minutes, not hours

---

## Installation

### Prerequisites

- **Python 3.12+** (check with `python --version`)
- **pip** package manager
- **Jama Connect account** with OAuth2 credentials (see [Configuration](#configuration))

### Install from PyPI

```bash
pip install jama-connect
```

### Install from Wheel

If you have a local wheel file (e.g., from the Enphase bundle):

```bash
pip install dist/jama_connect-0.5.0-py3-none-any.whl
```

### Post-Install Setup

Create a symlink/junction in your IDE's MCP servers directory:

```bash
jama-post-install
```

This creates:
- **Windows:** `%USERPROFILE%\.devin\mcp-servers\jama-connect` (junction)
- **macOS/Linux:** `~/.devin/mcp-servers/jama-connect` (symlink)

Verify the symlink:

```bash
jama-post-install --check
```

---

## Configuration

### OAuth2 Credentials

jama-connect uses OAuth2 **client credentials** flow. You need:

1. **JAMA_CLIENT_ID** — OAuth2 client ID
2. **JAMA_CLIENT_SECRET** — OAuth2 client secret

#### How to Get Credentials

1. Log in to your Jama Connect instance (e.g., `https://enphase.jamacloud.com`)
2. Go to **Admin** → **Organization** → **OAuth Clients**
3. Click **Create New Client**
4. Fill in:
   - **Name:** `jama-connect-cli` (or any name)
   - **Grant Type:** `Client Credentials`
   - **Scope:** Leave default (full access)
5. Click **Save**
6. Copy the **Client ID** and **Client Secret** (you won't see the secret again!)

### Configuration Methods

jama-connect auto-loads credentials from your IDE's MCP config. No manual env vars needed!

#### Method 1: MCP Config (Recommended)

Add to your IDE's `mcp_config.json`:

**Windsurf:** `~\.codeium\windsurf\mcp_config.json`  
**Devin:** `%APPDATA%\devin\mcp_config.json`  
**Claude Desktop:** `~\.config\claude\mcp_config.json`  
**Cursor:** `~\.cursor\mcp.json`

**Windows (Windsurf) — recommended:**

```json
{
  "mcpServers": {
    "jama-mcp-v2": {
      "command": "C:\\Users\\<USERNAME>\\AppData\\Roaming\\Python\\Python314\\Scripts\\jama-connect.exe",
      "args": [],
      "env": {
        "JAMA_URL": "https://enphase.jamacloud.com",
        "JAMA_CLIENT_ID": "your-client-id-here",
        "JAMA_CLIENT_SECRET": "your-client-secret-here",
        "JAMA_CACHE_DIR": "~/.jama-mcp-v2",
        "JAMA_REST_PORT": "8765",
        "JAMA_MAX_CONCURRENT": "10",
        "PYTHONIOENCODING": "utf-8"
      }
    }
  }
}
```

> **Windows note:** Use the full path to `jama-connect.exe` (not just `jama-connect`) to avoid Windsurf startup timeout. Replace `<USERNAME>` with your Windows username.

**macOS/Linux:**

```json
{
  "mcpServers": {
    "jama-mcp-v2": {
      "command": "jama-connect",
      "args": [],
      "env": {
        "JAMA_URL": "https://enphase.jamacloud.com",
        "JAMA_CLIENT_ID": "your-client-id-here",
        "JAMA_CLIENT_SECRET": "your-client-secret-here",
        "JAMA_CACHE_DIR": "~/.jama-mcp-v2",
        "JAMA_REST_PORT": "8765",
        "JAMA_MAX_CONCURRENT": "10"
      }
    }
  }
}
```

All jama-connect commands (`jama-connect`, `jama-rest`, `jama-editor`) will auto-find these credentials.

#### Method 2: Environment Variables

If no MCP config exists, set env vars directly:

**Windows (PowerShell):**
```powershell
$env:JAMA_CLIENT_ID = "your-client-id"
$env:JAMA_CLIENT_SECRET = "your-client-secret"
$env:JAMA_URL = "https://enphase.jamacloud.com"
```

**macOS/Linux (bash):**
```bash
export JAMA_CLIENT_ID="your-client-id"
export JAMA_CLIENT_SECRET="your-client-secret"
export JAMA_URL="https://enphase.jamacloud.com"
```

### Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `JAMA_URL` | `https://enphase.jamacloud.com` | Jama instance URL |
| `JAMA_CLIENT_ID` | auto from mcp_config | OAuth2 client ID |
| `JAMA_CLIENT_SECRET` | auto from mcp_config | OAuth2 client secret |
| `JAMA_CACHE_DIR` | `~/.jama-mcp-v2` | Cache directory (DB files, logs, project DBs) |
| `JAMA_REST_PORT` | `8765` | REST API port |
| `JAMA_MAX_CONCURRENT` | `10` | Jama API concurrency limit |
| `JAMA_CACHE_SERVER_URL` | _(unset)_ | LAN cache server URL (e.g. `http://192.168.1.50:8866`) |
| `PYTHONIOENCODING` | system default | Set to `utf-8` on Windows to avoid encoding errors |

---

## Getting Started

### First Run — Getting Data Into the Cache

jama-connect uses a **per-project SQLite** model (schema v4). Each project gets its own `.db.gz` file rather than one monolithic cache.

**Option A — Download from LAN cache server (fastest, ~10 seconds)**

If your team runs a LAN cache server (nginx on port 8866), set the URL and download:
```bash
# Set the server URL (saved across restarts)
curl -X POST "http://localhost:8765/api/cache-server/url?url=http://192.168.1.50:8866"

# Download a project DB (SSE stream, decompresses automatically)
curl "http://localhost:8765/api/cache-server/download/20570"
```
Or open the **DB Management** panel in VS Code (`Ctrl+Shift+P` → `Jama: Manage Project DBs`) and click **Download from Cache Server**.

**Option B — Import a `.db.gz` file (manual)**
```bash
curl -X POST "http://localhost:8765/api/db/project/20570/import" -F "file=@20570.db.gz"
```

**Option C — Full sync from Jama API (~5-10 min)**
```python
jama_sync_project(project_id=20570)
```
Or open `http://localhost:8765/viewer/sync`, select project, click **Full Sync**.

### Quick Start — 3 Ways to Use

#### 1. For Windsurf/Devin (AI Integration)

**Setup:**
1. Add MCP config (see [Configuration](#configuration))
2. Restart Windsurf/Devin
3. The MCP server starts automatically

**Usage in chat:**
```
"Search Jama for SET-43"
"Find all test runs for IQ Battery R5"
"What are the L2 requirements for thermal management?"
```

The AI will use the `jama_search`, `jama_deep_search`, and other MCP tools automatically.

#### 2. Web Viewer (Browse & Search)

**Start the server:**
```bash
jama-rest
```

**Open in browser:**
```
http://localhost:8765/viewer
```

**Features:**
- **Tree View** — Browse project hierarchy
- **Search** — Quick (FTS) or Deep (with relationships)
- **Sync** — Full or incremental project sync
- **Diff** — Compare item versions

#### 3. VS Code Extension (Rich Text Editing)

**Install the extension:**
```bash
jama-editor
```

**Start the backend:**
```bash
jama-rest
# or
jama-connect --daemon
```

**Open VS Code:**
1. Click the **Jama Editor** icon in the activity bar
2. Search for items or create new ones
3. Edit with TipTap WYSIWYG editor
4. Save back to Jama

---

## Components

### 1. MCP Server

**Purpose:** Integrate Jama with AI assistants (Windsurf, Devin, Claude Desktop)

**Transport:** stdio (standard input/output)

**Start command:**
```bash
jama-connect
```

**Daemon mode (MCP + REST in one process):**
```bash
jama-connect --daemon
```

**Available tools:** See [MCP Tools Reference](#mcp-tools-reference)

### 2. REST API

**Purpose:** Web-based access to Jama data

**Port:** 8765 (configurable via `JAMA_REST_PORT`)

**Start command:**
```bash
jama-rest
```

**Core Endpoints:**
- `GET /api/search?q=...` — Quick FTS search
- `GET /api/search/deep?q=...` — Deep search with relationships
- `POST /api/sync/{project_id}` — Trigger sync
- `GET /api/sync/progress` — SSE sync progress stream
- `GET /api/items/{item_id}` — Get item details
- `GET /api/projects` — List projects
- `GET /api/health` — Server health + version

**Local DB Management (Phase 4):**
- `GET /api/db/status` — List all local project DBs with stats
- `GET /api/db/project/{id}` — Stats for one project DB (items, tests, size)
- `DELETE /api/db/project/{id}` — Delete a project DB
- `POST /api/db/project/{id}/import` — Import a `.db.gz` file

**LAN Cache Server (Phase 4):**
- `POST /api/cache-server/url?url=...` — Set LAN cache server URL
- `GET /api/cache-server/ping` — Test connectivity + show index
- `GET /api/cache-server/index` — Fetch full `index.json` from server
- `GET /api/cache-server/download/{id}` — SSE stream: download + decompress project DB

**Full API docs:** `http://localhost:8765/docs` (Swagger UI)

### 3. Web Viewer

**Purpose:** Browse, search, and manage Jama data in a web UI

**URL:** `http://localhost:8765/viewer`

**Features:**
- **Tree View** — Hierarchical project structure
- **Search** — Full-text search with filters
- **Sync** — Project sync with progress bar
- **Diff** — Version comparison
- **Test Management** — View test plans, cycles, runs

**Tech stack:** React + TypeScript (pre-built, no Node.js at runtime)

### 4. VS Code Extension

**Purpose:** Rich-text editing of Jama items in VS Code

**Install command:**
```bash
jama-editor
```

**Features:**
- **TipTap WYSIWYG editor** — Bold, italic, lists, tables, images
- **Image upload** — Drag & drop or paste
- **Search** — Find items by ID, name, or text
- **Create** — New items with templates
- **Save** — Push changes back to Jama

**Commands (Ctrl+Shift+P):**
- `Jama: Open Item` — Open item by ID
- `Jama: Search Items` — Search dialog
- `Jama: Create Item` — New item wizard
- `Jama: Refresh` — Reload item from Jama

---

## Command Reference

### `jama-connect`

**Description:** Start the MCP server (stdio transport)

**Usage:**
```bash
jama-connect [--daemon]
```

**Options:**
- `--daemon` — Run MCP + REST API in one process (recommended for Windsurf/Devin)

**Examples:**
```bash
# MCP server only (for Claude Desktop)
jama-connect

# MCP + REST API (for Windsurf/Devin + web viewer)
jama-connect --daemon
```

**When to use:**
- Use `--daemon` if you want both MCP tools (for AI) and web viewer/VS Code extension
- Use without `--daemon` if you only need MCP tools (e.g., Claude Desktop)

---

### `jama-rest`

**Description:** Start the REST API + web viewer (standalone)

**Usage:**
```bash
jama-rest
```

**Port:** 8765 (configurable via `JAMA_REST_PORT`)

**Examples:**
```bash
# Start REST API
jama-rest

# Custom port
JAMA_REST_PORT=9000 jama-rest
```

**When to use:**
- Use if you only need the web viewer or VS Code extension (no AI integration)
- Use if you're already running `jama-connect --daemon` (don't run both!)

---

### `jama-editor`

**Description:** Install the Jama Editor VS Code extension

**Usage:**
```bash
jama-editor
```

**What it does:**
1. Finds the bundled VSIX file (`jama-editor-*.vsix`)
2. Installs it to VS Code via `code --install-extension`

**Examples:**
```bash
# Install extension
jama-editor

# Verify installation
code --list-extensions | grep jama
```

**When to use:**
- Run once after installing jama-connect
- Re-run if you update jama-connect and the extension version changes

---

### `jama-post-install`

**Description:** Create symlink/junction in `~/.devin/mcp-servers/`

**Usage:**
```bash
jama-post-install [--check]
```

**Options:**
- `--check` — Verify symlink exists (don't create)

**Examples:**
```bash
# Create symlink
jama-post-install

# Verify symlink
jama-post-install --check
```

**When to use:**
- Run once after installing jama-connect
- Re-run if you move the package or change Python environments

**Windows notes:**
- Requires Developer Mode or admin privileges for symlinks
- Falls back to junction (no admin needed) if symlink fails

---

## MCP Tools Reference

These tools are available when using jama-connect as an MCP server (e.g., in Windsurf, Devin, Claude Desktop).

### Search & Discovery

#### `jama_search`

**Description:** Fast full-text search across items, test plans, test cycles, and test runs

**Parameters:**
- `query` (string, required) — Search query (supports doc keys like `SET-43`, item IDs, natural language)
- `project_id` (integer, optional) — Filter to specific project (e.g., 20570 for IQ Battery R5)
- `limit` (integer, optional) — Max results (default: 20)

**Returns:**
- `entity_id` — Item/test run/test plan/test cycle ID
- `doc_type` — `item`, `test_run`, `test_plan`, or `test_cycle`
- `name` — Item name
- `snippet` — Text snippet with match highlighted
- `status` — Item status (e.g., "Approved", "Draft")
- `rank` — Search relevance score

**Examples:**
```python
# Search by document key
jama_search(query="SET-43")

# Search by natural language
jama_search(query="thermal management", project_id=20570)

# Search test runs
jama_search(query="battery discharge", limit=10)
```

**Fast-path optimizations:**
- Document keys (e.g., `SET-43`) → direct lookup
- Bare integers (e.g., `5624954`) → item ID lookup
- Otherwise → FTS5 full-text search

---

#### `jama_deep_search`

**Description:** Enriched search with upstream/downstream relationships, parent, children

**Parameters:**
- `query` (string, required) — Search query
- `project_id` (integer, optional) — Filter to specific project
- `include_relations` (boolean, optional) — Include upstream/downstream (default: true)
- `limit` (integer, optional) — Max results (default: 20)

**Returns:** Same as `jama_search`, plus:
- `upstream` — List of upstream related items (for items)
- `downstream` — List of downstream related items (for items)
- `parent` — Parent item ID (for items)
- `children_count` — Number of child items (for items)
- `test_cycle_name` — Test cycle name (for test runs)
- `test_plan_name` — Test plan name (for test runs)
- `test_case_id` — Test case ID (for test runs)
- `execution_date` — Test run execution date (for test runs)

**Examples:**
```python
# Deep search with relationships
jama_deep_search(query="SET-43", include_relations=True)

# Find test runs with context
jama_deep_search(query="thermal test", project_id=20570)
```

**When to use:**
- Use `jama_search` for quick lookups (faster)
- Use `jama_deep_search` when you need traceability context

---

### Item Operations

#### `jama_get_item`

**Description:** Get full details for a single item

**Parameters:**
- `item_id` (integer, required) — Jama item ID

**Returns:**
- `id` — Item ID
- `documentKey` — Document key (e.g., "SET-43")
- `globalId` — Global ID
- `project` — Project ID
- `itemType` — Item type ID
- `createdDate` — ISO timestamp
- `modifiedDate` — ISO timestamp
- `lastActivityDate` — ISO timestamp
- `createdBy` — User ID
- `modifiedBy` — User ID
- `fields` — Custom field values (dict)
- `location` — Parent folder
- `childItemType` — Allowed child item type

**Examples:**
```python
# Get item by ID
jama_get_item(item_id=5624954)
```

---

#### `jama_get_item_children`

**Description:** Get child items

**Parameters:**
- `item_id` (integer, required) — Parent item ID

**Returns:** List of child items (same schema as `jama_get_item`)

**Examples:**
```python
# Get children of a requirement
jama_get_item_children(item_id=5624954)
```

---

#### `jama_get_item_upstream`

**Description:** Get upstream related items (traced from)

**Parameters:**
- `item_id` (integer, required) — Item ID

**Returns:** List of upstream items (same schema as `jama_get_item`)

**Examples:**
```python
# Get upstream requirements
jama_get_item_upstream(item_id=5624954)
```

---

#### `jama_get_item_downstream`

**Description:** Get downstream related items (traced to)

**Parameters:**
- `item_id` (integer, required) — Item ID

**Returns:** List of downstream items (same schema as `jama_get_item`)

**Examples:**
```python
# Get downstream test cases
jama_get_item_downstream(item_id=5624954)
```

---

#### `jama_get_item_versions`

**Description:** Get version history for an item

**Parameters:**
- `item_id` (integer, required) — Item ID

**Returns:** List of versions with:
- `versionNum` — Version number
- `modifiedDate` — ISO timestamp
- `modifiedBy` — User ID
- `fields` — Field values at that version

**Examples:**
```python
# Get version history
jama_get_item_versions(item_id=5624954)
```

---

### Sync Operations

#### `jama_sync_project`

**Description:** Full sync of all items, relationships, test plans, test cycles, test runs

**Parameters:**
- `project_id` (integer, required) — Jama project ID (e.g., 20570 for IQ Battery R5)

**Returns:**
- `status` — "started"
- `message` — Progress message

**Duration:** ~5-10 minutes for a large project (22k+ items)

**Examples:**
```python
# Full sync of IQ Battery R5
jama_sync_project(project_id=20570)
```

**When to use:**
- First-time setup
- After major project changes
- When incremental sync fails

---

#### `jama_incremental_sync`

**Description:** Delta sync — only items changed since last sync

**Parameters:**
- `project_id` (integer, required) — Jama project ID

**Returns:**
- `status` — "started"
- `message` — Progress message

**Duration:** ~1-3 minutes (depends on number of changes)

**Examples:**
```python
# Incremental sync
jama_incremental_sync(project_id=20570)
```

**When to use:**
- Daily updates
- After small changes
- Faster than full sync

---

### Test Management

#### `jama_list_test_plans`

**Description:** List all test plans in a project

**Parameters:**
- `project_id` (integer, required) — Jama project ID

**Returns:** List of test plans with:
- `id` — Test plan ID
- `name` — Test plan name
- `status` — Status (e.g., "Active")
- `project` — Project ID

**Examples:**
```python
# List test plans
jama_list_test_plans(project_id=20570)
```

---

#### `jama_list_test_cycles`

**Description:** List all test cycles in a test plan

**Parameters:**
- `test_plan_id` (integer, required) — Test plan ID

**Returns:** List of test cycles with:
- `id` — Test cycle ID
- `name` — Test cycle name
- `testPlan` — Test plan ID
- `startDate` — ISO timestamp
- `endDate` — ISO timestamp

**Examples:**
```python
# List test cycles
jama_list_test_cycles(test_plan_id=12345)
```

---

#### `jama_list_test_runs`

**Description:** List all test runs in a test cycle

**Parameters:**
- `test_cycle_id` (integer, required) — Test cycle ID

**Returns:** List of test runs with:
- `id` — Test run ID
- `name` — Test run name
- `testCycle` — Test cycle ID
- `testCase` — Test case ID
- `assignedTo` — User ID
- `status` — `PASSED`, `FAILED`, `NOT_RUN`, `BLOCKED`, `INPROGRESS`
- `executionDate` — ISO timestamp

**Examples:**
```python
# List test runs
jama_list_test_runs(test_cycle_id=67890)
```

---

#### `jama_get_test_summary`

**Description:** Get test execution summary (pass/fail counts)

**Parameters:**
- `test_cycle_id` (integer, required) — Test cycle ID

**Returns:**
- `total` — Total test runs
- `passed` — Passed count
- `failed` — Failed count
- `not_run` — Not run count
- `blocked` — Blocked count
- `in_progress` — In progress count

**Examples:**
```python
# Get test summary
jama_get_test_summary(test_cycle_id=67890)
```

---

#### `jama_update_test_run`

**Description:** Update test run status and results

**Parameters:**
- `test_run_id` (integer, required) — Test run ID
- `status` (string, required) — `PASSED`, `FAILED`, `NOT_RUN`, `BLOCKED`, `INPROGRESS`
- `notes` (string, optional) — Execution notes

**Returns:**
- `status` — "success"
- `message` — Confirmation message

**Examples:**
```python
# Mark test as passed
jama_update_test_run(test_run_id=123456, status="PASSED", notes="All checks passed")

# Mark test as failed
jama_update_test_run(test_run_id=123456, status="FAILED", notes="Thermal limit exceeded")
```

---

## Web Viewer Guide

### Accessing the Viewer

1. Start the REST API:
   ```bash
   jama-rest
   # or
   jama-connect --daemon
   ```

2. Open in browser:
   ```
   http://localhost:8765/viewer
   ```

### Pages

#### Tree View

**URL:** `/viewer/tree`

**Features:**
- Browse project hierarchy
- Expand/collapse folders
- Click items to view details
- Filter by item type

**Usage:**
1. Select project from dropdown
2. Expand folders to navigate
3. Click item to view details in right panel

---

#### Search

**URL:** `/viewer/search`

**Features:**
- **Quick Search** — Fast FTS5 search
- **Deep Search** — Search with relationships
- **Filters** — Project, item type, status
- **Results** — Snippet preview, click to view details

**Usage:**
1. Enter search query (e.g., "thermal management" or "SET-43")
2. Select search mode (Quick or Deep)
3. Apply filters (optional)
4. Click result to view details

**Search tips:**
- Use document keys for exact matches (e.g., `SET-43`)
- Use natural language for broad searches (e.g., "battery thermal")
- Use Deep Search for traceability context

---

#### Sync

**URL:** `/viewer/sync`

**Features:**
- Select project
- Full or incremental sync
- Real-time progress bar
- Error reporting

**Usage:**
1. Select project from dropdown
2. Choose sync type:
   - **Full Sync** — All items (5-10 min)
   - **Incremental Sync** — Only changes (1-3 min)
3. Click **Start Sync**
4. Monitor progress bar
5. Refresh page when complete

**Notes:**
- Full sync overwrites local cache
- Incremental sync preserves local edits
- Sync runs in background (you can close the page)

---

#### Diff

**URL:** `/viewer/diff`

**Features:**
- Compare two item versions
- Side-by-side diff view
- Highlight changes (added, removed, modified)

**Usage:**
1. Enter item ID
2. Select two versions
3. Click **Compare**
4. Review changes in diff view

---

### API Explorer

**URL:** `/docs`

**Features:**
- Swagger UI for REST API
- Try endpoints interactively
- View request/response schemas

**Usage:**
1. Open `/docs` in browser
2. Expand endpoint
3. Click **Try it out**
4. Fill in parameters
5. Click **Execute**
6. View response

---

## VS Code Extension

### Installation

```bash
jama-editor
```

This installs the bundled VSIX to VS Code.

### Starting the Backend

The extension requires the REST API to be running:

```bash
jama-rest
# or
jama-connect --daemon
```

### Opening the Extension

1. Click the **Jama Editor** icon in the VS Code activity bar (left sidebar)
2. The Jama Editor panel opens

### Features

#### Search Items

1. Click **Search** in the Jama Editor panel
2. Enter search query
3. Select item from results
4. Item opens in editor

#### Open Item by ID

1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
2. Type `Jama: Open Item`
3. Enter item ID
4. Item opens in editor

#### Create New Item

1. Click **Create** in the Jama Editor panel
2. Select project
3. Select item type
4. Fill in template
5. Click **Save**

#### Edit Item

1. Open item (via search or ID)
2. Edit in TipTap WYSIWYG editor:
   - **Bold** — `Ctrl+B`
   - **Italic** — `Ctrl+I`
   - **Heading** — `Ctrl+Alt+1` (or 2, 3, etc.)
   - **Bullet List** — `Ctrl+Shift+8`
   - **Numbered List** — `Ctrl+Shift+7`
   - **Link** — `Ctrl+K`
3. Click **Save** to push changes to Jama

#### Insert Images

**Method 1: Drag & Drop**
1. Drag image file from file explorer
2. Drop into editor
3. Image uploads and embeds

**Method 2: Paste**
1. Copy image to clipboard
2. Paste into editor (`Ctrl+V`)
3. Image uploads and embeds

**Method 3: Upload Button**
1. Click **Insert Image** button
2. Select file
3. Image uploads and embeds

#### Refresh Item

1. Press `Ctrl+Shift+P`
2. Type `Jama: Refresh`
3. Item reloads from Jama (discards local edits)

### Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Bold | `Ctrl+B` | `Cmd+B` |
| Italic | `Ctrl+I` | `Cmd+I` |
| Heading 1 | `Ctrl+Alt+1` | `Cmd+Alt+1` |
| Heading 2 | `Ctrl+Alt+2` | `Cmd+Alt+2` |
| Bullet List | `Ctrl+Shift+8` | `Cmd+Shift+8` |
| Numbered List | `Ctrl+Shift+7` | `Cmd+Shift+7` |
| Link | `Ctrl+K` | `Cmd+K` |
| Undo | `Ctrl+Z` | `Cmd+Z` |
| Redo | `Ctrl+Y` | `Cmd+Shift+Z` |
| Save | `Ctrl+S` | `Cmd+S` |

---

## Troubleshooting

### Installation Issues

#### `pip install jama-connect` fails

**Cause:** Python version too old

**Fix:**
```bash
python --version  # Must be 3.12+
pip install --upgrade pip
pip install jama-connect
```

---

#### `jama-post-install` fails on Windows

**Cause:** No admin privileges or Developer Mode disabled

**Fix:**
1. Enable Developer Mode:
   - Settings → Update & Security → For developers → Developer Mode
2. Or run PowerShell as Administrator:
   ```powershell
   jama-post-install
   ```

The installer falls back to Windows junction (no admin needed) if symlink fails.

---

### Authentication Issues

#### 401 Unauthorized

**Cause:** Invalid or missing credentials

**Fix:**
1. Verify credentials in `mcp_config.json`:
   ```json
   "JAMA_CLIENT_ID": "your-client-id",
   "JAMA_CLIENT_SECRET": "your-client-secret"
   ```
2. Or set env vars:
   ```powershell
   $env:JAMA_CLIENT_ID = "your-client-id"
   $env:JAMA_CLIENT_SECRET = "your-client-secret"
   ```
3. Test with:
   ```bash
   jama-rest
   # Open http://localhost:8765/api/projects
   ```

---

#### 403 Forbidden

**Cause:** OAuth2 client lacks permissions

**Fix:**
1. Go to Jama → Admin → OAuth Clients
2. Edit your client
3. Ensure **Grant Type** is `Client Credentials`
4. Ensure **Scope** is `read write` (or leave default)
5. Save and regenerate secret if needed

---

### Runtime Issues

#### Port 8765 already in use

**Cause:** Another instance is running

**Fix:**
1. Kill existing process:
   ```powershell
   # Windows
   taskkill /F /IM jama-connect.exe
   
   # macOS/Linux
   pkill -f jama-connect
   ```
2. Or use a different port:
   ```bash
   JAMA_REST_PORT=9000 jama-rest
   ```

---

#### Jama Editor sidebar is empty

**Cause:** REST backend not running

**Fix:**
1. Start the backend:
   ```bash
   jama-rest
   # or
   jama-connect --daemon
   ```
2. Refresh VS Code (`Ctrl+R`)

---

#### MCP server fails to connect in Windsurf (Windows)

**Cause:** `uv run` wrapper adds startup overhead that exceeds Windsurf's timeout

**Fix:** Use the direct `.exe` path in `mcp_config.json`:
```json
"command": "C:\\Users\\<USERNAME>\\AppData\\Roaming\\Python\\Python314\\Scripts\\jama-connect.exe",
"args": [],
"env": { "PYTHONIOENCODING": "utf-8", ... }
```

---

#### LAN cache server download fails

**Cause:** Server URL not set or server unreachable

**Fix:**
1. Check server: `curl http://192.168.1.50:8866/index.json`
2. Set the URL: `curl -X POST "http://localhost:8765/api/cache-server/url?url=http://192.168.1.50:8866"`
3. Test ping: `curl http://localhost:8765/api/cache-server/ping`
4. Check firewall allows port 8866

---

#### Search returns no results

**Cause:** Cache not synced

**Fix:**
1. Open viewer: `http://localhost:8765/viewer/sync`
2. Select project (e.g., 20570)
3. Click **Full Sync**
4. Wait 5-10 minutes
5. Try search again

---

### Performance Issues

#### Sync is slow (>15 minutes)

**Cause:** Large project or slow network

**Fix:**
1. Use incremental sync instead of full sync
2. Increase concurrency:
   ```bash
   JAMA_MAX_CONCURRENT=20 jama-rest
   ```
3. Check network speed to Jama instance

---

#### Search is slow (>5 seconds)

**Cause:** Cache not indexed or too many results

**Fix:**
1. Rebuild FTS index:
   ```bash
   # Delete cache and re-sync
   rm ~/.jama-mcp-v2/cache.db
   jama-rest
   # Full sync via viewer
   ```
2. Limit results:
   ```python
   jama_search(query="...", limit=10)
   ```

---

## Advanced Topics

### Cache Management

#### Cache Location

**Windows:** `%USERPROFILE%\.jama-mcp-v2\`  
**macOS/Linux:** `~/.jama-mcp-v2/cache.db`

#### Cache Schema

**Version:** 4 (per-project DBs + FTS5)

**Tables:**
- `items` — Jama items
- `relationships` — Upstream/downstream links
- `test_plans` — Test plans
- `test_cycles` — Test cycles
- `test_runs` — Test runs
- `fts_items` — FTS5 full-text search index (items, test plans, cycles, test runs)

#### Rebuild Cache

```bash
# Delete cache
rm ~/.jama-mcp-v2/cache.db

# Start REST API
jama-rest

# Full sync via viewer
# http://localhost:8765/viewer/sync
```

---

### Custom Cache Seed

If you want to create your own cache seed (e.g., for a different Jama instance):

1. Sync your projects:
   ```bash
   jama-rest
   # Full sync via viewer
   ```

2. Compress cache:
   ```bash
   gzip -c ~/.jama-mcp-v2/cache.db > cache_seed.db.gz
   ```

3. Share `cache_seed.db.gz` with your team

4. Point to your LAN cache server instead:
   ```bash
   export JAMA_CACHE_SERVER_URL="http://your-server:8866"
   # Then use /api/cache-server/download/{project_id} to import
   ```

---

### REST API Authentication

The REST API uses the same OAuth2 credentials as the MCP server. No separate auth needed.

**Example:**
```bash
curl -X GET "http://localhost:8765/api/search?q=SET-43"
```

No `Authorization` header needed — the server uses the credentials from `mcp_config.json` or env vars.

---

### MCP Server Debugging

Enable debug logging:

```bash
# Windows
$env:JAMA_LOG_LEVEL = "DEBUG"
jama-connect

# macOS/Linux
export JAMA_LOG_LEVEL=DEBUG
jama-connect
```

Logs go to:
- **Windows:** `%USERPROFILE%\.jama-mcp-v2\logs\jama-connect.log`
- **macOS/Linux:** `~/.jama-mcp-v2/logs/jama-connect.log`

---

### Daemon Mode Internals

`jama-connect --daemon` runs:
- **Main thread:** MCP stdio server (reads from stdin, writes to stdout)
- **Background thread:** REST API (FastAPI on port 8765)

Both share:
- Same SQLite cache (`~/.jama-mcp-v2/cache.db`)
- Same Jama API client (OAuth2 token reused)

**Why daemon mode?**
- One process instead of two
- Shared cache (no sync conflicts)
- Shared API client (fewer OAuth2 token requests)

---

## FAQ

### General

**Q: What's the difference between jama-connect and jama-mcp-v2?**

A: They're the same thing! `jama-connect` is the pip package name. `jama-mcp-v2` is the MCP server name in `mcp_config.json`.

---

**Q: Can I use jama-connect without Windsurf/Devin?**

A: Yes! Use `jama-rest` for the web viewer or `jama-editor` for VS Code. The MCP server is optional.

---

**Q: Does jama-connect work offline?**

A: Partially. Search works offline (SQLite cache). Sync, item updates, and test run updates require internet.

---

### Installation

**Q: Do I need Node.js?**

A: No! The viewer is pre-built static HTML/JS. Node.js is only needed for development (building the viewer from source).

---

**Q: Can I install jama-connect in a virtual environment?**

A: Yes! Recommended for isolation:
```bash
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install jama-connect
```

---

**Q: How do I update jama-connect?**

A: 
```bash
pip install --upgrade jama-connect
jama-post-install  # Re-create symlink
jama-editor        # Re-install VS Code extension
```

---

### Configuration

**Q: Can I use multiple Jama instances?**

A: Yes! Set `JAMA_URL` to your instance:
```bash
export JAMA_URL="https://your-company.jamacloud.com"
```

---

**Q: Can I use multiple cache directories?**

A: Yes! Set `JAMA_CACHE_DIR`:
```bash
export JAMA_CACHE_DIR="~/.jama-mcp-v2-project-a"
jama-rest
```

---

**Q: How do I share credentials with my team?**

A: Use a shared MCP config or env vars. **Never commit credentials to git!**

---

### Usage

**Q: How often should I sync?**

A: 
- **Full sync:** Once per week or after major project changes
- **Incremental sync:** Daily or before important work

---

**Q: Can I edit items offline?**

A: Yes in VS Code (drafts saved locally). Push to Jama when online.

---

**Q: Can I create new projects?**

A: Not yet. Use the Jama web UI to create projects, then sync them with jama-connect.

---

### Performance

**Q: How big can the cache get?**

A: ~300-500 MB for a large project (22k+ items). The cache seed is 321 MB (91 projects, 8500+ items).

---

**Q: How fast is search?**

A: ~50-200ms for most queries (SQLite FTS5). Deep search with relationships: ~200-500ms.

---

**Q: How many projects can I sync?**

A: No hard limit. The cache seed has 91 projects. Each project adds ~3-5 MB.

---

### Troubleshooting

**Q: Why is my search not finding items?**

A: 
1. Check if cache is synced (`http://localhost:8765/viewer/sync`)
2. Try document key (e.g., `SET-43`) instead of natural language
3. Check if item is in the synced project

---

**Q: Why is the VS Code extension not loading?**

A: 
1. Ensure `jama-rest` or `jama-connect --daemon` is running
2. Check `http://localhost:8765/api/projects` in browser
3. Restart VS Code

---

**Q: Why is sync failing?**

A: 
1. Check credentials (401 error)
2. Check network (timeout error)
3. Check Jama API status (503 error)
4. Try incremental sync instead of full sync

---

## Support

### Documentation

- **README.md** — Package overview and quick start
- **ARCHITECTURE.md** — Data flow, image proxy, push flow
- **QUICKSTART.md** — 5-minute getting started guide
- **PACKAGE_STRUCTURE.md** — Source tree and build layout
- **VSCODE_EXTENSION_BUNDLING.md** — Extension build process

### Logs

Check logs for errors:

**Windows:** `%USERPROFILE%\.jama-mcp-v2\logs\jama-connect.log`  
**macOS/Linux:** `~/.jama-mcp-v2/logs/jama-connect.log`

### GitHub

**Repository:** [github.com/kailash-enph/jama-connect](https://github.com/kailash-enph/jama-connect)

**Issues:** [github.com/kailash-enph/jama-connect/issues](https://github.com/kailash-enph/jama-connect/issues)

### Enphase Internal

**Contact:** Kailash (kailash@enphaseenergy.com)

---

**Version:** 0.5.0 | **Last Updated:** 2026-09-03
