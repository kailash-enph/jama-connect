import * as vscode from "vscode";
import {
  ApiClient,
  JamaTestPlan,
  JamaTestCycle,
  JamaTestRun,
} from "../api";
import { ProjectSelector } from "./projectTree";

/**
 * VS Code TreeDataProvider for Jama Test Plans → Cycles → Runs.
 * Shows test hierarchy for the currently selected project.
 */
export class TestRunnerTreeProvider
  implements vscode.TreeDataProvider<TestTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TestTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private api: ApiClient;
  private selector: ProjectSelector;

  constructor(api: ApiClient, selector: ProjectSelector) {
    this.api = api;
    this.selector = selector;

    // React to project selection changes
    selector.onDidChange(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TestTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TestTreeItem): Promise<TestTreeItem[]> {
    const projectId = this.selector.selectedId;
    if (!projectId) {
      const item = new TestTreeItem(
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
      // Root: list test plans
      return this.getTestPlans(projectId);
    }

    if (element.contextValue === "jamaTestPlan") {
      return this.getTestCycles(element.testPlanId!);
    }

    if (element.contextValue === "jamaTestCycle") {
      return this.getTestRuns(element.testCycleId!);
    }

    return [];
  }

  // ---------- Private ----------

  private async getTestPlans(projectId: number): Promise<TestTreeItem[]> {
    try {
      const plans = await this.api.getTestPlans(projectId, true);
      if (plans.length === 0) {
        const empty = new TestTreeItem(
          "No test plans",
          vscode.TreeItemCollapsibleState.None
        );
        empty.iconPath = new vscode.ThemeIcon("info");
        return [empty];
      }
      return plans.map((plan) => {
        const item = new TestTreeItem(
          plan.name,
          vscode.TreeItemCollapsibleState.Collapsed
        );
        item.contextValue = "jamaTestPlan";
        item.testPlanId = plan.id;
        item.testPlanData = plan;
        item.description = plan.status;
        item.tooltip = `${plan.name}\nStatus: ${plan.status}`;
        item.iconPath = new vscode.ThemeIcon("test-view-icon");
        item.command = {
          command: "jamaEditor.openTestDetail",
          title: "Open Test Plan",
          arguments: ["plan", plan],
        };
        return item;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to load test plans: ${msg}`);
      return [];
    }
  }

  private async getTestCycles(planId: number): Promise<TestTreeItem[]> {
    try {
      const cycles = await this.api.getTestCycles(planId, true);
      if (cycles.length === 0) {
        const empty = new TestTreeItem(
          "No test cycles",
          vscode.TreeItemCollapsibleState.None
        );
        empty.iconPath = new vscode.ThemeIcon("info");
        return [empty];
      }
      return cycles.map((cycle) => {
        const item = new TestTreeItem(
          cycle.name,
          vscode.TreeItemCollapsibleState.Collapsed
        );
        item.contextValue = "jamaTestCycle";
        item.testCycleId = cycle.id;
        item.testPlanId = planId;
        item.testCycleData = cycle;
        item.description = cycle.status;
        item.tooltip = `${cycle.name}\nStatus: ${cycle.status}`;
        item.iconPath = new vscode.ThemeIcon("symbol-event");
        item.command = {
          command: "jamaEditor.openTestDetail",
          title: "Open Test Cycle",
          arguments: ["cycle", cycle],
        };
        return item;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to load test cycles: ${msg}`);
      return [];
    }
  }

  private async getTestRuns(cycleId: number): Promise<TestTreeItem[]> {
    try {
      const runs = await this.api.getTestRuns(cycleId, true);
      if (runs.length === 0) {
        const empty = new TestTreeItem(
          "No test runs",
          vscode.TreeItemCollapsibleState.None
        );
        empty.iconPath = new vscode.ThemeIcon("info");
        return [empty];
      }
      return runs.map((run) => {
        const item = new TestTreeItem(
          run.name,
          vscode.TreeItemCollapsibleState.None
        );
        item.contextValue = "jamaTestRun";
        item.testRunId = run.id;
        item.testCycleId = cycleId;
        item.testRunData = run;
        item.description = run.status;
        item.tooltip = `${run.name}\nStatus: ${run.status}\nAssigned: ${run.assigned_to ?? "unassigned"}`;
        item.iconPath = this.getStatusIcon(run.status);

        // Click opens the test run detail view
        item.command = {
          command: "jamaEditor.openTestDetail",
          title: "Open Test Run",
          arguments: ["run", run],
        };

        return item;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to load test runs: ${msg}`);
      return [];
    }
  }

  private getStatusIcon(status: string): vscode.ThemeIcon {
    const s = status.toUpperCase();
    if (s === "PASSED") {
      return new vscode.ThemeIcon(
        "testing-passed-icon",
        new vscode.ThemeColor("testing.iconPassed")
      );
    }
    if (s === "FAILED") {
      return new vscode.ThemeIcon(
        "testing-failed-icon",
        new vscode.ThemeColor("testing.iconFailed")
      );
    }
    if (s === "BLOCKED") {
      return new vscode.ThemeIcon(
        "testing-skipped-icon",
        new vscode.ThemeColor("testing.iconSkipped")
      );
    }
    if (s === "NOT_RUN" || s === "NOT RUN") {
      return new vscode.ThemeIcon("testing-unset-icon");
    }
    if (s === "IN_PROGRESS" || s === "INPROGRESS") {
      return new vscode.ThemeIcon(
        "testing-queued-icon",
        new vscode.ThemeColor("testing.iconQueued")
      );
    }
    return new vscode.ThemeIcon("circle-outline");
  }
}

/**
 * Custom TreeItem for test hierarchy.
 */
export class TestTreeItem extends vscode.TreeItem {
  testPlanId?: number;
  testCycleId?: number;
  testRunId?: number;
  testPlanData?: JamaTestPlan;
  testCycleData?: JamaTestCycle;
  testRunData?: JamaTestRun;
}
