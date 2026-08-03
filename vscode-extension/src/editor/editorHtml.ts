import * as vscode from "vscode";
import {
  JamaItem, JamaComment, JamaWorkflowTransition,
  EditorFieldDefinition, JamaPickListOption,
  JamaItemVersion, EditorDraft,
} from "../api";
import { isRichTextField } from "./jamaRichtextConfig";
import { getConfig } from "../utils/config";

export interface EditorData {
  item: JamaItem;
  fields: Record<string, unknown>;
  comments: JamaComment[];
  transitions: JamaWorkflowTransition[];
  projectId: number;
  fieldDefinitions?: EditorFieldDefinition[];
  pickListOptions?: Record<number, JamaPickListOption[]>;
  versions?: JamaItemVersion[];
  drafts?: EditorDraft[];
}

/**
 * Generate the full HTML for the Jama item editor WebView.
 * Phase 3: Schema-driven dynamic form rendering with pick lists,
 * version/draft dropdown, and metadata bar.
 */
export function getEditorHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  data: EditorData
): string {
  const { item, fields, comments, transitions } = data;
  const fieldDefs = data.fieldDefinitions ?? [];
  const pickLists = data.pickListOptions ?? {};
  const versions = data.versions ?? [];
  const drafts = data.drafts ?? [];
  const nonce = getNonce();
  const editorBaseUrl = `http://localhost:${getConfig().port}/editor`;

  // URI for the bundled TipTap WebView script
  const tiptapScriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "out", "webview", "tiptap.js")
  );

  const name = escapeHtml(item.name);
  const description = item.description ?? "";
  const docKey = escapeHtml(item.document_key);
  const version = item.version ?? item.current_version ?? 0;
  const globalId = escapeHtml(item.global_id ?? "");
  const modifiedDate = item.modified_date ?? "";

  const transitionOptions = transitions
    .map(
      (t) =>
        `<option value="${escapeHtml(t.id)}">${escapeHtml(t.action)}</option>`
    )
    .join("\n");

  const commentHtml = comments
    .map((c) => {
      const author = c.createdBy
        ? `${escapeHtml(c.createdBy.firstName ?? "")} ${escapeHtml(c.createdBy.lastName ?? "")}`
        : "Unknown";
      const date = c.createdDate ?? "";
      const body = c.body?.text ?? "";
      return `<div class="comment">
        <div class="comment-header"><strong>${author}</strong> <span class="date">${escapeHtml(date)}</span></div>
        <div class="comment-body">${body}</div>
      </div>`;
    })
    .join("\n");

  // --- Dynamic field rendering ---
  const dynamicFieldsHtml = buildDynamicFields(fieldDefs, fields, pickLists);

  // --- Version & Draft dropdown ---
  const versionDraftHtml = buildVersionDraftDropdown(versions, drafts);

  const fieldsJson = JSON.stringify(fields, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-inline' ${webview.cspSource}; img-src ${webview.cspSource} https: data: ${editorBaseUrl}; connect-src ${editorBaseUrl};">
  <title>${docKey} — ${name}</title>
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
    .toolbar button { background: var(--btn-bg); color: var(--btn-fg); border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; transition: background 0.15s; }
    .toolbar button:hover { background: var(--btn-hover); }
    .toolbar button.secondary { background: transparent; color: var(--fg); border: 1px solid var(--border); }
    .toolbar button.secondary:hover { background: var(--input-bg); }
    .toolbar select { background: var(--input-bg); color: var(--input-fg); border: 1px solid var(--input-border); padding: 4px 8px; border-radius: 4px; }
    .toolbar .spacer { flex: 1; }
    .toolbar .doc-key { font-weight: 700; font-size: 15px; letter-spacing: -0.3px; }

    /* Edit-only toolbar actions: hidden in read-only */
    .edit-actions { display: none; gap: 8px; align-items: center; }
    body.editing .edit-actions { display: flex; }

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

    /* TipTap rich-text editor — hidden toolbar in read-only */
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
    <span class="doc-key">${docKey}</span>
    <span class="meta-version" title="Jama server version">v${version}</span>
    <span class="dirty-indicator" id="dirtyIndicator">● Modified</span>
    <div class="spacer"></div>
    <span class="edit-actions">
      ${versionDraftHtml}
      ${transitions.length > 0 ? `
      <select id="transitionSelect">
        <option value="">Workflow…</option>
        ${transitionOptions}
      </select>
      <button id="btnTransition">Apply</button>
      ` : ""}
      <button class="secondary" id="btnUndo" title="Undo last field change">↶ Undo</button>
      <button class="secondary" id="btnRevert" title="Reload from server">↺ Revert</button>
      <button class="secondary" id="btnUnlock" style="display:none">🔓 Unlock</button>
      <button id="btnPush">⬆ Push to Jama</button>
    </span>
    <button class="secondary" id="btnEdit">✏ Edit</button>
  </div>

  <!-- Metadata bar -->
  <div class="meta-bar">
    <span id="lockStatus" class="lock-status unlocked">Read-Only</span>
    <span id="syncStatus" class="sync-status"></span>
    <span>Modified: ${escapeHtml(modifiedDate)}</span>
    <span class="meta-gid" title="Global ID">${globalId}</span>
  </div>

  <!-- SAML image placeholder banner (hidden by default, shown if images fail to load) -->
  <div class="saml-banner" id="samlBanner">
    <span>Some images may require SAML authentication to display.</span>
    <button id="btnImportImages">Import Images</button>
    <button id="btnDismissSaml">Dismiss</button>
  </div>

  <!-- Name field -->
  <div class="form-group">
    <label>Name <span class="required">*</span></label>
    <div class="readonly-name" id="readonlyName">${name}</div>
    <input type="text" id="fieldName" class="edit-input" value="${escapeAttr(item.name)}" />
  </div>

  <!-- Description (TipTap rich-text editor) -->
  <div class="form-group">
    <label>Description</label>
    <div class="tiptap-toolbar" id="descToolbar">
      <button type="button" data-tt="toggleBold" title="Bold"><b>B</b></button>
      <button type="button" data-tt="toggleItalic" title="Italic"><i>I</i></button>
      <button type="button" data-tt="toggleUnderline" title="Underline"><u>U</u></button>
      <button type="button" data-tt="toggleStrike" title="Strikethrough"><s>S</s></button>
      <span class="tb-sep"></span>
      <button type="button" data-tt="toggleSubscript" title="Subscript">X₂</button>
      <button type="button" data-tt="toggleSuperscript" title="Superscript">X²</button>
      <span class="tb-sep"></span>
      <button type="button" data-tt="toggleBulletList" title="Bullet List">• List</button>
      <button type="button" data-tt="toggleOrderedList" title="Numbered List">1. List</button>
      <span class="tb-sep"></span>
      <button type="button" data-tt="toggleBlockquote" title="Blockquote">❝</button>
      <button type="button" data-tt="toggleCode" title="Code Block">&lt;/&gt;</button>
      <button type="button" data-tt="insertHorizontalRule" title="Horizontal Rule">—</button>
      <span class="tb-sep"></span>
      <button type="button" data-tt-heading="1" title="Heading 1">H1</button>
      <button type="button" data-tt-heading="2" title="Heading 2">H2</button>
      <button type="button" data-tt-heading="3" title="Heading 3">H3</button>
      <button type="button" data-tt="setParagraph" title="Paragraph">¶</button>
      <span class="tb-sep"></span>
      <button type="button" data-tt-align="left" title="Align Left">⫷</button>
      <button type="button" data-tt-align="center" title="Center">⫸⫷</button>
      <button type="button" data-tt-align="right" title="Align Right">⫸</button>
      <span class="tb-sep"></span>
      <button type="button" id="btnInsertTable" title="Insert Table">⊞</button>
      <button type="button" id="btnInsertLink" title="Insert Link">🔗</button>
      <span class="tb-sep"></span>
      <button type="button" data-tt="undo" title="Undo">↶</button>
      <button type="button" data-tt="redo" title="Redo">↷</button>
    </div>
    <div class="tiptap-container" id="descriptionEditor"></div>
    <!-- Hidden fallback for data transport -->
    <input type="hidden" id="fieldDescription" value="" />
  </div>

  <!-- Dynamic Fields from Schema -->
  ${dynamicFieldsHtml}

  <!-- Comments Section -->
  <div class="section">
    <div class="section-header" data-toggle-section>
      <span class="chevron">▾</span> Comments (${comments.length})
    </div>
    <div class="section-body">
      ${commentHtml || "<p style='color: var(--vscode-descriptionForeground)'>No comments yet.</p>"}
      <div class="add-comment">
        <input type="text" id="commentInput" placeholder="Add a comment..." />
        <button id="btnAddComment">Post</button>
      </div>
    </div>
  </div>

  <!-- Attachments Panel -->
  <div class="section">
    <div class="section-header" data-toggle-section>
      <span class="chevron">▾</span> Attachments <span class="att-count" id="attCount">(loading…)</span>
    </div>
    <div class="section-body">
      <div class="att-toolbar">
        <button class="secondary edit-only-att" id="btnAttUpload">+ Upload</button>
        <button class="secondary" id="btnAttSync">↻ Refresh</button>
      </div>
      <ul class="att-list" id="attList">
        <li style="color:var(--vscode-descriptionForeground)">Loading attachments…</li>
      </ul>
      <div class="att-drop-zone" id="attDropZone">
        Drop files here or click to upload
      </div>
    </div>
  </div>

  <!-- Custom Fields (JSON) -->
  <div class="section">
    <div class="section-header collapsed" data-toggle-section>
      <span class="chevron">▾</span> Custom Fields (JSON)
    </div>
    <div class="section-body hidden">
      <pre class="fields-json">${escapeHtml(fieldsJson)}</pre>
    </div>
  </div>
</div><!-- end .page-content -->

  <script src="${tiptapScriptUri}"></script>
  <script nonce="${nonce}">
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
      if (!mime) return '📎';
      if (mime.startsWith('image/')) return '🖼';
      if (mime.includes('pdf')) return '📄';
      if (mime.includes('zip') || mime.includes('compress') || mime.includes('tar')) return '📦';
      if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return '📊';
      if (mime.includes('document') || mime.includes('word')) return '📝';
      return '📎';
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
            '<button title="Download" data-att-download="' + a.id + '">⬇</button>' +
            '<button title="Replace" data-att-replace="' + a.id + '">↻</button>' +
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
      // WebView can't read dropped file bytes — ask extension to handle
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
      const descContent = ${JSON.stringify(description)};
      descriptionEditor = window.JamaTipTap.createEditor({
        element: document.getElementById('descriptionEditor'),
        content: descContent,
        editable: false, // starts locked; setEditable called on lock
        proxyBaseUrl: '${editorBaseUrl}',
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
</html>`;
}

// ---------- Helpers ----------

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function escapeHtml(text: string | undefined | null): string {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(text: string | undefined | null): string {
  if (text == null) return "";
  return String(text).replace(/"/g, "&quot;").replace(/&/g, "&amp;");
}

// ---------- Dynamic Form Builder ----------

function buildDynamicFields(
  fieldDefs: EditorFieldDefinition[],
  fieldValues: Record<string, unknown>,
  pickLists: Record<number, JamaPickListOption[]>
): string {
  if (fieldDefs.length === 0) {
    return "";
  }

  // Skip name and description — they have dedicated fields above
  const skipFields = new Set(["name", "description"]);

  const rows = fieldDefs
    .filter((fd) => !skipFields.has(fd.name))
    .map((fd) => renderFieldInput(fd, fieldValues[fd.name], pickLists));

  if (rows.length === 0) {
    return "";
  }

  return `
  <div class="section">
    <div class="section-header" data-toggle-section>
      <span class="chevron">▾</span> Fields (${rows.length})
    </div>
    <div class="section-body">
      ${rows.join("\n")}
    </div>
  </div>`;
}

function renderFieldInput(
  fd: EditorFieldDefinition,
  value: unknown,
  pickLists: Record<number, JamaPickListOption[]>
): string {
  const label = escapeHtml(fd.label);
  const fieldName = escapeAttr(fd.name);
  const requiredMark = fd.required ? ` <span class="required">*</span>` : "";
  const readOnlyClass = fd.readOnly ? " field-readonly" : "";
  const readOnlyAttr = fd.readOnly ? " disabled" : "";
  const trackAttr = fd.readOnly
    ? ""
    : ` data-track-field="${fieldName}"`;

  const strVal = value != null ? String(value) : "";
  const inputId = `dynField_${fd.name}`;

  let inputHtml: string;

  switch (fd.fieldType) {
    case "PICK_LIST": {
      const options = fd.pickList != null ? (pickLists[fd.pickList] ?? []) : [];
      const optionHtml = options
        .filter((o) => o.active !== false)
        .map((o) => {
          const optVal = escapeAttr(String(o.id));
          const optLabel = escapeHtml(o.name);
          const selected = String(o.id) === strVal ? " selected" : "";
          return `<option value="${optVal}"${selected}>${optLabel}</option>`;
        })
        .join("\n");
      inputHtml = `<select id="${inputId}" data-field-name="${fieldName}"${readOnlyAttr} data-track-field="${fieldName}">
        <option value="">(none)</option>
        ${optionHtml}
      </select>`;
      break;
    }

    case "MULTI_SELECT": {
      const options = fd.pickList != null ? (pickLists[fd.pickList] ?? []) : [];
      const selectedIds = Array.isArray(value) ? value.map(String) : [];
      const optionHtml = options
        .filter((o) => o.active !== false)
        .map((o) => {
          const optVal = escapeAttr(String(o.id));
          const optLabel = escapeHtml(o.name);
          const selected = selectedIds.includes(String(o.id)) ? " selected" : "";
          return `<option value="${optVal}"${selected}>${optLabel}</option>`;
        })
        .join("\n");
      inputHtml = `<select id="${inputId}" data-field-name="${fieldName}" multiple${readOnlyAttr} data-track-field="${fieldName}">
        ${optionHtml}
      </select>`;
      break;
    }

    case "BOOLEAN":
      inputHtml = `<input type="checkbox" id="${inputId}" data-field-name="${fieldName}"${value ? " checked" : ""}${readOnlyAttr} data-track-field="${fieldName}" />`;
      break;

    case "INTEGER":
    case "FLOAT":
      inputHtml = `<input type="number" id="${inputId}" data-field-name="${fieldName}" value="${escapeAttr(strVal)}"${readOnlyAttr}${trackAttr}${fd.fieldType === "INTEGER" ? ' step="1"' : ' step="any"'} />`;
      break;

    case "DATE":
      inputHtml = `<input type="date" id="${inputId}" data-field-name="${fieldName}" value="${escapeAttr(strVal)}"${readOnlyAttr}${trackAttr} />`;
      break;

    case "URL":
      inputHtml = `<input type="url" id="${inputId}" data-field-name="${fieldName}" value="${escapeAttr(strVal)}"${readOnlyAttr}${trackAttr} />`;
      break;

    case "RICHTEXT":
    case "DOCUMENT":
      // For now, render as textarea. TipTap integration in Phase 4.
      inputHtml = `<textarea id="${inputId}" data-field-name="${fieldName}"${readOnlyAttr}${trackAttr}>${escapeHtml(strVal)}</textarea>`;
      break;

    case "TEXT":
    default: {
      const maxLen = fd.maxLength ? ` maxlength="${fd.maxLength}"` : "";
      inputHtml = `<input type="text" id="${inputId}" data-field-name="${fieldName}" value="${escapeAttr(strVal)}"${readOnlyAttr}${maxLen}${trackAttr} />`;
      break;
    }
  }

  return `<div class="form-group">
    <label>${label}${requiredMark}</label>
    <div class="${readOnlyClass}">${inputHtml}</div>
  </div>`;
}

// ---------- Version & Draft Dropdown ----------

function buildVersionDraftDropdown(
  versions: JamaItemVersion[],
  drafts: EditorDraft[]
): string {
  if (versions.length === 0 && drafts.length === 0) {
    return "";
  }

  const versionOpts = versions
    .slice()
    .sort((a, b) => b.version_num - a.version_num)
    .map((v) => {
      const who = v.modified_by ? ` — ${escapeHtml(String(v.modified_by))}` : "";
      const date = v.created_date ? ` (${escapeHtml(v.created_date)})` : "";
      return `<option value="v:${v.version_num}">v${v.version_num}${who}${date}</option>`;
    })
    .join("\n");

  const draftOpts = drafts
    .slice()
    .sort((a, b) => b.draft_version - a.draft_version)
    .map((d) => {
      const ts = d.created_at
        ? new Date(d.created_at * 1000).toLocaleString()
        : "";
      const auto = d.is_autosave ? " (auto)" : "";
      return `<option value="d:${d.draft_version}">Draft #${d.draft_version}${auto} — ${escapeHtml(ts)}</option>`;
    })
    .join("\n");

  return `<select id="versionDraftSelect" style="max-width:200px">
    <option value="">Versions & Drafts…</option>
    ${versionOpts ? `<optgroup label="Server Versions">${versionOpts}</optgroup>` : ""}
    ${draftOpts ? `<optgroup label="Local Drafts">${draftOpts}</optgroup>` : ""}
  </select>`;
}
