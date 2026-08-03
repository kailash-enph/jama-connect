"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search as SearchIcon,
  Loader2,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Layers,
} from "lucide-react";
import {
  searchItems,
  deepSearchItems,
  type SearchResult,
  type DeepSearchResult,
  type RelatedItemRef,
} from "@/lib/api";

function RelationBadge({ item, direction }: { item: RelatedItemRef; direction: "up" | "down" }) {
  return (
    <Link
      href={`/tree?item=${item.item_id}`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors group"
      title={`${item.document_key}: ${item.name}`}
    >
      {direction === "up" ? (
        <ArrowUpRight className="h-3 w-3 text-green-500 shrink-0" />
      ) : (
        <ArrowDownRight className="h-3 w-3 text-orange-500 shrink-0" />
      )}
      <span className="font-mono text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400">{item.document_key}</span>
      <span className="text-gray-600 dark:text-gray-400 truncate max-w-[180px]">{item.name}</span>
      {item.suspect && <span className="text-red-500 text-[10px] font-bold ml-1">SUSPECT</span>}
    </Link>
  );
}

function DeepResultCard({ r }: { r: DeepSearchResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setExpanded(!expanded)} className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
            {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          </button>
          <FileText className="h-4 w-4 text-gray-400 shrink-0" />
          <Link href={`/tree?project=${r.project_id}&item=${r.item_id}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            <span className="text-xs font-mono text-gray-400 mr-1.5">{r.document_key}</span>
            <span className="font-medium text-sm">{r.name}</span>
          </Link>
          <span className="text-[10px] text-gray-400 ml-auto">v{r.version}</span>
        </div>

        {r.description && (
          <p className="text-xs text-gray-500 mt-1 ml-10 line-clamp-2">{r.description}</p>
        )}

        {/* Compact relation summary */}
        <div className="flex flex-wrap gap-1.5 mt-2 ml-10">
          {r.parent && (
            <Link
              href={`/tree?project=${r.project_id}&item=${r.parent.item_id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
              title={`Parent: ${r.parent.document_key} ${r.parent.name}`}
            >
              <FolderOpen className="h-3 w-3" />
              {r.parent.document_key}
            </Link>
          )}
          {r.children_count > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-50 dark:bg-gray-800 text-gray-500">
              <Layers className="h-3 w-3" />
              {r.children_count} children
            </span>
          )}
          {r.upstream_items.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
              <ArrowUpRight className="h-3 w-3" />
              {r.upstream_items.length} upstream
            </span>
          )}
          {r.downstream_items.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300">
              <ArrowDownRight className="h-3 w-3" />
              {r.downstream_items.length} downstream
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3 bg-gray-50/50 dark:bg-gray-950/50">
          {/* Upstream relations */}
          {r.upstream_items.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-green-600 dark:text-green-400 font-semibold mb-1">Upstream (traces to this)</div>
              <div className="flex flex-wrap gap-1">
                {r.upstream_items.map((u) => (
                  <RelationBadge key={u.item_id} item={u} direction="up" />
                ))}
              </div>
            </div>
          )}

          {/* Downstream relations */}
          {r.downstream_items.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-orange-600 dark:text-orange-400 font-semibold mb-1">Downstream (derived from this)</div>
              <div className="flex flex-wrap gap-1">
                {r.downstream_items.map((d) => (
                  <RelationBadge key={d.item_id} item={d} direction="down" />
                ))}
              </div>
            </div>
          )}

          {/* Custom fields */}
          {Object.keys(r.fields).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Custom Fields</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                {Object.entries(r.fields).map(([key, val]) => (
                  <div key={key} className="flex gap-1 min-w-0">
                    <span className="text-gray-400 shrink-0">{key}:</span>
                    <span className="text-gray-600 dark:text-gray-300 truncate">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [deepResults, setDeepResults] = useState<DeepSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [mode, setMode] = useState<"quick" | "deep">("deep");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      if (mode === "deep") {
        const r = await deepSearchItems(query);
        setDeepResults(r);
        setResults([]);
      } else {
        const r = await searchItems(query);
        setResults(r);
        setDeepResults([]);
      }
    } catch {
      setResults([]);
      setDeepResults([]);
    }
    setLoading(false);
  };

  const totalResults = mode === "deep" ? deepResults.length : results.length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Search</h1>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setMode("quick")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === "quick"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Quick
          </button>
          <button
            onClick={() => setMode("deep")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === "deep"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Deep (+ Relations)
          </button>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={mode === "deep"
              ? "Search by name, doc key (SET-43), item ID, or custom field content..."
              : "Search items by name, description, document key..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-gray-200"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </button>
      </form>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {!loading && searched && totalResults === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
          No results found for &ldquo;{query}&rdquo;
        </div>
      )}

      {/* Quick search results */}
      {!loading && mode === "quick" && results.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-gray-500">{results.length} result{results.length !== 1 ? "s" : ""}</div>
          {results.map((r) => (
            <Link
              key={r.item_id}
              href={`/tree?project=${r.project_id}&item=${r.item_id}`}
              className="block bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-xs font-mono text-gray-400">{r.document_key}</span>
                <span className="font-medium text-sm">{r.name}</span>
              </div>
              {r.snippet && (
                <p className="text-xs text-gray-500 mt-1 ml-6 line-clamp-2">{r.snippet}</p>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Deep search results */}
      {!loading && mode === "deep" && deepResults.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-gray-500">{deepResults.length} result{deepResults.length !== 1 ? "s" : ""} (with relationships)</div>
          {deepResults.map((r) => (
            <DeepResultCard key={r.item_id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}
