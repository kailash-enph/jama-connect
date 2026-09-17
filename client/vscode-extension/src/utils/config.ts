import * as vscode from "vscode";
import * as path from "path";

export interface JamaEditorConfig {
  backendPath: string;
  port: number;
  /** @deprecated Editor is now mounted at /editor/ on the main port. */
  editorPort: number;
  jamaUrl: string;
  autoStartBackend: boolean;
  uvPath: string;
}

/**
 * Read extension settings from VS Code configuration.
 * If `backendPath` is empty, auto-detect relative to the extension install path.
 */
export function getConfig(): JamaEditorConfig {
  const cfg = vscode.workspace.getConfiguration("jamaEditor");
  let backendPath = cfg.get<string>("backendPath", "");

  if (!backendPath) {
    // Auto-detect: extension lives in tools/jama-connect/client/vscode-extension/out/
    // Backend lives in tools/jama-connect/client/backend/
    const extDir = path.resolve(__dirname, "..");  // vscode-extension/
    backendPath = path.join(extDir, "..", "backend");
  }

  return {
    backendPath,
    port: cfg.get<number>("port", 8765),
    editorPort: cfg.get<number>("editorPort", 8766),
    jamaUrl: cfg.get<string>("jamaUrl", "https://enphase.jamacloud.com"),
    autoStartBackend: cfg.get<boolean>("autoStartBackend", true),
    uvPath: cfg.get<string>("uvPath", "uv"),
  };
}

/**
 * Get the base URL for the REST API backend.
 */
export function getApiBaseUrl(): string {
  const cfg = getConfig();
  return `http://localhost:${cfg.port}`;
}

/**
 * @deprecated Editor routes are now served under /editor/ on the main backend.
 * Use `getApiBaseUrl() + "/editor"` instead.
 */
export function getEditorApiBaseUrl(): string {
  return `${getApiBaseUrl()}/editor`;
}
