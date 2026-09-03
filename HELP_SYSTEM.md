# jama-connect Help System

## Overview

jama-connect includes a comprehensive user manual and quick reference system accessible via multiple methods.

## Access Methods

### 1. User Manual (Full Documentation)

**File:** `USER_MANUAL.md` (1,493 lines)

**Location:** 
- Bundled with package: `<package-dir>/USER_MANUAL.md`
- Online: [github.com/kailash-enph/jama-connect](https://github.com/kailash-enph/jama-connect)

**Contents:**
- Installation and configuration
- Getting started guide
- Command reference
- MCP tools reference
- Web viewer guide
- VS Code extension guide
- Troubleshooting
- Advanced topics
- FAQ

**How to open:**
```bash
# Windows
start <package-dir>\USER_MANUAL.md

# macOS
open <package-dir>/USER_MANUAL.md

# Linux
xdg-open <package-dir>/USER_MANUAL.md
```

### 2. Quick Start Guide

**File:** `QUICKSTART.md` (129 lines)

**Contents:**
- What is jama-connect?
- Installation (3 steps)
- First run (cache seed)
- Usage (3 ways: AI, web, VS Code)
- All commands
- Troubleshooting
- File locations

**Best for:** New users, 5-minute setup

### 3. README

**File:** `README.md` (201 lines)

**Contents:**
- Features overview
- Installation
- CLI commands
- First-run cache seed
- MCP config
- Credential auto-loading
- Environment variables
- Development setup
- Architecture diagram

**Best for:** Package overview, developer setup

### 4. Architecture Guide

**File:** `ARCHITECTURE.md`

**Contents:**
- Data flow diagrams
- Image proxy system
- Push flow (VS Code → Jama)
- Cache schema
- REST API design

**Best for:** Developers, advanced users

### 5. In-App Help

#### Web Viewer

**URL:** `http://localhost:8765/viewer/help`

**Features:**
- Interactive help pages
- Embedded videos/screenshots
- Search tips
- Keyboard shortcuts

#### VS Code Extension

**Command:** `Ctrl+Shift+P` → `Jama: Help`

**Features:**
- Command palette help
- Keyboard shortcuts
- Troubleshooting tips

## Command Quick Reference

### Installation & Setup

```bash
# Install
pip install jama-connect

# Post-install (create symlink)
jama-post-install

# Verify symlink
jama-post-install --check
```

### Running

```bash
# MCP server only
jama-connect

# MCP + REST API (daemon mode)
jama-connect --daemon

# REST API only
jama-rest

# Install VS Code extension
jama-editor
```

### Configuration

**MCP Config:** `~\.codeium\windsurf\mcp_config.json`

   ```json
   {
     "jama-mcp-v2": {
       "command": "jama-connect",
       "args": [],
       "env": {
         "JAMA_CLIENT_ID": "your-id",
         "JAMA_CLIENT_SECRET": "your-secret",
         "JAMA_CACHE_DIR": "~/.jama-mcp-v2",
         "JAMA_REST_PORT": "8765",
         "PYTHONIOENCODING": "utf-8"
       }
     }
   }
   ```

**Environment Variables:**

```bash
# Windows
$env:JAMA_CLIENT_ID = "your-client-id"
$env:JAMA_CLIENT_SECRET = "your-client-secret"

# macOS/Linux
export JAMA_CLIENT_ID="your-client-id"
export JAMA_CLIENT_SECRET="your-client-secret"
```

## MCP Tools Quick Reference

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `jama_search` | Fast FTS search | `query`, `project_id`, `limit` |
| `jama_deep_search` | Search + relationships | `query`, `include_relations` |
| `jama_get_item` | Get item details | `item_id` |
| `jama_get_item_children` | Get child items | `item_id` |
| `jama_get_item_upstream` | Get upstream items | `item_id` |
| `jama_get_item_downstream` | Get downstream items | `item_id` |
| `jama_get_item_versions` | Get version history | `item_id` |
| `jama_sync_project` | Full sync | `project_id` |
| `jama_incremental_sync` | Delta sync | `project_id` |
| `jama_list_test_plans` | List test plans | `project_id` |
| `jama_list_test_cycles` | List test cycles | `test_plan_id` |
| `jama_list_test_runs` | List test runs | `test_cycle_id` |
| `jama_get_test_summary` | Test execution summary | `test_cycle_id` |
| `jama_update_test_run` | Update test run | `test_run_id`, `status` |
| `jama_list_projects` | List all projects | — |
| `jama_get_project` | Get project details | `project_id` |
| `jama_get_item_at_version` | Get item at version | `item_id`, `version` |
| `jama_get_item_tree` | Full project tree | `project_id`, `root_id` |
| `jama_get_relationships` | All relationships | `project_id` |

## Common Tasks

### First-Time Setup

1. Install package:
   ```bash
   pip install jama-connect
   ```

2. Get OAuth2 credentials:
   - Jama → Admin → OAuth Clients → Create New Client
   - Grant Type: `Client Credentials`
   - Copy Client ID and Secret

3. Add to MCP config:
   ```json
   {
     "jama-mcp-v2": {
       "command": "jama-connect",
       "args": [],
       "env": {
         "JAMA_CLIENT_ID": "your-id",
         "JAMA_CLIENT_SECRET": "your-secret",
         "PYTHONIOENCODING": "utf-8"
       }
     }
   }
   ```

4. Create symlink:
   ```bash
   jama-post-install
   ```

5. Restart Windsurf/Devin

### Daily Usage

**AI Integration (Windsurf/Devin):**
```
"Search Jama for SET-43"
"Find test runs for thermal validation"
"What are the L2 requirements for battery management?"
```

**Web Viewer:**
```bash
jama-rest
# Open http://localhost:8765/viewer
```

**VS Code Extension:**
```bash
jama-editor  # Install once
jama-rest    # Start backend
# Open VS Code → Jama Editor icon
```

### Syncing Data

**Full Sync (first time):**
1. Open `http://localhost:8765/viewer/sync`
2. Select project (e.g., 20570)
3. Click **Full Sync**
4. Wait 5-10 minutes

**Incremental Sync (daily):**
1. Open `http://localhost:8765/viewer/sync`
2. Select project
3. Click **Incremental Sync**
4. Wait 1-3 minutes

### Searching

**Quick Search (fast):**
```python
jama_search(query="SET-43")
jama_search(query="thermal management", project_id=20570)
```

**Deep Search (with relationships):**
```python
jama_deep_search(query="SET-43", include_relations=True)
```

**Web Viewer:**
1. Open `http://localhost:8765/viewer/search`
2. Enter query
3. Select Quick or Deep
4. Click Search

## Troubleshooting Quick Fixes

| Issue | Fix |
|-------|-----|
| 401 Unauthorized | Check credentials in `mcp_config.json` |
| Port 8765 in use | `taskkill /F /IM jama-connect.exe` (Windows) or `pkill -f jama-connect` (macOS/Linux) |
| Jama Editor empty | Start `jama-rest` or `jama-connect --daemon` |
| Search no results | Full sync via `http://localhost:8765/viewer/sync` |
| Symlink creation fails | Run as admin or enable Developer Mode (Windows) |
| Cache seed download fails | Download manually from SharePoint → place in `~/Downloads/` |

## File Locations

| File | Windows | macOS/Linux |
|------|---------|-------------|
| Cache | `%USERPROFILE%\.jama-mcp-v2\projects\` | `~/.jama-mcp-v2/projects/<id>.db` |
| Logs | `%USERPROFILE%\.jama-mcp-v2\logs\` | `~/.jama-mcp-v2/logs/` |
| MCP Symlink | `%USERPROFILE%\.devin\mcp-servers\jama-connect` | `~/.devin/mcp-servers/jama-connect` |
| MCP Config | `%USERPROFILE%\.codeium\windsurf\mcp_config.json` | `~/.codeium/windsurf/mcp_config.json` |

## Support Resources

| Resource | Location |
|----------|----------|
| User Manual | `USER_MANUAL.md` (bundled) |
| Quick Start | `QUICKSTART.md` (bundled) |
| README | `README.md` (bundled) |
| Architecture | `ARCHITECTURE.md` (bundled) |
| GitHub Repo | [github.com/kailash-enph/jama-connect](https://github.com/kailash-enph/jama-connect) |
| Issues | [github.com/kailash-enph/jama-connect/issues](https://github.com/kailash-enph/jama-connect/issues) |
| Logs | `~/.jama-mcp-v2/logs/jama-connect.log` |

## Version

- **Added:** v0.5.0
- **Updated:** v0.5.0
- **Last Updated:** 2026-09-03

---

**Quick Start:**

```bash
# Install
pip install jama-connect
jama-post-install

# Start
jama-connect --daemon

# Browse
# http://localhost:8765/viewer

# Help
# Open USER_MANUAL.md
```
