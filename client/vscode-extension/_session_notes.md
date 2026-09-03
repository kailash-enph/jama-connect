# Phases 4-6 — VS Code Settings Panel + Always-On Service + Onboarding Wizard — Session Notes

## Completed Steps

### 4.1 — Created `src/panels/SettingsPanel.ts`
- `WebviewViewProvider` registered as `jamaSettingsView`
- Renders HTML with 5 sections: Backend Status, API Credentials, Web Session (JSESSIONID), Active Project, Cache
- Uses `vscode.postMessage` ↔ extension message passing for API calls
- Backend communication via same `/settings/*` REST API as viewer
- Polls backend health every 10s while panel is visible
- All state updates pushed via `state` message type
- Credential save does test-first-then-store flow
- VS Code theme variables used for styling (fully dark/light mode compatible)

### 4.2 — Updated `package.json`
- Added `jamaSettingsView` webview view under `jama-editor` activity bar container
- Replaced `jamaEditor.setCredentials` command with `jamaEditor.openSettings`
- Note: `Missing property "icon"` warning on webview view is expected (webview views don't use icons)

### 4.3 — Simplified `BackendManager`
- Removed `SecretStorage` credential injection — credentials now stored in OS keyring via Settings API
- `stop()` now tries graceful REST API shutdown (`POST /settings/server/stop`) before SIGTERM
- Removed `setSecretStorage` export and `getSecretStorage` private function
- Status bar click now opens Settings panel (`jamaEditor.openSettings`) instead of `startBackend`

### 4.4 — Updated `extension.ts`
- Import `SettingsPanel` from `./panels/SettingsPanel`
- Removed `setSecretStorage` import and call
- Registered `SettingsPanel` as `WebviewViewProvider`
- Replaced `jamaEditor.setCredentials` command with `jamaEditor.openSettings` (focuses the settings panel)
- Deprecated `clientId` and `clientSecret` VS Code settings with deprecation messages

## Verification
- TypeScript compiles cleanly (`npx tsc --noEmit` → exit 0)

## Files Changed
- **Created**: `src/panels/SettingsPanel.ts`
- **Modified**: `package.json`, `src/backend.ts`, `src/extension.ts`

### 5.1 — Created `scripts/install-service.ps1`
- Creates Windows Task Scheduler task `JamaMCPBackend`
- Trigger: at logon for current user
- Action: `uv run python -m jama_mcp_v2 --rest-only`
- Settings: allow on battery, restart 3× on failure, no execution time limit
- Logs to `~/.jama-mcp-v2/logs/service.log`
- Offers to start immediately after install

### 5.2 — Created `scripts/uninstall-service.ps1`
- Stops running task, removes scheduled task
- Sends graceful REST API stop signal
- Cleans up PID file and kills any lingering process

### 5.3 — PID file management in `server.py`
- `_write_pid_file()` writes `~/.jama-mcp-v2/backend.pid` on FastAPI lifespan start
- `_remove_pid_file()` deletes on clean shutdown (also registered with `atexit`)
- `_check_stale_pid()` on `run_rest()` entry — detects stale processes, kills them, cleans up
- Windows-specific check via `ctypes.windll.kernel32.OpenProcess()`

### 5.4 — Updated `start-jama-viewer.bat`
- Removed hardcoded `JAMA_CLIENT_ID` / `JAMA_CLIENT_SECRET`
- Added health check: if backend already running on port, skip start
- Only stops backend on exit if this launcher started it
- Converted to CRLF line endings

### 5.5 — Updated `BackendManager` (VS Code)
- Added `hasScheduledTask()` — checks `schtasks /Query` for `JamaMCPBackend`
- Added `offerServiceInstall()` — prompts user to install if task not found
- Called after successful backend start in `extension.ts`

### 5.6 — Localhost binding in `server.py`
- Changed `uvicorn.run()` from `host="0.0.0.0"` to `host="127.0.0.1"`

### 5.7 — Log rotation in `server.py`
- `_setup_service_logging()` adds `RotatingFileHandler`
- Path: `~/.jama-mcp-v2/logs/service.log`
- Max 5 MB per file, 3 backups

## Verification
- TypeScript compiles cleanly (`npx tsc --noEmit` → exit 0)

## Files Changed (Phase 5)
- **Created**: `scripts/install-service.ps1`, `scripts/uninstall-service.ps1`
- **Modified**: `server.py`, `start-jama-viewer.bat`, `backend.ts`, `extension.ts`

### 6.1 — Created `settings/setup/page.tsx` (Wizard UI)
- 6-step wizard: Welcome → Credentials → Project → Sync → Session Cookie → Done
- Backend health check on mount (blocks "Get Started" if offline)
- Credentials: test & save flow with error/success banners
- Project: dropdown of non-folder projects, "Set & Sync" button
- Sync: informational step (background sync, user can proceed)
- Session Cookie: optional step (can skip)
- Done: summary with green/red checkmarks, "Go to Settings" button
- Progress bar at top, "Skip setup" link, step counter
- Full responsive layout with Tailwind + Lucide icons

### 6.2 — Updated `settings/page.tsx` (Auto-redirect)
- Added `useRouter` import and `checkedSetup` state
- On first load, if `credStatus.configured === false` → redirect to `/settings/setup`
- Added yellow "Credentials not configured" banner with "Run Setup Wizard" link

### 6.3 — Updated `extension.ts` (Onboarding Checks)
- Added `getCredentialStatus()` method to `ApiClient`
- Made `apiClient` public on `BackendManager`
- After backend start: checks credential status via REST API
- If not configured: shows warning notification with "Open Settings" action

## Verification
- TypeScript compiles cleanly (`npx tsc --noEmit` → exit 0)

## Files Changed (Phase 6)
- **Created**: `settings/setup/page.tsx`
- **Modified**: `settings/page.tsx`, `extension.ts`, `api.ts`, `backend.ts`

## All Phases Complete (2-6)

---

# Phase 5 (VS Code Extension UI Upgrade) — Session Notes

## Overview
Upgraded VS Code extension webview UIs to use `@vscode/webview-ui-toolkit@1.4.0` (Microsoft's official web component library). Replaced plain HTML `<button>`, `<input>`, `<textarea>`, `<select>`, `<table>` elements with VS Code-themed custom elements.

## Steps Completed

### 5.1 — Added `@vscode/webview-ui-toolkit@1.4.0` to package.json dependencies
- Added to `"dependencies"` section (NOT devDependencies — esbuild bundles it into `toolkit.js`)
- Also added `jamaEditor.cacheServerUrl` configuration property to `package.json`

### 5.2 — Created `src/webview/toolkit-entry.ts`
- Entry point for the toolkit IIFE bundle
- Calls `provideVSCodeDesignSystem().register(allComponents)` to register all custom elements

### 5.3 — Updated `esbuild.mjs`
- Added `toolkitConfig` (third build target: `src/webview/toolkit-entry.ts → out/webview/toolkit.js`)
- Updated both watch and build branches to include the toolkit context
- Build now produces: `out/extension.js`, `out/webview/tiptap.js`, `out/webview/toolkit.js`

### 5.4 — Updated `src/editor/editorHtml.ts`
- Added `toolkitUri` computation using `webview.asWebviewUri()`
- Added `<script src="${toolkitUri}"></script>` to `<head>`
- Changed `transitionOptions` to use `<vscode-option>` instead of `<option>`
- Computed `fieldCount`, `commentCount`, `versionCount` for tab labels
- Added `versionsPanelHtml` for the versions tab content
- Replaced toolbar `<button>` → `<vscode-button>`, `<select>` → `<vscode-dropdown>`
- Replaced doc-key `<span class="doc-key">` → `<vscode-badge>`
- Added `<vscode-progress-ring id="saveSpinner">` to toolbar
- Replaced SAML banner buttons with `<vscode-button>`
- Restructured sections into `<vscode-panels>` with 5 tabs: Description / Fields / Comments / Attachments / Versions
- Changed dynamic field TEXT → `<vscode-text-field>`, RICHTEXT/DOCUMENT → `<vscode-text-area>`
- Changed "Post" comment button and attachment toolbar buttons to `<vscode-button>`
- Updated `renderAttachments()` to use `<vscode-button appearance="icon">` for action buttons
- Added toolkit-specific CSS: `vscode-panels`, `vscode-panel-view`, `vscode-text-field`, `vscode-text-area`, `vscode-dropdown`

### 5.5 — Updated `src/editor/testDetailHtml.ts`
- Added `getToolkitUri()` helper
- Added `extensionUri: vscode.Uri` parameter to all three export functions
- Updated `getCspMeta()` to accept optional toolkit CSP source
- Added `<script src="${toolkitUri}">` to each HTML head
- Changed `toolbarHtml()` to use `<vscode-button>` instead of `<button>`
- Changed `statusBadge()` to include inline styles directly (removing class dependency)
- Replaced `<span class="badge">` with `<vscode-tag>` in the main header of each detail view

### 5.6 — Updated `src/panels/SettingsPanel.ts`
- Imported `DbManagementPanel`
- Updated `localResourceRoots` to include `out/webview` directory
- Updated `_getHtml()` to accept `vscode.Webview` parameter for toolkit URI computation
- Added CSP meta with `${webview.cspSource}` for toolkit script
- Restructured into `<vscode-panels>` with 4 tabs: Status / Credentials / Session / Cache Server
- Status tab: backend health, project selector (vscode-dropdown), cache info
- Credentials tab: client ID/secret (vscode-text-field), save/clear buttons (vscode-button)
- Session tab: JSESSIONID field (vscode-text-field type=password), save/clear buttons
- Cache Server tab: URL field, Save/Test buttons, "Manage Project Databases" button
- Added handlers: `openDbManagement`, `saveCacheServerUrl`, `testCacheServer`

### 5.7 — Created `src/panels/DbManagementPanel.ts`
- Full implementation with `show()` static factory, message handler, and HTML panel
- Handles: `getStatus` (fetches local DB status + cache server index), `download` (SSE streaming), `delete`
- UI shows project grid with local status, last sync, server variants, download/delete actions
- All buttons use `<vscode-button>`, includes `<vscode-progress-ring>` for download progress

### 5.8 — Updated `src/extension.ts`
- Added `DbManagementPanel` import
- Added `jamaEditor.manageProjectDbs` command registration
- Updated test detail panel `createWebviewPanel` to include `localResourceRoots` for toolkit
- Updated all 3 `getTest*DetailHtml()` calls to pass `context.extensionUri` as second argument

### 5.9 — Updated `package.json`
- Added `jamaEditor.manageProjectDbs` command (`$(database)` icon)
- Added `jamaEditor.cacheServerUrl` configuration property

## Build Command (must be run by parent agent)
```powershell
cd "C:\Users\ENPH\Windsurf\enphase-windsurf-bundle\tools\jama-connect\client\vscode-extension"
npm install
node esbuild.mjs
```
Expected output:
- `out/extension.js`
- `out/webview/tiptap.js`
- `out/webview/toolkit.js` (NEW)

## Files Changed (Phase 5)
- **Created**: `src/webview/toolkit-entry.ts`, `src/panels/DbManagementPanel.ts`
- **Modified**: `package.json`, `esbuild.mjs`, `src/editor/editorHtml.ts`, `src/editor/testDetailHtml.ts`, `src/panels/SettingsPanel.ts`, `src/extension.ts`

## Important Notes
- **npm install must be run** before building: `@vscode/webview-ui-toolkit@1.4.0` was added to `package.json` but not installed (shell commands were blocked in background agent mode)
- The `buildDynamicFields()` function in `editorHtml.ts` is now unused but retained (harmless — TypeScript doesn't flag unused functions without `noUnusedLocals`)
- JavaScript in webview HTML remains functionally identical — only HTML element types changed
- TipTap toolbar buttons are kept as native `<button>` (they use `data-tt` attributes for command dispatch, not standard click events on toolkit elements)
- The `vscode-text-field` component exposes `.value` property compatible with existing JS field tracking code
- The `vscode-dropdown` change event fires the same as native `<select>` change events

## Open Questions
- None: all steps from the task description implemented
