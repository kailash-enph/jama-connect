import * as vscode from "vscode";
import { getApiBaseUrl } from "../utils/config";
import { DbManagementPanel } from "./DbManagementPanel";

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
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "out", "webview"),
        this._extensionUri,
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

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

      case "openDbManagement":
        DbManagementPanel.show(this._extensionUri);
        break;

      case "saveCacheServerUrl": {
        const url = msg.url as string;
        const config = vscode.workspace.getConfiguration("jamaEditor");
        await config.update("cacheServerUrl", url, vscode.ConfigurationTarget.Global);
        this._postMessage({ type: "cacheServerResult", success: true, text: "Cache server URL saved" });
        break;
      }

      case "testCacheServer": {
        const cacheBase = vscode.workspace.getConfiguration("jamaEditor").get<string>("cacheServerUrl", "").trim();
        if (!cacheBase) {
          this._postMessage({ type: "cacheServerResult", success: false, text: "No cache server URL configured. Save a URL first." });
          break;
        }
        try {
          const res = await this._apiFetch(`${cacheBase}/api/health`);
          this._postMessage({ type: "cacheServerResult", success: true, text: `Connected: ${JSON.stringify(res)}` });
        } catch (e) {
          this._postMessage({ type: "cacheServerResult", success: false, text: `Failed: ${String(e)}` });
        }
        break;
      }
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
  private _getHtml(webview: vscode.Webview): string {
    const toolkitUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "out", "webview", "toolkit.js")
    );
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' ${webview.cspSource}; connect-src http://localhost:*;">
  <script src="${toolkitUri}"></script>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background);
      --fg: var(--vscode-sideBar-foreground);
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
      padding: 8px;
    }
    vscode-panels { width: 100%; }
    vscode-panel-view { padding: 8px 0; display: block; }
    vscode-text-field, vscode-text-area { width: 100%; margin-bottom: 6px; }
    vscode-dropdown { width: 100%; margin-bottom: 6px; }
    .row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot.green { background: var(--success); }
    .dot.red { background: var(--error); }
    .dot.yellow { background: var(--warning); }
    .label { font-size: 11px; color: var(--desc); min-width: 70px; }
    .value { font-size: 12px; font-family: var(--vscode-editor-font-family); }
    .btn-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
    .msg { font-size: 11px; padding: 4px 6px; border-radius: 3px; margin-top: 6px; }
    .msg.success { background: rgba(78,201,176,0.15); color: var(--success); }
    .msg.error { background: rgba(244,135,113,0.15); color: var(--error); }
    .meta { font-size: 10px; color: var(--desc); }
    vscode-divider { margin: 10px 0; }
  </style>
</head>
<body>
  <vscode-panels aria-label="Settings sections">
    <!-- TAB 1: Status -->
    <vscode-panel-tab id="tab-status">Status</vscode-panel-tab>
    <!-- TAB 2: Credentials -->
    <vscode-panel-tab id="tab-creds">Credentials</vscode-panel-tab>
    <!-- TAB 3: Session -->
    <vscode-panel-tab id="tab-session">Session</vscode-panel-tab>
    <!-- TAB 4: Cache Server -->
    <vscode-panel-tab id="tab-cache">Cache Server</vscode-panel-tab>

    <!-- VIEW 1: Status -->
    <vscode-panel-view id="view-status">
      <div style="width:100%">
        <div class="row">
          <span class="dot" id="statusDot"></span>
          <span id="statusText">Checking...</span>
        </div>
        <div id="statusDetails" style="display:none">
          <div class="row"><span class="label">Version</span><span class="value" id="version">\u2014</span></div>
          <div class="row"><span class="label">Port</span><span class="value" id="port">\u2014</span></div>
          <div class="row"><span class="label">Uptime</span><span class="value" id="uptime">\u2014</span></div>
          <div class="row"><span class="label">Jama URL</span><span class="value" id="jamaUrl">\u2014</span></div>
        </div>
        <div class="btn-row">
          <vscode-button appearance="secondary" onclick="send({type:'restartBackend'})">Restart</vscode-button>
          <vscode-button appearance="secondary" onclick="send({type:'openViewer'})">Open Viewer</vscode-button>
          <vscode-button appearance="secondary" onclick="send({type:'refresh'})">Refresh</vscode-button>
        </div>
        <vscode-divider></vscode-divider>
        <div style="font-size:11px;color:var(--desc);margin-bottom:6px;">Active Project</div>
        <vscode-dropdown id="projectSelect">
          <vscode-option value="">Loading...</vscode-option>
        </vscode-dropdown>
        <div class="btn-row">
          <vscode-button onclick="setProject()">Set Active</vscode-button>
        </div>
        <div id="projMsg" class="msg" style="display:none"></div>
        <vscode-divider></vscode-divider>
        <div id="cacheInfo" class="meta">Loading cache info...</div>
        <div class="btn-row">
          <vscode-button appearance="secondary" onclick="send({type:'clearCache'})">Clear Cache</vscode-button>
        </div>
        <div id="cacheMsg" class="msg" style="display:none"></div>
      </div>
    </vscode-panel-view>

    <!-- VIEW 2: Credentials -->
    <vscode-panel-view id="view-creds">
      <div style="width:100%">
        <div class="row">
          <span class="dot" id="credDot"></span>
          <span id="credStatus">Checking...</span>
        </div>
        <vscode-text-field id="clientId" placeholder="Client ID">Client ID</vscode-text-field>
        <vscode-text-field id="clientSecret" placeholder="Client Secret" type="password">Client Secret</vscode-text-field>
        <div class="btn-row">
          <vscode-button id="credSaveBtn" onclick="saveCredentials()">Save &amp; Test</vscode-button>
          <vscode-button appearance="secondary" onclick="send({type:'clearCredentials'})">Clear</vscode-button>
        </div>
        <div id="credMsg" class="msg" style="display:none"></div>
      </div>
    </vscode-panel-view>

    <!-- VIEW 3: Session -->
    <vscode-panel-view id="view-session">
      <div style="width:100%">
        <div class="row">
          <span class="dot" id="sessDot"></span>
          <span id="sessStatus">Checking...</span>
        </div>
        <vscode-text-field id="sessInput" placeholder="Paste JSESSIONID value..." type="password">JSESSIONID</vscode-text-field>
        <div class="btn-row">
          <vscode-button onclick="saveSession()">Save</vscode-button>
          <vscode-button appearance="secondary" onclick="send({type:'clearSession'})">Clear</vscode-button>
        </div>
        <div id="sessMsg" class="msg" style="display:none"></div>
      </div>
    </vscode-panel-view>

    <!-- VIEW 4: Cache Server -->
    <vscode-panel-view id="view-cache">
      <div style="width:100%">
        <vscode-text-field id="cacheServerUrl" placeholder="http://server-ip:8866">Cache Server URL</vscode-text-field>
        <div style="display:flex;gap:4px;margin-top:8px">
          <vscode-button onclick="saveCacheServerUrl()">Save</vscode-button>
          <vscode-button appearance="secondary" onclick="testCacheServer()">Test</vscode-button>
        </div>
        <div id="cacheServerMsg" class="msg" style="display:none"></div>
        <vscode-divider></vscode-divider>
        <vscode-button appearance="secondary" onclick="send({type:'openDbManagement'})">Manage Project Databases...</vscode-button>
      </div>
    </vscode-panel-view>
  </vscode-panels>

  <script>
    const vscode = acquireVsCodeApi();

    function send(msg) { vscode.postMessage(msg); }

    function saveCredentials() {
      const clientIdEl = document.getElementById('clientId');
      const clientSecretEl = document.getElementById('clientSecret');
      const clientId = (clientIdEl.value || '').trim();
      const clientSecret = (clientSecretEl.value || '').trim();
      if (!clientId || !clientSecret) return;
      document.getElementById('credSaveBtn').disabled = true;
      send({ type: 'setCredentials', clientId, clientSecret });
    }

    function saveSession() {
      const sessEl = document.getElementById('sessInput');
      const cookie = (sessEl.value || '').trim();
      if (!cookie) return;
      send({ type: 'setSession', cookie });
    }

    function setProject() {
      const sel = document.getElementById('projectSelect');
      const val = sel.value;
      if (!val) return;
      // Find the option text
      const selectedOpt = sel.querySelector('vscode-option[value="' + val + '"]');
      const name = selectedOpt ? selectedOpt.textContent : ('Project ' + val);
      send({ type: 'setProject', projectId: Number(val), projectName: name });
    }

    function saveCacheServerUrl() {
      const el = document.getElementById('cacheServerUrl');
      const url = (el.value || '').trim();
      send({ type: 'saveCacheServerUrl', url });
    }

    function testCacheServer() {
      send({ type: 'testCacheServer' });
    }

    function showMsg(id, text, isSuccess) {
      const el = document.getElementById(id);
      el.textContent = text;
      el.className = 'msg ' + (isSuccess ? 'success' : 'error');
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 5000);
    }

    function formatUptime(seconds) {
      if (!seconds) return '\u2014';
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
          document.getElementById('version').textContent = msg.health.version || '\u2014';
          document.getElementById('port').textContent = msg.health.port || '\u2014';
          document.getElementById('uptime').textContent = formatUptime(msg.health.uptime_seconds);
          document.getElementById('jamaUrl').textContent = msg.health.jama_url || '\u2014';
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

        // Projects (vscode-dropdown)
        const projSel = document.getElementById('projectSelect');
        if (msg.projects && Array.isArray(msg.projects.projects || msg.projects)) {
          const list = msg.projects.projects || msg.projects;
          const activeId = msg.projects.active_project_id;
          projSel.innerHTML = '<vscode-option value="">-- Select project --</vscode-option>';
          list.forEach(p => {
            const opt = document.createElement('vscode-option');
            opt.setAttribute('value', String(p.id));
            opt.textContent = p.name || ('Project ' + p.id);
            if (p.id === activeId) opt.setAttribute('selected', '');
            projSel.appendChild(opt);
          });
        }

        // Cache
        const cacheInfo = document.getElementById('cacheInfo');
        if (msg.cache) {
          const parts = [];
          if (msg.cache.items !== undefined) parts.push(msg.cache.items + ' items');
          if (msg.cache.test_plans !== undefined) parts.push(msg.cache.test_plans + ' test plans');
          if (msg.cache.relationships !== undefined) parts.push(msg.cache.relationships + ' relationships');
          if (msg.cache.db_size_mb !== undefined) parts.push(msg.cache.db_size_mb + ' MB');
          cacheInfo.textContent = parts.join(' \u00b7 ') || 'Cache available';
        } else {
          cacheInfo.textContent = 'Cache info unavailable';
        }

        // Re-enable save button
        const credSaveBtn = document.getElementById('credSaveBtn');
        if (credSaveBtn) credSaveBtn.disabled = false;
      }

      if (msg.type === 'credResult') {
        showMsg('credMsg', msg.text, msg.success);
        const credSaveBtn = document.getElementById('credSaveBtn');
        if (credSaveBtn) credSaveBtn.disabled = false;
        if (msg.success) {
          const clientIdEl = document.getElementById('clientId');
          const clientSecretEl = document.getElementById('clientSecret');
          if (clientIdEl) clientIdEl.value = '';
          if (clientSecretEl) clientSecretEl.value = '';
        }
      }

      if (msg.type === 'sessionResult') {
        showMsg('sessMsg', msg.text, msg.success);
        if (msg.success) {
          const sessEl = document.getElementById('sessInput');
          if (sessEl) sessEl.value = '';
        }
      }

      if (msg.type === 'projectResult') {
        showMsg('projMsg', msg.text, msg.success);
      }

      if (msg.type === 'cacheResult') {
        showMsg('cacheMsg', msg.text, msg.success);
      }

      if (msg.type === 'cacheServerResult') {
        showMsg('cacheServerMsg', msg.text, msg.success);
      }

      if (msg.type === 'backendAction') {
        document.getElementById('statusText').textContent = msg.text;
        document.getElementById('statusDot').className = 'dot yellow';
      }

      if (msg.type === 'error') {
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
