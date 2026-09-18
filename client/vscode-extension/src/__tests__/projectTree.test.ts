/**
 * Unit tests for ProjectSelector and ProjectTreeProvider.
 *
 * These tests run in Node via vitest with a vscode mock — no Extension Host
 * required. They cover every behaviour that has broken in production:
 *
 *  1. treeCache null-sentinel: getItemTree called exactly once after project
 *     switch even when the API returns [].
 *  2. Project switch fires onDidChange and clears cache.
 *  3. setProjectById updates selectedId, persists it, and fires onDidChange.
 *  4. Empty-cache hint item shown (not a silent blank tree).
 *  5. setProjectById is a no-op when called with the same id+name (dedup).
 *  6. init() prefers backend active_project_id over workspaceState.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectSelector, ProjectTreeProvider, JamaTreeItem } from "../tree/projectTree";
import { TreeItemCollapsibleState } from "./mocks/vscode";
import type { JamaTreeNode } from "../api";

// ---------- helpers ----------

function makeWorkspaceState(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  return {
    get: vi.fn((key: string) => store[key]),
    update: vi.fn(async (key: string, val: unknown) => { store[key] = val; }),
    _store: store,
  };
}

function makeApi(treeNodes: JamaTreeNode[] = [], projects: any[] = [], activeProjectId?: number) {
  return {
    getProjects: vi.fn(async () => projects),
    getItemTree: vi.fn(async (_id: number) => treeNodes),
    getSettings: vi.fn(async () => ({ active_project_id: activeProjectId ?? null })),
  };
}

function makeNode(id: number, name: string, hasChildren = false): JamaTreeNode {
  return {
    id,
    name,
    document_key: `DOC-${id}`,
    item_type: 1,
    item_type_display: "Requirement",
    parent_id: null,
    has_children: hasChildren,
    level: 0,
    section_label: "1",
    children: hasChildren ? [makeNode(id * 10, `Child of ${name}`)] : [],
  };
}

// ---------- ProjectSelector ----------

describe("ProjectSelector", () => {
  it("init(): fires onDidChange with undefined when no saved project", async () => {
    const api = makeApi([], []);
    const ctx = { workspaceState: makeWorkspaceState() } as any;
    const sel = new ProjectSelector(api as any, ctx);

    const fired: Array<number | undefined> = [];
    sel.onDidChange((id) => fired.push(id));

    await sel.init();
    expect(fired).toEqual([undefined]);
    expect(sel.selectedId).toBeUndefined();
  });

  it("init(): restores last project id from workspaceState", async () => {
    const project = { id: 20570, name: "IQ Battery R5", project_key: "IQ_BATT_R5", is_folder: 0, parent_id: null, description: "", synced_at: 1 };
    const api = makeApi([], [project]);
    const ctx = { workspaceState: makeWorkspaceState({ "jamaEditor.lastProjectId": 20570 }) } as any;
    const sel = new ProjectSelector(api as any, ctx);

    await sel.init();
    expect(sel.selectedId).toBe(20570);
    expect(sel.selectedName).toBe("IQ Battery R5");
  });

  it("setProjectById(): updates selectedId, persists, fires onDidChange", async () => {
    const api = makeApi();
    const ws = makeWorkspaceState();
    const ctx = { workspaceState: ws } as any;
    const sel = new ProjectSelector(api as any, ctx);

    const fired: Array<number | undefined> = [];
    sel.onDidChange((id) => fired.push(id));

    sel.setProjectById(20570, "IQ Battery R5");

    expect(sel.selectedId).toBe(20570);
    expect(sel.selectedName).toBe("IQ Battery R5");
    expect(ws.update).toHaveBeenCalledWith("jamaEditor.lastProjectId", 20570);
    expect(fired).toEqual([20570]);
  });

  it("setProjectById(): is a no-op (no event) when called with same id+name", () => {
    const api = makeApi();
    const ctx = { workspaceState: makeWorkspaceState() } as any;
    const sel = new ProjectSelector(api as any, ctx);

    sel.setProjectById(20570, "Project A");
    const fired: number[] = [];
    sel.onDidChange((id) => fired.push(id as number));

    // Same id+name → no-op, no event fired
    sel.setProjectById(20570, "Project A");
    expect(fired).toHaveLength(0);
  });

  it("setProjectById(): fires event when name changes even if id is same", () => {
    const api = makeApi();
    const ctx = { workspaceState: makeWorkspaceState() } as any;
    const sel = new ProjectSelector(api as any, ctx);

    sel.setProjectById(20570, "Old Name");
    const fired: string[] = [];
    sel.onDidChange(() => fired.push(sel.selectedName));

    sel.setProjectById(20570, "New Name");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toBe("New Name");
  });

  it("init(): prefers backend active_project_id over workspaceState", async () => {
    const p1 = { id: 20570, name: "Project A", project_key: "A", is_folder: 0, parent_id: null, description: "", synced_at: 1 };
    const p2 = { id: 99999, name: "Project B", project_key: "B", is_folder: 0, parent_id: null, description: "", synced_at: 1 };
    // Backend says active = 99999; workspaceState says 20570
    const api = makeApi([], [p1, p2], 99999);
    const ctx = { workspaceState: makeWorkspaceState({ "jamaEditor.lastProjectId": 20570 }) } as any;
    const sel = new ProjectSelector(api as any, ctx);

    await sel.init();

    // Backend wins
    expect(sel.selectedId).toBe(99999);
    expect(sel.selectedName).toBe("Project B");
  });
});

// ---------- ProjectTreeProvider ----------

describe("ProjectTreeProvider", () => {
  let api: ReturnType<typeof makeApi>;
  let selector: ProjectSelector;
  let provider: ProjectTreeProvider;

  beforeEach(() => {
    api = makeApi();
    const ctx = { workspaceState: makeWorkspaceState() } as any;
    selector = new ProjectSelector(api as any, ctx);
    provider = new ProjectTreeProvider(api as any, selector);
  });

  // ── cache sentinel ────────────────────────────────────────────────────────

  it("calls getItemTree exactly once even when API returns []", async () => {
    selector.setProjectById(1, "Empty Project");

    // API returns []
    api.getItemTree.mockResolvedValue([]);

    // Simulate VS Code calling getChildren twice (e.g. initial render + visibility change)
    await provider.getChildren(undefined);
    await provider.getChildren(undefined);

    expect(api.getItemTree).toHaveBeenCalledTimes(1);
  });

  it("does NOT re-fetch on subsequent getChildren calls after data is loaded", async () => {
    selector.setProjectById(20570, "IQ Battery R5");
    api.getItemTree.mockResolvedValue([makeNode(1, "Root")]);

    await provider.getChildren(undefined);
    await provider.getChildren(undefined);
    await provider.getChildren(undefined);

    expect(api.getItemTree).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after project switch (cache reset to null)", async () => {
    api.getItemTree.mockResolvedValue([makeNode(1, "Root")]);

    selector.setProjectById(20570, "Project A");
    await provider.getChildren(undefined);          // fetch #1

    selector.setProjectById(99999, "Project B");    // triggers cache reset
    await provider.getChildren(undefined);          // fetch #2

    expect(api.getItemTree).toHaveBeenCalledTimes(2);
    expect(api.getItemTree).toHaveBeenNthCalledWith(1, 20570);
    expect(api.getItemTree).toHaveBeenNthCalledWith(2, 99999);
  });

  it("re-fetches after manual refresh()", async () => {
    selector.setProjectById(20570, "IQ Battery R5");
    api.getItemTree.mockResolvedValue([makeNode(1, "Root")]);

    await provider.getChildren(undefined);
    provider.refresh();
    await provider.getChildren(undefined);

    expect(api.getItemTree).toHaveBeenCalledTimes(2);
  });

  // ── empty-project hint ───────────────────────────────────────────────────

  it("shows hint item (not blank) when project has no cached data", async () => {
    selector.setProjectById(99, "Unsynced Project");
    api.getItemTree.mockResolvedValue([]);

    const items = await provider.getChildren(undefined);

    expect(items).toHaveLength(1);
    expect((items[0] as JamaTreeItem).label).toContain("no items cached");
    expect((items[0] as JamaTreeItem).command?.command).toBe("jamaEditor.manageProjectDbs");
  });

  it("hint item is not collapsible", async () => {
    selector.setProjectById(99, "Unsynced Project");
    api.getItemTree.mockResolvedValue([]);

    const [hint] = await provider.getChildren(undefined);
    expect((hint as JamaTreeItem).collapsibleState).toBe(TreeItemCollapsibleState.None);
  });

  // ── no project selected ──────────────────────────────────────────────────

  it("shows 'No active project' hint when no project selected", async () => {
    const items = await provider.getChildren(undefined);
    expect(items).toHaveLength(1);
    expect((items[0] as JamaTreeItem).label).toBe("No active project");
    // Directs user to Settings panel, not project picker
    expect((items[0] as JamaTreeItem).command?.command).toBe("jamaEditor.openSettings");
  });

  // ── normal tree rendering ────────────────────────────────────────────────

  it("returns tree items for project root nodes", async () => {
    selector.setProjectById(20570, "IQ Battery R5");
    api.getItemTree.mockResolvedValue([
      makeNode(1, "L0 Requirements", true),
      makeNode(2, "L1 System Reqs", false),
    ]);

    const items = await provider.getChildren(undefined);
    expect(items).toHaveLength(2);
    expect((items[0] as JamaTreeItem).label).toBe("L0 Requirements");
    expect((items[0] as JamaTreeItem).collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
    expect((items[1] as JamaTreeItem).collapsibleState).toBe(TreeItemCollapsibleState.None);
  });

  it("returns children from treeCache for expanded items", async () => {
    selector.setProjectById(20570, "IQ Battery R5");
    api.getItemTree.mockResolvedValue([makeNode(100, "Parent", true)]);

    await provider.getChildren(undefined);  // populates cache

    const parentItem = new JamaTreeItem("Parent", TreeItemCollapsibleState.Collapsed);
    parentItem.itemId = 100;
    parentItem.projectId = 20570;
    parentItem.contextValue = "jamaFolder";

    const children = await provider.getChildren(parentItem);
    expect(children).toHaveLength(1);
    expect((children[0] as JamaTreeItem).itemId).toBe(1000);
  });

  // ── onDidChange propagation ──────────────────────────────────────────────

  it("fires onDidChangeTreeData when project changes", () => {
    const fired: number[] = [];
    provider.onDidChangeTreeData(() => fired.push(1));

    selector.setProjectById(20570, "Project A");
    selector.setProjectById(99999, "Project B");

    expect(fired).toHaveLength(2);
  });

  it("fires onDidChangeTreeData on refresh()", () => {
    const fired: number[] = [];
    provider.onDidChangeTreeData(() => fired.push(1));

    provider.refresh();
    expect(fired).toHaveLength(1);
  });
});
