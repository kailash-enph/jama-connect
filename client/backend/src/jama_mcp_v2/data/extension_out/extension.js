"use strict";var Be=Object.create;var Y=Object.defineProperty;var Ne=Object.getOwnPropertyDescriptor;var Oe=Object.getOwnPropertyNames;var Fe=Object.getPrototypeOf,qe=Object.prototype.hasOwnProperty;var ze=(i,e)=>{for(var t in e)Y(i,t,{get:e[t],enumerable:!0})},fe=(i,e,t,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let a of Oe(e))!qe.call(i,a)&&a!==t&&Y(i,a,{get:()=>e[a],enumerable:!(s=Ne(e,a))||s.enumerable});return i};var I=(i,e,t)=>(t=i!=null?Be(Fe(i)):{},fe(e||!i||!i.__esModule?Y(t,"default",{value:i,enumerable:!0}):t,i)),Ve=i=>fe(Y({},"__esModule",{value:!0}),i);var nt={};ze(nt,{activate:()=>st,deactivate:()=>at});module.exports=Ve(nt);var l=I(require("vscode"));var be=I(require("vscode")),Q=I(require("path"));function P(){let i=be.workspace.getConfiguration("jamaEditor"),e=i.get("backendPath","");if(!e){let t=Q.resolve(__dirname,"..");e=Q.join(t,"..","backend")}return{backendPath:e,port:i.get("port",8765),editorPort:i.get("editorPort",8766),jamaUrl:i.get("jamaUrl","https://enphase.jamacloud.com"),autoStartBackend:i.get("autoStartBackend",!0),uvPath:i.get("uvPath","uv")}}function z(){return`http://localhost:${P().port}`}var J=class{baseUrl;constructor(e){this.baseUrl=e??z()}async request(e,t){let s=`${this.baseUrl}${e}`,a=await fetch(s,{...t,headers:{"Content-Type":"application/json",...t?.headers}});if(!a.ok){let n=await a.text().catch(()=>"");throw new Error(`Jama API ${a.status}: ${n||a.statusText}`)}return a.json()}async healthCheck(){try{return await this.request("/api/health"),!0}catch{return!1}}async getCredentialStatus(){return this.request("/settings/credentials")}async getProjects(){return this.request("/api/projects")}async getItem(e,t=!1){return this.request(`/api/items/${e}${t?"?live=true":""}`)}async getItemChildren(e,t=!1){return this.request(`/api/items/${e}/children${t?"?live=true":""}`)}async getItemTree(e){return this.request(`/api/projects/${e}/tree`)}async updateItem(e,t){return this.request(`/api/items/${e}`,{method:"PUT",body:JSON.stringify({fields:t})})}async createItem(e,t,s,a){return this.request("/api/items",{method:"POST",body:JSON.stringify({project_id:e,item_type_id:t,parent_id:s,fields:a})})}async getItemComments(e){return this.request(`/api/items/${e}/comments`)}async addItemComment(e,t){return this.request(`/api/items/${e}/comments`,{method:"POST",body:JSON.stringify({text:t})})}async getItemAttachments(e){return this.request(`/api/items/${e}/attachments`)}async getItemTags(e){return this.request(`/api/items/${e}/tags`)}async getItemLinks(e){return this.request(`/api/items/${e}/links`)}async getItemLock(e){return this.request(`/api/items/${e}/lock`)}async setItemLock(e,t){return this.request(`/api/items/${e}/lock`,{method:"PUT",body:JSON.stringify({locked:t})})}async getWorkflowTransitions(e){return this.request(`/api/items/${e}/workflowtransitions`)}async executeWorkflowTransition(e,t,s=""){return this.request(`/api/items/${e}/workflowtransitions`,{method:"POST",body:JSON.stringify({transitionId:t,comment:s})})}async getItemUpstream(e){return this.request(`/api/items/${e}/upstream`)}async getItemDownstream(e){return this.request(`/api/items/${e}/downstream`)}async createRelationship(e,t,s){return this.request("/api/relationships",{method:"POST",body:JSON.stringify({from_item:e,to_item:t,relationship_type_id:s})})}async getRelationshipTypes(){return this.request("/api/relationshiptypes")}async getItemVersions(e){return this.request(`/api/items/${e}/versions`)}async getItemAtVersion(e,t){return this.request(`/api/items/${e}/versions/${t}`)}async search(e,t,s=20){let a=new URLSearchParams({q:e,limit:String(s)});return t&&a.set("project",String(t)),this.request(`/api/search?${a}`)}async deepSearch(e,t,s=10){let a=new URLSearchParams({q:e,limit:String(s)});return t&&a.set("project",String(t)),this.request(`/api/deepsearch?${a}`)}async syncProject(e){return this.request(`/api/projects/${e}/sync`,{method:"POST"})}async incrementalSync(e){return this.request(`/api/projects/${e}/incremental-sync`,{method:"POST"})}async getSyncProgress(){return this.request("/api/sync/progress")}async getItemTypes(){return this.request("/api/itemtypes")}async getPickLists(){return this.request("/api/picklists")}async getPickListOptions(e){return this.request(`/api/picklists/${e}/options`)}async getTestPlans(e,t=!1){return this.request(`/api/projects/${e}/testplans${t?"?live=true":""}`)}async getTestCycles(e,t=!1){return this.request(`/api/testplans/${e}/cycles${t?"?live=true":""}`)}async getTestRuns(e,t=!1){return this.request(`/api/testcycles/${e}/runs${t?"?live=true":""}`)}async updateTestRun(e,t,s){return this.request(`/api/testruns/${e}`,{method:"PUT",body:JSON.stringify({status:t,actual_results:s})})}async getTags(e){return this.request(`/api/projects/${e}/tags`)}async getCurrentUser(){return this.request("/api/users/current")}async getUsers(){return this.request("/api/users")}getAttachmentDownloadUrl(e){return`${this.baseUrl}/api/attachments/${e}/base64`}async getBaselines(e){return this.request(`/api/projects/${e}/baselines`)}async getReleases(e){return this.request(`/api/projects/${e}/releases`)}async getReviews(e){return this.request(`/api/projects/${e}/reviews`)}},V=class{baseUrl;constructor(e){this.baseUrl=e??`${z()}/editor`}async request(e,t){let s=`${this.baseUrl}${e}`,a=await fetch(s,{...t,headers:{"Content-Type":"application/json",...t?.headers}});if(!a.ok){let n=await a.text().catch(()=>"");throw new Error(`Editor API ${a.status}: ${n||a.statusText}`)}return a.json()}async healthCheck(){try{return await this.request("/health"),!0}catch{return!1}}async saveDraft(e,t,s,a,n=!0,d=""){return this.request(`/api/drafts/${e}`,{method:"POST",body:JSON.stringify({server_version:t,fields_json:s,description_html:a,is_autosave:n,change_summary:d})})}async getDrafts(e){return this.request(`/api/drafts/${e}`)}async getLatestDraft(e){return this.request(`/api/drafts/${e}/latest`)}async getDraft(e,t){return this.request(`/api/drafts/${e}/${t}`)}async clearDrafts(e){return this.request(`/api/drafts/${e}`,{method:"DELETE"})}async getDraftState(e){return this.request(`/api/drafts/${e}/state`)}async getDirtyItems(){return this.request("/api/drafts/dirty")}async getUndoStack(e){return this.request(`/api/undo/${e}`)}async pushUndo(e,t,s,a){return this.request(`/api/undo/${e}`,{method:"POST",body:JSON.stringify({field_name:t,old_value:s,new_value:a})})}async popUndo(e){return this.request(`/api/undo/${e}/pop`,{method:"POST"})}async getLock(e){return this.request(`/api/items/${e}/lock`)}async acquireLock(e){return this.request(`/api/items/${e}/lock`,{method:"POST"})}async releaseLock(e){return this.request(`/api/items/${e}/lock`,{method:"DELETE"})}async pushToJama(e,t,s){return this.request(`/api/items/${e}/push`,{method:"POST",body:JSON.stringify({fields:t,expected_version:s})})}async getItemTypes(){return this.request("/api/schema/itemtypes")}async getFieldDefinitions(e){return this.request(`/api/schema/itemtypes/${e}/fields`)}async getPickListOptions(e){return this.request(`/api/schema/picklists/${e}/options`)}async getWorkflowTransitions(e){return this.request(`/api/schema/workflows/${e}`)}async uploadAttachment(e,t,s){return this.request(`/api/items/${e}/attachments`,{method:"POST",body:JSON.stringify({file_path:t,file_name:s})})}async syncAttachments(e){return this.request(`/api/items/${e}/attachments/sync`)}async listAttachments(e){return this.request(`/api/items/${e}/attachments/list`)}async replaceAttachment(e,t,s){return this.request(`/api/attachments/${e}/replace`,{method:"PUT",body:JSON.stringify({file_path:t,file_name:s})})}async retryPendingUploads(e){let t=e?`/api/attachments/retry?item_id=${e}`:"/api/attachments/retry";return this.request(t,{method:"POST"})}async getPendingUploads(e){let t=e?`/api/attachments/pending?item_id=${e}`:"/api/attachments/pending";return this.request(t)}async getCacheStats(){return this.request("/api/attachments/cache/stats")}async clearAttachmentCache(){return this.request("/api/attachments/cache",{method:"DELETE"})}async getTestPlanLock(e){return this.request(`/api/testplans/${e}/lock`)}async acquireTestPlanLock(e){return this.request(`/api/testplans/${e}/lock`,{method:"POST"})}async releaseTestPlanLock(e){return this.request(`/api/testplans/${e}/lock`,{method:"DELETE"})}async pushTestPlan(e,t,s){return this.request(`/api/testplans/${e}/push`,{method:"POST",body:JSON.stringify({fields:t,expected_version:s})})}async pushTestCycle(e,t,s){return this.request(`/api/testcycles/${e}/push`,{method:"POST",body:JSON.stringify({fields:t,expected_version:s})})}async pushTestRun(e,t,s){return this.request(`/api/testruns/${e}/push`,{method:"POST",body:JSON.stringify({fields:t,expected_version:s})})}async clearImageCache(){return this.request("/api/images/cache",{method:"DELETE"})}async uploadItemAttachment(e,t,s=""){return this.request(`/api/items/${e}/attachments`,{method:"POST",body:JSON.stringify({file_path:t,file_name:s})})}};var M=I(require("vscode")),N=require("child_process"),de=I(require("path"));var X=class{process=null;statusBar;outputChannel;apiClient;healthTimer=null;_isRunning=!1;constructor(){this.outputChannel=M.window.createOutputChannel("Jama Backend"),this.statusBar=M.window.createStatusBarItem(M.StatusBarAlignment.Left,50),this.statusBar.command="jamaEditor.openSettings",this.apiClient=new J,this.updateStatus("stopped")}get isRunning(){return this._isRunning}get editorIsRunning(){return this._isRunning}async start(){if(this.process)return this.outputChannel.appendLine("[backend] Already running, skipping start."),!0;let e=P(),t=e.port;this.apiClient=new J(`http://localhost:${t}`);try{let c=new AbortController,p=setTimeout(()=>c.abort(),5e3),g=await fetch(`http://localhost:${t}/api/health`,{signal:c.signal});if(clearTimeout(p),g.ok)return this.outputChannel.appendLine(`[backend] Backend already running on port ${t}.`),this._isRunning=!0,this.updateStatus("running"),this.startHealthCheck(),!0}catch{}this.updateStatus("starting");let s=M.workspace.getConfiguration("jamaEditor").get("cacheServerUrl","").trim(),a={...process.env,JAMA_URL:e.jamaUrl,JAMA_REST_PORT:String(t),...s?{JAMA_CACHE_SERVER_URL:s}:{}},n=this.commandExists("jama-rest"),d=n?"jama-rest":e.uvPath,r=n?["--port",String(t)]:["run","--link-mode=copy","python","-m","jama_mcp_v2","--rest-only","--port",String(t)],o=n?void 0:e.backendPath;this.outputChannel.appendLine(`[backend] Starting: ${d} ${r.join(" ")}${o?` (cwd: ${o})`:""}`);try{return this.process=(0,N.spawn)(d,r,{cwd:o,env:a,stdio:["ignore","pipe","pipe"],shell:!0}),this.process.stdout?.on("data",p=>{this.outputChannel.append(p.toString())}),this.process.stderr?.on("data",p=>{this.outputChannel.append(p.toString())}),this.process.on("error",p=>{this.outputChannel.appendLine(`[backend] Process error: ${p.message}`),this._isRunning=!1,this.process=null,this.updateStatus("error")}),this.process.on("exit",(p,g)=>{this.outputChannel.appendLine(`[backend] Process exited (code=${p}, signal=${g})`),this._isRunning=!1,this.process=null,this.updateStatus("stopped")}),await this.waitForReady(t,3e4)?(this._isRunning=!0,this.outputChannel.appendLine("[backend] Unified backend ready."),this.updateStatus("running"),this.startHealthCheck(),!0):(this.outputChannel.appendLine("[backend] Timed out waiting for backend."),this.updateStatus("error"),!1)}catch(c){let p=c instanceof Error?c.message:String(c);return this.outputChannel.appendLine(`[backend] Failed to start: ${p}`),this.updateStatus("error"),!1}}async stop(){if(this.stopHealthCheck(),this._isRunning)try{let e=P();await fetch(`http://localhost:${e.port}/settings/server/stop`,{method:"POST"}),this.outputChannel.appendLine("[backend] Graceful stop requested via API."),await ye(2e3)}catch{this.outputChannel.appendLine("[backend] API stop failed, falling back to SIGTERM.")}this.process&&(this.outputChannel.appendLine("[backend] Stopping process..."),this.process.kill("SIGTERM"),await new Promise(e=>{let t=setTimeout(()=>{this.process&&this.process.kill("SIGKILL"),e()},5e3);this.process?.on("exit",()=>{clearTimeout(t),e()})}),this.process=null),this._isRunning=!1,this.updateStatus("stopped"),this.outputChannel.appendLine("[backend] Backend stopped.")}async restart(){return await this.stop(),this.start()}dispose(){this.stopHealthCheck(),this.process&&(this.process.kill("SIGKILL"),this.process=null),this.statusBar.dispose(),this.outputChannel.dispose()}commandExists(e){try{return process.platform==="win32"?(0,N.execSync)(`where ${e}`,{encoding:"utf-8",windowsHide:!0,stdio:"pipe"}):(0,N.execSync)(`which ${e}`,{encoding:"utf-8",stdio:"pipe"}),!0}catch{return!1}}async waitForReady(e,t){let s=Date.now(),a=new J(`http://localhost:${e}`);for(;Date.now()-s<t;){if(await a.healthCheck())return!0;await ye(1e3)}return!1}hasLoginService(){try{return process.platform==="win32"?(0,N.execSync)('schtasks /Query /TN "JamaMCPBackend" 2>nul',{encoding:"utf-8",windowsHide:!0}).includes("JamaMCPBackend"):process.platform==="darwin"?(0,N.execSync)("launchctl list 2>/dev/null | grep com.enphase.jama-backend",{encoding:"utf-8",shell:"/bin/bash"}).includes("com.enphase.jama-backend"):!1}catch{return!1}}async offerServiceInstall(){if(this.hasLoginService())return;let e=process.platform;if(e!=="win32"&&e!=="darwin"||await M.window.showInformationMessage("Jama backend can start automatically at login. Install as a login service?","Install","Not Now")!=="Install")return;let s=P(),a=M.window.createTerminal("Jama Service Install");if(a.show(),e==="win32"){let n=de.join(s.backendPath,"scripts","install-service.ps1");a.sendText(`powershell -ExecutionPolicy Bypass -File "${n}" -Port ${s.port}`)}else{let n=de.join(s.backendPath,"scripts","install-service.sh");a.sendText(`bash "${n}" --port ${s.port}`)}}startHealthCheck(){this.stopHealthCheck(),this.healthTimer=setInterval(async()=>{await this.apiClient.healthCheck()||(this.outputChannel.appendLine("[backend] Health check failed."),this._isRunning=!1,this.updateStatus("error"),P().autoStartBackend&&(this.outputChannel.appendLine("[backend] Attempting auto-restart..."),this.process&&(this.process.kill("SIGKILL"),this.process=null),await this.start()))},3e4)}stopHealthCheck(){this.healthTimer&&(clearInterval(this.healthTimer),this.healthTimer=null)}updateStatus(e){let t={starting:"$(loading~spin)",running:"$(check)",stopped:"$(circle-slash)",error:"$(error)"};this.statusBar.text=`${t[e]} Jama`,this.statusBar.tooltip=`Jama Backend: ${e}`,this.statusBar.show()}};function ye(i){return new Promise(e=>setTimeout(e,i))}var _=I(require("vscode"));var C=I(require("vscode")),H=class i{static currentPanel;_panel;_extensionUri;static show(e){if(i.currentPanel)return i.currentPanel._panel.reveal(C.ViewColumn.One),i.currentPanel;let t=C.window.createWebviewPanel("jamaDbManagement","Jama \u2014 Project Databases",C.ViewColumn.One,{enableScripts:!0,localResourceRoots:[C.Uri.joinPath(e,"out","webview")]}),s=new i(t,e);return i.currentPanel=s,s}constructor(e,t){this._panel=e,this._extensionUri=t,this._panel.onDidDispose(()=>{i.currentPanel=void 0}),this._panel.webview.html=this._getHtml(),this._panel.webview.onDidReceiveMessage(async s=>{await this._handleMessage(s)})}async _handleMessage(e){let s=`http://localhost:${C.workspace.getConfiguration("jamaEditor").get("port",8765)}`;if(e.type==="getStatus")try{let a=C.workspace.getConfiguration("jamaEditor").get("cacheServerUrl","").trim();a&&await fetch(`${s}/api/cache-server/url?url=${encodeURIComponent(a)}`,{method:"POST"}).catch(()=>{});let[n,d]=await Promise.allSettled([fetch(`${s}/api/db/status`).then(r=>r.json()),fetch(`${s}/api/cache-server/index`).then(r=>r.json())]);this._panel.webview.postMessage({type:"statusData",local:n.status==="fulfilled"?n.value:[],index:d.status==="fulfilled"?d.value:null})}catch(a){this._panel.webview.postMessage({type:"error",message:String(a)})}else if(e.type==="download"){let a=e.projectId,n=e.variant;try{let r=(await fetch(`${s}/api/cache-server/download/${a}?variant=${n}`)).body?.getReader();if(!r)return;let o=new TextDecoder;for(;;){let{done:c,value:p}=await r.read();if(c)break;let m=o.decode(p).split(`
`);for(let v of m)if(v.startsWith("data: "))try{let w=JSON.parse(v.slice(6));this._panel.webview.postMessage({type:"downloadProgress",projectId:a,...w})}catch{}}}catch(d){this._panel.webview.postMessage({type:"error",message:String(d)})}}else if(e.type==="delete"){let a=e.projectId;try{await fetch(`${s}/api/db/project/${a}`,{method:"DELETE"}),this._panel.webview.postMessage({type:"deleted",projectId:a})}catch(n){this._panel.webview.postMessage({type:"error",message:String(n)})}}else if(e.type==="deleteImages"){let a=e.projectId;try{await fetch(`${s}/api/db/project/${a}/images`,{method:"DELETE"}),this._panel.webview.postMessage({type:"deleted",projectId:a})}catch(n){this._panel.webview.postMessage({type:"error",message:String(n)})}}}_getHtml(){let e=this._panel.webview.asWebviewUri(C.Uri.joinPath(this._extensionUri,"out","webview","toolkit.js"));return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' ${this._panel.webview.cspSource}; connect-src http://localhost:*;">
  <script src="${e}"></script>
  <style>
    /* \u2500\u2500 Layout uses VS Code CSS variables so dark/light adapts automatically \u2500\u2500 */
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
      if (b < 1024 * 1024) return (b / 1024).toFixed(0) + '\u202FKB';
      return (b / (1024 * 1024)).toFixed(1) + '\u202FMB';
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

      // \u2500\u2500 Build lookup maps \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      const localMap = {};
      (local || []).forEach(p => { localMap[p.project_id] = p; });

      const serverProjs = (index && index.projects) ? Object.values(index.projects) : [];
      const serverMap = {};
      serverProjs.forEach(p => { serverMap[p.id] = p; });

      // UNION of server + local project IDs \u2014 fixes "sync one \u2192 other disappears"
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

        // \u2500\u2500 Local DB column \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
        let dataCell = '<span class="status-none">Not downloaded</span>';
        let imgsCell = '';
        if (loc) {
          const itemLbl   = (loc.items_count || 0) + ' items';
          const embImgLbl = loc.has_images ? ' \xB7 ' + loc.image_count + ' imgs embedded' : '';
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

        // \u2500\u2500 Server variants column \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
        const variantLines = Object.entries(variants).map(([k, v]) => {
          const lbl  = { data_only: 'Data', images: 'Images', with_images: '+All' }[k] || k;
          const imgs = v.image_count ? ' (' + v.image_count + ' imgs)' : '';
          return lbl + ': ' + fmtBytes(v.size_bytes) + imgs;
        });
        const variantCell = variantLines.length
          ? '<div class="variant-info">' + variantLines.join('<br>') + '</div>'
          : '<span class="status-none">Not on server</span>';

        // \u2500\u2500 Actions column \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
        const actions = [
          '<vscode-button appearance="primary" onclick="download(' + id + ','data_only')">&#11123; Data</vscode-button>',
          (variants.images
            ? '<vscode-button appearance="secondary" onclick="download(' + id + ','images')">&#11123; Images</vscode-button>'
            : ''),
          (variants.with_images
            ? '<vscode-button appearance="secondary" onclick="download(' + id + ','with_images')">&#11123; +All</vscode-button>'
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
</html>`}};var Z=class{constructor(e){this._extensionUri=e}static viewType="jamaSettingsView";_view;_pollTimer;resolveWebviewView(e,t,s){this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[_.Uri.joinPath(this._extensionUri,"out","webview"),this._extensionUri]},e.webview.html=this._getHtml(e.webview),e.webview.onDidReceiveMessage(async a=>{try{await this._handleMessage(a)}catch(n){let d=n instanceof Error?n.message:String(n);this._postMessage({type:"error",text:d})}}),e.onDidChangeVisibility(()=>{e.visible?this._startPolling():this._stopPolling()}),e.visible&&this._startPolling(),e.onDidDispose(()=>{this._stopPolling(),this._view=void 0})}_postMessage(e){this._view?.webview.postMessage(e)}_startPolling(){this._stopPolling(),this._fetchAll(),this._pollTimer=setInterval(()=>this._fetchAll(),1e4)}_stopPolling(){this._pollTimer&&(clearInterval(this._pollTimer),this._pollTimer=void 0)}async _fetchAll(){let e=z();try{let[t,s,a,n]=await Promise.allSettled([this._apiFetch(`${e}/api/health`),this._apiFetch(`${e}/settings/credentials`),this._apiFetch(`${e}/settings/projects`),this._apiFetch(`${e}/api/stats`)]);this._postMessage({type:"state",health:t.status==="fulfilled"?t.value:null,credentials:s.status==="fulfilled"?s.value:null,projects:a.status==="fulfilled"?a.value:null,cache:n.status==="fulfilled"?n.value:null})}catch{this._postMessage({type:"state",health:null,credentials:null,projects:null,cache:null})}}async _handleMessage(e){let t=z();switch(e.type){case"refresh":await this._fetchAll();break;case"setCredentials":{let s=await this._apiFetch(`${t}/settings/credentials/test`,{method:"POST",body:JSON.stringify({client_id:e.clientId,client_secret:e.clientSecret})});if(s.status!=="success"){this._postMessage({type:"credResult",success:!1,text:s.message||"Authentication failed"});return}await this._apiFetch(`${t}/settings/credentials`,{method:"POST",body:JSON.stringify({client_id:e.clientId,client_secret:e.clientSecret})}),this._postMessage({type:"credResult",success:!0,text:`Credentials stored in OS keyring (token expires in ${s.expires_in}s)`}),await this._fetchAll();break}case"clearCredentials":await this._apiFetch(`${t}/settings/credentials`,{method:"DELETE"}),this._postMessage({type:"credResult",success:!0,text:"Credentials cleared"}),await this._fetchAll();break;case"setProject":{await this._apiFetch(`${t}/settings/project/${e.projectId}`,{method:"POST"}),await _.commands.executeCommand("jamaEditor.setActiveProjectById",Number(e.projectId),String(e.projectName??"")),this._postMessage({type:"projectResult",success:!0,text:`Project set to ${e.projectName}`}),await this._fetchAll();break}case"restartBackend":this._postMessage({type:"backendAction",text:"Restarting backend..."}),await this._apiFetch(`${t}/settings/server/restart`,{method:"POST"}),await new Promise(s=>setTimeout(s,3e3)),await this._fetchAll();break;case"clearCache":await this._apiFetch(`${t}/settings/cache/clear`,{method:"POST"}),this._postMessage({type:"cacheResult",success:!0,text:"Cache cleared"}),await this._fetchAll();break;case"reloadTree":await _.commands.executeCommand("jamaEditor.refreshTree"),await _.commands.executeCommand("jamaEditor.refreshTestRunner"),this._postMessage({type:"projectResult",success:!0,text:"Tree reloaded"});break;case"openViewer":_.env.openExternal(_.Uri.parse("http://localhost:3000/settings"));break;case"openDbManagement":H.show(this._extensionUri);break;case"saveCacheServerUrl":{let s=e.url;await _.workspace.getConfiguration("jamaEditor").update("cacheServerUrl",s,_.ConfigurationTarget.Global),this._postMessage({type:"cacheServerResult",success:!0,text:"Cache server URL saved"});break}case"testCacheServer":{let s=_.workspace.getConfiguration("jamaEditor").get("cacheServerUrl","").trim();if(!s){this._postMessage({type:"cacheServerResult",success:!1,text:"No cache server URL configured. Save a URL first."});break}try{let a=await this._apiFetch(`${s}/api/health`);this._postMessage({type:"cacheServerResult",success:!0,text:`Connected: ${JSON.stringify(a)}`})}catch(a){this._postMessage({type:"cacheServerResult",success:!1,text:`Failed: ${String(a)}`})}break}}}async _apiFetch(e,t){let s=await fetch(e,{...t,headers:{"Content-Type":"application/json",...t?.headers}});if(!s.ok){let a=await s.text().catch(()=>"");throw new Error(`${s.status}: ${a||s.statusText}`)}return s.json()}_getHtml(e){let t=e.asWebviewUri(_.Uri.joinPath(this._extensionUri,"out","webview","toolkit.js"));return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' ${e.cspSource}; connect-src http://localhost:*;">
  <script src="${t}"></script>
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
    <!-- TAB 3: Cache Server -->
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
          <vscode-button appearance="secondary" onclick="reloadTree()">Reload Tree</vscode-button>
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

    <!-- VIEW 3: Cache Server -->
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

    function setProject() {
      const sel = document.getElementById('projectSelect');
      const val = sel.value;
      if (!val) return;
      // Find the option text
      const selectedOpt = sel.querySelector('vscode-option[value="' + val + '"]');
      const name = selectedOpt ? selectedOpt.textContent : ('Project ' + val);
      send({ type: 'setProject', projectId: Number(val), projectName: name });
    }

    function reloadTree() {
      send({ type: 'reloadTree' });
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
          cacheInfo.textContent = parts.join(' \xB7 ') || 'Cache available';
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
</html>`}};var S=I(require("vscode")),ce="jamaEditor.lastProjectId",ee=class{constructor(e,t){this.api=e;this.ctx=t}_onDidChange=new S.EventEmitter;onDidChange=this._onDidChange.event;_selectedId;_selectedName="";_projects=[];get selectedId(){return this._selectedId}get selectedName(){return this._selectedName}get projects(){return this._projects}async init(){try{this._projects=await this.api.getProjects()}catch{this._projects=[]}let e=this.ctx.workspaceState.get(ce);e&&this._projects.some(t=>t.id===e)&&(this._selectedId=e,this._selectedName=this._projects.find(t=>t.id===e)?.name??""),this._onDidChange.fire(this._selectedId)}async pickProject(){if(this._projects.length===0)try{this._projects=await this.api.getProjects()}catch{S.window.showErrorMessage("Failed to load projects.");return}let e=this._projects.filter(s=>!s.is_folder).sort((s,a)=>s.name.localeCompare(a.name)).map(s=>({label:s.name,description:s.project_key,detail:s.synced_at>0?"synced":"not synced",projectId:s.id})),t=await S.window.showQuickPick(e,{placeHolder:"Select a Jama project",matchOnDescription:!0});t&&(this._selectedId=t.projectId,this._selectedName=t.label,await this.ctx.workspaceState.update(ce,this._selectedId),this._onDidChange.fire(this._selectedId))}setProjectById(e,t){this._selectedId=e,this._selectedName=t,this.ctx.workspaceState.update(ce,e),this._onDidChange.fire(e)}async refreshProjects(){try{this._projects=await this.api.getProjects()}catch{}}},te=class{_onDidChangeTreeData=new S.EventEmitter;onDidChangeTreeData=this._onDidChangeTreeData.event;api;selector;treeCache=[];constructor(e,t){this.api=e,this.selector=t,t.onDidChange(()=>{this.treeCache=[],this._onDidChangeTreeData.fire()})}refresh(){this.treeCache=[],this._onDidChangeTreeData.fire()}getTreeItem(e){return e}async getChildren(e){let t=this.selector.selectedId;if(!t){let s=new se("Select a project...",S.TreeItemCollapsibleState.None);return s.command={command:"jamaEditor.selectProject",title:"Select Project"},s.iconPath=new S.ThemeIcon("folder-opened"),[s]}return e?e.contextValue==="jamaFolder"||e.contextValue==="jamaItem"?this.getItemChildren(t,e.itemId):[]:this.getProjectItems(t)}async getProjectItems(e){try{return this.treeCache.length===0&&(this.treeCache=await this.api.getItemTree(e)),this.treeCache.map(t=>this.nodeToTreeItem(t,e))}catch(t){let s=t instanceof Error?t.message:String(t);return S.window.showErrorMessage(`Failed to load project tree: ${s}`),[]}}getItemChildren(e,t){let s=this.findNode(this.treeCache,t);return!s||!s.children?[]:s.children.map(a=>this.nodeToTreeItem(a,e))}findNode(e,t){for(let s of e){if(s.id===t)return s;if(s.children){let a=this.findNode(s.children,t);if(a)return a}}}nodeToTreeItem(e,t){let s=e.has_children&&e.children&&e.children.length>0,a=s?S.TreeItemCollapsibleState.Collapsed:S.TreeItemCollapsibleState.None,n=new se(e.name,a);return n.projectId=t,n.itemId=e.id,n.documentKey=e.document_key,n.description=`${e.document_key} \xB7 ${e.item_type_display}`,n.tooltip=`${e.section_label} ${e.document_key} \u2014 ${e.name}`,n.contextValue=s?"jamaFolder":"jamaItem",n.iconPath=this.getItemIcon(e.item_type_display),n.command={command:"jamaEditor.openItem",title:"Open Item",arguments:[e.id,t,e.name,e.document_key]},n}getItemIcon(e){let t=e.toLowerCase();return t.includes("requirement")?new S.ThemeIcon("checklist"):t.includes("test")?new S.ThemeIcon("beaker"):t.includes("component")?new S.ThemeIcon("symbol-class"):t.includes("set")||t.includes("folder")?new S.ThemeIcon("folder"):t.includes("text")?new S.ThemeIcon("file-text"):new S.ThemeIcon("symbol-misc")}},se=class extends S.TreeItem{projectId;itemId;documentKey};var f=I(require("vscode")),ae=class{_onDidChangeTreeData=new f.EventEmitter;onDidChangeTreeData=this._onDidChangeTreeData.event;api;selector;constructor(e,t){this.api=e,this.selector=t,t.onDidChange(()=>{this._onDidChangeTreeData.fire()})}refresh(){this._onDidChangeTreeData.fire()}getTreeItem(e){return e}async getChildren(e){let t=this.selector.selectedId;if(!t){let s=new A("Select a project...",f.TreeItemCollapsibleState.None);return s.command={command:"jamaEditor.selectProject",title:"Select Project"},s.iconPath=new f.ThemeIcon("folder-opened"),[s]}return e?e.contextValue==="jamaTestPlan"?this.getTestCycles(e.testPlanId):e.contextValue==="jamaTestCycle"?this.getTestRuns(e.testCycleId):[]:this.getTestPlans(t)}async getTestPlans(e){try{let t=await this.api.getTestPlans(e,!0);if(t.length===0){let s=new A("No test plans",f.TreeItemCollapsibleState.None);return s.iconPath=new f.ThemeIcon("info"),[s]}return t.map(s=>{let a=new A(s.name,f.TreeItemCollapsibleState.Collapsed);return a.contextValue="jamaTestPlan",a.testPlanId=s.id,a.testPlanData=s,a.description=s.status,a.tooltip=`${s.name}
Status: ${s.status}`,a.iconPath=new f.ThemeIcon("test-view-icon"),a.command={command:"jamaEditor.openTestDetail",title:"Open Test Plan",arguments:["plan",s]},a})}catch(t){let s=t instanceof Error?t.message:String(t);return f.window.showErrorMessage(`Failed to load test plans: ${s}`),[]}}async getTestCycles(e){try{let t=await this.api.getTestCycles(e,!0);if(t.length===0){let s=new A("No test cycles",f.TreeItemCollapsibleState.None);return s.iconPath=new f.ThemeIcon("info"),[s]}return t.map(s=>{let a=new A(s.name,f.TreeItemCollapsibleState.Collapsed);return a.contextValue="jamaTestCycle",a.testCycleId=s.id,a.testPlanId=e,a.testCycleData=s,a.description=s.status,a.tooltip=`${s.name}
Status: ${s.status}`,a.iconPath=new f.ThemeIcon("symbol-event"),a.command={command:"jamaEditor.openTestDetail",title:"Open Test Cycle",arguments:["cycle",s]},a})}catch(t){let s=t instanceof Error?t.message:String(t);return f.window.showErrorMessage(`Failed to load test cycles: ${s}`),[]}}async getTestRuns(e){try{let t=await this.api.getTestRuns(e,!0);if(t.length===0){let s=new A("No test runs",f.TreeItemCollapsibleState.None);return s.iconPath=new f.ThemeIcon("info"),[s]}return t.map(s=>{let a=new A(s.name,f.TreeItemCollapsibleState.None);return a.contextValue="jamaTestRun",a.testRunId=s.id,a.testCycleId=e,a.testRunData=s,a.description=s.status,a.tooltip=`${s.name}
Status: ${s.status}
Assigned: ${s.assigned_to??"unassigned"}`,a.iconPath=this.getStatusIcon(s.status),a.command={command:"jamaEditor.openTestDetail",title:"Open Test Run",arguments:["run",s]},a})}catch(t){let s=t instanceof Error?t.message:String(t);return f.window.showErrorMessage(`Failed to load test runs: ${s}`),[]}}getStatusIcon(e){let t=e.toUpperCase();return t==="PASSED"?new f.ThemeIcon("testing-passed-icon",new f.ThemeColor("testing.iconPassed")):t==="FAILED"?new f.ThemeIcon("testing-failed-icon",new f.ThemeColor("testing.iconFailed")):t==="BLOCKED"?new f.ThemeIcon("testing-skipped-icon",new f.ThemeColor("testing.iconSkipped")):t==="NOT_RUN"||t==="NOT RUN"?new f.ThemeIcon("testing-unset-icon"):t==="IN_PROGRESS"||t==="INPROGRESS"?new f.ThemeIcon("testing-queued-icon",new f.ThemeColor("testing.iconQueued")):new f.ThemeIcon("circle-outline")}},A=class extends f.TreeItem{testPlanId;testCycleId;testRunId;testPlanData;testCycleData;testRunData};var u=I(require("vscode"));var le=I(require("vscode"));function we(i,e,t){let{item:s,fields:a,comments:n,transitions:d}=t,r=t.fieldDefinitions??[],o=t.pickListOptions??{},c=t.versions??[],p=t.drafts??[],g=He(),m=`http://localhost:${P().port}/editor`,v=i.asWebviewUri(le.Uri.joinPath(e,"out","webview","tiptap.js")),w=i.asWebviewUri(le.Uri.joinPath(e,"out","webview","toolkit.js")),b=T(s.name),x=s.description??"",h=T(s.document_key),y=s.version??s.current_version??0,D=T(s.global_id??""),F=s.modified_date??"",R=d.map(k=>`<vscode-option value="${T(k.id)}">${T(k.action)}</vscode-option>`).join(`
`),K=n.map(k=>{let oe=k.createdBy?`${T(k.createdBy.firstName??"")} ${T(k.createdBy.lastName??"")}`:"Unknown",Je=k.createdDate??"",Ue=k.body?.text??"";return`<div class="comment">
        <div class="comment-header"><strong>${oe}</strong> <span class="date">${T(Je)}</span></div>
        <div class="comment-body">${Ue}</div>
      </div>`}).join(`
`),ie=new Set(["name","description"]),q=r.filter(k=>!ie.has(k.name)).map(k=>We(k,a[k.name],o)),re=q.length,De=re>0?q.join(`
`):"",je=n.length,Re=c.length,Me=Ge(c,p),Ae=c.length>0?`<p style="color:var(--vscode-descriptionForeground);font-size:12px;margin-bottom:8px;">
         Use the Versions &amp; Drafts dropdown in the toolbar (in Edit mode) to view a specific version.
       </p>
       <ul style="list-style:none;padding:0;margin:0;">
         ${c.slice().sort((k,oe)=>oe.version_num-k.version_num).map(k=>`<li style="padding:6px 0;border-bottom:1px solid var(--vscode-panel-border);font-size:12px;">
              <b>v${k.version_num}</b>${k.modified_by?` \u2014 ${T(String(k.modified_by))}`:""}${k.created_date?` <span style="color:var(--vscode-descriptionForeground)">(${T(k.created_date)})</span>`:""}
            </li>`).join("")}
       </ul>`:'<p style="color:var(--vscode-descriptionForeground)">No version history available.</p>',Le=JSON.stringify(a,null,2);return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${i.cspSource} 'unsafe-inline'; script-src 'nonce-${g}' 'unsafe-inline' ${i.cspSource}; img-src ${i.cspSource} https: data: ${m}; connect-src ${m};">
  <title>${h} \u2014 ${b}</title>
  <script src="${w}"></script>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --input-bg: var(--vscode-input-background);
      --input-border: var(--vscode-input-border);
      --input-fg: var(--vscode-input-foreground);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-hover: var(--vscode-button-hoverBackground);
      --border: var(--vscode-panel-border);
      --section-bg: var(--vscode-sideBar-background);
      --accent: var(--vscode-focusBorder);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--fg); background: var(--bg); padding: 24px; }
    .page-content { max-width: 900px; margin: 0 auto; }

    /* Toolbar */
    .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; padding: 8px 12px; background: var(--section-bg); border-radius: 6px; border: 1px solid var(--border); flex-wrap: wrap; }
    .toolbar .spacer { flex: 1; }

    /* Edit-only toolbar actions: hidden in read-only */
    .edit-actions { display: none; gap: 8px; align-items: center; }
    body.editing .edit-actions { display: flex; }

    /* Toolkit panels */
    vscode-panels { width: 100%; margin-top: 12px; }
    vscode-panel-view { padding: 12px 0; display: block; }
    vscode-text-field, vscode-text-area { width: 100%; }
    vscode-dropdown { width: 100%; max-width: 400px; }

    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-weight: 600; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--vscode-descriptionForeground); }
    .form-group input, .form-group textarea { width: 100%; background: var(--input-bg); color: var(--input-fg); border: 1px solid var(--input-border); padding: 8px 12px; border-radius: 4px; font-family: inherit; font-size: inherit; transition: border-color 0.15s; }
    .form-group input:focus, .form-group textarea:focus { border-color: var(--accent); outline: none; }
    .form-group textarea { min-height: 200px; resize: vertical; }

    /* Read-only name: show as clean text */
    .readonly-name { font-size: 20px; font-weight: 700; line-height: 1.3; padding: 4px 0; letter-spacing: -0.3px; }
    body.editing .readonly-name { display: none; }
    .form-group .edit-input { display: none; }
    body.editing .form-group .edit-input { display: block; }

    /* Legacy section styles (kept for Custom Fields JSON only) */
    .section { margin-top: 20px; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
    .section-header { padding: 10px 14px; background: var(--section-bg); cursor: pointer; font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid var(--border); }
    .section-header .chevron { transition: transform 0.2s; }
    .section-header.collapsed .chevron { transform: rotate(-90deg); }
    .section-header.collapsed { border-bottom: none; }
    .section-body { padding: 14px; }
    .section-body.hidden { display: none; }

    .comment { padding: 10px; border-bottom: 1px solid var(--border); }
    .comment:last-child { border-bottom: none; }
    .comment-header { font-size: 12px; margin-bottom: 4px; font-weight: 600; }
    .comment-header .date { color: var(--vscode-descriptionForeground); margin-left: 8px; font-weight: 400; }
    .comment-body { font-size: 13px; line-height: 1.5; }

    .add-comment { display: flex; gap: 8px; margin-top: 10px; }
    .add-comment input { flex: 1; }
    .add-comment button { flex-shrink: 0; }

    .fields-json { font-family: var(--vscode-editor-font-family); font-size: 12px; white-space: pre-wrap; background: var(--input-bg); padding: 10px; border-radius: 4px; max-height: 300px; overflow-y: auto; }

    .dirty-indicator { display: none; color: var(--vscode-editorWarning-foreground); font-weight: bold; }
    .dirty-indicator.visible { display: inline; }

    .meta-version { font-size: 12px; color: var(--vscode-descriptionForeground); padding: 2px 8px; background: var(--input-bg); border-radius: 10px; }
    .meta-gid { font-size: 11px; color: var(--vscode-descriptionForeground); }
    .meta-bar { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; display: flex; gap: 16px; align-items: center; }
    .lock-status { padding: 3px 10px; border-radius: 10px; font-weight: 600; font-size: 11px; }
    .lock-status.unlocked { background: var(--input-bg); color: var(--vscode-descriptionForeground); }
    .lock-status.locked { background: var(--vscode-editorWarning-background, #664d00); color: var(--vscode-editorWarning-foreground, #ffcc02); }
    .lock-status.editing { background: var(--vscode-editor-findMatchHighlightBackground, #1a5e1a); color: var(--vscode-testing-iconPassed, #73c991); }
    .sync-status { font-size: 11px; color: var(--vscode-editorWarning-foreground); font-weight: 600; }
    .required { color: var(--vscode-editorError-foreground); }
    .form-group input:disabled, .form-group textarea:disabled, .form-group select:disabled { opacity: 0.6; cursor: not-allowed; }
    .form-group select { width: 100%; background: var(--input-bg); color: var(--input-fg); border: 1px solid var(--input-border); padding: 6px 10px; border-radius: 4px; font-family: inherit; font-size: inherit; }
    .form-group input[type="checkbox"] { width: auto; }
    .field-readonly { opacity: 0.65; font-style: italic; }

    /* SAML image placeholder banner */
    .saml-banner { display: none; padding: 8px 12px; margin-bottom: 12px; background: var(--vscode-editorWarning-background, #664d00); color: var(--vscode-editorWarning-foreground, #ffd700); border-radius: 6px; font-size: 12px; align-items: center; gap: 8px; }
    .saml-banner.visible { display: flex; }
    .saml-banner button { background: var(--btn-bg); color: var(--btn-fg); border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }

    /* TipTap rich-text editor \u2014 hidden toolbar in read-only */
    .tiptap-toolbar { display: none; gap: 2px; flex-wrap: wrap; padding: 6px 8px; background: var(--section-bg); border: 1px solid var(--input-border); border-bottom: none; border-radius: 4px 4px 0 0; }
    body.editing .tiptap-toolbar { display: flex; }
    .tiptap-toolbar button { background: transparent; color: var(--fg); border: 1px solid transparent; padding: 3px 7px; border-radius: 3px; cursor: pointer; font-size: 13px; font-weight: 500; }
    .tiptap-toolbar button:hover { background: var(--btn-bg); color: var(--btn-fg); }
    .tiptap-toolbar button.is-active { background: var(--btn-bg); color: var(--btn-fg); }
    .tiptap-toolbar .tb-sep { width: 1px; background: var(--border); margin: 2px 4px; }

    /* Description container: seamless in read-only, bordered in edit */
    .tiptap-container { border: none; border-radius: 4px; min-height: 120px; background: transparent; }
    body.editing .tiptap-container { border: 1px solid var(--input-border); border-radius: 0 0 4px 4px; min-height: 200px; background: var(--input-bg); }
    .tiptap-container .tiptap { padding: 8px 4px; min-height: 100px; outline: none; color: var(--fg); line-height: 1.6; }
    body.editing .tiptap-container .tiptap { padding: 10px 14px; min-height: 180px; color: var(--input-fg); }
    .tiptap-container .tiptap p { margin-bottom: 0.5em; }
    .tiptap-container .tiptap h1, .tiptap-container .tiptap h2, .tiptap-container .tiptap h3 { margin-top: 0.5em; margin-bottom: 0.3em; }
    .tiptap-container .tiptap ul, .tiptap-container .tiptap ol { padding-left: 1.5em; }
    .tiptap-container .tiptap table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
    .tiptap-container .tiptap td, .tiptap-container .tiptap th { border: 1px solid var(--border); padding: 4px 8px; }
    .tiptap-container .tiptap th { background: var(--section-bg); font-weight: 600; }
    .tiptap-container .tiptap blockquote { border-left: 3px solid var(--border); padding-left: 12px; margin-left: 0; color: var(--vscode-descriptionForeground); }
    .tiptap-container .tiptap img.jama-image { max-width: 100%; height: auto; border-radius: 4px; }
    .tiptap-container .tiptap pre { background: var(--section-bg); padding: 8px; border-radius: 4px; overflow-x: auto; }
    .tiptap-container .tiptap code { background: var(--section-bg); padding: 1px 4px; border-radius: 2px; font-size: 0.9em; }

    /* Attachment panel */
    .att-list { list-style: none; padding: 0; margin: 0; }
    .att-list li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
    .att-list li:last-child { border-bottom: none; }
    .att-icon { font-size: 14px; flex-shrink: 0; }
    .att-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; color: var(--vscode-textLink-foreground); }
    .att-name:hover { text-decoration: underline; }
    .att-size { color: var(--vscode-descriptionForeground); flex-shrink: 0; font-size: 11px; }
    .att-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .att-actions button { background: transparent; border: none; cursor: pointer; color: var(--fg); padding: 2px 4px; border-radius: 2px; font-size: 12px; }
    .att-actions button:hover { background: var(--btn-bg); color: var(--btn-fg); }
    /* Drop zone and upload: hidden in read-only */
    .att-drop-zone { display: none; border: 2px dashed var(--input-border); border-radius: 6px; padding: 16px; text-align: center; color: var(--vscode-descriptionForeground); font-size: 12px; margin-top: 8px; transition: border-color 0.15s, background 0.15s; cursor: pointer; }
    body.editing .att-drop-zone { display: block; }
    .att-drop-zone.drag-over { border-color: var(--accent); background: rgba(0, 120, 212, 0.06); }
    .att-toolbar { display: flex; gap: 4px; margin-bottom: 8px; }
    .att-toolbar .edit-only-att { display: none; }
    body.editing .att-toolbar .edit-only-att { display: inline-block; }
    .att-toolbar button { font-size: 11px; padding: 3px 8px; }
    .att-count { font-size: 11px; color: var(--vscode-descriptionForeground); margin-left: auto; }
  </style>
</head>
<body>
<div class="page-content">
  <!-- Toolbar -->
  <div class="toolbar">
    <vscode-badge>${h}</vscode-badge>
    <span class="meta-version" title="Jama server version">v${y}</span>
    <span class="dirty-indicator" id="dirtyIndicator">\u25CF Modified</span>
    <div class="spacer"></div>
    <span class="edit-actions">
      ${Me}
      ${d.length>0?`
      <vscode-dropdown id="transitionSelect">
        <vscode-option value="">Workflow\u2026</vscode-option>
        ${R}
      </vscode-dropdown>
      <vscode-button id="btnTransition" appearance="secondary">Apply</vscode-button>
      `:""}
      <vscode-button id="btnUndo" appearance="secondary" title="Undo last field change">\u21B6 Undo</vscode-button>
      <vscode-button id="btnRevert" appearance="secondary" title="Reload from server">\u21BA Revert</vscode-button>
      <vscode-button id="btnUnlock" appearance="secondary" style="display:none">\u{1F513} Unlock</vscode-button>
      <vscode-button id="btnPush">\u2B06 Push to Jama</vscode-button>
      <vscode-progress-ring id="saveSpinner" style="display:none"></vscode-progress-ring>
    </span>
    <vscode-button id="btnEdit" appearance="secondary">\u270F Edit</vscode-button>
  </div>

  <!-- Metadata bar -->
  <div class="meta-bar">
    <span id="lockStatus" class="lock-status unlocked">Read-Only</span>
    <span id="syncStatus" class="sync-status"></span>
    <span>Modified: ${T(F)}</span>
    <span class="meta-gid" title="Global ID">${D}</span>
  </div>

  <!-- SAML image placeholder banner (hidden by default, shown if images fail to load) -->
  <div class="saml-banner" id="samlBanner">
    <span>Some images may require SAML authentication to display.</span>
    <vscode-button id="btnImportImages" appearance="secondary">Import Images</vscode-button>
    <vscode-button id="btnDismissSaml" appearance="secondary">Dismiss</vscode-button>
  </div>

  <!-- Name field (always visible, outside tabs) -->
  <div class="form-group">
    <label>Name <span class="required">*</span></label>
    <div class="readonly-name" id="readonlyName">${b}</div>
    <input type="text" id="fieldName" class="edit-input" value="${L(s.name)}" />
  </div>

  <!-- Tabbed panels: Description / Fields / Comments / Attachments / Versions -->
  <vscode-panels activeid="tab-desc" aria-label="Item sections">
    <vscode-panel-tab id="tab-desc">Description</vscode-panel-tab>
    <vscode-panel-tab id="tab-fields">Fields (${re})</vscode-panel-tab>
    <vscode-panel-tab id="tab-comments">Comments (${je})</vscode-panel-tab>
    <vscode-panel-tab id="tab-attachments">Attachments</vscode-panel-tab>
    <vscode-panel-tab id="tab-versions">Versions (${Re})</vscode-panel-tab>

    <!-- Description panel -->
    <vscode-panel-view id="view-desc">
      <div class="form-group" style="width:100%">
        <div class="tiptap-toolbar" id="descToolbar">
          <button type="button" data-tt="toggleBold" title="Bold"><b>B</b></button>
          <button type="button" data-tt="toggleItalic" title="Italic"><i>I</i></button>
          <button type="button" data-tt="toggleUnderline" title="Underline"><u>U</u></button>
          <button type="button" data-tt="toggleStrike" title="Strikethrough"><s>S</s></button>
          <span class="tb-sep"></span>
          <button type="button" data-tt="toggleSubscript" title="Subscript">X\u2082</button>
          <button type="button" data-tt="toggleSuperscript" title="Superscript">X\xB2</button>
          <span class="tb-sep"></span>
          <button type="button" data-tt="toggleBulletList" title="Bullet List">\u2022 List</button>
          <button type="button" data-tt="toggleOrderedList" title="Numbered List">1. List</button>
          <span class="tb-sep"></span>
          <button type="button" data-tt="toggleBlockquote" title="Blockquote">\u275D</button>
          <button type="button" data-tt="toggleCode" title="Code Block">&lt;/&gt;</button>
          <button type="button" data-tt="insertHorizontalRule" title="Horizontal Rule">\u2014</button>
          <span class="tb-sep"></span>
          <button type="button" data-tt-heading="1" title="Heading 1">H1</button>
          <button type="button" data-tt-heading="2" title="Heading 2">H2</button>
          <button type="button" data-tt-heading="3" title="Heading 3">H3</button>
          <button type="button" data-tt="setParagraph" title="Paragraph">\xB6</button>
          <span class="tb-sep"></span>
          <button type="button" data-tt-align="left" title="Align Left">\u2AF7</button>
          <button type="button" data-tt-align="center" title="Center">\u2AF8\u2AF7</button>
          <button type="button" data-tt-align="right" title="Align Right">\u2AF8</button>
          <span class="tb-sep"></span>
          <button type="button" id="btnInsertTable" title="Insert Table">\u229E</button>
          <button type="button" id="btnInsertLink" title="Insert Link">\u{1F517}</button>
          <span class="tb-sep"></span>
          <button type="button" data-tt="undo" title="Undo">\u21B6</button>
          <button type="button" data-tt="redo" title="Redo">\u21B7</button>
        </div>
        <div class="tiptap-container" id="descriptionEditor"></div>
        <!-- Hidden fallback for data transport -->
        <input type="hidden" id="fieldDescription" value="" />
      </div>
    </vscode-panel-view>

    <!-- Fields panel -->
    <vscode-panel-view id="view-fields">
      ${re>0?De:"<p style='color:var(--vscode-descriptionForeground)'>No additional fields for this item type.</p>"}
    </vscode-panel-view>

    <!-- Comments panel -->
    <vscode-panel-view id="view-comments">
      ${K||"<p style='color: var(--vscode-descriptionForeground)'>No comments yet.</p>"}
      <div class="add-comment" style="margin-top:10px;">
        <input type="text" id="commentInput" placeholder="Add a comment..." />
        <vscode-button id="btnAddComment">Post</vscode-button>
      </div>
    </vscode-panel-view>

    <!-- Attachments panel -->
    <vscode-panel-view id="view-attachments">
      <div class="att-toolbar">
        <vscode-button id="btnAttUpload" appearance="secondary" class="edit-only-att">+ Upload</vscode-button>
        <vscode-button id="btnAttSync" appearance="secondary">\u21BB Refresh</vscode-button>
        <span class="att-count" id="attCount">(loading\u2026)</span>
      </div>
      <ul class="att-list" id="attList">
        <li style="color:var(--vscode-descriptionForeground)">Loading attachments\u2026</li>
      </ul>
      <div class="att-drop-zone" id="attDropZone">
        Drop files here or click to upload
      </div>
    </vscode-panel-view>

    <!-- Versions panel -->
    <vscode-panel-view id="view-versions">
      ${Ae}
    </vscode-panel-view>
  </vscode-panels>

  <!-- Custom Fields (JSON) \u2014 collapsed by default -->
  <div class="section" style="margin-top:20px;">
    <div class="section-header collapsed" data-toggle-section>
      <span class="chevron">\u25BE</span> Custom Fields (JSON)
    </div>
    <div class="section-body hidden">
      <pre class="fields-json">${T(Le)}</pre>
    </div>
  </div>
</div><!-- end .page-content -->

  <script src="${v}"></script>
  <script nonce="${g}">
    const vscode = acquireVsCodeApi();
    let isDirty = false;
    let isEditable = false;
    const prevValues = {};
    let descriptionEditor = null; // TipTap editor instance

    function markDirty() {
      isDirty = true;
      document.getElementById('dirtyIndicator').classList.add('visible');
    }

    function trackField(fieldId, fieldName) {
      const el = document.getElementById(fieldId);
      if (!el) return;
      const current = el.value;
      const prev = prevValues[fieldName];
      if (prev !== undefined && prev !== current) {
        vscode.postMessage({ type: 'fieldChanged', fieldName, oldValue: prev, newValue: current });
      }
      prevValues[fieldName] = current;
      markDirty();
    }

    function getFormFields() {
      const result = {
        name: document.getElementById('fieldName').value,
        description: descriptionEditor ? descriptionEditor.getHTML() : document.getElementById('fieldDescription').value,
      };
      // Collect dynamic fields
      document.querySelectorAll('[data-field-name]').forEach(el => {
        const fname = el.getAttribute('data-field-name');
        if (!fname) return;
        if (el.type === 'checkbox') {
          result[fname] = el.checked;
        } else {
          result[fname] = el.value;
        }
      });
      return result;
    }

    function doPush() {
      vscode.postMessage({ type: 'push', fields: getFormFields(), descriptionHtml: document.getElementById('fieldDescription').value });
    }

    function doUndo() {
      vscode.postMessage({ type: 'undo' });
    }

    function doRevert() {
      if (isDirty && !confirm('Discard local changes and reload from server?')) return;
      vscode.postMessage({ type: 'revert' });
    }

    function doEdit() {
      vscode.postMessage({ type: 'edit' });
    }
    function doUnlock() {
      vscode.postMessage({ type: 'unlock' });
    }

    function doTransition() {
      const select = document.getElementById('transitionSelect');
      const transitionId = select?.value;
      if (!transitionId) return;
      vscode.postMessage({ type: 'transition', transitionId });
    }

    function doAddComment() {
      const input = document.getElementById('commentInput');
      const text = input?.value?.trim();
      if (!text) return;
      vscode.postMessage({ type: 'addComment', text });
      input.value = '';
    }

    // ---- Attachment Panel Functions ----
    function attSync() { vscode.postMessage({ type: 'syncAttachments' }); }
    function attUpload() { vscode.postMessage({ type: 'uploadAttachment' }); }
    function attDownload(id) { vscode.postMessage({ type: 'downloadAttachment', attachmentId: id }); }
    function attReplace(id) { vscode.postMessage({ type: 'replaceAttachment', attachmentId: id }); }

    function formatFileSize(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
      return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
    }

    function attFileIcon(mime) {
      if (!mime) return '\u{1F4CE}';
      if (mime.startsWith('image/')) return '\u{1F5BC}';
      if (mime.includes('pdf')) return '\u{1F4C4}';
      if (mime.includes('zip') || mime.includes('compress') || mime.includes('tar')) return '\u{1F4E6}';
      if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return '\u{1F4CA}';
      if (mime.includes('document') || mime.includes('word')) return '\u{1F4DD}';
      return '\u{1F4CE}';
    }

    function renderAttachments(attachments) {
      const list = document.getElementById('attList');
      const count = document.getElementById('attCount');
      if (!list || !count) return;
      count.textContent = '(' + attachments.length + ')';
      if (attachments.length === 0) {
        list.innerHTML = '<li style="color:var(--vscode-descriptionForeground)">No attachments.</li>';
        return;
      }
      list.innerHTML = attachments.map(a =>
        '<li>' +
          '<span class="att-icon">' + attFileIcon(a.mime_type) + '</span>' +
          '<span class="att-name" title="' + a.file_name + '" data-att-download="' + a.id + '">' + a.file_name + '</span>' +
          '<span class="att-size">' + formatFileSize(a.file_size) + '</span>' +
          '<span class="att-actions">' +
            '<vscode-button appearance="icon" title="Download" data-att-download="' + a.id + '">\u2B07</vscode-button>' +
            '<vscode-button appearance="icon" title="Replace" data-att-replace="' + a.id + '">\u21BB</vscode-button>' +
          '</span>' +
        '</li>'
      ).join('');
      // Wire up attachment action listeners (re-bind after render)
      list.querySelectorAll('[data-att-download]').forEach(function(el) {
        el.addEventListener('click', function() { attDownload(parseInt(el.getAttribute('data-att-download'), 10)); });
      });
      list.querySelectorAll('[data-att-replace]').forEach(function(el) {
        el.addEventListener('click', function() { attReplace(parseInt(el.getAttribute('data-att-replace'), 10)); });
      });
    }

    function attDragOver(e) {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('attDropZone')?.classList.add('drag-over');
    }
    function attDragLeave(e) {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('attDropZone')?.classList.remove('drag-over');
    }
    function attDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('attDropZone')?.classList.remove('drag-over');
      // WebView can't read dropped file bytes \u2014 ask extension to handle
      vscode.postMessage({ type: 'uploadAttachment' });
    }

    function toggleSection(header) {
      header.classList.toggle('collapsed');
      const body = header.nextElementSibling;
      body.classList.toggle('hidden');
    }

    function setEditable(editable) {
      isEditable = editable;
      // Toggle body class for CSS-driven visibility
      if (editable) {
        document.body.classList.add('editing');
      } else {
        document.body.classList.remove('editing');
      }
      const nameEl = document.getElementById('fieldName');
      if (nameEl) nameEl.disabled = !editable;
      // Sync readonly name display
      const roName = document.getElementById('readonlyName');
      if (roName && nameEl) roName.textContent = nameEl.value;
      // Update TipTap editor editability
      if (descriptionEditor) {
        descriptionEditor.setEditable(editable);
      }
      // Disable/enable dynamic fields
      document.querySelectorAll('[data-field-name]').forEach(el => {
        if (!el.classList.contains('field-readonly')) {
          el.disabled = !editable;
        }
      });
      document.getElementById('btnEdit').style.display = editable ? 'none' : '';
      document.getElementById('btnUnlock').style.display = editable ? '' : 'none';
      // Update lock status indicator
      const lockEl = document.getElementById('lockStatus');
      if (lockEl) {
        lockEl.className = 'lock-status ' + (editable ? 'editing' : 'unlocked');
        lockEl.textContent = editable ? 'Editing (Locked)' : 'Read-Only';
      }
    }

    // Handle messages from extension host
    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'pushComplete':
          if (msg.success) {
            isDirty = false;
            document.getElementById('dirtyIndicator').classList.remove('visible');
          }
          break;
        case 'lockState':
          setEditable(msg.editable);
          break;
        case 'requestAutosave':
          if (isDirty) {
            vscode.postMessage({ type: 'autosaveData', fields: getFormFields(), descriptionHtml: document.getElementById('fieldDescription').value });
          }
          break;
        case 'undoApply': {
          const fieldMap = { 'name': 'fieldName', 'description': 'fieldDescription' };
          const elId = fieldMap[msg.fieldName];
          let el = elId ? document.getElementById(elId) : null;
          // Try dynamic field
          if (!el) {
            el = document.querySelector('[data-field-name="' + msg.fieldName + '"]');
          }
          if (el && msg.value !== null) {
            if (el.type === 'checkbox') {
              el.checked = msg.value === 'true';
            } else {
              el.value = msg.value;
            }
            prevValues[msg.fieldName] = msg.value;
            markDirty();
          }
          break;
        }
        case 'draftRestored':
          markDirty();
          break;
        case 'insertImage':
          if (descriptionEditor && window.JamaTipTap && msg.src) {
            window.JamaTipTap.insertImage(descriptionEditor, msg.src, msg.alt || '');
            markDirty();
          }
          break;
        case 'statusMessage': {
          const syncEl = document.getElementById('syncStatus');
          if (syncEl) syncEl.textContent = msg.text || '';
          break;
        }
        case 'attachmentsLoaded':
          if (msg.attachments) { renderAttachments(msg.attachments); }
          break;
        case 'versionData': {
          // Update name field
          const nameEl = document.getElementById('fieldName');
          if (nameEl && msg.fields && msg.fields.name != null) {
            nameEl.value = msg.fields.name;
            const roName = document.getElementById('readonlyName');
            if (roName) roName.textContent = msg.fields.name;
          }
          // Update description (TipTap or textarea)
          if (msg.descriptionHtml != null) {
            if (descriptionEditor) {
              descriptionEditor.commands.setContent(msg.descriptionHtml, false);
            }
            const descEl = document.getElementById('fieldDescription');
            if (descEl) descEl.value = msg.descriptionHtml;
          }
          // Update dynamic fields
          if (msg.fields) {
            Object.entries(msg.fields).forEach(([key, val]) => {
              const el = document.querySelector('[data-field-name="' + key + '"]');
              if (el) {
                if (el.type === 'checkbox') {
                  el.checked = val === true || val === 'true';
                } else {
                  el.value = val != null ? String(val) : '';
                }
              }
            });
          }
          // Show version indicator
          const metaBar = document.querySelector('.meta-bar');
          if (metaBar && msg.version) {
            metaBar.innerHTML = '<span style="color:var(--vscode-editorWarning-foreground);font-weight:600;">Viewing version ' + msg.version + ' (read-only)</span>';
          }
          break;
        }
      }
    });

    // ---- TipTap helpers ----
    function ttCmd(cmd) {
      if (!descriptionEditor || !window.JamaTipTap) return;
      const fn = window.JamaTipTap[cmd];
      if (typeof fn === 'function') fn(descriptionEditor);
    }
    function ttHeading(level) {
      if (!descriptionEditor || !window.JamaTipTap) return;
      window.JamaTipTap.setHeading(descriptionEditor, level);
    }
    function ttAlign(alignment) {
      if (!descriptionEditor || !window.JamaTipTap) return;
      window.JamaTipTap.setTextAlign(descriptionEditor, alignment);
    }
    function ttInsertTable() {
      if (!descriptionEditor || !window.JamaTipTap) return;
      window.JamaTipTap.insertTable(descriptionEditor, 3, 3);
    }
    function ttInsertLink() {
      if (!descriptionEditor || !window.JamaTipTap) return;
      const href = prompt('Enter URL:');
      if (href) window.JamaTipTap.setLink(descriptionEditor, href);
    }

    // ---- Initialize TipTap editor ----
    if (window.JamaTipTap && document.getElementById('descriptionEditor')) {
      const descContent = ${JSON.stringify(x)};
      descriptionEditor = window.JamaTipTap.createEditor({
        element: document.getElementById('descriptionEditor'),
        content: descContent,
        editable: false, // starts locked; setEditable called on lock
        proxyBaseUrl: '${m}',
        onUpdate: function(html) {
          // Store in hidden field for form transport
          const hidden = document.getElementById('fieldDescription');
          if (hidden) hidden.value = html;
          const prev = prevValues['description'];
          if (prev !== undefined && prev !== html) {
            vscode.postMessage({ type: 'fieldChanged', fieldName: 'description', oldValue: prev, newValue: html });
          }
          prevValues['description'] = html;
          markDirty();
        },
        onImagePaste: function(file) {
          vscode.postMessage({ type: 'imageUpload', fileName: file.name, fileSize: file.size, mimeType: file.type });
        },
        onImageDrop: function(file) {
          vscode.postMessage({ type: 'imageUpload', fileName: file.name, fileSize: file.size, mimeType: file.type });
        },
      });
    }

    // Detect broken images (SAML or auth failures) and show banner
    setTimeout(() => {
      const editorEl = document.getElementById('descriptionEditor');
      if (editorEl) {
        const imgs = editorEl.querySelectorAll('img');
        imgs.forEach(img => {
          img.addEventListener('error', () => {
            const banner = document.getElementById('samlBanner');
            if (banner) banner.classList.add('visible');
          });
        });
      }
    }, 1000);

    // Initialize prevValues for undo tracking
    prevValues['name'] = document.getElementById('fieldName')?.value ?? '';
    prevValues['description'] = descriptionEditor ? descriptionEditor.getHTML() : (document.getElementById('fieldDescription')?.value ?? '');
    document.querySelectorAll('[data-field-name]').forEach(el => {
      const fname = el.getAttribute('data-field-name');
      if (fname) prevValues[fname] = el.type === 'checkbox' ? String(el.checked) : (el.value ?? '');
    });

    // Version/draft dropdown handler
    function onVersionDraftChange(select) {
      const val = select.value;
      if (!val) return;
      if (val.startsWith('v:')) {
        vscode.postMessage({ type: 'loadVersion', version: parseInt(val.slice(2), 10) });
      } else if (val.startsWith('d:')) {
        vscode.postMessage({ type: 'loadDraft', draftVersion: parseInt(val.slice(2), 10) });
      }
      select.value = ''; // Reset
    }

    // ---- Wire up all event listeners (CSP-safe, no inline handlers) ----
    function $(id) { return document.getElementById(id); }
    function listen(id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); }

    // Toolbar buttons
    listen('btnEdit', doEdit);
    listen('btnPush', doPush);
    listen('btnUndo', doUndo);
    listen('btnRevert', doRevert);
    listen('btnUnlock', doUnlock);
    listen('btnTransition', doTransition);
    listen('btnAddComment', doAddComment);

    // SAML banner
    listen('btnImportImages', function() { vscode.postMessage({ type: 'importImages' }); });
    listen('btnDismissSaml', function() { $('samlBanner')?.classList.remove('visible'); });

    // Name field input tracking
    var nameField = $('fieldName');
    if (nameField) nameField.addEventListener('input', function() { trackField('fieldName', 'name'); });

    // TipTap toolbar: data-tt="command", data-tt-heading="N", data-tt-align="dir"
    document.querySelectorAll('[data-tt]').forEach(function(btn) {
      btn.addEventListener('click', function() { ttCmd(btn.getAttribute('data-tt')); });
    });
    document.querySelectorAll('[data-tt-heading]').forEach(function(btn) {
      btn.addEventListener('click', function() { ttHeading(parseInt(btn.getAttribute('data-tt-heading'), 10)); });
    });
    document.querySelectorAll('[data-tt-align]').forEach(function(btn) {
      btn.addEventListener('click', function() { ttAlign(btn.getAttribute('data-tt-align')); });
    });
    listen('btnInsertTable', ttInsertTable);
    listen('btnInsertLink', ttInsertLink);

    // Section toggle headers
    document.querySelectorAll('[data-toggle-section]').forEach(function(header) {
      header.addEventListener('click', function() { toggleSection(header); });
    });

    // Dynamic field tracking (data-track-field="fieldName")
    document.querySelectorAll('[data-track-field]').forEach(function(el) {
      var fn = el.getAttribute('data-track-field');
      var evtType = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
      el.addEventListener(evtType, function() { trackField(el.id, fn); });
    });

    // Attachment panel
    listen('btnAttUpload', attUpload);
    listen('btnAttSync', attSync);
    var dropZone = $('attDropZone');
    if (dropZone) {
      dropZone.addEventListener('dragover', attDragOver);
      dropZone.addEventListener('dragleave', attDragLeave);
      dropZone.addEventListener('drop', attDrop);
      dropZone.addEventListener('click', attUpload);
    }

    // Version/draft dropdown
    var vdSelect = $('versionDraftSelect');
    if (vdSelect) vdSelect.addEventListener('change', function() { onVersionDraftChange(vdSelect); });
  </script>
</body>
</html>`}function He(){let i="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",e="";for(let t=0;t<32;t++)e+=i.charAt(Math.floor(Math.random()*i.length));return e}function T(i){return i==null?"":String(i).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function L(i){return i==null?"":String(i).replace(/"/g,"&quot;").replace(/&/g,"&amp;")}function We(i,e,t){let s=T(i.label),a=L(i.name),n=i.required?' <span class="required">*</span>':"",d=i.readOnly?" field-readonly":"",r=i.readOnly?" disabled":"",o=i.readOnly?"":` data-track-field="${a}"`,c=e!=null?String(e):"",p=`dynField_${i.name}`,g;switch(i.fieldType){case"PICK_LIST":{let v=(i.pickList!=null?t[i.pickList]??[]:[]).filter(w=>w.active!==!1).map(w=>{let b=L(String(w.id)),x=T(w.name),h=String(w.id)===c?" selected":"";return`<option value="${b}"${h}>${x}</option>`}).join(`
`);g=`<select id="${p}" data-field-name="${a}"${r} data-track-field="${a}">
        <option value="">(none)</option>
        ${v}
      </select>`;break}case"MULTI_SELECT":{let m=i.pickList!=null?t[i.pickList]??[]:[],v=Array.isArray(e)?e.map(String):[],w=m.filter(b=>b.active!==!1).map(b=>{let x=L(String(b.id)),h=T(b.name),y=v.includes(String(b.id))?" selected":"";return`<option value="${x}"${y}>${h}</option>`}).join(`
`);g=`<select id="${p}" data-field-name="${a}" multiple${r} data-track-field="${a}">
        ${w}
      </select>`;break}case"BOOLEAN":g=`<input type="checkbox" id="${p}" data-field-name="${a}"${e?" checked":""}${r} data-track-field="${a}" />`;break;case"INTEGER":case"FLOAT":g=`<input type="number" id="${p}" data-field-name="${a}" value="${L(c)}"${r}${o}${i.fieldType==="INTEGER"?' step="1"':' step="any"'} />`;break;case"DATE":g=`<input type="date" id="${p}" data-field-name="${a}" value="${L(c)}"${r}${o} />`;break;case"URL":g=`<input type="url" id="${p}" data-field-name="${a}" value="${L(c)}"${r}${o} />`;break;case"RICHTEXT":case"DOCUMENT":g=`<vscode-text-area id="${p}" data-field-name="${a}" value="${L(c)}" rows="5"${r}${o}></vscode-text-area>`;break;case"TEXT":default:{let m=i.maxLength?` maxlength="${i.maxLength}"`:"";g=`<vscode-text-field id="${p}" data-field-name="${a}" value="${L(c)}"${r}${m}${o}></vscode-text-field>`;break}}return`<div class="form-group">
    <label>${s}${n}</label>
    <div class="${d}">${g}</div>
  </div>`}function Ge(i,e){if(i.length===0&&e.length===0)return"";let t=i.slice().sort((a,n)=>n.version_num-a.version_num).map(a=>{let n=a.modified_by?` \u2014 ${T(String(a.modified_by))}`:"",d=a.created_date?` (${T(a.created_date)})`:"";return`<option value="v:${a.version_num}">v${a.version_num}${n}${d}</option>`}).join(`
`),s=e.slice().sort((a,n)=>n.draft_version-a.draft_version).map(a=>{let n=a.created_at?new Date(a.created_at*1e3).toLocaleString():"",d=a.is_autosave?" (auto)":"";return`<option value="d:${a.draft_version}">Draft #${a.draft_version}${d} \u2014 ${T(n)}</option>`}).join(`
`);return`<select id="versionDraftSelect" style="max-width:200px">
    <option value="">Versions & Drafts\u2026</option>
    ${t?`<optgroup label="Server Versions">${t}</optgroup>`:""}
    ${s?`<optgroup label="Local Drafts">${s}</optgroup>`:""}
  </select>`}var Ke=5e3,Ze=/https?:\/\/[^"'\s]*?\/(?:rest\/v1\/(?:attachments|files)\/(\d+)(?:\/file)?|attachment\/(\d+)\/[^"'\s]*)/gi;function pe(){return`http://localhost:${P().port}/editor`}function xe(i){let e=pe();return i.replace(Ze,(t,s,a)=>`${e}/api/proxy/image/${s||a}`)}var ne=class i{static viewType="jamaEditor.itemEditor";panels=new Map;autosaveTimers=new Map;serverVersions=new Map;api;editorApi;extensionUri;constructor(e,t){this.api=e,this.editorApi=new V,this.extensionUri=t}get openTabCount(){return this.panels.size}getEditorApi(){return this.editorApi}async openItem(e,t,s,a){let n=this.panels.get(e);if(n){n.reveal(u.ViewColumn.One);return}let d=u.window.createWebviewPanel(i.viewType,`${a} \u2014 ${s}`,u.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[u.Uri.joinPath(this.extensionUri,"media"),u.Uri.joinPath(this.extensionUri,"out")]});this.panels.set(e,d),d.onDidDispose(async()=>{this.stopAutosave(e),this.panels.delete(e),this.serverVersions.delete(e);try{await this.editorApi.releaseLock(e)}catch{}}),d.webview.onDidReceiveMessage(async r=>{try{await this.handleWebviewMessage(d,e,t,r)}catch(o){let c=o instanceof Error?o.message:String(o);console.error(`[jama-editor] Error handling message '${r?.type}': ${c}`),u.window.showErrorMessage(`Jama Editor error: ${c}`)}}),await u.window.withProgress({location:u.ProgressLocation.Notification,title:"Syncing item from Jama\u2026",cancellable:!1},()=>this.loadItem(d,e,t)),d.webview.postMessage({type:"lockState",locked:!1,editable:!1})}dispose(){for(let[e]of this.autosaveTimers)this.stopAutosave(e);for(let[e,t]of this.panels)this.editorApi.releaseLock(e).catch(()=>{}),t.dispose();this.panels.clear(),this.serverVersions.clear()}startAutosave(e,t){this.stopAutosave(e);let s=setInterval(()=>{t.webview.postMessage({type:"requestAutosave"})},Ke);this.autosaveTimers.set(e,s)}stopAutosave(e){let t=this.autosaveTimers.get(e);t&&(clearInterval(t),this.autosaveTimers.delete(e))}async loadItem(e,t,s){try{let a,n=!0;try{a=await this.api.getItem(t,!0)}catch{n=!1,a=await this.api.getItem(t)}let[d,r]=await Promise.all([this.api.getItemComments(t).catch(()=>[]),this.api.getWorkflowTransitions(t).catch(()=>[])]);n||u.window.showWarningMessage("Could not sync from Jama \u2014 showing cached data."),this.serverVersions.set(t,a.version??0);let o=a.fields_json?JSON.parse(a.fields_json):{},c=[],p={};try{let h=a.item_type;if(h){c=(await this.editorApi.getFieldDefinitions(h)).fields??[];let D=c.filter(R=>R.pickList!=null).map(R=>R.pickList),F=[...new Set(D)];if(F.length>0){let R=await Promise.all(F.map(K=>this.editorApi.getPickListOptions(K).catch(()=>[])));F.forEach((K,ie)=>{let q=R[ie];p[K]=Array.isArray(q)?q:q?.options??[]})}}}catch{}let g=[];try{g=await this.api.getItemVersions(t)??[]}catch{}let m=[],v=o,w=a.description??"",b=!1;try{m=(await this.editorApi.getDrafts(t)).drafts??[];let y=await this.editorApi.getLatestDraft(t);y&&y.fields_json&&(v=JSON.parse(y.fields_json),w=y.description_html??w,b=!0)}catch{}let x=xe(w);e.webview.html=we(e.webview,this.extensionUri,{item:{...a,description:x},fields:v,comments:d,transitions:r,projectId:s,fieldDefinitions:c,pickListOptions:p,versions:g,drafts:m}),b&&e.webview.postMessage({type:"draftRestored"}),this.editorApi.syncAttachments(t).then(h=>{e.webview.postMessage({type:"attachmentsLoaded",attachments:h.attachments})}).catch(()=>{})}catch(a){let n=a instanceof Error?a.message:String(a);u.window.showErrorMessage(`Failed to load item ${t}: ${n}`),e.webview.html=`<html><body><h2>Error loading item</h2><pre>${n}</pre></body></html>`}}async handleWebviewMessage(e,t,s,a){switch(a.type!=="autosaveData"&&a.type!=="fieldChanged"&&console.log(`[jama-editor] Received message: ${a.type} for item ${t}`),a.type){case"autosaveData":{try{let n=this.serverVersions.get(t)??0;await this.editorApi.saveDraft(t,n,JSON.stringify(a.fields??{}),a.descriptionHtml??"",!0)}catch{}break}case"push":{try{let n=this.serverVersions.get(t)??0,d=await this.editorApi.pushToJama(t,a.fields??{},n);this.serverVersions.set(t,d.version),u.window.showInformationMessage(`Pushed to Jama \u2192 v${d.version}`),await this.loadItem(e,t,s),e.webview.postMessage({type:"pushComplete",success:!0,version:d.version}),u.commands.executeCommand("jamaEditor.refreshTree")}catch(n){let d=n instanceof Error?n.message:String(n);if(d.includes("version_conflict")){let r=await u.window.showWarningMessage("Item was modified on the server. Overwrite or reload?","Force Push","Reload Server Version");if(r==="Force Push")try{let o=await this.editorApi.pushToJama(t,a.fields??{});this.serverVersions.set(t,o.version),u.window.showInformationMessage(`Force-pushed \u2192 v${o.version}`),await this.loadItem(e,t,s),e.webview.postMessage({type:"pushComplete",success:!0,version:o.version}),u.commands.executeCommand("jamaEditor.refreshTree")}catch(o){let c=o instanceof Error?o.message:String(o);u.window.showErrorMessage(`Force push failed: ${c}`)}else r==="Reload Server Version"&&await this.loadItem(e,t,s)}else u.window.showErrorMessage(`Push failed: ${d}`),e.webview.postMessage({type:"pushComplete",success:!1,error:d})}break}case"undo":{try{let n=await this.editorApi.popUndo(t);e.webview.postMessage({type:"undoApply",fieldName:n.field_name,value:n.old_value})}catch{u.window.showInformationMessage("Nothing to undo.")}break}case"fieldChanged":{try{await this.editorApi.pushUndo(t,a.fieldName??"",a.oldValue??null,a.newValue??null)}catch{}break}case"revert":{try{await this.editorApi.clearDrafts(t)}catch{}await this.loadItem(e,t,s);break}case"edit":{if(this.autosaveTimers.size>0&&this.autosaveTimers.keys().next().value!==t){u.window.showWarningMessage("Another item is already being edited. Unlock it first before editing this one.");break}let n="";try{await this.editorApi.acquireLock(t),n="Lock acquired \u2014 editing enabled."}catch(d){let r=d instanceof Error?d.message:String(d);n=r.includes("workflow")?"Item is workflow-locked on Jama \u2014 editing locally.":`Could not lock on Jama \u2014 editing locally. (${r.slice(0,80)})`}this.startAutosave(t,e),e.webview.postMessage({type:"lockState",locked:!0,editable:!0}),u.window.showInformationMessage(n);break}case"unlock":{try{await this.editorApi.releaseLock(t),this.stopAutosave(t),e.webview.postMessage({type:"lockState",locked:!1,editable:!1}),u.window.showInformationMessage("Read-only mode \u2014 item unlocked.")}catch(n){let d=n instanceof Error?n.message:String(n);u.window.showErrorMessage(`Unlock failed: ${d}`)}break}case"transition":{try{let n=await u.window.showInputBox({prompt:"Transition comment (optional)",placeHolder:"Enter a comment for this workflow transition..."});await this.api.executeWorkflowTransition(t,a.transitionId??"",n??""),u.window.showInformationMessage("Workflow transition applied."),await this.loadItem(e,t,s),u.commands.executeCommand("jamaEditor.refreshTree")}catch(n){let d=n instanceof Error?n.message:String(n);u.window.showErrorMessage(`Transition failed: ${d}`)}break}case"addComment":{try{await this.api.addItemComment(t,a.text??""),await this.loadItem(e,t,s)}catch(n){let d=n instanceof Error?n.message:String(n);u.window.showErrorMessage(`Comment failed: ${d}`)}break}case"loadVersion":{try{let n=a.version??0;if(n<=0)break;let d=await this.api.getItemAtVersion(t,n);if(d){let r=d.fields_json?JSON.parse(d.fields_json):{};e.webview.postMessage({type:"versionData",version:n,fields:r,descriptionHtml:d.description_html??""}),e.webview.postMessage({type:"lockState",locked:!1,editable:!1}),u.window.showInformationMessage(`Viewing server version ${n} (read-only).`)}}catch(n){let d=n instanceof Error?n.message:String(n);u.window.showErrorMessage(`Failed to load version: ${d}`)}break}case"imageUpload":{try{let n=await u.window.showOpenDialog({canSelectFiles:!0,canSelectMany:!1,openLabel:"Upload Image",filters:{Images:["png","jpg","jpeg","gif","bmp","webp","svg"]}});if(!n||n.length===0)break;let d=n[0].fsPath,r=await this.editorApi.uploadAttachment(t,d,a.fileName??"");if(r?.attachmentId){let o=`${pe()}/api/proxy/image/${r.attachmentId}`;e.webview.postMessage({type:"insertImage",src:o,alt:a.fileName??""})}}catch(n){let d=n instanceof Error?n.message:String(n);u.window.showErrorMessage(`Image upload failed: ${d}`)}break}case"loadDraft":{try{let n=a.draftVersion??0;if(n<=0)break;let d=await this.editorApi.getDraft(t,n);if(d&&d.fields_json){let r=JSON.parse(d.fields_json);for(let[o,c]of Object.entries(r))e.webview.postMessage({type:"undoApply",fieldName:o,value:c!=null?String(c):""});u.window.showInformationMessage(`Restored draft #${n}.`)}}catch(n){let d=n instanceof Error?n.message:String(n);u.window.showErrorMessage(`Failed to load draft: ${d}`)}break}case"syncAttachments":{try{let n=await this.editorApi.syncAttachments(t);e.webview.postMessage({type:"attachmentsLoaded",attachments:n.attachments})}catch(n){let d=n instanceof Error?n.message:String(n);u.window.showErrorMessage(`Failed to sync attachments: ${d}`)}break}case"uploadAttachment":{try{let n=await u.window.showOpenDialog({canSelectFiles:!0,canSelectMany:!1,openLabel:"Upload Attachment"});if(!n||n.length===0)break;let d=n[0].fsPath,r=d.split(/[\\/]/).pop()??"";await this.editorApi.uploadAttachment(t,d,r),u.window.showInformationMessage(`Uploaded "${r}".`);let o=await this.editorApi.syncAttachments(t);e.webview.postMessage({type:"attachmentsLoaded",attachments:o.attachments})}catch(n){let d=n instanceof Error?n.message:String(n);u.window.showErrorMessage(`Upload failed: ${d}`)}break}case"downloadAttachment":{try{let n=a.attachmentId??0;if(n<=0)break;let d=`${pe()}/api/attachments/${n}/download`;await u.env.openExternal(u.Uri.parse(d))}catch(n){let d=n instanceof Error?n.message:String(n);u.window.showErrorMessage(`Download failed: ${d}`)}break}case"deleteAttachment":{u.window.showWarningMessage("Deleting attachments is not allowed from this app.");break}case"importImages":{try{let d=(await this.api.getItem(t,!0))?.description??"",r=xe(d);e.webview.postMessage({type:"updateDescription",html:r})}catch{u.window.showErrorMessage("Failed to import images.")}break}case"replaceAttachment":{try{let n=a.attachmentId??0;if(n<=0)break;let d=await u.window.showOpenDialog({canSelectFiles:!0,canSelectMany:!1,openLabel:"Replace Attachment"});if(!d||d.length===0)break;let r=d[0].fsPath,o=r.split(/[\\/]/).pop()??"";await this.editorApi.replaceAttachment(n,r,o),u.window.showInformationMessage(`Replaced with "${o}".`);let c=await this.editorApi.syncAttachments(t);e.webview.postMessage({type:"attachmentsLoaded",attachments:c.attachments})}catch(n){let d=n instanceof Error?n.message:String(n);u.window.showErrorMessage(`Replace failed: ${d}`)}break}}}};var Ee=I(require("vscode"));function me(i,e){return i.asWebviewUri(Ee.Uri.joinPath(e,"out","webview","toolkit.js"))}var Ye=/https?:\/\/[^"'\s]*?\/(?:rest\/v1\/(?:attachments|files)\/(\d+)(?:\/file)?|attachment\/(\d+)\/[^"'\s]*)/gi;function Te(){return`http://localhost:${P().port}/editor`}function U(i){let e=Te();return i.replace(Ye,(t,s,a)=>`${e}/api/proxy/image/${s||a}`)}function ue(i){let e=Te();return`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'${i?` ${i}`:""}; img-src https: data: ${e};">`}var ke={PASSED:{bg:"#166534",text:"#bbf7d0"},FAILED:{bg:"#991b1b",text:"#fecaca"},BLOCKED:{bg:"#854d0e",text:"#fef08a"},INPROGRESS:{bg:"#1e40af",text:"#bfdbfe"},IN_PROGRESS:{bg:"#1e40af",text:"#bfdbfe"},NOT_RUN:{bg:"#374151",text:"#d1d5db"}};function W(i){let e=i.toUpperCase(),t=ke[e]??ke.NOT_RUN;return`<span class="badge" style="background:${t.bg};color:${t.text};display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${i}</span>`}function E(i){return i.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}var ge=`
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; margin: 0; }
  h1 { font-size: 22px; margin: 0 0 4px 0; }
  .meta { font-size: 13px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
  .section { margin-top: 20px; }
  .section h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground); margin: 0 0 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px 12px; font-size: 12px; color: var(--vscode-descriptionForeground); border-bottom: 2px solid var(--vscode-panel-border); }
  td { padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
  .desc { background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textLink-foreground); padding: 12px; border-radius: 4px; font-size: 14px; }
  .badge { padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .toolbar { position: sticky; top: 0; z-index: 100; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); padding: 8px 0; margin: -20px -20px 16px -20px; padding: 8px 20px; display: flex; gap: 8px; align-items: center; }
  .toolbar .status-msg { font-size: 12px; color: var(--vscode-descriptionForeground); margin-left: auto; }
  .btn { padding: 4px 14px; border-radius: 4px; border: none; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
  .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .editable-field { display: none; }
  .readonly-field { display: block; }
  body.editing .editable-field { display: block; }
  body.editing .readonly-field { display: none; }
  .field-input, .field-textarea { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-family: inherit; font-size: 13px; }
  .field-textarea { min-height: 80px; resize: vertical; }
  .field-select { padding: 6px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-family: inherit; font-size: 13px; }
  .dirty-indicator { display: none; width: 8px; height: 8px; border-radius: 50%; background: var(--vscode-gitDecoration-modifiedResourceForeground); }
  body.dirty .dirty-indicator { display: inline-block; }
  .summary-card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 16px; margin-bottom: 20px; }
  .summary-card .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 12px; }
  .summary-card .summary-item { display: flex; flex-direction: column; gap: 2px; }
  .summary-card .summary-label { font-size: 11px; font-weight: 600; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.3px; }
  .summary-card .summary-value { font-size: 14px; }
  .step-summary { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
  .step-summary .step-count { display: flex; align-items: center; gap: 4px; font-size: 12px; }
  .step-summary .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .progress-bar { height: 6px; border-radius: 3px; background: var(--vscode-input-background); overflow: hidden; margin-top: 6px; display: flex; }
  .progress-bar .seg { height: 100%; }
`,ve=`
  const vscode = acquireVsCodeApi();
  let isEditing = false;
  let isDirty = false;

  function setEditing(val) {
    isEditing = val;
    document.body.classList.toggle('editing', val);
    document.getElementById('btnEdit').style.display = val ? 'none' : 'inline-block';
    document.getElementById('btnPush').style.display = val ? 'inline-block' : 'none';
    document.getElementById('btnCancel').style.display = val ? 'inline-block' : 'none';
  }

  function setDirty(val) {
    isDirty = val;
    document.body.classList.toggle('dirty', val);
  }

  function setStatus(msg) {
    document.getElementById('statusMsg').textContent = msg;
    setTimeout(() => { document.getElementById('statusMsg').textContent = ''; }, 4000);
  }

  document.getElementById('btnEdit').addEventListener('click', () => {
    vscode.postMessage({ type: 'edit' });
  });

  document.getElementById('btnCancel').addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
  });

  document.getElementById('btnPush').addEventListener('click', () => {
    vscode.postMessage({ type: 'push', fields: gatherFields() });
    document.getElementById('btnPush').disabled = true;
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'setEditing') {
      setEditing(msg.editing);
      if (msg.message) setStatus(msg.message);
    } else if (msg.type === 'pushResult') {
      setStatus(msg.message || 'Pushed to Jama');
      setDirty(false);
      document.getElementById('btnPush').disabled = false;
      if (msg.success) setEditing(false);
    } else if (msg.type === 'error') {
      setStatus(msg.message || 'Error');
      document.getElementById('btnPush').disabled = false;
    }
  });
`;function he(){return`<div class="toolbar">
    <vscode-button id="btnEdit">Edit</vscode-button>
    <vscode-button id="btnPush" style="display:none;">Push to Jama</vscode-button>
    <vscode-button id="btnCancel" appearance="secondary" style="display:none;">Cancel</vscode-button>
    <span class="dirty-indicator" title="Unsaved changes"></span>
    <span class="status-msg" id="statusMsg"></span>
  </div>`}function _e(i){if(i.length===0)return"";let e={PASSED:0,FAILED:0,BLOCKED:0,INPROGRESS:0,NOT_RUN:0};for(let t of i){let s=t.status?.toUpperCase()??"NOT_RUN";e[s]=(e[s]??0)+1}return $e(e,i.length,"Runs")}function $e(i,e,t){let s=r=>e>0?Math.round(r/e*100):0,a={PASSED:"#22c55e",FAILED:"#ef4444",BLOCKED:"#eab308",INPROGRESS:"#3b82f6",NOT_RUN:"#6b7280"},n=Object.entries(i).filter(([,r])=>r>0).map(([r,o])=>`<span class="step-count"><span class="dot" style="background:${a[r]??"#6b7280"};"></span>${o} ${r}</span>`).join(""),d=Object.entries(i).filter(([,r])=>r>0).map(([r,o])=>`<div class="seg" style="width:${s(o)}%;background:${a[r]??"#6b7280"};"></div>`).join("");return`
    <div class="summary-item" style="grid-column: 1 / -1;">
      <div class="summary-label">${t} Progress (${e})</div>
      <div class="progress-bar">${d}</div>
      <div class="step-summary">${n}</div>
    </div>`}function Qe(i,e,t){let s=[];s.push(`<div class="summary-item"><div class="summary-label">Plan ID</div><div class="summary-value">${i.id}</div></div>`),s.push(`<div class="summary-item"><div class="summary-label">Project</div><div class="summary-value">${i.project_id}</div></div>`),s.push(`<div class="summary-item"><div class="summary-label">Status</div><div class="summary-value">${W(i.status)}</div></div>`),s.push(`<div class="summary-item"><div class="summary-label">Cycles</div><div class="summary-value">${e.length}</div></div>`),s.push(`<div class="summary-item"><div class="summary-label">Total Runs</div><div class="summary-value">${t.length}</div></div>`);let a=_e(t);return`<div class="summary-card">
    <div style="font-size:13px;font-weight:600;color:var(--vscode-descriptionForeground);">SUMMARY</div>
    <div class="summary-grid">${s.join(`
`)}${a}</div>
  </div>`}function Ie(i,e,t,s,a){let n=me(i,e),d=s.map(p=>`<tr style="cursor:pointer;" onclick="openCycle(${p.id})">
        <td>${E(p.name)}</td>
        <td>${W(p.status)}</td>
        <td>${p.start_date?new Date(p.start_date).toLocaleDateString():"\u2014"}</td>
        <td>${p.end_date?new Date(p.end_date).toLocaleDateString():"\u2014"}</td>
      </tr>`).join(""),r={};try{r=JSON.parse(t.fields_json||"{}")}catch{}let o=U(r.description??t.description??""),c=Qe(t,s,a??[]);return`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" />${ue(i.cspSource)}<script src="${n}"></script><style>${ge}</style></head>
<body>
  ${he()}
  <div style="display:flex;align-items:center;gap:10px;">
    <div class="readonly-field"><h1>${E(t.name)}</h1></div>
    <div class="editable-field"><input class="field-input" id="f_name" value="${E(t.name)}" data-field="name" /></div>
    <vscode-tag>${E(t.status)}</vscode-tag>
  </div>

  ${c}

  <div class="section">
    <h2>Description</h2>
    <div class="readonly-field">${o?`<div class="desc">${o}</div>`:'<span style="color:var(--vscode-descriptionForeground);">\u2014</span>'}</div>
    <div class="editable-field"><textarea class="field-textarea" id="f_description" data-field="description">${E(typeof o=="string"?o.replace(/<[^>]*>/g,""):"")}</textarea></div>
  </div>

  <div class="section">
    <h2>Test Cycles (${s.length})</h2>
    ${s.length>0?`<table><thead><tr><th>Cycle</th><th>Status</th><th>Start</th><th>End</th></tr></thead><tbody>${d}</tbody></table>`:'<p style="color:var(--vscode-descriptionForeground);">No test cycles in this plan.</p>'}
  </div>

  <script>
    ${ve}
    function gatherFields() {
      const fields = {};
      document.querySelectorAll('[data-field]').forEach(el => {
        fields[el.dataset.field] = el.value;
      });
      return fields;
    }
    document.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('input', () => setDirty(true));
    });
    function openCycle(cycleId) {
      vscode.postMessage({ type: 'openCycle', cycleId });
    }
  </script>
</body>
</html>`}function Xe(i,e){let t=[];if(t.push(`<div class="summary-item"><div class="summary-label">Cycle ID</div><div class="summary-value">${i.id}</div></div>`),t.push(`<div class="summary-item"><div class="summary-label">Plan ID</div><div class="summary-value">${i.test_plan_id}</div></div>`),t.push(`<div class="summary-item"><div class="summary-label">Status</div><div class="summary-value">${W(i.status)}</div></div>`),i.start_date&&t.push(`<div class="summary-item"><div class="summary-label">Start Date</div><div class="summary-value">${new Date(i.start_date).toLocaleDateString()}</div></div>`),i.end_date&&t.push(`<div class="summary-item"><div class="summary-label">End Date</div><div class="summary-value">${new Date(i.end_date).toLocaleDateString()}</div></div>`),i.start_date&&i.end_date){let a=Math.ceil((new Date(i.end_date).getTime()-new Date(i.start_date).getTime())/864e5);t.push(`<div class="summary-item"><div class="summary-label">Duration</div><div class="summary-value">${a} day${a!==1?"s":""}</div></div>`)}t.push(`<div class="summary-item"><div class="summary-label">Total Runs</div><div class="summary-value">${e.length}</div></div>`);let s=_e(e);return`<div class="summary-card">
    <div style="font-size:13px;font-weight:600;color:var(--vscode-descriptionForeground);">SUMMARY</div>
    <div class="summary-grid">${t.join(`
`)}${s}</div>
  </div>`}function Pe(i,e,t,s){let a=me(i,e),n=s.map(c=>`<tr style="cursor:pointer;" onclick="openRun(${c.id})">
        <td>${E(c.name)}</td>
        <td>${W(c.status)}</td>
        <td>${c.assigned_to??"\u2014"}</td>
        <td>${c.execution_date?new Date(c.execution_date).toLocaleDateString():"\u2014"}</td>
      </tr>`).join(""),d={};try{d=JSON.parse(t.fields_json||"{}")}catch{}let r=U(d.description??t.description??""),o=Xe(t,s);return`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" />${ue(i.cspSource)}<script src="${a}"></script><style>${ge}</style></head>
<body>
  ${he()}
  <div style="display:flex;align-items:center;gap:10px;">
    <div class="readonly-field"><h1>${E(t.name)}</h1></div>
    <div class="editable-field"><input class="field-input" id="f_name" value="${E(t.name)}" data-field="name" /></div>
    <vscode-tag>${E(t.status)}</vscode-tag>
  </div>

  ${o}

  <div class="section">
    <h2>Description</h2>
    <div class="readonly-field">${r?`<div class="desc">${r}</div>`:'<span style="color:var(--vscode-descriptionForeground);">\u2014</span>'}</div>
    <div class="editable-field"><textarea class="field-textarea" id="f_description" data-field="description">${E(typeof r=="string"?r.replace(/<[^>]*>/g,""):"")}</textarea></div>
  </div>

  <div class="section editable-field">
    <h2>Dates</h2>
    <div style="display:flex;gap:16px;">
      <div><label style="font-size:12px;display:block;margin-bottom:4px;">Start Date</label><input type="date" class="field-input" id="f_startDate" data-field="startDate" value="${t.start_date?new Date(t.start_date).toISOString().slice(0,10):""}" /></div>
      <div><label style="font-size:12px;display:block;margin-bottom:4px;">End Date</label><input type="date" class="field-input" id="f_endDate" data-field="endDate" value="${t.end_date?new Date(t.end_date).toISOString().slice(0,10):""}" /></div>
    </div>
  </div>

  <div class="section">
    <h2>Test Runs (${s.length})</h2>
    ${s.length>0?`<table><thead><tr><th>Test Run</th><th>Status</th><th>Assigned</th><th>Execution Date</th></tr></thead><tbody>${n}</tbody></table>`:'<p style="color:var(--vscode-descriptionForeground);">No test runs in this cycle.</p>'}
  </div>

  <script>
    ${ve}
    function gatherFields() {
      const fields = {};
      document.querySelectorAll('[data-field]').forEach(el => {
        fields[el.dataset.field] = el.value;
      });
      return fields;
    }
    document.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('input', () => setDirty(true));
    });
    function openRun(runId) {
      vscode.postMessage({ type: 'openRun', runId });
    }
  </script>
</body>
</html>`}var Se=["NOT_RUN","PASSED","FAILED","BLOCKED","INPROGRESS"];function et(i){if(i.length===0)return"";let e={PASSED:0,FAILED:0,BLOCKED:0,INPROGRESS:0,NOT_RUN:0};for(let t of i){let s=t.status?.toUpperCase()??"NOT_RUN";e[s]=(e[s]??0)+1}return $e(e,i.length,"Steps")}function tt(i,e,t){let s=e.documentKey??"",a=e.duration,n=e.testGroup??"",d=e.priority??"",r=[];if(r.push(`<div class="summary-item"><div class="summary-label">Run ID</div><div class="summary-value">${i.id}</div></div>`),s&&r.push(`<div class="summary-item"><div class="summary-label">Document Key</div><div class="summary-value">${E(s)}</div></div>`),i.test_case_id&&r.push(`<div class="summary-item"><div class="summary-label">Test Case</div><div class="summary-value">${i.test_case_id}</div></div>`),r.push(`<div class="summary-item"><div class="summary-label">Status</div><div class="summary-value">${W(i.status)}</div></div>`),i.assigned_to&&r.push(`<div class="summary-item"><div class="summary-label">Assigned To</div><div class="summary-value">${i.assigned_to}</div></div>`),i.execution_date&&r.push(`<div class="summary-item"><div class="summary-label">Execution Date</div><div class="summary-value">${new Date(i.execution_date).toLocaleDateString()}</div></div>`),a!=null&&a>0){let c=Math.round(a/6e4);r.push(`<div class="summary-item"><div class="summary-label">Duration</div><div class="summary-value">${c>0?c+" min":"<1 min"}</div></div>`)}n&&r.push(`<div class="summary-item"><div class="summary-label">Test Group</div><div class="summary-value">${E(n)}</div></div>`),d&&r.push(`<div class="summary-item"><div class="summary-label">Priority</div><div class="summary-value">${E(d)}</div></div>`);let o=et(t);return`<div class="summary-card">
    <div style="font-size:13px;font-weight:600;color:var(--vscode-descriptionForeground);">SUMMARY</div>
    <div class="summary-grid">
      ${r.join(`
`)}
      ${o}
    </div>
  </div>`}function Ce(i,e,t){let s=me(i,e),a={};try{a=JSON.parse(t.fields_json||"{}")}catch{}let n=U(a.description??""),d=(a.testRunSteps??[]).map(m=>({...m,action:U(m.action||""),expectedResult:U(m.expectedResult||""),result:U(m.result||"")})),r=U(a.actualResults??t.actual_results??""),o=tt(t,a,d),c=Se.map(m=>`<option value="${m}" ${m===t.status?"selected":""}>${m}</option>`).join(""),p=d.map((m,v)=>`
    <div style="border:1px solid var(--vscode-panel-border);border-radius:6px;margin-bottom:10px;overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:center;background:var(--vscode-sideBar-background);padding:8px 12px;font-size:12px;">
        <b>Step ${v+1}</b>
        ${W(m.status)}
      </div>
      <div style="padding:12px;font-size:13px;">
        ${m.action?`<div style="margin-bottom:8px;"><div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Action</div><div>${m.action}</div></div>`:""}
        ${m.expectedResult?`<div style="margin-bottom:8px;"><div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Expected Result</div><div>${m.expectedResult}</div></div>`:""}
        ${m.result?`<div style="margin-bottom:8px;"><div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Actual Result</div><div class="desc">${m.result}</div></div>`:""}
        ${m.notes?`<div><div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Notes</div><div style="font-size:12px;color:var(--vscode-descriptionForeground);">${E(m.notes)}</div></div>`:""}
      </div>
    </div>`).join(""),g=d.map((m,v)=>`
    <div class="step-card" data-step-index="${v}" style="border:1px solid var(--vscode-panel-border);border-radius:6px;margin-bottom:10px;overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:center;background:var(--vscode-sideBar-background);padding:8px 12px;font-size:12px;">
        <b>Step ${v+1}</b>
        <select class="field-select step-status" data-step="${v}" data-step-field="status">${Se.map(w=>`<option value="${w}" ${w===m.status?"selected":""}>${w}</option>`).join("")}</select>
      </div>
      <div style="padding:12px;font-size:13px;">
        ${m.action?`<div style="margin-bottom:8px;"><div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Action</div><div>${m.action}</div></div>`:""}
        ${m.expectedResult?`<div style="margin-bottom:8px;"><div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Expected Result</div><div>${m.expectedResult}</div></div>`:""}
        <div style="margin-bottom:8px;">
          <div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Actual Result</div>
          <textarea class="field-textarea step-field" data-step="${v}" data-step-field="result" rows="3">${E(m.result||"")}</textarea>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Notes</div>
          <textarea class="field-textarea step-field" data-step="${v}" data-step-field="notes" rows="2">${E(m.notes||"")}</textarea>
        </div>
      </div>
    </div>`).join("");return`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" />${ue(i.cspSource)}<script src="${s}"></script><style>${ge}</style></head>
<body>
  ${he()}
  <div style="display:flex;align-items:center;gap:10px;">
    <h1>${E(t.name||"Run "+t.id)}</h1>
    <div class="readonly-field"><vscode-tag>${E(t.status)}</vscode-tag></div>
    ${d.length===0?`<div class="editable-field"><select class="field-select" id="f_testRunStatus" data-field="testRunStatus">${c}</select></div>`:`<div class="editable-field"><span style="font-size:12px;color:var(--vscode-descriptionForeground);"><vscode-tag>${E(t.status)}</vscode-tag> (derived from steps)</span></div>`}
  </div>

  ${o}

  ${n?`<div class="section"><h2>Description</h2><div class="desc">${n}</div></div>`:""}

  <div class="section">
    <h2>Actual Results</h2>
    <div class="readonly-field">${r?`<div class="desc">${r}</div>`:'<span style="color:var(--vscode-descriptionForeground);">\u2014</span>'}</div>
    <div class="editable-field"><textarea class="field-textarea" id="f_actualResults" data-field="actualResults" rows="4">${E(typeof r=="string"?r.replace(/<[^>]*>/g,""):"")}</textarea></div>
  </div>

  ${t.planned_results?`<div class="section"><h2>Planned Results</h2><div class="desc">${U(t.planned_results)}</div></div>`:""}

  ${d.length>0?`
  <div class="section">
    <h2>Test Steps (${d.length})</h2>
    <div class="readonly-field">${p}</div>
    <div class="editable-field">${g}</div>
  </div>
  `:""}

  ${!n&&d.length===0&&!r?'<p style="color:var(--vscode-descriptionForeground);text-align:center;padding:30px 0;">No additional details available for this test run.</p>':""}

  <script>
    const originalSteps = ${JSON.stringify(d)};

    ${ve}

    function gatherFields() {
      const fields = {};

      // Top-level fields
      document.querySelectorAll('[data-field]').forEach(el => {
        fields[el.dataset.field] = el.tagName === 'SELECT' ? el.value : el.value;
      });

      // Steps
      const stepCards = document.querySelectorAll('.step-card');
      if (stepCards.length > 0) {
        const stepsData = originalSteps.map((s, i) => ({ ...s }));
        stepCards.forEach(card => {
          const idx = parseInt(card.dataset.stepIndex, 10);
          card.querySelectorAll('[data-step-field]').forEach(el => {
            const field = el.dataset.stepField;
            stepsData[idx][field] = el.value;
          });
        });
        fields.testRunSteps = stepsData;
      }

      return fields;
    }

    // Dirty tracking
    document.querySelectorAll('[data-field], .step-field, .step-status').forEach(el => {
      el.addEventListener('input', () => setDirty(true));
      el.addEventListener('change', () => setDirty(true));
    });
  </script>
</body>
</html>`}var B,$,G,O,j;async function st(i){let e=l.window.createOutputChannel("Jama Editor");e.appendLine("Jama Editor extension activating...");let t=new J;B=new X,i.subscriptions.push(B),$=new ee(t,i),G=new te(t,$);let s=l.window.createTreeView("jamaProjects",{treeDataProvider:G,showCollapseAll:!0});i.subscriptions.push(s),O=new ae(t,$);let a=l.window.createTreeView("jamaTestRunner",{treeDataProvider:O,showCollapseAll:!0});i.subscriptions.push(a),j=new ne(t,i.extensionUri),i.subscriptions.push(j);let n=new Z(i.extensionUri);if(i.subscriptions.push(l.window.registerWebviewViewProvider(Z.viewType,n)),i.subscriptions.push(l.commands.registerCommand("jamaEditor.refreshTree",()=>{G?.refresh()}),l.commands.registerCommand("jamaEditor.selectProject",async()=>{await $?.pickProject()}),l.commands.registerCommand("jamaEditor.refreshTestRunner",()=>{O?.refresh()}),l.commands.registerCommand("jamaEditor.openTestDetail",async(r,o)=>{let c=new V,p=o.id,g=o.name||`${r} ${p}`,m=r==="plan"?"Test Plan":r==="cycle"?"Test Cycle":"Test Run",v=l.window.createWebviewPanel("jamaTestDetail",`${m}: ${g}`,l.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[l.Uri.joinPath(i.extensionUri,"out","webview")]});async function w(b){let x=b??o;if(r==="plan"){let h=x,y=[];try{y=await t.getTestCycles(h.id,!0)}catch{}let D=[];try{D=(await Promise.all(y.map(R=>t.getTestRuns(R.id,!0).catch(()=>[])))).flat()}catch{}v.webview.html=Ie(v.webview,i.extensionUri,h,y,D)}else if(r==="cycle"){let h=x,y=[];try{y=await t.getTestRuns(h.id,!0)}catch{}v.webview.html=Pe(v.webview,i.extensionUri,h,y)}else v.webview.html=Ce(v.webview,i.extensionUri,x)}await w(),v.webview.onDidReceiveMessage(async b=>{try{if(b.type==="edit"){if(r==="plan")try{await c.acquireTestPlanLock(p)}catch{}v.webview.postMessage({type:"setEditing",editing:!0,message:"Editing..."})}else if(b.type==="cancel"){if(r==="plan")try{await c.releaseTestPlanLock(p)}catch{}v.webview.postMessage({type:"setEditing",editing:!1,message:"Cancelled"})}else if(b.type==="openCycle"&&b.cycleId)try{let x=o,y=(await t.getTestCycles(x.id,!0)).find(D=>D.id===b.cycleId);y&&l.commands.executeCommand("jamaEditor.openTestDetail","cycle",y)}catch{}else if(b.type==="openRun"&&b.runId)try{let x=o,y=(await t.getTestRuns(x.id,!0)).find(D=>D.id===b.runId);y&&l.commands.executeCommand("jamaEditor.openTestDetail","run",y)}catch{}else if(b.type==="push"){let x=b.fields;try{let h;r==="plan"?h=await c.pushTestPlan(p,x):r==="cycle"?h=await c.pushTestCycle(p,x):h=await c.pushTestRun(p,x);let y=h.status==="no_changes"?"No changes detected":`Pushed to Jama (v${h.version})`;if(r==="plan")try{await c.releaseTestPlanLock(p)}catch{}h.status!=="no_changes"&&h.item?await w(h.item):v.webview.postMessage({type:"pushResult",success:!0,message:y}),O?.refresh(),l.window.showInformationMessage(`${m} ${g}: ${y}`)}catch(h){let y=h instanceof Error?h.message:String(h);v.webview.postMessage({type:"error",message:y}),l.window.showErrorMessage(`Push failed: ${y}`)}}}catch(x){let h=x instanceof Error?x.message:String(x);v.webview.postMessage({type:"error",message:h})}}),v.onDidDispose(async()=>{if(r==="plan")try{await c.releaseTestPlanLock(p)}catch{}})}),l.commands.registerCommand("jamaEditor.openItem",async(r,o,c,p)=>{if(typeof r=="object"&&r!==null&&"itemId"in r){let g=r;await j?.openItem(g.itemId,g.projectId,g.label||"",g.documentKey??"")}else await j?.openItem(r,o,c,p)}),l.commands.registerCommand("jamaEditor.syncProject",async r=>{let o=r?.projectId??$?.selectedId;if(!o){l.window.showWarningMessage("No project selected.");return}try{l.window.withProgress({location:l.ProgressLocation.Notification,title:"Syncing project...",cancellable:!1},async c=>{c.report({message:"Starting sync..."}),await t.syncProject(o),c.report({message:"Sync complete, refreshing tree..."}),G?.refresh(),O?.refresh()})}catch(c){let p=c instanceof Error?c.message:String(c);l.window.showErrorMessage(`Sync failed: ${p}`)}}),l.commands.registerCommand("jamaEditor.createItem",async r=>{let o=r?.projectId??$?.selectedId;if(!o||!r?.itemId)return;let c=await l.window.showInputBox({prompt:"Enter name for the new item",placeHolder:"New Item"});if(c)try{let p=await t.getItemTypes(),g=await l.window.showQuickPick(p.map(m=>({label:m.display,id:m.id})),{placeHolder:"Select item type"});if(!g)return;await t.createItem(o,g.id,r.itemId,{name:c}),l.window.showInformationMessage(`Item "${c}" created.`),G?.refresh()}catch(p){let g=p instanceof Error?p.message:String(p);l.window.showErrorMessage(`Create failed: ${g}`)}}),l.commands.registerCommand("jamaEditor.startBackend",async()=>{await B?.start()?(l.window.showInformationMessage("Jama backend started."),await $?.init()):l.window.showErrorMessage("Failed to start Jama backend. Check Output > Jama Backend.")}),l.commands.registerCommand("jamaEditor.stopBackend",async()=>{await B?.stop(),l.window.showInformationMessage("Jama backend stopped.")}),l.commands.registerCommand("jamaEditor.searchItems",async()=>{let r=await l.window.showInputBox({prompt:"Search Jama items",placeHolder:"Enter search query..."});if(r)try{let o=await t.search(r);if(o.length===0){l.window.showInformationMessage("No results found.");return}let c=await l.window.showQuickPick(o.map(p=>({label:`${p.document_key} \u2014 ${p.name}`,description:p.doc_type,detail:p.snippet,itemId:p.entity_id,projectId:p.project_id,name:p.name,documentKey:p.document_key})),{placeHolder:`${o.length} results for "${r}"`});c&&await j?.openItem(c.itemId,c.projectId,c.name,c.documentKey)}catch(o){let c=o instanceof Error?o.message:String(o);l.window.showErrorMessage(`Search failed: ${c}`)}}),l.commands.registerCommand("jamaEditor.clearAttachmentCache",async()=>{try{let r=j?.getEditorApi();if(!r){l.window.showErrorMessage("Editor backend not available.");return}let o=await r.clearAttachmentCache();l.window.showInformationMessage(`Attachment cache cleared: ${o.files_deleted} files, ${(o.bytes_freed/1024/1024).toFixed(1)} MB freed.`)}catch(r){let o=r instanceof Error?r.message:String(r);l.window.showErrorMessage(`Clear cache failed: ${o}`)}}),l.commands.registerCommand("jamaEditor.incrementalSync",async()=>{let r=$?.selectedId;if(!r){l.window.showWarningMessage("No project selected. Use 'Jama: Select Project' first.");return}try{await l.window.withProgress({location:l.ProgressLocation.Notification,title:"Jama: Incremental sync...",cancellable:!1},async o=>{o.report({message:"Syncing changed items..."}),await t.incrementalSync(r),o.report({message:"Done \u2014 refreshing tree..."}),G?.refresh(),O?.refresh(),l.window.showInformationMessage("Incremental sync complete.")})}catch(o){let c=o instanceof Error?o.message:String(o);l.window.showErrorMessage(`Incremental sync failed: ${c}`)}}),l.commands.registerCommand("jamaEditor.clearImageCache",async()=>{try{let r=j?.getEditorApi();if(!r){l.window.showErrorMessage("Editor backend not available.");return}let o=await r.clearImageCache();l.window.showInformationMessage(`Image cache cleared: ${o.files_deleted} files, ${(o.bytes_freed/1024/1024).toFixed(1)} MB freed.`)}catch(r){let o=r instanceof Error?r.message:String(r);l.window.showErrorMessage(`Clear image cache failed: ${o}`)}}),l.commands.registerCommand("jamaEditor.uploadAttachment",async r=>{try{let o=j?.getEditorApi();if(!o){l.window.showErrorMessage("Editor backend not available.");return}if(!r){let m=await l.window.showInputBox({prompt:"Enter Jama item ID to attach file to",placeHolder:"e.g. 7598533"});if(!m)return;if(r=parseInt(m,10),isNaN(r)){l.window.showErrorMessage("Invalid item ID.");return}}let c=await l.window.showOpenDialog({canSelectMany:!1,openLabel:"Upload to Jama",filters:{Images:["png","jpg","jpeg","gif","bmp","webp","svg"],Reports:["pdf","xlsx","docx","csv","html"],"All Files":["*"]}});if(!c||c.length===0)return;let p=c[0].fsPath,g=p.split(/[\\/]/).pop()||"attachment";await l.window.withProgress({location:l.ProgressLocation.Notification,title:`Uploading ${g}...`,cancellable:!1},async m=>{m.report({message:"Uploading to Jama..."});let v=await o.uploadItemAttachment(r,p,g);l.window.showInformationMessage(`Uploaded "${g}" to item ${r} (attachment ID: ${v.attachment_id})`)})}catch(o){let c=o instanceof Error?o.message:String(o);l.window.showErrorMessage(`Upload failed: ${c}`)}}),l.commands.registerCommand("jamaEditor.openSettings",async()=>{await l.commands.executeCommand("jamaSettingsView.focus")}),l.commands.registerCommand("jamaEditor.manageProjectDbs",()=>{H.show(i.extensionUri)}),l.commands.registerCommand("jamaEditor.setActiveProjectById",(r,o)=>{$?.setProjectById(Number(r),o||`Project ${r}`),O?.refresh()})),l.workspace.getConfiguration("jamaEditor").get("autoStartBackend",!0))if(await B.start()){e.appendLine("Backend ready. Loading project tree..."),await $.init(),$.selectedId&&e.appendLine(`Restored last project: ${$.selectedName} (${$.selectedId})`);try{let o=j?.getEditorApi();if(o){let c=await o.getDirtyItems();if(c.count>0){let g=c.items.filter(v=>v.lock_held);if(g.length>0){let v=g.map(b=>b.item_id).join(", ");if(e.appendLine(`Stale locks detected: items ${v}`),await l.window.showWarningMessage(`${g.length} item(s) have stale locks from a previous session (${v}). Release them?`,"Release All","Ignore")==="Release All")for(let b of g)try{await o.releaseLock(b.item_id),e.appendLine(`Released stale lock: item ${b.item_id}`)}catch{e.appendLine(`Failed to release lock: item ${b.item_id}`)}}let m=await o.getPendingUploads();m.count>0&&(e.appendLine(`${m.count} pending upload(s) found from previous session.`),await l.window.showInformationMessage(`${m.count} attachment upload(s) were interrupted. Retry?`,"Retry","Dismiss")==="Retry"&&(await o.retryPendingUploads(),e.appendLine("Pending uploads retried.")))}}}catch{e.appendLine("Stale lock check skipped (editor backend may still be initializing).")}B.offerServiceInstall();try{(await B.apiClient.getCredentialStatus()).configured||await l.window.showWarningMessage("Jama API credentials are not configured. Open Settings to set them up?","Open Settings")==="Open Settings"&&l.commands.executeCommand("jamaEditor.openSettings")}catch{e.appendLine("Onboarding: credential check skipped (backend may still be initializing).")}}else e.appendLine("Backend failed to start. Use 'Jama: Start Backend' command.");e.appendLine("Jama Editor extension activated.")}function at(){B?.dispose(),j?.dispose()}0&&(module.exports={activate,deactivate});
//# sourceMappingURL=extension.js.map
