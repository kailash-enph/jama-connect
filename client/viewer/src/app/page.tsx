"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FolderTree,
  Database,
  RefreshCw,
  TestTube2,
  Search,
  AlertCircle,
} from "lucide-react";
import { getProjects, getStats, type Project } from "@/lib/api";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getProjects().catch(() => []),
      getStats().catch(() => ({})),
    ]).then(([p, s]) => {
      setProjects(p);
      setStats(s);
      setLoading(false);
    }).catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-lg p-4 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Backend not reachable: {error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<FolderTree className="h-5 w-5 text-blue-600" />} label="Projects" value={projects.length} loading={loading} />
        <StatCard icon={<Database className="h-5 w-5 text-green-600" />} label="Cached Items" value={stats.items ?? 0} loading={loading} />
        <StatCard icon={<TestTube2 className="h-5 w-5 text-purple-600" />} label="Test Plans" value={stats.test_plans ?? 0} loading={loading} />
        <StatCard icon={<RefreshCw className="h-5 w-5 text-orange-600" />} label="Syncs" value={stats.sync_logs ?? 0} loading={loading} />
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Projects</h2>
        {loading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-gray-200 rounded-lg" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
            <p className="mb-2">No projects cached yet.</p>
            <Link href="/sync" className="text-blue-600 hover:underline text-sm">
              Sync a project to get started
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/tree?project=${p.id}`}
                className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all"
              >
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{p.project_key} &middot; ID {p.id}</div>
                </div>
                <FolderTree className="h-4 w-4 text-gray-400" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <QuickAction href="/search" icon={<Search className="h-5 w-5" />} label="Search Items" />
          <QuickAction href="/testing" icon={<TestTube2 className="h-5 w-5" />} label="Test Management" />
          <QuickAction href="/sync" icon={<RefreshCw className="h-5 w-5" />} label="Sync Dashboard" />
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: number; loading: boolean }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 flex items-center gap-3">
      {icon}
      <div>
        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</div>
        {loading ? <div className="h-6 w-10 bg-gray-200 dark:bg-gray-700 animate-pulse rounded mt-0.5" /> : <div className="text-xl font-bold">{value.toLocaleString()}</div>}
      </div>
    </div>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all">
      <div className="text-blue-600">{icon}</div>
      <span className="font-medium text-sm">{label}</span>
    </Link>
  );
}
