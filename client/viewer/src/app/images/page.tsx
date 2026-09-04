"use client";

import { useEffect, useState, useCallback } from "react";
import { ExternalLink, Upload, CheckCircle2, Loader2, ImageIcon, AlertCircle, Download } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8765";

interface UncachedImage {
  attachment_id: number;
  file_name: string;
  url: string;
  item_id: number;
}

export default function ImagesPage() {
  const [uncached, setUncached] = useState<UncachedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [cached, setCached] = useState<Set<number>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [hasCookie, setHasCookie] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const fetchUncached = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/proxy/jama-image/uncached`);
      const data = await resp.json();
      setUncached(data.uncached || []);
    } catch (err) {
      console.error("Failed to fetch uncached images:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUncached();
    fetch(`${API_BASE}/api/session-cookie`)
      .then((r) => r.json())
      .then((d) => setHasCookie(d.has_cookie))
      .catch(() => {});
  }, [fetchUncached]);

  const bulkImport = async () => {
    setBulkImporting(true);
    setBulkResult(null);
    try {
      const resp = await fetch(`${API_BASE}/api/images/bulk-import`, { method: "POST" });
      const data = await resp.json();
      setBulkResult(data.message || `Done: ${data.downloaded} downloaded`);
      fetchUncached();
    } catch {
      setBulkResult("Bulk import failed");
    }
    setBulkImporting(false);
  };

  const uploadImage = async (attId: number, url: string, file: File) => {
    setUploading((prev) => ({ ...prev, [attId]: true }));
    try {
      const resp = await fetch(
        `${API_BASE}/api/proxy/jama-image/cache?url=${encodeURIComponent(url)}`,
        { method: "POST", body: file }
      );
      if (resp.ok) {
        setCached((prev) => new Set([...prev, attId]));
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading((prev) => ({ ...prev, [attId]: false }));
    }
  };

  // Global drop handler — match file name to attachment
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        // Try to match file name to an uncached image
        const match = uncached.find(
          (img) =>
            !cached.has(img.attachment_id) &&
            (img.file_name === file.name ||
              img.url.includes(file.name) ||
              file.name.includes(String(img.attachment_id)))
        );
        if (match) {
          await uploadImage(match.attachment_id, match.url, file);
        } else if (uncached.length === 1 && !cached.has(uncached[0].attachment_id)) {
          // Only one uncached image — assume that's the target
          await uploadImage(uncached[0].attachment_id, uncached[0].url, files[0]);
        }
      }
    },
    [uncached, cached]
  );

  const remaining = uncached.filter((img) => !cached.has(img.attachment_id));

  return (
    <div
      className="max-w-4xl mx-auto p-6"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ImageIcon className="h-6 w-6" />
            Import Images
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            SAML-protected images must be manually imported. Open each URL in your browser, save the image, then upload it here.
          </p>
        </div>
        <div className="flex gap-2">
          {hasCookie && remaining.length > 0 && (
            <button
              onClick={bulkImport}
              disabled={bulkImporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {bulkImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Bulk Import ({remaining.length})
            </button>
          )}
          <button
            onClick={fetchUncached}
            className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : remaining.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-400" />
          <p className="text-lg font-medium text-gray-600 dark:text-gray-300">All images cached!</p>
          <p className="text-sm">No uncached embedded images found.</p>
        </div>
      ) : (
        <>
          {/* Drop zone overlay */}
          {dragOver && (
            <div className="fixed inset-0 bg-blue-500/10 border-4 border-dashed border-blue-400 rounded-xl z-50 flex items-center justify-center pointer-events-none">
              <div className="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-2xl text-center">
                <Upload className="h-12 w-12 mx-auto mb-3 text-blue-500" />
                <p className="text-lg font-semibold">Drop image file to cache</p>
              </div>
            </div>
          )}

          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Bulk import (recommended for {remaining.length} images):</strong>
                <ol className="mt-1 ml-4 list-decimal space-y-0.5">
                  <li>Open <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">enphase.jamacloud.com</code> in your browser and login</li>
                  <li>Press F12 → Application → Cookies → jamacloud.com</li>
                  <li>Copy the <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">JSESSIONID</code> cookie value</li>
                  <li>Run in terminal: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">python scripts/bulk_import_images.py --cookie &quot;JSESSIONID=&lt;value&gt;&quot;</code></li>
                </ol>
              </div>
            </div>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Manual import (one at a time):</strong> Click the link icon to open in browser, save the image, then upload here.
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {remaining.map((img) => (
              <div
                key={img.attachment_id}
                className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">
                    {img.file_name}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    ID: {img.attachment_id} · Item: {img.item_id}
                  </div>
                </div>

                <a
                  href={img.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-md transition-colors"
                  title="Open in browser"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>

                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadImage(img.attachment_id, img.url, file);
                    }}
                  />
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                    {uploading[img.attachment_id] ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    Upload
                  </span>
                </label>
              </div>
            ))}
          </div>

          {cached.size > 0 && (
            <div className="mt-6 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4 inline mr-1" />
              {cached.size} image{cached.size !== 1 ? "s" : ""} cached successfully. Refresh the item page to see them.
            </div>
          )}
        </>
      )}
    </div>
  );
}
