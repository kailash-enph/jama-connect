import * as vscode from "vscode";
import { getApiBaseUrl } from "../utils/config";

/**
 * WebviewViewProvider for the Jama Settings panel in the activity bar sidebar.
 * Mirrors the viewer Settings page — credentials, session, project, backend status, cache.
 * Communicates with backend via /settings/* REST API.
 */
export class SettingsPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = "jamaSettingsView";

  private _view?: vscode.WebviewView;
  private _pollTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml();

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        await this._handleMessage(msg);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this._postMessage({ type: "error", text: errMsg });
      }
    });

    // Poll backend health every 10s while panel is visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._startPolling();
      } else {
        this._stopPolling();
      }
    });

    if (webviewView.visible) {
      this._startPolling();
    }

    webviewView.onDidDispose(() => {
      this._stopPolling();
      this._view = undefined;
    });
  }

  /** Send a message to the webview. */
  private _postMessage(msg: unknown): void {
    this._view?.webview.postMessage(msg);
  }

  /** Start polling backend health. */
  private _startPolling(): void {
    this._stopPolling();
    this._fetchAll(); // immediate
    this._pollTimer = setInterval(() => this._fetchAll(), 10_000);
  }

  private _stopPolling(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = undefined;
    }
  }

  /** Fetch all settings data and push to webview. */
  private async _fetchAll(): Promise<void> {
    const base = getApiBaseUrl();
    try {
      const [health, creds, session, projects, cache] = await Promise.allSettled([
        this._apiFetch(`${base}/api/health`),
        this._apiFetch(`${base}/settings/credentials`),
        this._apiFetch(`${base}/settings/session`),
        this._apiFetch(`${base}/settings/projects`),
        this._apiFetch(`${base}/api/stats`),
      ]);

      this._postMessage({
        type: "state",
        health: health.status === "fulfilled" ? health.value : null,
        credentials: creds.status === "fulfilled" ? creds.value : null,
        session: session.status === "fulfilled" ? session.value : null,
        projects: projects.status === "fulfilled" ? projects.value : null,
        cache: cache.status === "fulfilled" ? cache.value : null,
      });
    } catch {
      this._postMessage({ type: "state", health: null, credentials: null, session: null, projects: null, cache: null });
    }
  }

  /** Handle a message from the webview. */
  private async _handleMessage(msg: Record<string, unknown>): Promise<void> {
    const base = getApiBaseUrl();

    switch (msg.type) {
      case "refresh":
        await this._fetchAll();
        break;

      case "setCredentials": {
        const testResult = await this._apiFetch(`${base}/settings/credentials/test`, {
          method: "POST",
          body: JSON.stringify({ client_id: msg.clientId, client_secret: msg.clientSecret }),
        });
        if ((testResult as Record<string, unknown>).status !== "success") {
          this._postMessage({ type: "credResult", success: false, text: (testResult as Record<string, unknown>).message || "Authentication failed" });
          return;
        }
        await this._apiFetch(`${base}/settings/credentials`, {
          method: "POST",
          body: JSON.stringify({ client_id: msg.clientId, client_secret: msg.clientSecret }),
        });
        this._postMessage({
          type: "credResult",
          success: true,
          text: `Credentials stored in OS keyring (token expires in ${(testResult as Record<string, unknown>).expires_in}s)`,
        });
        await this._fetchAll();
        break;
      }

      case "clearCredentials":
        await this._apiFetch(`${base}/settings/credentials`, { method: "DELETE" });
        this._postMessage({ type: "credResult", success: true, text: "Credentials cleared" });
        await this._fetchAll();
        break;

      case "setSession": {
        const result = await this._apiFetch(`${base}/settings/session`, {
          method: "POST",
          body: JSON.stringify({ cookie: msg.cookie }),
        });
        this._postMessage({ type: "sessionResult", success: true, text: "Session cookie saved", data: result });
        await this._fetchAll();
        break;
      }

      case "clearSession":
        await this._apiFetch(`${base}/settings/session`, { method: "DELETE" });
        this._postMessage({ type: "sessionResult", success: true, text: "Session cleared" });
        await this._fetchAll();
        break;

      case "setProject": {
        await this._apiFetch(`${base}/settings/project/${msg.projectId}`, { method: "POST" });
        this._postMessage({ type: "projectResult", success: true, text: `Project set to ${msg.projectName}` });
        await this._fetchAll();
        break;
      }

      case "restartBackend":
        this._postMessage({ type: "backendAction", text: "Restarting backend..." });
        await this._apiFetch(`${base}/settings/server/restart`, { method: "POST" });
        // Wait a moment for restart
        await new Promise((r) => setTimeout(r, 3000));
        await this._fetchAll();
        break;

      case "clearCache":
        await this._apiFetch(`${base}/settings/cache/clear`, { method: "POST" });
        this._postMessage({ type: "cacheResult", success: true, text: "Cache cleared" });
        await this._fetchAll();
        break;

      case "openViewer":
        vscode.env.openExternal(vscode.Uri.parse("http://localhost:3000/settings"));
        break;
    }
  }

  /** Simple fetch wrapper. */
  private async _apiFetch(url: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }

  /** Generate the settings panel HTML. */
  private _getHtml(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root {
      --bg: var(--vscode-sideBar-background);
      --fg: var(--vscode-sideBar-foreground);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-hover: var(--vscode-button-hoverBackground);
      --btn-secondary-bg: var(--vscode-button-secondaryBackground);
      --btn-secondary-fg: var(--vscode-button-secondaryForeground);
      --error: var(--vscode-errorForeground);
      --success: #4ec9b0;
      --warning: #cca700;
      --border: var(--vscode-panel-border);
      --desc: var(--vscode-descriptionForeground);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--fg);
      background: var(--bg);
      padding: 12px;
    }
    h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--desc); margin: 16px 0 8px; }
    h2:first-child { margin-top: 0; }

    .card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 10px;
    }
    .row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .row:last-child { margin-bottom: 0; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot.green { background: var(--success); }
    .dot.red { background: var(--error); }
    .dot.yellow { background: var(--warning); }
    .label { font-size: 11px; color: var(--desc); min-width: 70px; }
    .value { font-size: 12px; font-family: var(--vscode-editor-font-family); }

    input, select {
      width: 100%;
      padding: 4px 8px;
      font-size: 12px;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 3px;
      outline: none;
      font-family: var(--vscode-editor-font-family);
      margin-bottom: 6px;
    }
    input:focus, select:focus { border-color: var(--vscode-focusBorder); }

    .btn-row { display: flex; gap: 4px; flex-wrap: wrap; }
    button {
      padding: 4px 10px;
      font-size: 11px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      background: var(--btn-bg);
      color: var(--btn-fg);
    }
    button:hover { background: var(--btn-hover); }
    button.secondary {
      background: var(--btn-secondary-bg);
      color: var(--btn-secondary-fg);
    }
    button.danger {
      background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      color: var(--vscode-inputValidation-errorForeground, #f48771);
    }
    button:disabled { opacity: 0.5; cursor: default; }

    .msg { font-size: 11px; padding: 4px 6px; border-radius: 3px; margin-top: 6px; }
    .msg.success { background: rgba(78,201,176,0.15); color: var(--success); }
    .msg.error { background: rgba(244,135,113,0.15); color: var(--error); }

    .meta { font-size: 10px; color: var(--desc); }
    .link { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: underline; font-size: 11px; }
  </style>
</head>
<body>
  <!-- Backend Status -->
  <h2>Backend Status</h2>
  <div class="card" id="statusCard">
    <div class="row">
      <span class="dot" id="statusDot"></span>
      <span id="statusText">Checking...</span>
    </div>
    <div id="statusDetails" style="display:none">
      <div class="row"><span class="label">Version</span><span class="value" id="version">—</span></div>
      <div class="row"><span class="label">Port</span><span class="value" id="port">—</span></div>
      <div class="row"><span class="label">Uptime</span><span class="value" id="uptime">—</span></div>
      <div class="row"><span class="label">Jama URL</span><span class="value" id="jamaUrl">—</span></div>
    </div>
    <div class="btn-row" style="margin-top:6px">
      <button onclick="send({type:'restartBackend'})" class="secondary">Restart</button>
      <button onclick="send({type:'openViewer'})" class="secondary">Open Viewer</button>
    </div>
  </div>

  <!-- Credentials -->
  <h2>API Credentials</h2>
  <div class="card">
    <div class="row">
      <span class="dot" id="credDot"></span>
      <span id="credStatus">Checking...</span>
    </div>
    <input id="clientId" type="text" placeholder="Client ID" />
    <input id="clientSecret" type="password" placeholder="Client Secret" />
    <div class="btn-row">
      <button id="credSaveBtn" onclick="saveCredentials()">Save & Test</button>
      <button onclick="send({type:'clearCredentials'})" class="danger">Clear</button>
    </div>
    <div id="credMsg" class="msg" style="display:none"></div>
  </div>

  <!-- Session Cookie -->
  <h2>Web Session (JSESSIONID)</h2>
  <div class="card">
    <div class="row">
      <span class="dot" id="sessDot"></span>
      <span id="sessStatus">Checking...</span>
    </div>
    <input id="sessInput" type="password" placeholder="Paste JSESSIONID value..." />
    <div class="btn-row">
      <button onclick="saveSession()">Save</button>
      <button onclick="send({type:'clearSession'})" class="danger">Clear</button>
    </div>
    <div id="sessMsg" class="msg" style="display:none"></div>
  </div>

  <!-- Active Project -->
  <h2>Active Project</h2>
  <div class="card">
    <select id="projectSelect"><option value="">Loading...</option></select>
    <div class="btn-row">
      <button onclick="setProject()">Set Active</button>
    </div>
    <div id="projMsg" class="msg" style="display:none"></div>
  </div>

  <!-- Cache -->
  <h2>Cache</h2>
  <div class="card">
    <div id="cacheInfo" class="meta">Loading...</div>
    <div class="btn-row" style="margin-top:6px">
      <button onclick="send({type:'clearCache'})" class="danger">Clear Cache</button>
    </div>
    <div id="cacheMsg" class="msg" style="display:none"></div>
  </div>

  <div style="margin-top:12px;text-align:center">
    <span class="link" onclick="send({type:'refresh'})">Refresh All</span>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function send(msg) { vscode.postMessage(msg); }

    function saveCredentials() {
      const clientId = document.getElementById('clientId').value.trim();
      const clientSecret = document.getElementById('clientSecret').value.trim();
      if (!clientId || !clientSecret) return;
      document.getElementById('credSaveBtn').disabled = true;
      send({ type: 'setCredentials', clientId, clientSecret });
    }

    function saveSession() {
      const cookie = document.getElementById('sessInput').value.trim();
      if (!cookie) return;
      send({ type: 'setSession', cookie });
    }

    function setProject() {
      const sel = document.getElementById('projectSelect');
      const opt = sel.options[sel.selectedIndex];
      if (!opt || !opt.value) return;
      send({ type: 'setProject', projectId: Number(opt.value), projectName: opt.textContent });
    }

    function showMsg(id, text, isSuccess) {
      const el = document.getElementById(id);
      el.textContent = text;
      el.className = 'msg ' + (isSuccess ? 'success' : 'error');
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 5000);
    }

    function formatUptime(seconds) {
      if (!seconds) return '—';
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;

      if (msg.type === 'state') {
        // Backend status
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        const details = document.getElementById('statusDetails');
        if (msg.health) {
          const allOk = msg.health.mcp_initialized && msg.health.editor_initialized;
          dot.className = 'dot ' + (allOk ? 'green' : 'yellow');
          text.textContent = allOk ? 'All services running' : 'Partially running';
          details.style.display = 'block';
          document.getElementById('version').textContent = msg.health.version || '—';
          document.getElementById('port').textContent = msg.health.port || '—';
          document.getElementById('uptime').textContent = formatUptime(msg.health.uptime_seconds);
          document.getElementById('jamaUrl').textContent = msg.health.jama_url || '—';
        } else {
          dot.className = 'dot red';
          text.textContent = 'Backend not reachable';
          details.style.display = 'none';
        }

        // Credentials
        const credDot = document.getElementById('credDot');
        const credStat = document.getElementById('credStatus');
        if (msg.credentials) {
          credDot.className = 'dot ' + (msg.credentials.configured ? 'green' : 'red');
          credStat.textContent = msg.credentials.configured
            ? 'Configured (' + (msg.credentials.source || 'keyring') + ')'
            : 'Not configured';
        } else {
          credDot.className = 'dot red';
          credStat.textContent = 'Unknown';
        }

        // Session
        const sessDot = document.getElementById('sessDot');
        const sessStat = document.getElementById('sessStatus');
        if (msg.session) {
          const has = msg.session.has_cookie || msg.session.valid;
          sessDot.className = 'dot ' + (has ? 'green' : 'red');
          sessStat.textContent = has ? 'Cookie stored' : 'Not set';
        } else {
          sessDot.className = 'dot red';
          sessStat.textContent = 'Unknown';
        }

        // Projects
        const projSel = document.getElementById('projectSelect');
        if (msg.projects && Array.isArray(msg.projects.projects || msg.projects)) {
          const list = msg.projects.projects || msg.projects;
          const activeId = msg.projects.active_project_id;
          projSel.innerHTML = '';
          if (list.length === 0) {
            projSel.innerHTML = '<option value="">No projects synced</option>';
          } else {
            list.forEach(p => {
              const opt = document.createElement('option');
              opt.value = p.id;
              opt.textContent = p.name || ('Project ' + p.id);
              if (p.id === activeId) opt.selected = true;
              projSel.appendChild(opt);
            });
          }
        }

        // Cache
        const cacheInfo = document.getElementById('cacheInfo');
        if (msg.cache) {
          const parts = [];
          if (msg.cache.items !== undefined) parts.push(msg.cache.items + ' items');
          if (msg.cache.test_plans !== undefined) parts.push(msg.cache.test_plans + ' test plans');
          if (msg.cache.relationships !== undefined) parts.push(msg.cache.relationships + ' relationships');
          if (msg.cache.db_size_mb !== undefined) parts.push(msg.cache.db_size_mb + ' MB');
          cacheInfo.textContent = parts.join(' · ') || 'Cache available';
        } else {
          cacheInfo.textContent = 'Cache info unavailable';
        }

        // Re-enable buttons
        document.getElementById('credSaveBtn').disabled = false;
      }

      if (msg.type === 'credResult') {
        showMsg('credMsg', msg.text, msg.success);
        document.getElementById('credSaveBtn').disabled = false;
        if (msg.success) {
          document.getElementById('clientId').value = '';
          document.getElementById('clientSecret').value = '';
        }
      }

      if (msg.type === 'sessionResult') {
        showMsg('sessMsg', msg.text, msg.success);
        if (msg.success) document.getElementById('sessInput').value = '';
      }

      if (msg.type === 'projectResult') {
        showMsg('projMsg', msg.text, msg.success);
      }

      if (msg.type === 'cacheResult') {
        showMsg('cacheMsg', msg.text, msg.success);
      }

      if (msg.type === 'backendAction') {
        document.getElementById('statusText').textContent = msg.text;
        document.getElementById('statusDot').className = 'dot yellow';
      }

      if (msg.type === 'error') {
        // Show generic error
        showMsg('credMsg', msg.text, false);
      }
    });

    // Initial fetch
    send({ type: 'refresh' });
  </script>
</body>
</html>`;
  }
}
