"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, GitBranch, ArrowUp, ArrowDown, Loader2, ExternalLink } from "lucide-react";
import { getItem, getItemVersions, getUpstream, getDownstream, type Item, type ItemVersion } from "@/lib/api";
import JamaHtml from "@/components/JamaHtml";

interface ItemDetailProps {
  itemId: number;
}

export default function ItemDetail({ itemId }: ItemDetailProps) {
  const [item, setItem] = useState<Item | null>(null);
  const [versions, setVersions] = useState<ItemVersion[]>([]);
  const [upstream, setUpstream] = useState<any[]>([]);
  const [downstream, setDownstream] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const [relationsLoaded, setRelationsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<"detail" | "versions" | "relations">("detail");

  useEffect(() => {
    setLoading(true);
    setActiveTab("detail");
    setVersions([]);
    setUpstream([]);
    setDownstream([]);
    setVersionsLoaded(false);
    setRelationsLoaded(false);
    getItem(itemId)
      .then((data) => {
        setItem(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [itemId]);

  useEffect(() => {
    if (activeTab === "versions" && !versionsLoaded) {
      getItemVersions(itemId).then((v) => { setVersions(v); setVersionsLoaded(true); }).catch(() => setVersionsLoaded(true));
    }
    if (activeTab === "relations" && !relationsLoaded) {
      Promise.all([
        getUpstream(itemId).catch(() => []),
        getDownstream(itemId).catch(() => []),
      ]).then(([up, down]) => {
        setUpstream(up);
        setDownstream(down);
        setRelationsLoaded(true);
      });
    }
  }, [activeTab, itemId, versionsLoaded, relationsLoaded]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!item) {
    return <div className="p-6 text-gray-500">Item not found.</div>;
  }

  const fields = parseFields(item.fields_json);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 p-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{item.document_key}</div>
        <h2 className="text-lg font-semibold mt-0.5">{item.name}</h2>
        <div className="flex gap-4 text-xs text-gray-400 mt-1">
          <span>ID: {item.id}</span>
          <span>v{item.version}</span>
          {item.modified_date && <span>Modified: {new Date(item.modified_date).toLocaleDateString()}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        <TabBtn active={activeTab === "detail"} onClick={() => setActiveTab("detail")} label="Detail" />
        <TabBtn active={activeTab === "versions"} onClick={() => setActiveTab("versions")} label="Versions" icon={<Clock className="h-3.5 w-3.5" />} />
        <TabBtn active={activeTab === "relations"} onClick={() => setActiveTab("relations")} label="Relations" icon={<GitBranch className="h-3.5 w-3.5" />} />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "detail" && (
          <div className="space-y-4">
            {item.description && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Description</h3>
                <JamaHtml html={item.description} className="prose prose-sm max-w-none dark:prose-invert" />
              </div>
            )}
            {Object.keys(fields).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Fields</h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  {Object.entries(fields).map(([k, v]) => {
                    if (k === "name" || k === "description") return null;
                    return (
                      <div key={k} className="contents">
                        <dt className="text-gray-500 dark:text-gray-400 font-medium">{k}</dt>
                        <dd className="text-gray-900 dark:text-gray-100">{String(v ?? "")}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            )}
          </div>
        )}

        {activeTab === "versions" && (
          <div className="space-y-2">
            {!versionsLoaded ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading versions...
              </div>
            ) : versions.length === 0 ? (
              <p className="text-gray-500 text-sm">No version history available.</p>
            ) : (
              versions.map((v) => (
                <div key={v.version_num} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">Version {v.version_num}</span>
                    {v.created_date && (
                      <span className="text-xs text-gray-400">{new Date(v.created_date).toLocaleDateString()}</span>
                    )}
                  </div>
                  {v.modified_by && <p className="text-xs text-gray-500 mt-0.5">by {v.modified_by}</p>}
                  {v.version_comment && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{v.version_comment}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "relations" && (
          <div className="space-y-4">
            {!relationsLoaded ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading relations...
              </div>
            ) : (
              <>
                <RelationSection label="Upstream" icon={<ArrowUp className="h-4 w-4 text-green-600" />} items={upstream} projectId={item?.project_id} />
                <RelationSection label="Downstream" icon={<ArrowDown className="h-4 w-4 text-blue-600" />} items={downstream} projectId={item?.project_id} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function RelationSection({ label, icon, items, projectId }: { label: string; icon: React.ReactNode; items: any[]; projectId?: number }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold">{label} ({items.length})</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 ml-6">None</p>
      ) : (
        <ul className="ml-6 space-y-1">
          {items.map((item: any, i: number) => {
            const pid = item.project ?? item.project_id ?? projectId;
            const href = pid ? `/tree?project=${pid}&item=${item.id}` : `/tree?item=${item.id}`;
            return (
              <li key={i}>
                <Link
                  href={href}
                  className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-800 rounded px-3 py-1.5 border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors cursor-pointer group"
                >
                  <span>
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{item.documentKey || item.document_key || `Item ${item.id}`}</span>
                    <span className="mx-1.5 text-gray-300">—</span>
                    <span>{item.name || ""}</span>
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-500 shrink-0 ml-2" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function parseFields(json: string | null | undefined): Record<string, any> {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
