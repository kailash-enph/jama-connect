import * as vscode from "vscode";
import { ApiClient, JamaProject, JamaTreeNode } from "../api";

const LAST_PROJECT_KEY = "jamaEditor.lastProjectId";

/**
 * Shared project selection state.
 * Both tree providers (items + test runner) react to changes.
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

  /** Load project list and restore last selection. */
  async init(): Promise<void> {
    try {
      this._projects = await this.api.getProjects();
    } catch {
      this._projects = [];
    }
    const lastId = this.ctx.workspaceState.get<number>(LAST_PROJECT_KEY);
    if (lastId && this._projects.some((p) => p.id === lastId)) {
      this._selectedId = lastId;
      this._selectedName =
        this._projects.find((p) => p.id === lastId)?.name ?? "";
    }
    this._onDidChange.fire(this._selectedId);
  }

  /** Show QuickPick with all projects and set the selection. */
  async pickProject(): Promise<void> {
    if (this._projects.length === 0) {
      try {
        this._projects = await this.api.getProjects();
      } catch {
        vscode.window.showErrorMessage("Failed to load projects.");
        return;
      }
    }

    const items = this._projects
      .filter((p) => !p.is_folder)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        label: p.name,
        description: p.project_key,
        detail: p.synced_at > 0 ? "synced" : "not synced",
        projectId: p.id,
      }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a Jama project",
      matchOnDescription: true,
    });
    if (!selected) {
      return;
    }

    this._selectedId = selected.projectId;
    this._selectedName = selected.label;
    await this.ctx.workspaceState.update(LAST_PROJECT_KEY, this._selectedId);
    this._onDidChange.fire(this._selectedId);
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
 * Shows the selected project's item tree (no project-level nodes).
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
  private treeCache: JamaTreeNode[] = [];

  constructor(api: ApiClient, selector: ProjectSelector) {
    this.api = api;
    this.selector = selector;

    // React to project selection changes
    selector.onDidChange(() => {
      this.treeCache = [];
      this._onDidChangeTreeData.fire();
    });
  }

  refresh(): void {
    this.treeCache = [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: JamaTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: JamaTreeItem): Promise<JamaTreeItem[]> {
    const projectId = this.selector.selectedId;
    if (!projectId) {
      // No project selected — show a prompt item
      const item = new JamaTreeItem(
        "Select a project...",
        vscode.TreeItemCollapsibleState.None
      );
      item.command = {
        command: "jamaEditor.selectProject",
        title: "Select Project",
      };
      item.iconPath = new vscode.ThemeIcon("folder-opened");
      return [item];
    }

    if (!element) {
      // Root: load project item tree
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

  private async getProjectItems(
    projectId: number
  ): Promise<JamaTreeItem[]> {
    try {
      if (this.treeCache.length === 0) {
        this.treeCache = await this.api.getItemTree(projectId);
      }
      return this.treeCache.map((node) =>
        this.nodeToTreeItem(node, projectId)
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to load project tree: ${msg}`);
      return [];
    }
  }

  private getItemChildren(
    projectId: number,
    parentId: number
  ): JamaTreeItem[] {
    const parent = this.findNode(this.treeCache, parentId);
    if (!parent || !parent.children) {
      return [];
    }
    return parent.children.map((node) =>
      this.nodeToTreeItem(node, projectId)
    );
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

  private nodeToTreeItem(
    node: JamaTreeNode,
    projectId: number
  ): JamaTreeItem {
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

    // Double-click opens the item in the custom editor
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
