"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, FileText, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TreeNode } from "@/lib/api";

interface TreeViewProps {
  nodes: TreeNode[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export default function TreeView({ nodes, selectedId, onSelect }: TreeViewProps) {
  return (
    <div className="text-sm">
      {nodes.map((node) => (
        <TreeItem key={node.id} node={node} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}

function TreeItem({
  node,
  selectedId,
  onSelect,
}: {
  node: TreeNode;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(node.level < 1);
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedId;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors whitespace-nowrap",
          isSelected && "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 font-medium"
        )}
        style={{ paddingLeft: `${node.level * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <button
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
            )}
          </button>
        ) : (
          <span className="w-[22px] shrink-0" />
        )}

        {hasChildren ? (
          <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        ) : (
          <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        )}

        <span className="text-[11px] text-gray-400 font-mono shrink-0">{node.document_key}</span>
        <span>{node.name}</span>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeItem key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
