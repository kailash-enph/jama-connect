"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getProjects, getTree, getSettings, type Project, type TreeNode } from "@/lib/api";
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
  const projectParam = searchParams.get("project");
  const itemParam = searchParams.get("item");

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(
    projectParam ? Number(projectParam) : null
  );
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedItem, setSelectedItem] = useState<number | null>(
    itemParam ? Number(itemParam) : null
  );
  const [loading, setLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeWidth, setTreeWidth] = useState(TREE_DEFAULT_W);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("tree-panel-width");
    if (saved) setTreeWidth(Math.max(TREE_MIN_W, Math.min(TREE_MAX_W, Number(saved))));
  }, []);

  useEffect(() => {
    Promise.all([
      getProjects().catch(() => [] as Project[]),
      getSettings().catch(() => null),
    ]).then(([p, settings]) => {
      setProjects(p);
      if (!selectedProject && p.length > 0) {
        // Priority: URL param > backend active_project > localStorage > first project
        const backendPid = settings?.active_project_id;
        const localPid = Number(localStorage.getItem("last-project-id"));
        const defaultPid = (backendPid && p.some(pr => pr.id === backendPid)) ? backendPid
          : (localPid && p.some(pr => pr.id === localPid)) ? localPid
          : p[0].id;
        setSelectedProject(defaultPid);
        localStorage.setItem("last-project-id", String(defaultPid));
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setTreeLoading(true);
    if (!itemParam) setSelectedItem(null);
    getTree(selectedProject)
      .then((t) => {
        setTree(t);
        setTreeLoading(false);
      })
      .catch(() => setTreeLoading(false));
  }, [selectedProject]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: tree panel */}
      <div
        className="shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-900"
        style={{ width: `${treeWidth}px` }}
      >
        <div className="p-3 border-b border-gray-200 dark:border-gray-800">
          <select
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
            value={selectedProject ?? ""}
            onChange={(e) => { const pid = Number(e.target.value); setSelectedProject(pid); localStorage.setItem("last-project-id", String(pid)); }}
          >
            <option value="" disabled>Select project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-auto py-1">
          {treeLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : tree.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              No items. Sync this project first.
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
