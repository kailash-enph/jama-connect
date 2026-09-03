import * as vscode from "vscode";

export class DbManagementPanel {
  static currentPanel: DbManagementPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;

  public static show(extensionUri: vscode.Uri): DbManagementPanel {
    if (DbManagementPanel.currentPanel) {
      DbManagementPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return DbManagementPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      "jamaDbManagement",
      "Jama — Project Databases",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "out", "webview")],
      }
    );
    const p = new DbManagementPanel(panel, extensionUri);
    DbManagementPanel.currentPanel = p;
    return p;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._panel.onDidDispose(() => { DbManagementPanel.currentPanel = undefined; });
    this._panel.webview.html = this._getHtml();
    this._panel.webview.onDidReceiveMessage(async (msg) => {
      await this._handleMessage(msg);
    });
  }

  private async _handleMessage(msg: { type: string; [key: string]: unknown }) {
    const port = vscode.workspace.getConfiguration("jamaEditor").get<number>("port", 8765);
    const baseUrl = `http://localhost:${port}`;

    if (msg.type === "getStatus") {
      try {
        const [statusRes, indexRes] = await Promise.allSettled([
          fetch(`${baseUrl}/api/db/status`).then(r => r.json()),
          fetch(`${baseUrl}/api/cache-server/index`).then(r => r.json()),
        ]);
        this._panel.webview.postMessage({
          type: "statusData",
          local: statusRes.status === "fulfilled" ? statusRes.value : [],
          index: indexRes.status === "fulfilled" ? indexRes.value : null,
        });
      } catch (e) {
        this._panel.webview.postMessage({ type: "error", message: String(e) });
      }
    } else if (msg.type === "download") {
      // Trigger SSE download via REST endpoint
      const projectId = msg.projectId as number;
      const variant = msg.variant as string;
      try {
        const response = await fetch(`${baseUrl}/api/cache-server/download/${projectId}?variant=${variant}`);
        const reader = response.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                this._panel.webview.postMessage({ type: "downloadProgress", projectId, ...data });
              } catch { /* ignore parse errors */ }
            }
          }
        }
      } catch (e) {
        this._panel.webview.postMessage({ type: "error", message: String(e) });
      }
    } else if (msg.type === "delete") {
      const projectId = msg.projectId as number;
      try {
        await fetch(`${baseUrl}/api/db/project/${projectId}`, { method: "DELETE" });
        this._panel.webview.postMessage({ type: "deleted", projectId });
      } catch (e) {
        this._panel.webview.postMessage({ type: "error", message: String(e) });
      }
    }
  }

  private _getHtml(): string {
    const toolkitUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "out", "webview", "toolkit.js")
    );
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' ${this._panel.webview.cspSource}; connect-src http://localhost:*;">
  <script src="${toolkitUri}"></script>
  <style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 20px; }
    .grid-wrap { margin-top: 12px; }
    .row { display: grid; grid-template-columns: 2fr 1.5fr 1.5fr 1.5fr 1fr; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--vscode-panel-border); font-size: 13px; }
    .row.header { font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground); padding-bottom: 4px; }
    .project-name { font-weight: 500; }
    .project-id { font-size: 11px; color: var(--vscode-descriptionForeground); }
    .status-none { color: var(--vscode-descriptionForeground); font-style: italic; }
    .status-downloaded { color: var(--vscode-testing-iconPassed, #73c991); font-weight: 500; }
    .actions { display: flex; gap: 4px; flex-wrap: wrap; }
    .progress-row { padding: 8px; background: var(--vscode-editorWidget-background); border-radius: 4px; margin-top: 4px; display: none; align-items: center; gap: 8px; font-size: 12px; }
    .progress-row.visible { display: flex; }
    #errorMsg { color: var(--vscode-errorForeground); font-size: 12px; margin-top: 8px; display: none; }
  </style>
</head>
<body>
  <h1>Project Databases</h1>
  <p class="subtitle">Manage locally cached project databases downloaded from the cache server.</p>
  <div style="display:flex;gap:8px;margin-bottom:16px">
    <vscode-button id="refreshBtn" appearance="secondary" onclick="refresh()">Refresh</vscode-button>
  </div>
  <div id="errorMsg"></div>
  <div class="grid-wrap">
    <div class="row header">
      <span>Project</span>
      <span>Local Status</span>
      <span>Last Sync</span>
      <span>Server Variants</span>
      <span>Actions</span>
    </div>
    <div id="projectRows"><p style="color:var(--vscode-descriptionForeground);padding:16px 0">Loading...</p></div>
  </div>
  <div class="progress-row" id="progressRow">
    <vscode-progress-ring></vscode-progress-ring>
    <span id="progressMsg">Downloading...</span>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function send(msg) { vscode.postMessage(msg); }
    function refresh() { send({ type: 'getStatus' }); }

    function formatBytes(b) {
      if (!b) return '\u2014';
      if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
      return (b / (1024 * 1024)).toFixed(1) + ' MB';
    }
    function formatDate(s) {
      if (!s) return '\u2014';
      try { return new Date(s).toLocaleDateString(); } catch { return s; }
    }

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'statusData') renderProjects(msg.local, msg.index);
      else if (msg.type === 'error') showError(msg.message);
      else if (msg.type === 'downloadProgress') updateProgress(msg);
      else if (msg.type === 'deleted') refresh();
    });

    function showError(msg) {
      const el = document.getElementById('errorMsg');
      el.textContent = 'Error: ' + msg;
      el.style.display = 'block';
    }

    function updateProgress(data) {
      const row = document.getElementById('progressRow');
      const msg = document.getElementById('progressMsg');
      if (data.phase === 'done') {
        row.classList.remove('visible');
        refresh();
      } else if (data.phase === 'error') {
        row.classList.remove('visible');
        showError(data.message || 'Download failed');
      } else {
        row.classList.add('visible');
        msg.textContent = (data.phase || 'Downloading') + (data.pct ? ' ' + data.pct + '%' : '');
      }
    }

    function renderProjects(local, index) {
      const container = document.getElementById('projectRows');
      const localMap = {};
      (local || []).forEach(p => { localMap[p.project_id] = p; });
      const projects = index && index.projects ? Object.values(index.projects) : [];

      if (projects.length === 0) {
        container.innerHTML = '<p style="color:var(--vscode-descriptionForeground);padding:16px 0">No cache server configured or no projects found.</p>';
        return;
      }

      container.innerHTML = projects.map(p => {
        const loc = localMap[p.id];
        const localStatus = loc
          ? '<span class="status-downloaded">\u2713 ' + (loc.variant || 'data_only') + ' (' + formatBytes(loc.size_bytes) + ')</span>'
          : '<span class="status-none">Not downloaded</span>';
        const variants = p.variants || {};
        const variantInfo = Object.entries(variants).map(([k, v]) =>
          k + ': ' + formatBytes(v.size_bytes)
        ).join(', ') || '\u2014';
        const actions = [
          '<vscode-button appearance="primary" onclick="download(' + p.id + ',\'data_only\')">\u2193 Data</vscode-button>',
          (variants.with_images ? '<vscode-button appearance="secondary" onclick="download(' + p.id + ',\'with_images\')">\u2193 +Images</vscode-button>' : ''),
          (loc ? '<vscode-button appearance="secondary" onclick="deleteDb(' + p.id + ')">Delete</vscode-button>' : ''),
        ].filter(Boolean).join('');

        return '<div class="row"><span><div class="project-name">' + p.name + '</div><div class="project-id">ID: ' + p.id + '</div></span><span>' + localStatus + '</span><span>' + formatDate(p.last_sync) + '</span><span style="font-size:11px;color:var(--vscode-descriptionForeground)">' + variantInfo + '</span><span class="actions">' + actions + '</span></div>';
      }).join('');
    }

    function download(projectId, variant) {
      document.getElementById('errorMsg').style.display = 'none';
      send({ type: 'download', projectId, variant });
    }
    function deleteDb(projectId) {
      send({ type: 'delete', projectId });
    }

    refresh();
  </script>
</body>
</html>`;
  }
}
