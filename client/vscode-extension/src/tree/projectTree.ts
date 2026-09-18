import * as vscode from "vscode";
import { ApiClient, JamaProject, JamaTreeNode } from "../api";

const LAST_PROJECT_KEY = "jamaEditor.lastProjectId";

/**
 * Shared project selection state — always mirrors the backend's active project.
 *
 * Single source of truth: POST /settings/project/select on the backend.
 * The backend fires an SSE active_project_changed event that all clients
 * (VS Code extension, web viewer, MCP) subscribe to and react to.
 *
 * Project selection UI lives ONLY in the Settings panel.
 * The tree views display the active project name as a read-only label.
 */
export class ProjectSelector {
  private _onDidChange = new vscode.EventEmitter<number | undefined>();
  readonly onDidChange = this._onDidChange.event;

  private _selectedId: number | undefined;
  private _selectedName = "";
  private _projects: JamaProject[] = [];

  constructor(
    private api: ApiClient,
    private ctx: vscode.ExtensionContext
  ) {}

  get selectedId(): number | undefined {
    return this._selectedId;
  }
  get selectedName(): string {
    return this._selectedName;
  }
  get projects(): JamaProject[] {
    return this._projects;
  }

  /** Load project list and restore active project from backend settings. */
  async init(): Promise<void> {
    try {
      this._projects = await this.api.getProjects();
    } catch {
      this._projects = [];
    }

    // Prefer backend's persisted active_project_id over local workspaceState
    try {
      const settings = await this.api.getSettings();
      const backendId = settings?.active_project_id;
      if (backendId && this._projects.some((p) => p.id === backendId)) {
        this._selectedId = backendId;
        this._selectedName =
          this._projects.find((p) => p.id === backendId)?.name ?? "";
        await this.ctx.workspaceState.update(LAST_PROJECT_KEY, backendId);
        this._onDidChange.fire(this._selectedId);
        return;
      }
    } catch {
      /* fall through to local state */
    }

    const lastId = this.ctx.workspaceState.get<number>(LAST_PROJECT_KEY);
    if (lastId && this._projects.some((p) => p.id === lastId)) {
      this._selectedId = lastId;
      this._selectedName =
        this._projects.find((p) => p.id === lastId)?.name ?? "";
    }
    this._onDidChange.fire(this._selectedId);
  }

  /**
   * Called by SSE listener (extension.ts) when backend fires
   * active_project_changed.  Updates local state and fires onDidChange
   * so both tree views reload immediately.
   */
  setProjectById(id: number, name: string): void {
    if (this._selectedId === id && this._selectedName === name) {
      return; // no-op — already correct
    }
    this._selectedId = id;
    this._selectedName = name;
    this.ctx.workspaceState.update(LAST_PROJECT_KEY, id);
    this._onDidChange.fire(id);
  }

  /** Refresh the project list from API. */
  async refreshProjects(): Promise<void> {
    try {
      this._projects = await this.api.getProjects();
    } catch {
      /* keep stale list */
    }
  }
}

/**
 * VS Code TreeDataProvider for Jama items.
 *
 * Shows the active project's item tree (from ProjectDb via REST).
 * The tree title bar has Refresh + Sync buttons; project selection is
 * in the Settings panel only.
 */
export class ProjectTreeProvider
  implements vscode.TreeDataProvider<JamaTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    JamaTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private api: ApiClient;
  private selector: ProjectSelector;
  // null  = not yet fetched for this project
  // []    = fetched but no cached items (show "sync to load" hint)
  // [...] = items loaded
  private treeCache: JamaTreeNode[] | null = null;

  constructor(api: ApiClient, selector: ProjectSelector) {
    this.api = api;
    this.selector = selector;

    // React to project selection changes — reset cache so new project loads
    selector.onDidChange(() => {
      this.treeCache = null;
      this._onDidChangeTreeData.fire();
    });
  }

  refresh(): void {
    this.treeCache = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: JamaTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: JamaTreeItem): Promise<JamaTreeItem[]> {
    const projectId = this.selector.selectedId;
    if (!projectId) {
      // No active project — prompt user to set one in Settings
      const item = new JamaTreeItem(
        "No active project",
        vscode.TreeItemCollapsibleState.None
      );
      item.description = "Set one in Settings → Status";
      item.command = {
        command: "jamaEditor.openSettings",
        title: "Open Settings",
      };
      item.iconPath = new vscode.ThemeIcon("info");
      return [item];
    }

    if (!element) {
      return this.getProjectItems(projectId);
    }

    if (
      element.contextValue === "jamaFolder" ||
      element.contextValue === "jamaItem"
    ) {
      return this.getItemChildren(projectId, element.itemId!);
    }

    return [];
  }

  // ---------- Private ----------

  private async getProjectItems(projectId: number): Promise<JamaTreeItem[]> {
    try {
      if (this.treeCache === null) {
        this.treeCache = await this.api.getItemTree(projectId);
      }
      if (this.treeCache.length === 0) {
        const hint = new JamaTreeItem(
          `${this.selector.selectedName || "Project"} — no items cached`,
          vscode.TreeItemCollapsibleState.None
        );
        hint.description = "Use Sync button or DB Manager to load";
        hint.iconPath = new vscode.ThemeIcon("cloud-download");
        hint.command = {
          command: "jamaEditor.manageProjectDbs",
          title: "Manage Project Databases",
        };
        return [hint];
      }
      return this.treeCache.map((node) => this.nodeToTreeItem(node, projectId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to load project tree: ${msg}`);
      return [];
    }
  }

  private getItemChildren(projectId: number, parentId: number): JamaTreeItem[] {
    const parent = this.findNode(this.treeCache ?? [], parentId);
    if (!parent || !parent.children) {
      return [];
    }
    return parent.children.map((node) => this.nodeToTreeItem(node, projectId));
  }

  private findNode(
    nodes: JamaTreeNode[],
    id: number
  ): JamaTreeNode | undefined {
    for (const node of nodes) {
      if (node.id === id) {
        return node;
      }
      if (node.children) {
        const found = this.findNode(node.children, id);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  private nodeToTreeItem(node: JamaTreeNode, projectId: number): JamaTreeItem {
    const hasChildren =
      node.has_children && node.children && node.children.length > 0;
    const collapsible = hasChildren
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

    const item = new JamaTreeItem(node.name, collapsible);
    item.projectId = projectId;
    item.itemId = node.id;
    item.documentKey = node.document_key;
    item.description = `${node.document_key} · ${node.item_type_display}`;
    item.tooltip = `${node.section_label} ${node.document_key} — ${node.name}`;
    item.contextValue = hasChildren ? "jamaFolder" : "jamaItem";
    item.iconPath = this.getItemIcon(node.item_type_display);

    item.command = {
      command: "jamaEditor.openItem",
      title: "Open Item",
      arguments: [node.id, projectId, node.name, node.document_key],
    };

    return item;
  }

  private getItemIcon(typeDisplay: string): vscode.ThemeIcon {
    const lower = typeDisplay.toLowerCase();
    if (lower.includes("requirement")) {
      return new vscode.ThemeIcon("checklist");
    }
    if (lower.includes("test")) {
      return new vscode.ThemeIcon("beaker");
    }
    if (lower.includes("component")) {
      return new vscode.ThemeIcon("symbol-class");
    }
    if (lower.includes("set") || lower.includes("folder")) {
      return new vscode.ThemeIcon("folder");
    }
    if (lower.includes("text")) {
      return new vscode.ThemeIcon("file-text");
    }
    return new vscode.ThemeIcon("symbol-misc");
  }
}

/**
 * Custom TreeItem that carries Jama metadata.
 */
export class JamaTreeItem extends vscode.TreeItem {
  projectId?: number;
  itemId?: number;
  documentKey?: string;
}
