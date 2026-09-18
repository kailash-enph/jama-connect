"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import {
  getProjects,
  getTree,
  getSettings,
  selectProject,
  subscribeEvents,
  type Project,
  type TreeNode,
} from "@/lib/api";
import TreeView from "@/components/TreeView";
import ItemDetail from "@/components/ItemDetail";

export default function TreePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}>
      <TreePageInner />
    </Suspense>
  );
}

const TREE_MIN_W = 280;
const TREE_MAX_W = 700;
const TREE_DEFAULT_W = 420;

function TreePageInner() {
  const searchParams = useSearchParams();
  const itemParam = searchParams.get("item");

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedItem, setSelectedItem] = useState<number | null>(
    itemParam ? Number(itemParam) : null
  );
  const [loading, setLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeWidth, setTreeWidth] = useState(TREE_DEFAULT_W);
  const [dragging, setDragging] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // Restore panel width from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("tree-panel-width");
    if (saved) setTreeWidth(Math.max(TREE_MIN_W, Math.min(TREE_MAX_W, Number(saved))));
  }, []);

  // Load project list and resolve active project from backend
  useEffect(() => {
    Promise.all([
      getProjects().catch(() => [] as Project[]),
      getSettings().catch(() => null),
    ]).then(([p, settings]) => {
      setProjects(p);

      // Priority: URL param > backend active_project > localStorage > first project
      const urlPid = searchParams.get("project") ? Number(searchParams.get("project")) : null;
      const backendPid = settings?.active_project_id ?? null;
      const localPid = Number(localStorage.getItem("last-project-id")) || null;

      const pid = (urlPid && p.some(pr => pr.id === urlPid)) ? urlPid
        : (backendPid && p.some(pr => pr.id === backendPid)) ? backendPid
        : (localPid && p.some(pr => pr.id === localPid)) ? localPid
        : p.length > 0 ? p[0].id
        : null;

      setSelectedProject(pid);
      if (pid) { localStorage.setItem("last-project-id", String(pid)); }
      setLoading(false);
    });
  }, []);

  // Subscribe to SSE events — react to active_project_changed from any client
  useEffect(() => {
    const es = subscribeEvents((type, data) => {
      if (type === "active_project_changed") {
        const d = data as { project_id: number; project_name: string };
        if (d.project_id) {
          setSelectedProject(d.project_id);
          localStorage.setItem("last-project-id", String(d.project_id));
          if (!itemParam) setSelectedItem(null);
        }
      } else if (type === "sync_complete") {
        // Reload tree after a sync
        setTree([]);
        setSelectedProject(prev => prev); // trigger tree reload
      }
    });
    esRef.current = es;
    return () => { es.close(); };
  }, []);

  // Load tree whenever selectedProject changes
  useEffect(() => {
    if (!selectedProject) return;
    setTreeLoading(true);
    if (!itemParam) setSelectedItem(null);
    getTree(selectedProject)
      .then((t) => { setTree(t); setTreeLoading(false); })
      .catch(() => setTreeLoading(false));
  }, [selectedProject]);

  // Drag handle for resizing tree panel
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const sidebar = document.querySelector("aside");
      const sidebarW = sidebar ? sidebar.getBoundingClientRect().width : 0;
      const newW = Math.max(TREE_MIN_W, Math.min(TREE_MAX_W, e.clientX - sidebarW));
      setTreeWidth(newW);
    };
    const onUp = () => {
      setDragging(false);
      localStorage.setItem("tree-panel-width", String(treeWidth));
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, treeWidth]);

  /**
   * When the user picks a project from the dropdown:
   * 1. Call POST /settings/project/select on the backend — updates active project globally
   * 2. Backend fires active_project_changed SSE event
   * 3. All clients (VS Code, Devin, other browser tabs) receive the event and reload
   */
  const handleProjectChange = async (pid: number) => {
    const p = projects.find(pr => pr.id === pid);
    try {
      await selectProject(pid, p?.name);
      // SSE event will update selectedProject — but also update immediately for responsiveness
      setSelectedProject(pid);
      localStorage.setItem("last-project-id", String(pid));
    } catch {
      // Fallback: update local state only
      setSelectedProject(pid);
      localStorage.setItem("last-project-id", String(pid));
    }
  };

  const handleReload = () => {
    setTree([]);
    if (selectedProject) {
      setTreeLoading(true);
      getTree(selectedProject)
        .then((t) => { setTree(t); setTreeLoading(false); })
        .catch(() => setTreeLoading(false));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const activeProjectName = projects.find(p => p.id === selectedProject)?.name ?? "";

  return (
    <div className="flex h-full">
      {/* Left: tree panel */}
      <div
        className="shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-900"
        style={{ width: `${treeWidth}px` }}
      >
        {/* Project picker + reload button */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex gap-2 items-center">
          <select
            className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
            value={selectedProject ?? ""}
            onChange={(e) => handleProjectChange(Number(e.target.value))}
          >
            <option value="" disabled>Select project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={handleReload}
            title="Reload tree from local DB"
            className="p-1.5 rounded text-gray-500 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Active project label */}
        {activeProjectName && (
          <div className="px-3 py-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 border-b border-blue-100 dark:border-blue-900 truncate">
            Active: {activeProjectName}
          </div>
        )}

        <div className="flex-1 overflow-y-auto overflow-x-auto py-1">
          {treeLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : tree.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              <p>No items cached.</p>
              <p className="text-xs mt-1 text-gray-400">Use Sync to load items from Jama.</p>
            </div>
          ) : (
            <TreeView nodes={tree} selectedId={selectedItem} onSelect={setSelectedItem} />
          )}
        </div>
      </div>

      {/* Drag handle */}
      <div
        className="w-1 shrink-0 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors"
        onMouseDown={() => setDragging(true)}
        title="Drag to resize tree panel"
      />

      {/* Right: item detail */}
      <div className="flex-1 bg-white dark:bg-gray-900 min-w-0">
        {selectedItem ? (
          <ItemDetail itemId={selectedItem} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Select an item from the tree
          </div>
        )}
      </div>
    </div>
  );
}
