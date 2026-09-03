import * as vscode from "vscode";
import {
  ApiClient, EditorApiClient, JamaItem,
  EditorFieldDefinition, JamaPickListOption, JamaItemVersion, EditorDraft,
} from "../api";
import { getEditorHtml } from "./editorHtml";
import { getConfig } from "../utils/config";

const AUTOSAVE_INTERVAL_MS = 5_000;
// Matches both REST API URLs (/rest/v1/attachments/{id}/file) and web UI URLs (/attachment/{id}/filename)
const JAMA_IMG_RE = /https?:\/\/[^"'\s]*?\/(?:rest\/v1\/(?:attachments|files)\/(\d+)(?:\/file)?|attachment\/(\d+)\/[^"'\s]*)/gi;

function getEditorBaseUrl(): string {
  return `http://localhost:${getConfig().port}/editor`;
}

function rewriteImageUrls(html: string): string {
  const base = getEditorBaseUrl();
  return html.replace(JAMA_IMG_RE, (_match, restId, webId) => {
    const id = restId || webId;
    return `${base}/api/proxy/image/${id}`;
  });
}

/**
 * Custom editor provider that opens Jama items in WebView-based editor tabs.
 *
 * Phase 2 behaviour:
 *   - Lock-on-open via editor backend (mounted at /editor/ on unified backend)
 *   - Autosave to local drafts every 5 s
 *   - Push to Jama (version-checked PUT + clear drafts)
 *   - Field-level undo (5 entries per item)
 *   - Max 5 concurrent editor tabs
 *   - Unlock-on-close
 */
export class JamaEditorProvider implements vscode.Disposable {
  public static readonly viewType = "jamaEditor.itemEditor";

  private panels: Map<number, vscode.WebviewPanel> = new Map();
  private autosaveTimers: Map<number, ReturnType<typeof setInterval>> = new Map();
  private serverVersions: Map<number, number> = new Map();
  private api: ApiClient;
  private editorApi: EditorApiClient;
  private extensionUri: vscode.Uri;

  constructor(api: ApiClient, extensionUri: vscode.Uri) {
    this.api = api;
    this.editorApi = new EditorApiClient();
    this.extensionUri = extensionUri;
  }

  get openTabCount(): number {
    return this.panels.size;
  }

  getEditorApi(): EditorApiClient {
    return this.editorApi;
  }

  /**
   * Open (or focus) an editor tab for the given Jama item.
   */
  async openItem(
    itemId: number,
    projectId: number,
    name: string,
    documentKey: string
  ): Promise<void> {
    // Reuse existing panel if already open
    const existing = this.panels.get(itemId);
    if (existing) {
      existing.reveal(vscode.ViewColumn.One);
      return;
    }

    // Open read-only by default — user clicks Edit to acquire lock
    const panel = vscode.window.createWebviewPanel(
      JamaEditorProvider.viewType,
      `${documentKey} — ${name}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "media"),
          vscode.Uri.joinPath(this.extensionUri, "out"),
        ],
      }
    );

    this.panels.set(itemId, panel);

    // Unlock and cleanup on close
    panel.onDidDispose(async () => {
      this.stopAutosave(itemId);
      this.panels.delete(itemId);
      this.serverVersions.delete(itemId);
      // Release lock silently
      try {
        await this.editorApi.releaseLock(itemId);
      } catch {
        // Best-effort unlock
      }
    });

    // Handle messages from the WebView
    panel.webview.onDidReceiveMessage(async (msg) => {
      try {
        await this.handleWebviewMessage(panel, itemId, projectId, msg);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[jama-editor] Error handling message '${msg?.type}': ${errMsg}`);
        vscode.window.showErrorMessage(`Jama Editor error: ${errMsg}`);
      }
    });

    // Load item data (with live sync progress)
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Syncing item from Jama…", cancellable: false },
      () => this.loadItem(panel, itemId, projectId)
    );

    // Open in read-only mode by default
    panel.webview.postMessage({
      type: "lockState",
      locked: false,
      editable: false,
    });
  }

  dispose(): void {
    // Stop all autosave timers
    for (const [itemId] of this.autosaveTimers) {
      this.stopAutosave(itemId);
    }
    // Release all locks silently and close panels
    for (const [itemId, panel] of this.panels) {
      this.editorApi.releaseLock(itemId).catch(() => {});
      panel.dispose();
    }
    this.panels.clear();
    this.serverVersions.clear();
  }

  // ---------- Autosave ----------

  private startAutosave(itemId: number, panel: vscode.WebviewPanel): void {
    this.stopAutosave(itemId);
    const timer = setInterval(() => {
      // Request current form state from the WebView
      panel.webview.postMessage({ type: "requestAutosave" });
    }, AUTOSAVE_INTERVAL_MS);
    this.autosaveTimers.set(itemId, timer);
  }

  private stopAutosave(itemId: number): void {
    const timer = this.autosaveTimers.get(itemId);
    if (timer) {
      clearInterval(timer);
      this.autosaveTimers.delete(itemId);
    }
  }

  // ---------- Private ----------

  private async loadItem(
    panel: vscode.WebviewPanel,
    itemId: number,
    projectId: number
  ): Promise<void> {
    try {
      // Always fetch live from Jama → update cache → display
      let item: JamaItem;
      let liveSyncOk = true;
      try {
        item = await this.api.getItem(itemId, true);
      } catch {
        liveSyncOk = false;
        item = await this.api.getItem(itemId);
      }
      const [comments, transitions] = await Promise.all([
        this.api.getItemComments(itemId).catch(() => []),
        this.api.getWorkflowTransitions(itemId).catch(() => []),
      ]);
      if (!liveSyncOk) {
        vscode.window.showWarningMessage("Could not sync from Jama — showing cached data.");
      }

      // Track server version for conflict detection
      this.serverVersions.set(itemId, item.version ?? 0);

      const fields = item.fields_json ? JSON.parse(item.fields_json) : {};

      // Fetch schema (field definitions) from editor backend
      let fieldDefinitions: EditorFieldDefinition[] = [];
      let pickListOptions: Record<number, JamaPickListOption[]> = {};
      try {
        const itemTypeId = item.item_type;
        if (itemTypeId) {
          const schemaResp = await this.editorApi.getFieldDefinitions(itemTypeId);
          fieldDefinitions = schemaResp.fields ?? [];

          // Collect pick list IDs and fetch options in parallel
          const pickListIds = fieldDefinitions
            .filter((fd) => fd.pickList != null)
            .map((fd) => fd.pickList as number);
          const uniqueIds = [...new Set(pickListIds)];
          if (uniqueIds.length > 0) {
            const plResults = await Promise.all(
              uniqueIds.map((plId) =>
                this.editorApi.getPickListOptions(plId).catch(() => [])
              )
            );
            uniqueIds.forEach((plId, idx) => {
              const r = plResults[idx];
              pickListOptions[plId] = Array.isArray(r) ? r : (r?.options ?? []);
            });
          }
        }
      } catch {
        // Schema fetch failed — render without dynamic fields
      }

      // Fetch versions (non-critical)
      let versions: JamaItemVersion[] = [];
      try {
        const vResp = await this.api.getItemVersions(itemId);
        versions = vResp ?? [];
      } catch {
        // Non-critical
      }

      // Fetch all local drafts (non-critical)
      let drafts: EditorDraft[] = [];
      let draftFields = fields;
      let draftDescription = item.description ?? "";
      let hasDraft = false;
      try {
        const draftsResp = await this.editorApi.getDrafts(itemId);
        drafts = draftsResp.drafts ?? [];
        // Restore latest draft if available
        const latest = await this.editorApi.getLatestDraft(itemId);
        if (latest && latest.fields_json) {
          draftFields = JSON.parse(latest.fields_json);
          draftDescription = latest.description_html ?? draftDescription;
          hasDraft = true;
        }
      } catch {
        // No drafts
      }

      // Rewrite Jama attachment URLs → editor-backend proxy for image loading
      const renderedDescription = rewriteImageUrls(draftDescription);

      panel.webview.html = getEditorHtml(panel.webview, this.extensionUri, {
        item: { ...item, description: renderedDescription },
        fields: draftFields,
        comments,
        transitions,
        projectId,
        fieldDefinitions,
        pickListOptions,
        versions,
        drafts,
      });

      if (hasDraft) {
        panel.webview.postMessage({ type: "draftRestored" });
      }

      // Auto-load attachments (non-blocking)
      this.editorApi.syncAttachments(itemId).then((r) => {
        panel.webview.postMessage({ type: "attachmentsLoaded", attachments: r.attachments });
      }).catch(() => {/* non-critical */});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to load item ${itemId}: ${msg}`);
      panel.webview.html = `<html><body><h2>Error loading item</h2><pre>${msg}</pre></body></html>`;
    }
  }

  private async handleWebviewMessage(
    panel: vscode.WebviewPanel,
    itemId: number,
    projectId: number,
    msg: WebviewMessage
  ): Promise<void> {
    if (msg.type !== "autosaveData" && msg.type !== "fieldChanged") {
      console.log(`[jama-editor] Received message: ${msg.type} for item ${itemId}`);
    }
    switch (msg.type) {
      // ---- Autosave: WebView responds with current form data ----
      case "autosaveData": {
        try {
          const sv = this.serverVersions.get(itemId) ?? 0;
          await this.editorApi.saveDraft(
            itemId,
            sv,
            JSON.stringify(msg.fields ?? {}),
            msg.descriptionHtml ?? "",
            true
          );
        } catch {
          // Silent — autosave failures are non-critical
        }
        break;
      }

      // ---- Push to Jama (replaces old "save") ----
      case "push": {
        try {
          const sv = this.serverVersions.get(itemId) ?? 0;
          const result = await this.editorApi.pushToJama(
            itemId,
            msg.fields ?? {},
            sv
          );
          this.serverVersions.set(itemId, result.version);
          vscode.window.showInformationMessage(
            `Pushed to Jama → v${result.version}`
          );
          await this.loadItem(panel, itemId, projectId);
          panel.webview.postMessage({ type: "pushComplete", success: true, version: result.version });
          vscode.commands.executeCommand("jamaEditor.refreshTree");
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          // Check for version conflict
          if (errMsg.includes("version_conflict")) {
            const action = await vscode.window.showWarningMessage(
              "Item was modified on the server. Overwrite or reload?",
              "Force Push",
              "Reload Server Version"
            );
            if (action === "Force Push") {
              // Re-push without version check
              try {
                const result = await this.editorApi.pushToJama(itemId, msg.fields ?? {});
                this.serverVersions.set(itemId, result.version);
                vscode.window.showInformationMessage(`Force-pushed → v${result.version}`);
                await this.loadItem(panel, itemId, projectId);
                panel.webview.postMessage({ type: "pushComplete", success: true, version: result.version });
                vscode.commands.executeCommand("jamaEditor.refreshTree");
              } catch (err2: unknown) {
                const e2 = err2 instanceof Error ? err2.message : String(err2);
                vscode.window.showErrorMessage(`Force push failed: ${e2}`);
              }
            } else if (action === "Reload Server Version") {
              await this.loadItem(panel, itemId, projectId);
            }
          } else {
            vscode.window.showErrorMessage(`Push failed: ${errMsg}`);
            panel.webview.postMessage({ type: "pushComplete", success: false, error: errMsg });
          }
        }
        break;
      }

      // ---- Undo (field-level, from editor_db) ----
      case "undo": {
        try {
          const entry = await this.editorApi.popUndo(itemId);
          panel.webview.postMessage({
            type: "undoApply",
            fieldName: entry.field_name,
            value: entry.old_value,
          });
        } catch {
          vscode.window.showInformationMessage("Nothing to undo.");
        }
        break;
      }

      // ---- Track field change for undo stack ----
      case "fieldChanged": {
        try {
          await this.editorApi.pushUndo(
            itemId,
            msg.fieldName ?? "",
            msg.oldValue ?? null,
            msg.newValue ?? null
          );
        } catch {
          // Silent
        }
        break;
      }

      // ---- Revert to server version ----
      case "revert": {
        try {
          await this.editorApi.clearDrafts(itemId);
        } catch {
          // Non-critical
        }
        await this.loadItem(panel, itemId, projectId);
        break;
      }

      // ---- Edit (acquire lock, only one item editable at a time) ----
      case "edit": {
        // Check if another item is already being edited
        if (this.autosaveTimers.size > 0) {
          const editingId = this.autosaveTimers.keys().next().value;
          if (editingId !== itemId) {
            vscode.window.showWarningMessage(
              `Another item is already being edited. Unlock it first before editing this one.`
            );
            break;
          }
        }
        // Try to acquire lock, but enable editing regardless
        let lockMsg = "";
        try {
          await this.editorApi.acquireLock(itemId);
          lockMsg = "Lock acquired — editing enabled.";
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          lockMsg = errMsg.includes("workflow")
            ? "Item is workflow-locked on Jama — editing locally."
            : `Could not lock on Jama — editing locally. (${errMsg.slice(0, 80)})`;
        }
        this.startAutosave(itemId, panel);
        panel.webview.postMessage({
          type: "lockState",
          locked: true,
          editable: true,
        });
        vscode.window.showInformationMessage(lockMsg);
        break;
      }

      // ---- Unlock (release lock, go read-only) ----
      case "unlock": {
        try {
          await this.editorApi.releaseLock(itemId);
          this.stopAutosave(itemId);
          panel.webview.postMessage({
            type: "lockState",
            locked: false,
            editable: false,
          });
          vscode.window.showInformationMessage("Read-only mode — item unlocked.");
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Unlock failed: ${errMsg}`);
        }
        break;
      }

      // ---- Workflow Transition ----
      case "transition": {
        try {
          const comment = await vscode.window.showInputBox({
            prompt: "Transition comment (optional)",
            placeHolder: "Enter a comment for this workflow transition...",
          });
          await this.api.executeWorkflowTransition(
            itemId,
            msg.transitionId ?? "",
            comment ?? ""
          );
          vscode.window.showInformationMessage("Workflow transition applied.");
          await this.loadItem(panel, itemId, projectId);
          vscode.commands.executeCommand("jamaEditor.refreshTree");
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Transition failed: ${errMsg}`);
        }
        break;
      }

      // ---- Add Comment ----
      case "addComment": {
        try {
          await this.api.addItemComment(itemId, msg.text ?? "");
          await this.loadItem(panel, itemId, projectId);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Comment failed: ${errMsg}`);
        }
        break;
      }

      // ---- Load a specific server version (read-only view) ----
      case "loadVersion": {
        try {
          const ver = msg.version ?? 0;
          if (ver <= 0) { break; }
          const verItem = await this.api.getItemAtVersion(itemId, ver);
          if (verItem) {
            const verFields = verItem.fields_json ? JSON.parse(verItem.fields_json) : {};
            // Send versioned data to WebView for display
            panel.webview.postMessage({
              type: "versionData",
              version: ver,
              fields: verFields,
              descriptionHtml: verItem.description_html ?? "",
            });
            panel.webview.postMessage({ type: "lockState", locked: false, editable: false });
            vscode.window.showInformationMessage(`Viewing server version ${ver} (read-only).`);
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to load version: ${errMsg}`);
        }
        break;
      }

      // ---- Image upload & embed (from paste/drop in TipTap) ----
      case "imageUpload": {
        try {
          // WebView can't send file bytes via postMessage, so prompt user
          const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: "Upload Image",
            filters: { Images: ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"] },
          });
          if (!fileUri || fileUri.length === 0) { break; }
          const filePath = fileUri[0].fsPath;
          // Upload via editor backend
          const result = await this.editorApi.uploadAttachment(itemId, filePath, msg.fileName ?? "");
          if (result?.attachmentId) {
            const proxyUrl = `${getEditorBaseUrl()}/api/proxy/image/${result.attachmentId}`;
            panel.webview.postMessage({ type: "insertImage", src: proxyUrl, alt: msg.fileName ?? "" });
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Image upload failed: ${errMsg}`);
        }
        break;
      }

      // ---- Load a local draft ----
      case "loadDraft": {
        try {
          const dv = msg.draftVersion ?? 0;
          if (dv <= 0) { break; }
          const draft = await this.editorApi.getDraft(itemId, dv);
          if (draft && draft.fields_json) {
            const draftFields = JSON.parse(draft.fields_json);
            // Update form fields via undoApply messages
            for (const [key, val] of Object.entries(draftFields)) {
              panel.webview.postMessage({
                type: "undoApply",
                fieldName: key,
                value: val != null ? String(val) : "",
              });
            }
            vscode.window.showInformationMessage(`Restored draft #${dv}.`);
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to load draft: ${errMsg}`);
        }
        break;
      }

      // ---- Attachment panel messages ----
      case "syncAttachments": {
        try {
          const result = await this.editorApi.syncAttachments(itemId);
          panel.webview.postMessage({ type: "attachmentsLoaded", attachments: result.attachments });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to sync attachments: ${errMsg}`);
        }
        break;
      }

      case "uploadAttachment": {
        try {
          const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: "Upload Attachment",
          });
          if (!fileUri || fileUri.length === 0) { break; }
          const filePath = fileUri[0].fsPath;
          const fileName = filePath.split(/[\\/]/).pop() ?? "";
          await this.editorApi.uploadAttachment(itemId, filePath, fileName);
          vscode.window.showInformationMessage(`Uploaded "${fileName}".`);
          // Refresh list
          const refreshed = await this.editorApi.syncAttachments(itemId);
          panel.webview.postMessage({ type: "attachmentsLoaded", attachments: refreshed.attachments });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Upload failed: ${errMsg}`);
        }
        break;
      }

      case "downloadAttachment": {
        try {
          const attId = msg.attachmentId ?? 0;
          if (attId <= 0) { break; }
          const downloadUrl = `${getEditorBaseUrl()}/api/attachments/${attId}/download`;
          await vscode.env.openExternal(vscode.Uri.parse(downloadUrl));
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Download failed: ${errMsg}`);
        }
        break;
      }

      case "deleteAttachment": {
        vscode.window.showWarningMessage("Deleting attachments is not allowed from this app.");
        break;
      }

      case "importImages": {
        try {
          // Re-fetch item live and rewrite image URLs to proxy
          const freshItem = await this.api.getItem(itemId, true);
          const desc = freshItem?.description ?? "";
          const rewritten = rewriteImageUrls(desc);
          panel.webview.postMessage({ type: "updateDescription", html: rewritten });
        } catch {
          vscode.window.showErrorMessage("Failed to import images.");
        }
        break;
      }

      case "replaceAttachment": {
        try {
          const attId = msg.attachmentId ?? 0;
          if (attId <= 0) { break; }
          const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: "Replace Attachment",
          });
          if (!fileUri || fileUri.length === 0) { break; }
          const filePath = fileUri[0].fsPath;
          const fileName = filePath.split(/[\\/]/).pop() ?? "";
          await this.editorApi.replaceAttachment(attId, filePath, fileName);
          vscode.window.showInformationMessage(`Replaced with "${fileName}".`);
          const refreshed = await this.editorApi.syncAttachments(itemId);
          panel.webview.postMessage({ type: "attachmentsLoaded", attachments: refreshed.attachments });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Replace failed: ${errMsg}`);
        }
        break;
      }
    }
  }
}

// ---------- Message Types ----------

interface WebviewMessage {
  type: string;
  fields?: Record<string, unknown>;
  descriptionHtml?: string;
  locked?: boolean;
  transitionId?: string;
  text?: string;
  fieldName?: string;
  oldValue?: string | null;
  newValue?: string | null;
  version?: number;
  draftVersion?: number;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  attachmentId?: number;
}
