"use client";

import { useEffect, useState, useRef } from "react";
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
  Zap,
} from "lucide-react";
import {
  getProjects,
  startSync,
  subscribeSyncProgress,
  getLastSync,
  type Project,
  type SyncProgress,
  type SyncLog,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export default function SyncPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastSync, setLastSync] = useState<SyncLog | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    getProjects()
      .then((p) => {
        setProjects(p);
        if (p.length > 0) setSelectedProject(p[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    return () => esRef.current?.close();
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    getLastSync(selectedProject).then(setLastSync).catch(() => setLastSync(null));
  }, [selectedProject]);

  const handleSync = async (incremental: boolean) => {
    if (!selectedProject || syncing) return;
    setSyncing(true);
    setProgress(null);

    esRef.current?.close();
    esRef.current = subscribeSyncProgress((data) => {
      setProgress(data);
      if (data.state === "done" || data.state === "error") {
        setSyncing(false);
        esRef.current?.close();
        getLastSync(selectedProject).then(setLastSync).catch(() => {});
      }
    });

    try {
      await startSync(selectedProject, incremental);
    } catch {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Sync Dashboard</h1>

      {/* Project selector + buttons */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Project</label>
          <select
            className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px] dark:text-gray-200"
            value={selectedProject ?? ""}
            onChange={(e) => setSelectedProject(Number(e.target.value))}
          >
            <option value="" disabled>Select...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => handleSync(false)}
          disabled={syncing || !selectedProject}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Play className="h-4 w-4" />
          Full Sync
        </button>

        <button
          onClick={() => handleSync(true)}
          disabled={syncing || !selectedProject}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          <Zap className="h-4 w-4" />
          Incremental
        </button>
      </div>

      {/* Progress */}
      {progress && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {progress.state === "syncing" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
              {progress.state === "done" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
              {progress.state === "error" && <XCircle className="h-4 w-4 text-red-500" />}
              <span className="font-medium text-sm capitalize">{progress.state}</span>
            </div>
            <span className="text-sm text-gray-500">{progress.progress_pct.toFixed(0)}%</span>
          </div>

          <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={cn(
                "h-full transition-all rounded-full",
                progress.state === "error" ? "bg-red-500" : "bg-blue-500"
              )}
              style={{ width: `${progress.progress_pct}%` }}
            />
          </div>

          <p className="text-xs text-gray-500">{progress.message}</p>

          <div className="grid grid-cols-4 gap-3 text-center text-xs">
            <Metric label="Total" value={progress.total_items} />
            <Metric label="New" value={progress.new_items} />
            <Metric label="Changed" value={progress.changed_items} />
            <Metric label="Errors" value={progress.errors} error={progress.errors > 0} />
          </div>
        </div>
      )}

      {/* Last sync info */}
      {lastSync && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-2">Last Sync</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-gray-500 dark:text-gray-400">Started</dt>
            <dd>{new Date(lastSync.started_at).toLocaleString()}</dd>
            <dt className="text-gray-500 dark:text-gray-400">Completed</dt>
            <dd>{lastSync.completed_at ? new Date(lastSync.completed_at).toLocaleString() : "—"}</dd>
            <dt className="text-gray-500 dark:text-gray-400">Status</dt>
            <dd className="capitalize">{lastSync.status}</dd>
            <dt className="text-gray-500 dark:text-gray-400">Items</dt>
            <dd>{lastSync.total_items} total, {lastSync.changed_items} changed, {lastSync.new_items} new</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, error = false }: { label: string; value: number; error?: boolean }) {
  return (
    <div>
      <div className={cn("text-lg font-bold", error ? "text-red-600" : "")}>{value}</div>
      <div className="text-gray-500">{label}</div>
    </div>
  );
}
