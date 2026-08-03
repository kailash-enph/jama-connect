import * as vscode from "vscode";
import { ChildProcess, spawn, execSync } from "child_process";
import * as path from "path";
import { getConfig } from "./utils/config";
import { ApiClient } from "./api";

/**
 * Manages the lifecycle of the unified Jama backend process.
 * Single FastAPI process on port 8765 serving MCP viewer API + editor API
 * (editor routes mounted at /editor/).
 * Auto-starts on activation, health-checks via /api/health, restarts on crash.
 */
export class BackendManager implements vscode.Disposable {
  private process: ChildProcess | null = null;
  private statusBar: vscode.StatusBarItem;
  private outputChannel: vscode.OutputChannel;
  apiClient: ApiClient;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private _isRunning = false;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel("Jama Backend");
    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      50
    );
    this.statusBar.command = "jamaEditor.openSettings";
    this.apiClient = new ApiClient();
    this.updateStatus("stopped");
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /** @deprecated Editor is now part of the unified backend. Always returns isRunning. */
  get editorIsRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Start the unified Python backend process.
   */
  async start(): Promise<boolean> {
    if (this.process) {
      this.outputChannel.appendLine("[backend] Already running, skipping start.");
      return true;
    }

    const cfg = getConfig();
    const port = cfg.port;

    // Check if a backend is already running on the port
    this.apiClient = new ApiClient(`http://localhost:${port}`);
    if (await this.apiClient.healthCheck()) {
      this.outputChannel.appendLine(
        `[backend] Backend already running on port ${port}.`
      );
      this._isRunning = true;
      this.updateStatus("running");
      this.startHealthCheck();
      return true;
    }

    this.updateStatus("starting");
    this.outputChannel.appendLine(
      `[backend] Starting unified backend on port ${port} from ${cfg.backendPath}...`
    );

    // Build environment — credentials are stored in OS keyring via Settings API,
    // no need to inject them as env vars. The backend reads them from keyring on startup.
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      JAMA_URL: cfg.jamaUrl,
      JAMA_REST_PORT: String(port),
    };

    try {
      this.process = spawn(
        cfg.uvPath,
        ["run", "--link-mode=copy", "python", "-m", "jama_mcp_v2", "--rest-only", "--port", String(port)],
        {
          cwd: cfg.backendPath,
          env,
          stdio: ["ignore", "pipe", "pipe"],
          shell: true,
        }
      );

      this.process.stdout?.on("data", (data: Buffer) => {
        this.outputChannel.append(data.toString());
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        this.outputChannel.append(data.toString());
      });

      this.process.on("error", (err) => {
        this.outputChannel.appendLine(`[backend] Process error: ${err.message}`);
        this._isRunning = false;
        this.process = null;
        this.updateStatus("error");
      });

      this.process.on("exit", (code, signal) => {
        this.outputChannel.appendLine(
          `[backend] Process exited (code=${code}, signal=${signal})`
        );
        this._isRunning = false;
        this.process = null;
        this.updateStatus("stopped");
      });

      // Poll until the backend responds on /api/health
      const ready = await this.waitForReady(port, 30_000);
      if (ready) {
        this._isRunning = true;
        this.outputChannel.appendLine("[backend] Unified backend ready.");
        this.updateStatus("running");
        this.startHealthCheck();
        return true;
      } else {
        this.outputChannel.appendLine("[backend] Timed out waiting for backend.");
        this.updateStatus("error");
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(`[backend] Failed to start: ${msg}`);
      this.updateStatus("error");
      return false;
    }
  }

  /**
   * Stop the backend process.
   * Tries graceful REST API shutdown first, falls back to SIGTERM.
   */
  async stop(): Promise<void> {
    this.stopHealthCheck();

    // Try graceful shutdown via REST API
    if (this._isRunning) {
      try {
        const cfg = getConfig();
        await fetch(`http://localhost:${cfg.port}/settings/server/stop`, { method: "POST" });
        this.outputChannel.appendLine("[backend] Graceful stop requested via API.");
        // Wait briefly for process to exit
        await sleep(2_000);
      } catch {
        this.outputChannel.appendLine("[backend] API stop failed, falling back to SIGTERM.");
      }
    }

    if (this.process) {
      this.outputChannel.appendLine("[backend] Stopping process...");
      this.process.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (this.process) {
            this.process.kill("SIGKILL");
          }
          resolve();
        }, 5_000);
        this.process?.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      this.process = null;
    }
    this._isRunning = false;
    this.updateStatus("stopped");
    this.outputChannel.appendLine("[backend] Backend stopped.");
  }

  /**
   * Restart the backend.
   */
  async restart(): Promise<boolean> {
    await this.stop();
    return this.start();
  }

  dispose(): void {
    this.stopHealthCheck();
    if (this.process) {
      this.process.kill("SIGKILL");
      this.process = null;
    }
    this.statusBar.dispose();
    this.outputChannel.dispose();
  }

  // ---------- Private ----------

  private async waitForReady(port: number, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    const client = new ApiClient(`http://localhost:${port}`);
    while (Date.now() - start < timeoutMs) {
      if (await client.healthCheck()) {
        return true;
      }
      await sleep(1_000);
    }
    return false;
  }

  /**
   * Check if a login service is installed (Windows Task Scheduler or macOS Launch Agent).
   */
  hasLoginService(): boolean {
    try {
      if (process.platform === "win32") {
        const result = execSync(
          'schtasks /Query /TN "JamaMCPBackend" 2>nul',
          { encoding: "utf-8", windowsHide: true }
        );
        return result.includes("JamaMCPBackend");
      } else if (process.platform === "darwin") {
        const result = execSync(
          'launchctl list 2>/dev/null | grep com.enphase.jama-backend',
          { encoding: "utf-8", shell: "/bin/bash" }
        );
        return result.includes("com.enphase.jama-backend");
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Offer to install the backend as a login service
   * (Windows Task Scheduler or macOS Launch Agent).
   */
  async offerServiceInstall(): Promise<void> {
    if (this.hasLoginService()) {
      return; // already installed
    }

    const platform = process.platform;
    if (platform !== "win32" && platform !== "darwin") {
      return; // Linux / other — deferred
    }

    const action = await vscode.window.showInformationMessage(
      "Jama backend can start automatically at login. Install as a login service?",
      "Install",
      "Not Now"
    );
    if (action !== "Install") {
      return;
    }

    const cfg = getConfig();
    const terminal = vscode.window.createTerminal("Jama Service Install");
    terminal.show();

    if (platform === "win32") {
      const scriptPath = path.join(cfg.backendPath, "scripts", "install-service.ps1");
      terminal.sendText(`powershell -ExecutionPolicy Bypass -File "${scriptPath}" -Port ${cfg.port}`);
    } else {
      const scriptPath = path.join(cfg.backendPath, "scripts", "install-service.sh");
      terminal.sendText(`bash "${scriptPath}" --port ${cfg.port}`);
    }
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthTimer = setInterval(async () => {
      if (!(await this.apiClient.healthCheck())) {
        this.outputChannel.appendLine("[backend] Health check failed.");
        this._isRunning = false;
        this.updateStatus("error");
        // Attempt auto-restart
        if (getConfig().autoStartBackend) {
          this.outputChannel.appendLine("[backend] Attempting auto-restart...");
          this.process = null;
          await this.start();
        }
      }
    }, 30_000);
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  private updateStatus(state: "starting" | "running" | "stopped" | "error"): void {
    const icons: Record<string, string> = {
      starting: "$(loading~spin)",
      running: "$(check)",
      stopped: "$(circle-slash)",
      error: "$(error)",
    };
    this.statusBar.text = `${icons[state]} Jama`;
    this.statusBar.tooltip = `Jama Backend: ${state}`;
    this.statusBar.show();
  }
}

// ---------- Helpers ----------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
