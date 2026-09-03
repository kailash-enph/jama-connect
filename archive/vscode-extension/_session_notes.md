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
