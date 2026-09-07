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
    } else if (msg.type === "deleteImages") {
      const projectId = msg.projectId as number;
      try {
        await fetch(`${baseUrl}/api/db/project/${projectId}/images`, { method: "DELETE" });
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
    /* ── Layout uses VS Code CSS variables so dark/light adapts automatically ── */
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
    }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 20px; }
    .grid-wrap { margin-top: 12px; }
    .row {
      display: grid;
      grid-template-columns: 2fr 2fr 1fr 1.5fr 1.5fr;
      gap: 8px;
      align-items: start;
      padding: 10px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 13px;
    }
    .row.header {
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      padding-bottom: 6px;
      align-items: center;
    }
    .project-name { font-weight: 500; }
    .project-id   { font-size: 11px; color: var(--vscode-descriptionForeground); }
    /* "local only" pill shown when a project isn't on the server */
    .local-only-badge {
      display: inline-block;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 10px;
      background: var(--vscode-badge-background, #3794ff);
      color: var(--vscode-badge-foreground, #ffffff);
      margin-left: 6px;
      vertical-align: middle;
    }
    .status-none    { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 12px; }
    .status-ok      { color: var(--vscode-testing-iconPassed, #73c991); font-size: 12px; }
    .status-lbl     { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 1px; }
    .imgs-row       { margin-top: 4px; }
    .variant-info   { font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.7; }
    .actions        { display: flex; gap: 4px; flex-wrap: wrap; align-items: flex-start; }
    .progress-row {
      padding: 8px;
      background: var(--vscode-editorWidget-background);
      border-radius: 4px;
      margin-top: 8px;
      display: none;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
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
      <span>Local DB</span>
      <span>Last Sync</span>
      <span>Server Variants</span>
      <span>Actions</span>
    </div>
    <div id="projectRows">
      <p style="color:var(--vscode-descriptionForeground);padding:16px 0">Loading...</p>
    </div>
  </div>
  <div class="progress-row" id="progressRow">
    <vscode-progress-ring></vscode-progress-ring>
    <span id="progressMsg">Downloading...</span>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function send(msg) { vscode.postMessage(msg); }
    function refresh() { send({ type: 'getStatus' }); }

    // Cached project names so download progress can show a label
    let _projectNames = {};

    function fmtBytes(b) {
      if (!b && b !== 0) return '\u2014';
      if (b < 1024 * 1024) return (b / 1024).toFixed(0) + '\u202fKB';
      return (b / (1024 * 1024)).toFixed(1) + '\u202fMB';
    }
    function fmtDate(s) {
      if (!s) return '\u2014';
      try { return new Date(s).toLocaleDateString(); } catch { return s; }
    }

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'statusData')       renderProjects(msg.local, msg.index);
      else if (msg.type === 'error')        showError(msg.message);
      else if (msg.type === 'downloadProgress') updateProgress(msg);
      else if (msg.type === 'deleted')      refresh();
    });

    function showError(msg) {
      const el = document.getElementById('errorMsg');
      el.textContent = 'Error: ' + msg;
      el.style.display = 'block';
    }

    function updateProgress(data) {
      const row = document.getElementById('progressRow');
      const msgEl = document.getElementById('progressMsg');
      if (data.phase === 'done') {
        row.classList.remove('visible');
        refresh();
      } else if (data.phase === 'error') {
        row.classList.remove('visible');
        showError(data.message || 'Download failed');
      } else {
        row.classList.add('visible');
        const projName = _projectNames[data.projectId] || ('Project ' + data.projectId);
        const pct = data.pct ? ' \u2014 ' + data.pct + '%' : '';
        msgEl.textContent = projName + ': ' + (data.phase || 'Downloading') + pct;
      }
    }

    function renderProjects(local, index) {
      const container = document.getElementById('projectRows');

      // ── Build lookup maps ──────────────────────────────────────────────────
      const localMap = {};
      (local || []).forEach(p => { localMap[p.project_id] = p; });

      const serverProjs = (index && index.projects) ? Object.values(index.projects) : [];
      const serverMap = {};
      serverProjs.forEach(p => { serverMap[p.id] = p; });

      // UNION of server + local project IDs — fixes "sync one → other disappears"
      const allIds = [
        ...new Set([
          ...serverProjs.map(p => Number(p.id)),
          ...Object.keys(localMap).map(Number),
        ])
      ].sort((a, b) => a - b);

      if (allIds.length === 0) {
        container.innerHTML =
          '<p style="color:var(--vscode-descriptionForeground);padding:16px 0">' +
          'No cache server configured and no local databases found.</p>';
        return;
      }

      // Cache names for progress messages
      _projectNames = {};
      allIds.forEach(id => {
        _projectNames[id] = serverMap[id]?.name || ('Project ' + id);
      });

      container.innerHTML = allIds.map(id => {
        const svr      = serverMap[id];
        const loc      = localMap[id];
        const name     = svr?.name || ('Project ' + id);
        const variants = svr?.variants || {};

        // ── Local DB column ────────────────────────────────────────────────
        let dataCell = '<span class="status-none">Not downloaded</span>';
        let imgsCell = '';
        if (loc) {
          const itemLbl   = (loc.items_count || 0) + ' items';
          const embImgLbl = loc.has_images ? ' \u00b7 ' + loc.image_count + ' imgs embedded' : '';
          dataCell =
            '<span class="status-ok">\u2713 Data: ' + fmtBytes(loc.db_size_bytes) + '</span>' +
            '<div class="status-lbl">' + itemLbl + embImgLbl + '</div>';

          if (loc.has_images_db) {
            imgsCell =
              '<div class="imgs-row"><span class="status-ok">' +
              '\u2713 Images DB: ' + (loc.images_db_count || 0) + ' imgs</span></div>';
          } else {
            imgsCell =
              '<div class="imgs-row"><span class="status-none">No images DB</span></div>';
          }
        }

        // ── Server variants column ─────────────────────────────────────────
        const variantLines = Object.entries(variants).map(([k, v]) => {
          const lbl  = { data_only: 'Data', images: 'Images', with_images: '+All' }[k] || k;
          const imgs = v.image_count ? ' (' + v.image_count + ' imgs)' : '';
          return lbl + ': ' + fmtBytes(v.size_bytes) + imgs;
        });
        const variantCell = variantLines.length
          ? '<div class="variant-info">' + variantLines.join('<br>') + '</div>'
          : '<span class="status-none">Not on server</span>';

        // ── Actions column ─────────────────────────────────────────────────
        const actions = [
          '<vscode-button appearance="primary" onclick="download(' + id + ',\'data_only\')">&#11123; Data</vscode-button>',
          (variants.images
            ? '<vscode-button appearance="secondary" onclick="download(' + id + ',\'images\')">&#11123; Images</vscode-button>'
            : ''),
          (variants.with_images
            ? '<vscode-button appearance="secondary" onclick="download(' + id + ',\'with_images\')">&#11123; +All</vscode-button>'
            : ''),
          (loc
            ? '<vscode-button appearance="secondary" onclick="deleteDb(' + id + ')">Delete</vscode-button>'
            : ''),
        ].filter(Boolean).join('');

        const localBadge = !svr
          ? '<span class="local-only-badge">local only</span>'
          : '';

        return (
          '<div class="row">' +
          '<span>' +
            '<div class="project-name">' + name + localBadge + '</div>' +
            '<div class="project-id">ID: ' + id + '</div>' +
          '</span>' +
          '<span>' + dataCell + imgsCell + '</span>' +
          '<span style="font-size:12px">' + fmtDate(svr?.last_sync || loc?.last_sync) + '</span>' +
          '<span>' + variantCell + '</span>' +
          '<span class="actions">' + actions + '</span>' +
          '</div>'
        );
      }).join('');
    }

    function download(projectId, variant) {
      document.getElementById('errorMsg').style.display = 'none';
      send({ type: 'download', projectId, variant });
    }
    function deleteDb(projectId) {
      send({ type: 'delete', projectId });
    }
    function deleteImagesDb(projectId) {
      send({ type: 'deleteImages', projectId });
    }

    refresh();
  </script>
</body>
</html>`;
  }
}
