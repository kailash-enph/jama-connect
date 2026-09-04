"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderTree,
  Search,
  TestTube2,
  RefreshCw,
  GitCompare,
  ImageIcon,
  Download,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { subscribeSettingsStatus, type SettingsStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTheme } from "./ThemeProvider";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tree", label: "Browse", icon: FolderTree },
  { href: "/search", label: "Search", icon: Search },
  { href: "/testing", label: "Testing", icon: TestTube2 },
  { href: "/sync", label: "Sync", icon: RefreshCw },
  { href: "/diff", label: "Diff", icon: GitCompare },
  { href: "/images", label: "Images", icon: ImageIcon },
  { href: "/export", label: "Export", icon: Download },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { theme, setTheme } = useTheme();
  const [backendStatus, setBackendStatus] = useState<"connected" | "degraded" | "disconnected">("disconnected");

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = subscribeSettingsStatus((data) => {
        if (data.mcp_initialized && data.editor_initialized) {
          setBackendStatus("connected");
        } else if (data.backend === "running") {
          setBackendStatus("degraded");
        } else {
          setBackendStatus("disconnected");
        }
      });
      es.onerror = () => setBackendStatus("disconnected");
    } catch {
      setBackendStatus("disconnected");
    }
    return () => es?.close();
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  };

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col transition-all duration-200",
        collapsed ? "w-14" : "w-56"
      )}
    >
      <div className="h-14 flex items-center justify-between px-3 border-b border-gray-200 dark:border-gray-800">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2 font-semibold text-lg truncate">
            <FolderTree className="h-5 w-5 text-blue-600 shrink-0" />
            <span>Jama Viewer</span>
          </Link>
        )}
        <button
          onClick={toggle}
          className={cn(
            "p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
            collapsed && "mx-auto"
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center rounded-md py-2 text-sm font-medium transition-colors",
                collapsed ? "justify-center px-2" : "gap-2.5 px-3",
                active
                  ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <div className={cn("border-t border-gray-200 dark:border-gray-800", collapsed ? "p-2" : "p-3")}>
        {collapsed ? (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
            className="mx-auto flex items-center justify-center p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={`Theme: ${theme}`}
          >
            {theme === "dark" ? <Moon className="h-4 w-4" /> : theme === "light" ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
          </button>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <span className={cn(
                "h-2 w-2 rounded-full shrink-0",
                backendStatus === "connected" ? "bg-green-500" :
                backendStatus === "degraded" ? "bg-yellow-500" : "bg-red-500"
              )} />
              Jama MCP v2
            </span>
            <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
              <ThemeBtn icon={<Sun className="h-3 w-3" />} active={theme === "light"} onClick={() => setTheme("light")} title="Light" />
              <ThemeBtn icon={<Monitor className="h-3 w-3" />} active={theme === "system"} onClick={() => setTheme("system")} title="System" />
              <ThemeBtn icon={<Moon className="h-3 w-3" />} active={theme === "dark"} onClick={() => setTheme("dark")} title="Dark" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function ThemeBtn({ icon, active, onClick, title }: { icon: React.ReactNode; active: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "p-1 rounded transition-colors",
        active
          ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
          : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      )}
    >
      {icon}
    </button>
  );
}
