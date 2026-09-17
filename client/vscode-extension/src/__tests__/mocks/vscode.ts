/**
 * Minimal vscode API mock for unit tests (vitest / Node, no Extension Host).
 *
 * Only the subset of the API actually used by the tree providers and panels is
 * mocked here. Add stubs as needed when new VS Code APIs are introduced.
 */

export class EventEmitter<T> {
  private listeners: Array<(value: T) => void> = [];

  get event() {
    return (listener: (value: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
  }

  fire(value: T): void {
    for (const l of this.listeners) l(value);
  }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  label: string;
  collapsibleState: TreeItemCollapsibleState;
  command?: { command: string; title: string; arguments?: unknown[] };
  contextValue?: string;
  description?: string;
  tooltip?: string;
  iconPath?: ThemeIcon;

  constructor(label: string, collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class ThemeIcon {
  constructor(public id: string) {}
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export enum ProgressLocation {
  Notification = 15,
  SourceControl = 1,
  Window = 10,
}

export const window = {
  showErrorMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  showQuickPick: vi.fn(),
  showInputBox: vi.fn(),
  createOutputChannel: vi.fn(() => ({ appendLine: vi.fn() })),
  createTreeView: vi.fn(() => ({ onDidChangeSelection: vi.fn(), dispose: vi.fn() })),
  registerWebviewViewProvider: vi.fn(),
  withProgress: vi.fn(),
};

export const commands = {
  registerCommand: vi.fn(),
  executeCommand: vi.fn(),
};

export const workspace = {
  getConfiguration: vi.fn(() => ({
    get: vi.fn(),
    update: vi.fn(),
  })),
};

export const env = {
  openExternal: vi.fn(),
};

export const Uri = {
  parse: vi.fn((s: string) => ({ toString: () => s })),
  joinPath: vi.fn((...args: unknown[]) => args.join('/')),
};
