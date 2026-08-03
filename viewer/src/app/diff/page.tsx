"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { resolveItem, getItemVersions, getItemAtVersion, proxyJamaImages, type Item, type ItemVersion } from "@/lib/api";

export default function DiffPage() {
  const [itemInput, setItemInput] = useState("");
  const [item, setItem] = useState<Item | null>(null);
  const [versions, setVersions] = useState<ItemVersion[]>([]);
  const [verA, setVerA] = useState<number | null>(null);
  const [verB, setVerB] = useState<number | null>(null);
  const [dataA, setDataA] = useState<ItemVersion | null>(null);
  const [dataB, setDataB] = useState<ItemVersion | null>(null);
  const [loading, setLoading] = useState(false);

  const loadItem = async () => {
    const input = itemInput.trim();
    if (!input) return;
    setLoading(true);
    setVersions([]);
    setVerA(null);
    setVerB(null);
    setDataA(null);
    setDataB(null);
    try {
      const it = await resolveItem(input);
      setItem(it);
      const vs = await getItemVersions(it.id);
      setVersions(vs);
      if (vs.length >= 2) {
        setVerA(vs[vs.length - 2].version_num);
        setVerB(vs[vs.length - 1].version_num);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (verA == null || verB == null || !item) return;
    Promise.all([getItemAtVersion(item.id, verA), getItemAtVersion(item.id, verB)]).then(([a, b]) => {
      setDataA(a);
      setDataB(b);
    });
  }, [verA, verB, item]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Version Diff</h1>

      <div className="flex gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Item (key or ID)</label>
          <input
            type="text"
            value={itemInput}
            onChange={(e) => setItemInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadItem()}
            placeholder="e.g. SET-43 or 5624955"
            className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-md px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
          />
        </div>
        <button
          onClick={loadItem}
          disabled={loading || !itemInput.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load"}
        </button>

        {versions.length > 0 && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Version A</label>
              <select
                className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
                value={verA ?? ""}
                onChange={(e) => setVerA(Number(e.target.value))}
              >
                {versions.map((v) => (
                  <option key={v.version_num} value={v.version_num}>v{v.version_num}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Version B</label>
              <select
                className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
                value={verB ?? ""}
                onChange={(e) => setVerB(Number(e.target.value))}
              >
                {versions.map((v) => (
                  <option key={v.version_num} value={v.version_num}>v{v.version_num}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {item && (
        <div className="text-sm text-gray-500">
          <span className="font-mono">{item.document_key}</span> — {item.name}
        </div>
      )}

      {/* Side-by-side diff */}
      {dataA && dataB && (
        <div className="grid grid-cols-2 gap-4">
          <VersionPanel label={`Version ${verA}`} data={dataA} />
          <VersionPanel label={`Version ${verB}`} data={dataB} />
        </div>
      )}
    </div>
  );
}

function VersionPanel({ label, data }: { label: string; data: ItemVersion }) {
  const fields = parseFields(data.fields_json);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
        <span className="font-medium text-sm">{label}</span>
        {data.modified_date && (
          <span className="text-xs text-gray-400 ml-2">{new Date(data.modified_date).toLocaleDateString()}</span>
        )}
      </div>
      <div className="p-4 space-y-3 text-sm max-h-[60vh] overflow-y-auto">
        {data.version_comment && (
          <div className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 rounded px-3 py-1.5 text-xs">{data.version_comment}</div>
        )}
        {data.description_html && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 mb-1">Description</h4>
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: proxyJamaImages(data.description_html) }} />
          </div>
        )}
        {Object.keys(fields).length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 mb-1">Fields</h4>
            <dl className="space-y-0.5">
              {Object.entries(fields).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-gray-400 min-w-[120px]">{k}:</dt>
                  <dd className="text-gray-800 dark:text-gray-200">{String(v ?? "")}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
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
