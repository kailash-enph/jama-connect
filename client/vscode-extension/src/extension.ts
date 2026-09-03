import * as vscode from "vscode";
import { ApiClient, EditorApiClient, JamaTestPlan, JamaTestCycle, JamaTestRun } from "./api";
import { BackendManager } from "./backend";
import { SettingsPanel } from "./panels/SettingsPanel";
import { DbManagementPanel } from "./panels/DbManagementPanel";
import { ProjectSelector, ProjectTreeProvider, JamaTreeItem } from "./tree/projectTree";
import { TestRunnerTreeProvider } from "./tree/testRunnerTree";
import { JamaEditorProvider } from "./editor/jamaEditor";
import {
  getTestPlanDetailHtml,
  getTestCycleDetailHtml,
  getTestRunDetailHtml,
} from "./editor/testDetailHtml";

let backendManager: BackendManager | undefined;
let projectSelector: ProjectSelector | undefined;
let treeProvider: ProjectTreeProvider | undefined;
let testRunnerProvider: TestRunnerTreeProvider | undefined;
let editorProvider: JamaEditorProvider | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Jama Editor");
  outputChannel.appendLine("Jama Editor extension activating...");

  // Create API client
  const api = new ApiClient();

  // Create backend manager and auto-start if configured
  backendManager = new BackendManager();
  context.subscriptions.push(backendManager);

  // Create shared project selector (persists last selection)
  projectSelector = new ProjectSelector(api, context);

  // Create tree view provider (items)
  treeProvider = new ProjectTreeProvider(api, projectSelector);
  const treeView = vscode.window.createTreeView("jamaProjects", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Create test runner tree view
  testRunnerProvider = new TestRunnerTreeProvider(api, projectSelector);
  const testTreeView = vscode.window.createTreeView("jamaTestRunner", {
    treeDataProvider: testRunnerProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(testTreeView);

  // Create editor provider
  editorProvider = new JamaEditorProvider(api, context.extensionUri);
  context.subscriptions.push(editorProvider);

  // Register Settings webview panel
  const settingsPanel = new SettingsPanel(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SettingsPanel.viewType, settingsPanel)
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("jamaEditor.refreshTree", () => {
      treeProvider?.refresh();
    }),

    vscode.commands.registerCommand("jamaEditor.selectProject", async () => {
      await projectSelector?.pickProject();
    }),

    vscode.commands.registerCommand("jamaEditor.refreshTestRunner", () => {
      testRunnerProvider?.refresh();
    }),

    vscode.commands.registerCommand(
      "jamaEditor.openTestDetail",
      async (type: string, data: JamaTestPlan | JamaTestCycle | JamaTestRun) => {
        const editorApi = new EditorApiClient();
        const entityId = data.id;
        const entityName = (data as any).name || `${type} ${entityId}`;
        const label = type === "plan" ? "Test Plan" : type === "cycle" ? "Test Cycle" : "Test Run";

        const panel = vscode.window.createWebviewPanel(
          "jamaTestDetail",
          `${label}: ${entityName}`,
          vscode.ViewColumn.One,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "out", "webview")],
          }
        );

        // Render helper — reused after push to refresh with fresh Jama data
        async function renderPanel(freshData?: JamaTestPlan | JamaTestCycle | JamaTestRun) {
          const d = freshData ?? data;
          if (type === "plan") {
            const plan = d as JamaTestPlan;
            let cycles: JamaTestCycle[] = [];
            try { cycles = await api.getTestCycles(plan.id, true); } catch { /* ignore */ }
            let allRuns: JamaTestRun[] = [];
            try {
              const runArrays = await Promise.all(cycles.map(c => api.getTestRuns(c.id, true).catch(() => [] as JamaTestRun[])));
              allRuns = runArrays.flat();
            } catch { /* ignore */ }
            panel.webview.html = getTestPlanDetailHtml(panel.webview, context.extensionUri, plan, cycles, allRuns);
          } else if (type === "cycle") {
            const cycle = d as JamaTestCycle;
            let runs: JamaTestRun[] = [];
            try { runs = await api.getTestRuns(cycle.id, true); } catch { /* ignore */ }
            panel.webview.html = getTestCycleDetailHtml(panel.webview, context.extensionUri, cycle, runs);
          } else {
            panel.webview.html = getTestRunDetailHtml(panel.webview, context.extensionUri, d as JamaTestRun);
          }
        }

        // Initial render
        await renderPanel();

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(async (msg) => {
          try {
            if (msg.type === "edit") {
              // For test plans, try to acquire lock
              if (type === "plan") {
                try {
                  await editorApi.acquireTestPlanLock(entityId);
                } catch {
                  // Lock failure is non-fatal for test plans
                }
              }
              panel.webview.postMessage({ type: "setEditing", editing: true, message: "Editing..." });

            } else if (msg.type === "cancel") {
              if (type === "plan") {
                try { await editorApi.releaseTestPlanLock(entityId); } catch { /* ignore */ }
              }
              panel.webview.postMessage({ type: "setEditing", editing: false, message: "Cancelled" });

            } else if (msg.type === "openCycle" && msg.cycleId) {
              // Navigate: plan webview -> open cycle detail
              try {
                const plan = data as JamaTestPlan;
                const cycles = await api.getTestCycles(plan.id, true);
                const cycle = cycles.find((c: JamaTestCycle) => c.id === msg.cycleId);
                if (cycle) {
                  vscode.commands.executeCommand("jamaEditor.openTestDetail", "cycle", cycle);
                }
              } catch { /* ignore */ }
            } else if (msg.type === "openRun" && msg.runId) {
              // Navigate: cycle webview -> open run detail
              try {
                const cycle = data as JamaTestCycle;
                const runs = await api.getTestRuns(cycle.id, true);
                const run = runs.find((r: JamaTestRun) => r.id === msg.runId);
                if (run) {
                  vscode.commands.executeCommand("jamaEditor.openTestDetail", "run", run);
                }
              } catch { /* ignore */ }
            } else if (msg.type === "push") {
              const fields = msg.fields as Record<string, unknown>;
              try {
                let result;
                if (type === "plan") {
                  result = await editorApi.pushTestPlan(entityId, fields);
                } else if (type === "cycle") {
                  result = await editorApi.pushTestCycle(entityId, fields);
                } else {
                  result = await editorApi.pushTestRun(entityId, fields);
                }

                const statusMsg = result.status === "no_changes"
                  ? "No changes detected"
                  : `Pushed to Jama (v${result.version})`;

                // Release lock for test plans after push
                if (type === "plan") {
                  try { await editorApi.releaseTestPlanLock(entityId); } catch { /* ignore */ }
                }

                // Re-render panel with fresh data from Jama
                if (result.status !== "no_changes" && result.item) {
                  await renderPanel(result.item as unknown as JamaTestPlan | JamaTestCycle | JamaTestRun);
                } else {
                  panel.webview.postMessage({ type: "pushResult", success: true, message: statusMsg });
                }

                // Refresh tree
                testRunnerProvider?.refresh();
                vscode.window.showInformationMessage(`${label} ${entityName}: ${statusMsg}`);
              } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                panel.webview.postMessage({ type: "error", message: errMsg });
                vscode.window.showErrorMessage(`Push failed: ${errMsg}`);
              }
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            panel.webview.postMessage({ type: "error", message: errMsg });
          }
        });

        // Cleanup on close
        panel.onDidDispose(async () => {
          if (type === "plan") {
            try { await editorApi.releaseTestPlanLock(entityId); } catch { /* ignore */ }
          }
        });
      }
    ),

    vscode.commands.registerCommand(
      "jamaEditor.openItem",
      async (itemIdOrNode: number | JamaTreeItem, projectId?: number, name?: string, documentKey?: string) => {
        if (typeof itemIdOrNode === "object" && itemIdOrNode !== null && "itemId" in itemIdOrNode) {
          const node = itemIdOrNode as JamaTreeItem;
          await editorProvider?.openItem(
            node.itemId!,
            node.projectId!,
            (node.label as string) || "",
            node.documentKey ?? ""
          );
        } else {
          await editorProvider?.openItem(itemIdOrNode as number, projectId!, name!, documentKey!);
        }
      }
    ),

    vscode.commands.registerCommand("jamaEditor.syncProject", async (node?: JamaTreeItem) => {
      const projectId = node?.projectId ?? projectSelector?.selectedId;
      if (!projectId) {
        vscode.window.showWarningMessage("No project selected.");
        return;
      }
      try {
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Syncing project...`,
            cancellable: false,
          },
          async (progress) => {
            progress.report({ message: "Starting sync..." });
            await api.syncProject(projectId);
            progress.report({ message: "Sync complete, refreshing tree..." });
            treeProvider?.refresh();
            testRunnerProvider?.refresh();
          }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Sync failed: ${msg}`);
      }
    }),

    vscode.commands.registerCommand("jamaEditor.createItem", async (node: JamaTreeItem) => {
      const pId = node?.projectId ?? projectSelector?.selectedId;
      if (!pId || !node?.itemId) {
        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: "Enter name for the new item",
        placeHolder: "New Item",
      });
      if (!name) {
        return;
      }

      try {
        // Get item types to let user choose
        const itemTypes = await api.getItemTypes();
        const selected = await vscode.window.showQuickPick(
          itemTypes.map((t) => ({ label: t.display, id: t.id })),
          { placeHolder: "Select item type" }
        );
        if (!selected) {
          return;
        }

        await api.createItem(pId, selected.id, node.itemId, { name });
        vscode.window.showInformationMessage(`Item "${name}" created.`);
        treeProvider?.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Create failed: ${msg}`);
      }
    }),

    vscode.commands.registerCommand("jamaEditor.startBackend", async () => {
      const started = await backendManager?.start();
      if (started) {
        vscode.window.showInformationMessage("Jama backend started.");
        await projectSelector?.init();
      } else {
        vscode.window.showErrorMessage("Failed to start Jama backend. Check Output > Jama Backend.");
      }
    }),

    vscode.commands.registerCommand("jamaEditor.stopBackend", async () => {
      await backendManager?.stop();
      vscode.window.showInformationMessage("Jama backend stopped.");
    }),

    vscode.commands.registerCommand("jamaEditor.searchItems", async () => {
      const query = await vscode.window.showInputBox({
        prompt: "Search Jama items",
        placeHolder: "Enter search query...",
      });
      if (!query) {
        return;
      }

      try {
        const results = await api.search(query);
        if (results.length === 0) {
          vscode.window.showInformationMessage("No results found.");
          return;
        }

        const selected = await vscode.window.showQuickPick(
          results.map((r) => ({
            label: `${r.document_key} — ${r.name}`,
            description: r.doc_type,
            detail: r.snippet,
            itemId: r.entity_id,
            projectId: r.project_id,
            name: r.name,
            documentKey: r.document_key,
          })),
          { placeHolder: `${results.length} results for "${query}"` }
        );
        if (selected) {
          await editorProvider?.openItem(
            selected.itemId,
            selected.projectId,
            selected.name,
            selected.documentKey
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Search failed: ${msg}`);
      }
    }),

    // Clear attachment cache
    vscode.commands.registerCommand("jamaEditor.clearAttachmentCache", async () => {
      try {
        const editorApi = editorProvider?.getEditorApi();
        if (!editorApi) {
          vscode.window.showErrorMessage("Editor backend not available.");
          return;
        }
        const result = await editorApi.clearAttachmentCache();
        vscode.window.showInformationMessage(
          `Attachment cache cleared: ${result.files_deleted} files, ${(result.bytes_freed / 1024 / 1024).toFixed(1)} MB freed.`
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Clear cache failed: ${msg}`);
      }
    }),

    // Set JSESSIONID for web UI image downloads
    vscode.commands.registerCommand("jamaEditor.setSessionCookie", async () => {
      try {
        const editorApi = editorProvider?.getEditorApi();
        if (!editorApi) {
          vscode.window.showErrorMessage("Editor backend not available.");
          return;
        }

        // Check if already authenticated
        const status = await editorApi.sessionStatus();
        if (status.authenticated) {
          const action = await vscode.window.showInformationMessage(
            "Session cookie is already set. Update it?",
            "Update", "Clear", "Cancel"
          );
          if (action === "Clear") {
            await editorApi.clearSession();
            vscode.window.showInformationMessage("Session cookie cleared.");
            return;
          }
          if (action !== "Update") { return; }
        }

        const jsessionid = await vscode.window.showInputBox({
          prompt: "Paste JSESSIONID from browser (F12 → Application → Cookies → enphase.jamacloud.com)",
          placeHolder: "e.g. 1A2B3C4D5E6F...",
          password: true,
          ignoreFocusOut: true,
        });
        if (!jsessionid) { return; }

        const result = await editorApi.setSessionCookie(jsessionid);
        if (result.valid) {
          vscode.window.showInformationMessage("✓ Session cookie set — images downloading in background.");
        } else {
          vscode.window.showWarningMessage("Cookie saved but could not be validated. It may be expired — try copying a fresh one.");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Set session cookie failed: ${msg}`);
      }
    }),

    // Incremental sync (changed items only)
    vscode.commands.registerCommand("jamaEditor.incrementalSync", async () => {
      const projectId = projectSelector?.selectedId;
      if (!projectId) {
        vscode.window.showWarningMessage("No project selected. Use 'Jama: Select Project' first.");
        return;
      }
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Jama: Incremental sync...`,
            cancellable: false,
          },
          async (progress) => {
            progress.report({ message: "Syncing changed items..." });
            await api.incrementalSync(projectId);
            progress.report({ message: "Done — refreshing tree..." });
            treeProvider?.refresh();
            testRunnerProvider?.refresh();
            vscode.window.showInformationMessage("Incremental sync complete.");
          }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Incremental sync failed: ${msg}`);
      }
    }),

    // Prefetch all images
    vscode.commands.registerCommand("jamaEditor.prefetchImages", async () => {
      try {
        const editorApi = editorProvider?.getEditorApi();
        if (!editorApi) {
          vscode.window.showErrorMessage("Editor backend not available.");
          return;
        }
        const result = await editorApi.triggerPrefetch();
        vscode.window.showInformationMessage(result.message);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Prefetch failed: ${msg}`);
      }
    }),

    // Show session & image prefetch status
    vscode.commands.registerCommand("jamaEditor.sessionStatus", async () => {
      try {
        const editorApi = editorProvider?.getEditorApi();
        if (!editorApi) {
          vscode.window.showErrorMessage("Editor backend not available.");
          return;
        }
        const session = await editorApi.sessionStatus();
        const prefetch = await editorApi.prefetchStatus();

        const lines = [
          `Session: ${session.authenticated ? "✓ Authenticated" : "✗ Not set"}`,
          `Cookie: ${session.has_cookie ? "Present" : "Missing"}`,
          `Image Prefetch: ${prefetch.status} — ${prefetch.message}`,
        ];
        vscode.window.showInformationMessage(lines.join("  |  "));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Status check failed: ${msg}`);
      }
    }),

    // Clear image cache
    vscode.commands.registerCommand("jamaEditor.clearImageCache", async () => {
      try {
        const editorApi = editorProvider?.getEditorApi();
        if (!editorApi) {
          vscode.window.showErrorMessage("Editor backend not available.");
          return;
        }
        const result = await editorApi.clearImageCache();
        vscode.window.showInformationMessage(
          `Image cache cleared: ${result.files_deleted} files, ${(result.bytes_freed / 1024 / 1024).toFixed(1)} MB freed.`
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Clear image cache failed: ${msg}`);
      }
    }),

    // Upload attachment to a Jama item (image, report, etc.)
    vscode.commands.registerCommand("jamaEditor.uploadAttachment", async (itemId?: number) => {
      try {
        const editorApi = editorProvider?.getEditorApi();
        if (!editorApi) {
          vscode.window.showErrorMessage("Editor backend not available.");
          return;
        }

        // If no item ID, ask user
        if (!itemId) {
          const input = await vscode.window.showInputBox({
            prompt: "Enter Jama item ID to attach file to",
            placeHolder: "e.g. 7598533",
          });
          if (!input) { return; }
          itemId = parseInt(input, 10);
          if (isNaN(itemId)) {
            vscode.window.showErrorMessage("Invalid item ID.");
            return;
          }
        }

        // File picker
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          openLabel: "Upload to Jama",
          filters: {
            "Images": ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"],
            "Reports": ["pdf", "xlsx", "docx", "csv", "html"],
            "All Files": ["*"],
          },
        });
        if (!uris || uris.length === 0) { return; }

        const filePath = uris[0].fsPath;
        const fileName = filePath.split(/[\\/]/).pop() || "attachment";

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Uploading ${fileName}...`,
            cancellable: false,
          },
          async (progress) => {
            progress.report({ message: "Uploading to Jama..." });
            const result = await editorApi.uploadItemAttachment(itemId!, filePath, fileName);
            vscode.window.showInformationMessage(
              `Uploaded "${fileName}" to item ${itemId} (attachment ID: ${result.attachment_id})`
            );
          }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Upload failed: ${msg}`);
      }
    }),

    // Open Settings panel in the sidebar
    vscode.commands.registerCommand("jamaEditor.openSettings", async () => {
      await vscode.commands.executeCommand("jamaSettingsView.focus");
    }),

    // Open Database Management panel
    vscode.commands.registerCommand("jamaEditor.manageProjectDbs", () => {
      DbManagementPanel.show(context.extensionUri);
    })
  );

  // Auto-start backend
  const config = vscode.workspace.getConfiguration("jamaEditor");
  if (config.get<boolean>("autoStartBackend", true)) {
    const started = await backendManager.start();
    if (started) {
      outputChannel.appendLine("Backend ready. Loading project tree...");

      // Initialize project selector (loads project list, restores last selection)
      await projectSelector.init();
      if (projectSelector.selectedId) {
        outputChannel.appendLine(
          `Restored last project: ${projectSelector.selectedName} (${projectSelector.selectedId})`
        );
      }

      // Stale lock detection: check for dirty items from previous session
      try {
        const editorApi = editorProvider?.getEditorApi();
        if (editorApi) {
          const dirtyResp = await editorApi.getDirtyItems();
          if (dirtyResp.count > 0) {
            const items = dirtyResp.items as Array<{ item_id: number; lock_held: number }>;
            const lockedItems = items.filter((i) => i.lock_held);
            if (lockedItems.length > 0) {
              const ids = lockedItems.map((i) => i.item_id).join(", ");
              outputChannel.appendLine(`Stale locks detected: items ${ids}`);
              const action = await vscode.window.showWarningMessage(
                `${lockedItems.length} item(s) have stale locks from a previous session (${ids}). Release them?`,
                "Release All",
                "Ignore"
              );
              if (action === "Release All") {
                for (const item of lockedItems) {
                  try {
                    await editorApi.releaseLock(item.item_id);
                    outputChannel.appendLine(`Released stale lock: item ${item.item_id}`);
                  } catch {
                    outputChannel.appendLine(`Failed to release lock: item ${item.item_id}`);
                  }
                }
              }
            }

            // Also check for pending uploads to retry
            const pendingResp = await editorApi.getPendingUploads();
            if (pendingResp.count > 0) {
              outputChannel.appendLine(`${pendingResp.count} pending upload(s) found from previous session.`);
              const retryAction = await vscode.window.showInformationMessage(
                `${pendingResp.count} attachment upload(s) were interrupted. Retry?`,
                "Retry",
                "Dismiss"
              );
              if (retryAction === "Retry") {
                await editorApi.retryPendingUploads();
                outputChannel.appendLine("Pending uploads retried.");
              }
            }
          }
        }
      } catch {
        outputChannel.appendLine("Stale lock check skipped (editor backend may still be initializing).");
      }
      // Offer to install as login service if not already set up
      backendManager.offerServiceInstall();

      // Onboarding checks: credentials and project
      try {
        const credStatus = await backendManager.apiClient.getCredentialStatus();
        if (!credStatus.configured) {
          const action = await vscode.window.showWarningMessage(
            "Jama API credentials are not configured. Open Settings to set them up?",
            "Open Settings"
          );
          if (action === "Open Settings") {
            vscode.commands.executeCommand("jamaEditor.openSettings");
          }
        }
      } catch {
        outputChannel.appendLine("Onboarding: credential check skipped (backend may still be initializing).");
      }
    } else {
      outputChannel.appendLine("Backend failed to start. Use 'Jama: Start Backend' command.");
    }
  }

  outputChannel.appendLine("Jama Editor extension activated.");
}

export function deactivate(): void {
  backendManager?.dispose();
  editorProvider?.dispose();
}
