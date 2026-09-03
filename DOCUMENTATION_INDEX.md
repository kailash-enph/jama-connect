# Jama Connect Documentation Index

> **Package:** jama-connect v0.5.0  
> **Purpose:** Unified Jama Connect integration — MCP server + REST API + web viewer + VS Code extension

---

## Quick Navigation

| I want to... | Read this |
|--------------|-----------|
| **Get started in 5 minutes** | [QUICKSTART.md](QUICKSTART.md) |
| **Learn everything** | [USER_MANUAL.md](USER_MANUAL.md) |
| **Find a command** | [HELP_SYSTEM.md](HELP_SYSTEM.md) |
| **Understand internals** | [ARCHITECTURE.md](ARCHITECTURE.md) |
| **See what's included** | [README.md](README.md) |
| **Build from source** | [BUILD_SUMMARY.md](BUILD_SUMMARY.md) |
| **Understand package structure** | [PACKAGE_STRUCTURE.md](PACKAGE_STRUCTURE.md) |
| **Learn about VS Code extension** | [VSCODE_EXTENSION_BUNDLING.md](VSCODE_EXTENSION_BUNDLING.md) |

---

## Documentation Files

### User Documentation

#### [USER_MANUAL.md](USER_MANUAL.md) — Comprehensive User Manual
**1,493 lines | Complete reference**

**Contents:**
1. Overview
2. What is Jama Connect?
3. Installation
4. Configuration
5. Getting Started
6. Components
7. Command Reference
8. MCP Tools Reference
9. Web Viewer Guide
10. VS Code Extension
11. Troubleshooting
12. Advanced Topics
13. FAQ

**Best for:** 
- New users learning the system
- Reference for all features
- Troubleshooting issues
- Advanced configuration

---

#### [QUICKSTART.md](QUICKSTART.md) — 5-Minute Setup Guide
**129 lines | Fast track**

**Contents:**
- What is jama-connect?
- Installation (3 steps)
- First run (cache seed)
- Usage (3 ways: AI, web, VS Code)
- All commands
- Troubleshooting
- File locations

**Best for:**
- First-time users
- Quick setup
- Impatient engineers

---

#### [HELP_SYSTEM.md](HELP_SYSTEM.md) — Quick Reference
**334 lines | Cheat sheet**

**Contents:**
- Access methods
- Command quick reference
- MCP tools quick reference
- Common tasks
- Troubleshooting quick fixes
- File locations
- Support resources

**Best for:**
- Daily reference
- Command syntax lookup
- Quick troubleshooting
- File location lookup

---

### Technical Documentation

#### [README.md](README.md) — Package Overview
**201 lines | Feature list**

**Contents:**
- Features
- Installation
- CLI commands
- First-run cache seed
- MCP config
- Credential auto-loading
- Environment variables
- Development setup
- Architecture diagram
- Files

**Best for:**
- Package overview
- Feature discovery
- Developer onboarding

---

#### [ARCHITECTURE.md](ARCHITECTURE.md) — System Design
**Technical deep-dive**

**Contents:**
- Data flow diagrams
- Image proxy system
- Push flow (VS Code → Jama)
- Cache schema (SQLite + FTS5)
- REST API design
- MCP server design
- Daemon mode internals

**Best for:**
- Developers
- System architects
- Advanced users
- Contributors

---

#### [PACKAGE_STRUCTURE.md](PACKAGE_STRUCTURE.md) — Source Tree
**Build layout reference**

**Contents:**
- Source tree structure
- Build artifacts
- Distribution layout
- File manifest

**Best for:**
- Developers
- Build engineers
- Package maintainers

---

#### [BUILD_SUMMARY.md](BUILD_SUMMARY.md) — Build Process
**Build documentation**

**Contents:**
- Build prerequisites
- Build steps
- Build scripts
- Distribution packaging

**Best for:**
- Developers
- CI/CD engineers
- Release managers

---

#### [VSCODE_EXTENSION_BUNDLING.md](VSCODE_EXTENSION_BUNDLING.md) — Extension Build
**VS Code extension packaging**

**Contents:**
- Extension build process
- VSIX bundling
- Installation flow
- Distribution strategy

**Best for:**
- Extension developers
- Build engineers

---

## Viewer Documentation

### Web Viewer

**Built-in help:** http://localhost:8765/viewer/help

**Features:**
- Interactive help pages
- Embedded screenshots
- Search tips
- Keyboard shortcuts

### VS Code Extension

**Command palette:** `Ctrl+Shift+P` → `Jama: Help`

**Features:**
- Command reference
- Keyboard shortcuts
- Troubleshooting tips

---

## External Resources

### GitHub Repository

**URL:** [github.com/kailash-enph/jama-connect](https://github.com/kailash-enph/jama-connect)

**Contents:**
- Source code
- Issue tracker
- Releases
- Contribution guidelines

### Enphase Windsurf Bundle

**Location:** `enphase-windsurf-bundle/tools/jama-connect/`

**Integration docs:**
- `enphase-windsurf-bundle/workflows/jama.md` — Jama workflow
- `enphase-windsurf-bundle/docs/mcp-servers.md` — MCP server setup
- `enphase-windsurf-bundle/docs/api-keys.md` — Credential generation
- `enphase-windsurf-bundle/docs/jama-editor.md` — VS Code extension guide

---

## Documentation by Use Case

### I'm a new user

1. Read [QUICKSTART.md](QUICKSTART.md) (5 minutes)
2. Follow installation steps
3. Try the web viewer
4. Bookmark [HELP_SYSTEM.md](HELP_SYSTEM.md) for daily reference

### I'm setting up for my team

1. Read [USER_MANUAL.md](USER_MANUAL.md) → Configuration
2. Generate OAuth2 credentials (see `../../docs/api-keys.md`)
3. Create shared MCP config template
4. Share cache seed file (see [USER_MANUAL.md](USER_MANUAL.md) → Advanced Topics → Custom Cache Seed)

### I'm integrating with Windsurf/Devin

1. Read [README.md](README.md) → MCP Config
2. Add to `mcp_config.json`
3. Run `jama-post-install`
4. Restart Windsurf/Devin
5. Test with: `"Search Jama for SET-43"`

### I'm using the web viewer

1. Start: `jama-rest`
2. Open: http://localhost:8765/viewer
3. Read [USER_MANUAL.md](USER_MANUAL.md) → Web Viewer Guide
4. Try: Tree, Search, Sync, Diff

### I'm using the VS Code extension

1. Install: `jama-editor`
2. Start backend: `jama-rest`
3. Open VS Code → Jama Editor icon
4. Read [USER_MANUAL.md](USER_MANUAL.md) → VS Code Extension

### I'm a developer

1. Read [ARCHITECTURE.md](ARCHITECTURE.md)
2. Read [PACKAGE_STRUCTURE.md](PACKAGE_STRUCTURE.md)
3. Read [BUILD_SUMMARY.md](BUILD_SUMMARY.md)
4. Clone repo: `git clone https://github.com/kailash-enph/jama-connect`
5. Dev setup: `uv sync && cd viewer && npm ci`

### I'm troubleshooting

1. Check [HELP_SYSTEM.md](HELP_SYSTEM.md) → Troubleshooting Quick Fixes
2. Check [USER_MANUAL.md](USER_MANUAL.md) → Troubleshooting (detailed)
3. Check logs: `~/.jama-mcp-v2/logs/jama-connect.log`
4. File issue: [github.com/kailash-enph/jama-connect/issues](https://github.com/kailash-enph/jama-connect/issues)

---

## Documentation Maintenance

### Updating Documentation

When updating jama-connect:

1. Update version in all docs (search for `0.5.0`)
2. Update "Last Updated" dates
3. Update command examples if CLI changes
4. Update screenshots if UI changes
5. Update MCP tools reference if tools change
6. Rebuild viewer help pages if needed

### Documentation Standards

- **Markdown:** GitHub-flavored markdown
- **Line length:** 120 chars max (except code blocks)
- **Code blocks:** Always specify language (```bash, ```python, ```json)
- **Links:** Use relative links for internal docs, absolute for external
- **Headings:** Use ATX-style (#, ##, ###)
- **Tables:** Use pipe tables with alignment
- **Examples:** Always include working examples
- **Version:** Always specify version and last updated date

---

## Support

### Documentation Issues

If you find errors or gaps in the documentation:

1. File an issue: [github.com/kailash-enph/jama-connect/issues](https://github.com/kailash-enph/jama-connect/issues)
2. Label: `documentation`
3. Include: file name, section, description of issue

### Enphase Internal

**Contact:** Kailash (kailash@enphaseenergy.com)

---

**Version:** 0.5.0 | **Last Updated:** 2026-09-03
