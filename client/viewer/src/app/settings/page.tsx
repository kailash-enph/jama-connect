"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Key,
  Cookie,
  FolderTree,
  Server,
  Database,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Power,
  RotateCcw,
  Eye,
  EyeOff,
  Network,
  HardDrive,
} from "lucide-react";
import {
  getBackendHealth,
  getCredentialStatus,
  setCredentials,
  clearCredentials,
  testCredentials,
  getSessionStatus,
  setSession,
  clearSession,
  getSettingsProjects,
  selectProject,
  restartServer,
  stopServer,
  getCacheStats,
  clearCache,
  getDbStatus,
  deleteProjectDb,
  setCacheServerUrl,
  pingCacheServer,
  type BackendHealth,
  type CredentialStatus,
  type SessionStatus,
  type CacheStats,
  type Project,
  type ProjectDbInfo,
} from "@/lib/api";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function SettingsPage() {
  const router = useRouter();
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [credStatus, setCredStatus] = useState<CredentialStatus | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkedSetup, setCheckedSetup] = useState(false);

  // Credential form
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [credMsg, setCredMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [credLoading, setCredLoading] = useState(false);

  // Session form
  const [sessionCookie, setSessionCookie] = useState("");
  const [sessionMsg, setSessionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Project selection
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [projectMsg, setProjectMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Server actions
  const [serverMsg, setServerMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [cacheMsg, setCacheMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Cache Server URL
  const [cacheServerUrl, setCacheServerUrlState] = useState("");
  const [cacheServerMsg, setCacheServerMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [cacheServerTesting, setCacheServerTesting] = useState(false);

  // DB Management
  const [projectDbs, setProjectDbs] = useState<ProjectDbInfo[]>([]);
  const [dbMsg, setDbMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dbLoading, setDbLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [h, c, s, cs] = await Promise.all([
        getBackendHealth().catch(() => null),
        getCredentialStatus().catch(() => null),
        getSessionStatus().catch(() => null),
        getCacheStats().catch(() => null),
      ]);
      setHealth(h);
      setCredStatus(c);
      setSessionStatus(s);
      setCacheStats(cs);
      setError("");

      if (h) {
        const p = await getSettingsProjects().catch(() => []);
        setProjects(p);
      }
    } catch (e: any) {
      setError(e.message || "Backend unreachable");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDbs = useCallback(async () => {
    setDbLoading(true);
    try {
      const dbs = await getDbStatus();
      setProjectDbs(dbs);
    } catch {
      setProjectDbs([]);
    } finally {
      setDbLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshDbs();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh, refreshDbs]);

  // Auto-redirect to setup wizard if credentials are not configured
  useEffect(() => {
    if (!loading && !checkedSetup) {
      setCheckedSetup(true);
      if (credStatus && !credStatus.configured) {
        // First-time user: redirect to wizard
        router.push("/settings/setup");
      }
    }
  }, [loading, credStatus, checkedSetup, router]);

  const handleSetCredentials = async () => {
    setCredLoading(true);
    setCredMsg(null);
    try {
      // Test first
      const test = await testCredentials(clientId, clientSecret);
      if (test.status !== "success") {
        setCredMsg({ type: "error", text: test.message || "Authentication failed" });
        setCredLoading(false);
        return;
      }
      // Store
      await setCredentials(clientId, clientSecret);
      setCredMsg({ type: "success", text: `Credentials stored in OS keyring (expires in ${test.expires_in}s)` });
      setClientId("");
      setClientSecret("");
      await refresh();
    } catch (e: any) {
      setCredMsg({ type: "error", text: e.message });
    }
    setCredLoading(false);
  };

  const handleTestCredentials = async () => {
    setCredLoading(true);
    setCredMsg(null);
    try {
      const test = await testCredentials(
        clientId || undefined,
        clientSecret || undefined,
      );
      setCredMsg({
        type: test.status === "success" ? "success" : "error",
        text: test.message,
      });
    } catch (e: any) {
      setCredMsg({ type: "error", text: e.message });
    }
    setCredLoading(false);
  };

  const handleClearCredentials = async () => {
    try {
      await clearCredentials();
      setCredMsg({ type: "success", text: "Credentials cleared from keyring" });
      await refresh();
    } catch (e: any) {
      setCredMsg({ type: "error", text: e.message });
    }
  };

  const handleSetSession = async () => {
    setSessionMsg(null);
    try {
      const res = await setSession(sessionCookie);
      setSessionMsg({ type: "success", text: `Cookie stored (${res.length} chars)` });
      setSessionCookie("");
      await refresh();
    } catch (e: any) {
      setSessionMsg({ type: "error", text: e.message });
    }
  };

  const handleClearSession = async () => {
    try {
      await clearSession();
      setSessionMsg({ type: "success", text: "Session cleared" });
      await refresh();
    } catch (e: any) {
      setSessionMsg({ type: "error", text: e.message });
    }
  };

  const handleSelectProject = async () => {
    if (!selectedProject) return;
    setProjectMsg(null);
    try {
      const proj = projects.find((p) => p.id === selectedProject);
      const res = await selectProject(selectedProject, proj?.name, true);
      setProjectMsg({ type: "success", text: `Project set & sync started: ${proj?.name || selectedProject}` });
      await refresh();
    } catch (e: any) {
      setProjectMsg({ type: "error", text: e.message });
    }
  };

  const handleRestart = async () => {
    setServerMsg(null);
    try {
      await restartServer();
      setServerMsg({ type: "success", text: "Backend restarted" });
      setTimeout(refresh, 2000);
    } catch (e: any) {
      setServerMsg({ type: "error", text: e.message });
    }
  };

  const handleStop = async () => {
    setServerMsg(null);
    try {
      await stopServer();
      setServerMsg({ type: "success", text: "Backend shutting down..." });
    } catch (e: any) {
      setServerMsg({ type: "error", text: e.message });
    }
  };

  const handleClearCache = async () => {
    setCacheMsg(null);
    try {
      await clearCache();
      setCacheMsg({ type: "success", text: "Cache cleared" });
      await refresh();
    } catch (e: any) {
      setCacheMsg({ type: "error", text: e.message });
    }
  };

  const handleSaveCacheServerUrl = async () => {
    setCacheServerMsg(null);
    try {
      const result = await setCacheServerUrl(cacheServerUrl.trim());
      setCacheServerMsg({ type: "success", text: `Saved: ${result.url}` });
    } catch (e: any) {
      setCacheServerMsg({ type: "error", text: e.message });
    }
  };

  const handlePingCacheServer = async () => {
    setCacheServerMsg(null);
    setCacheServerTesting(true);
    try {
      const result = await pingCacheServer();
      setCacheServerMsg({ type: "success", text: `Connected — server responded OK` });
    } catch (e: any) {
      setCacheServerMsg({ type: "error", text: `Unreachable: ${e.message}` });
    } finally {
      setCacheServerTesting(false);
    }
  };

  const handleDeleteDb = async (projectId: number) => {
    setDbMsg(null);
    try {
      await deleteProjectDb(projectId);
      setDbMsg({ type: "success", text: `Project ${projectId} database deleted` });
      await refreshDbs();
    } catch (e: any) {
      setDbMsg({ type: "error", text: e.message });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-lg p-4 text-sm">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>Backend not reachable: {error}</span>
        </div>
      )}

      {credStatus && !credStatus.configured && (
        <div className="flex items-center justify-between bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-400 rounded-lg p-4 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Credentials not configured. Set up your API credentials below or run the setup wizard.</span>
          </div>
          <button
            onClick={() => router.push("/settings/setup")}
            className="text-xs font-medium underline hover:no-underline ml-4 shrink-0"
          >
            Run Setup Wizard
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ---- Backend Status Card ---- */}
          <Card title="Backend Status" icon={<Server className="h-5 w-5 text-blue-600" />}>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            ) : health ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <StatusDot ok={health.mcp_initialized && health.editor_initialized} />
                  <span className="text-sm font-medium">
                    {health.mcp_initialized && health.editor_initialized
                      ? "All services running"
                      : health.mcp_initialized
                      ? "MCP only (editor not ready)"
                      : "Services initializing..."}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span>Version</span><span className="font-mono">{health.version}</span>
                  <span>Port</span><span className="font-mono">{health.port}</span>
                  <span>Uptime</span><span className="font-mono">{formatUptime(health.uptime_seconds)}</span>
                  <span>Jama URL</span><span className="font-mono text-xs truncate">{health.jama_url}</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <ActionBtn icon={<RotateCcw className="h-3.5 w-3.5" />} label="Restart" onClick={handleRestart} />
                  <ActionBtn icon={<Power className="h-3.5 w-3.5" />} label="Stop" onClick={handleStop} variant="danger" />
                </div>
                {serverMsg && <Msg msg={serverMsg} />}
              </div>
            ) : (
              <p className="text-sm text-red-500">Backend offline</p>
            )}
          </Card>

          {/* ---- Credentials Card ---- */}
          <Card title="API Credentials" icon={<Key className="h-5 w-5 text-yellow-600" />}>
            {credStatus && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <StatusDot ok={credStatus.configured} />
                  <span className="text-sm">
                    {credStatus.configured
                      ? `Configured (source: ${credStatus.source})`
                      : "Not configured"}
                  </span>
                </div>
                {credStatus.client_id_hint && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                    Client ID: {credStatus.client_id_hint}
                  </p>
                )}
                <p className="text-xs text-gray-400">
                  {credStatus.keyring_available
                    ? "OS keyring available (Windows Credential Manager / macOS Keychain)"
                    : "OS keyring not available — using env vars only"}
                </p>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Client ID"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono"
                  />
                  <div className="relative">
                    <input
                      type={showSecret ? "text" : "password"}
                      placeholder="Client Secret"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <ActionBtn
                      icon={credLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                      label="Save & Test"
                      onClick={handleSetCredentials}
                      disabled={!clientId || !clientSecret || credLoading}
                    />
                    <ActionBtn
                      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      label="Test Current"
                      onClick={handleTestCredentials}
                      disabled={credLoading}
                    />
                    <ActionBtn
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      label="Clear"
                      onClick={handleClearCredentials}
                      variant="danger"
                    />
                  </div>
                </div>
                {credMsg && <Msg msg={credMsg} />}
              </div>
            )}
          </Card>

          {/* ---- Session Cookie Card ---- */}
          <Card title="Web Session (JSESSIONID)" icon={<Cookie className="h-5 w-5 text-orange-600" />}>
            {sessionStatus && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <StatusDot ok={sessionStatus.valid} />
                  <span className="text-sm">
                    {sessionStatus.valid
                      ? `Session active (${sessionStatus.cookie_length} chars)`
                      : "No valid session"}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Required for downloading SAML-protected attachments and images from Jama.
                </p>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Paste JSESSIONID value or full cookie header"
                    value={sessionCookie}
                    onChange={(e) => setSessionCookie(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono"
                  />
                  <div className="flex gap-2">
                    <ActionBtn
                      icon={<Cookie className="h-3.5 w-3.5" />}
                      label="Set Cookie"
                      onClick={handleSetSession}
                      disabled={!sessionCookie}
                    />
                    <ActionBtn
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      label="Clear"
                      onClick={handleClearSession}
                      variant="danger"
                    />
                  </div>
                </div>
                {sessionMsg && <Msg msg={sessionMsg} />}
              </div>
            )}
          </Card>

          {/* ---- Active Project Card ---- */}
          <Card title="Active Project" icon={<FolderTree className="h-5 w-5 text-green-600" />}>
            <div className="space-y-3">
              {health?.mcp_initialized ? (
                <>
                  <select
                    className="w-full px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                    value={selectedProject ?? ""}
                    onChange={(e) => setSelectedProject(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Select a project...</option>
                    {projects
                      .filter((p) => !p.is_folder && p.project_key)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.project_key})
                        </option>
                      ))}
                  </select>
                  <ActionBtn
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    label="Set Project & Sync"
                    onClick={handleSelectProject}
                    disabled={!selectedProject}
                  />
                  {projectMsg && <Msg msg={projectMsg} />}
                </>
              ) : (
                <p className="text-sm text-gray-400">Backend not initialized</p>
              )}
            </div>
          </Card>

          {/* ---- Cache Card ---- */}
          <Card title="Cache" icon={<Database className="h-5 w-5 text-purple-600" />} className="lg:col-span-2">
            {cacheStats ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatMini label="Items" value={cacheStats.items ?? 0} />
                  <StatMini label="Test Plans" value={cacheStats.test_plans ?? 0} />
                  <StatMini label="Relationships" value={cacheStats.relationships ?? 0} />
                  <StatMini label="DB Size" value={cacheStats.db_size_bytes ? formatBytes(cacheStats.db_size_bytes) : "N/A"} />
                </div>
                <div className="flex gap-2 pt-1">
                  <ActionBtn
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    label="Clear Cache"
                    onClick={handleClearCache}
                    variant="danger"
                  />
                </div>
                {cacheMsg && <Msg msg={cacheMsg} />}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Cache not available</p>
            )}
          </Card>

          {/* ---- Cache Server URL Card ---- */}
          <Card title="LAN Cache Server" icon={<Network className="h-5 w-5 text-indigo-600" />} className="lg:col-span-2">
            <p className="text-xs text-gray-400">
              Point to a shared LAN server so project databases are downloaded in seconds instead of synced from Jama.
              One server serves all clients on the network.
            </p>
            <div className="space-y-2 pt-1">
              <input
                type="text"
                placeholder="http://server-ip:8866"
                value={cacheServerUrl}
                onChange={(e) => setCacheServerUrlState(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono"
              />
              <div className="flex gap-2">
                <ActionBtn
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  label="Save"
                  onClick={handleSaveCacheServerUrl}
                  disabled={!cacheServerUrl.trim()}
                />
                <ActionBtn
                  icon={cacheServerTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Network className="h-3.5 w-3.5" />}
                  label="Test Connection"
                  onClick={handlePingCacheServer}
                  disabled={cacheServerTesting}
                />
              </div>
            </div>
            {cacheServerMsg && <Msg msg={cacheServerMsg} />}
          </Card>

          {/* ---- Project Databases Card ---- */}
          <Card title="Project Databases" icon={<HardDrive className="h-5 w-5 text-teal-600" />} className="lg:col-span-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">Local SQLite databases cached on this machine.</p>
              <ActionBtn
                icon={dbLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                label="Refresh"
                onClick={refreshDbs}
                disabled={dbLoading}
              />
            </div>
            {dbMsg && <Msg msg={dbMsg} />}
            {projectDbs.length === 0 ? (
              <p className="text-sm text-gray-400 pt-2">{dbLoading ? "Loading..." : "No local project databases found."}</p>
            ) : (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-5 gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide pb-1 border-b border-gray-200 dark:border-gray-700">
                  <span className="col-span-2">Project</span>
                  <span>Schema</span>
                  <span>Size</span>
                  <span>Last Sync</span>
                </div>
                {projectDbs.map((db) => (
                  <div key={db.project_id} className="grid grid-cols-5 gap-2 items-center py-2 border-b border-gray-100 dark:border-gray-800 text-sm">
                    <div className="col-span-2">
                      <div className="font-medium truncate">{db.project_name ?? `Project ${db.project_id}`}</div>
                      <div className="text-xs text-gray-400">ID: {db.project_id}</div>
                    </div>
                    <span className="font-mono text-xs text-gray-500">v{db.schema_version}</span>
                    <span className="text-xs">{formatBytes(db.size_bytes)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 truncate">
                        {db.last_sync ? new Date(db.last_sync).toLocaleDateString() : "—"}
                      </span>
                      <button
                        onClick={() => handleDeleteDb(db.project_id)}
                        title="Delete this project database"
                        className="ml-auto text-red-400 hover:text-red-600 transition-colors shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
      </div>
    </div>
  );
}

// ---- Sub-components ----

function Card({ title, icon, children, className = "" }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4 ${className}`}>
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-semibold text-lg">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${ok ? "bg-green-500" : "bg-red-500"}`} />
  );
}

function ActionBtn({ icon, label, onClick, disabled, variant = "default" }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
}) {
  const base = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = variant === "danger"
    ? "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900"
    : "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900";
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {icon}
      {label}
    </button>
  );
}

function Msg({ msg }: { msg: { type: "success" | "error"; text: string } }) {
  return (
    <div className={`flex items-start gap-2 rounded-md p-2 text-xs ${
      msg.type === "success"
        ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400"
        : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400"
    }`}>
      {msg.type === "success"
        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
      <span>{msg.text}</span>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}
