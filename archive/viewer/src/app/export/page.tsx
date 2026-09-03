"use client";

import { useState } from "react";
import { Loader2, Download, Copy, Check, FileText, FolderTree } from "lucide-react";
import { exportItem, exportTree, getProjects, resolveItem, type Project } from "@/lib/api";

type ExportMode = "item" | "tree";
type ExportFormat = "md" | "html" | "json";

export default function ExportPage() {
  const [mode, setMode] = useState<ExportMode>("item");
  const [itemInput, setItemInput] = useState("");
  const [resolvedItem, setResolvedItem] = useState<{ id: number; document_key: string; name: string } | null>(null);
  const [format, setFormat] = useState<ExportFormat>("md");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  // Tree mode state
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  const loadProjects = async () => {
    if (projectsLoaded) return;
    try {
      const p = await getProjects();
      setProjects(p);
      if (p.length > 0) setSelectedProject(p[0].id);
      setProjectsLoaded(true);
    } catch {
      setError("Failed to load projects");
    }
  };

  const handleExport = async () => {
    setLoading(true);
    setError("");
    setContent("");
    try {
      if (mode === "item") {
        const input = itemInput.trim();
        if (!input) { setError("Enter a document key or item ID"); setLoading(false); return; }
        const item = await resolveItem(input);
        setResolvedItem({ id: item.id, document_key: item.document_key, name: item.name });
        const result = await exportItem(item.id, format);
        setContent(result.content);
      } else {
        if (!selectedProject) { setError("Select a project"); setLoading(false); return; }
        const result = await exportTree(selectedProject, format);
        setContent(result.content);
      }
    } catch (e: any) {
      setError(e.message || "Export failed");
    }
    setLoading(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext = format === "md" ? "md" : format === "html" ? "html" : "json";
    const mimeType = format === "json" ? "application/json" : "text/plain";
    const label = resolvedItem?.document_key || itemInput;
    const filename = mode === "item" ? `jama-${label}.${ext}` : `jama-project-${selectedProject}.${ext}`;
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Export</h1>

      <div className="flex flex-wrap gap-4 items-end">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setMode("item")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === "item"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Single Item
          </button>
          <button
            onClick={() => { setMode("tree"); loadProjects(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === "tree"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <FolderTree className="h-3.5 w-3.5" />
            Project Tree
          </button>
        </div>

        {/* Item ID or Project selector */}
        {mode === "item" ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Item (key or ID)</label>
            <input
              type="text"
              value={itemInput}
              onChange={(e) => { setItemInput(e.target.value); setResolvedItem(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleExport()}
              placeholder="e.g. SET-43 or 5624955"
              className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-md px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
            />
            {resolvedItem && (
              <span className="text-xs text-gray-500 mt-0.5">
                <span className="font-mono">{resolvedItem.document_key}</span> (ID: {resolvedItem.id}) — {resolvedItem.name}
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Project</label>
            <select
              className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
              value={selectedProject ?? ""}
              onChange={(e) => setSelectedProject(Number(e.target.value))}
            >
              <option value="" disabled>Select project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Format selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Format</label>
          <select
            className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
          >
            <option value="md">Markdown</option>
            <option value="html">HTML</option>
            <option value="json">JSON</option>
          </select>
        </div>

        <button
          onClick={handleExport}
          disabled={loading}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Export"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {content && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{content.length.toLocaleString()} characters</span>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <pre className="p-4 text-sm text-gray-800 dark:text-gray-200 overflow-x-auto max-h-[60vh] overflow-y-auto whitespace-pre-wrap font-mono">
              {content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
