"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Key,
  FolderTree,
  Cookie,
  RefreshCw,
  Shield,
  Eye,
  EyeOff,
  Rocket,
  PartyPopper,
} from "lucide-react";
import {
  getBackendHealth,
  getCredentialStatus,
  setCredentials,
  testCredentials,
  getSettingsProjects,
  selectProject,
  getSessionStatus,
  setSession,
  type BackendHealth,
  type CredentialStatus,
  type Project,
} from "@/lib/api";

const TOTAL_STEPS = 6;

export default function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 1 (Credentials)
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [credLoading, setCredLoading] = useState(false);
  const [credResult, setCredResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [credConfigured, setCredConfigured] = useState(false);

  // Step 2 (Project)
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectResult, setProjectResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [projectName, setProjectName] = useState("");

  // Step 3 (Sync)
  const [syncStarted, setSyncStarted] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Waiting...");

  // Step 4 (Session Cookie)
  const [sessionCookie, setSessionCookie] = useState("");
  const [sessionResult, setSessionResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sessionConfigured, setSessionConfigured] = useState(false);

  // Backend status
  const [backendOnline, setBackendOnline] = useState(false);
  const [healthChecked, setHealthChecked] = useState(false);

  // Check backend on mount
  useEffect(() => {
    (async () => {
      try {
        const h = await getBackendHealth();
        setBackendOnline(!!h);
      } catch {
        setBackendOnline(false);
      }
      setHealthChecked(true);
    })();
  }, []);

  // Load projects when reaching step 2
  useEffect(() => {
    if (step === 2 && projects.length === 0) {
      (async () => {
        try {
          const p = await getSettingsProjects();
          setProjects(p);
        } catch {
          // ignore
        }
      })();
    }
  }, [step, projects.length]);

  // ---- Handlers ----

  const handleTestAndSave = async () => {
    setCredLoading(true);
    setCredResult(null);
    try {
      const test = await testCredentials(clientId, clientSecret);
      if (test.status !== "success") {
        setCredResult({ ok: false, msg: test.message || "Authentication failed" });
        setCredLoading(false);
        return;
      }
      await setCredentials(clientId, clientSecret);
      setCredResult({ ok: true, msg: `Authenticated! Token expires in ${test.expires_in}s` });
      setCredConfigured(true);
    } catch (e: any) {
      setCredResult({ ok: false, msg: e.message });
    }
    setCredLoading(false);
  };

  const handleSelectProject = async () => {
    if (!selectedProject) return;
    setProjectLoading(true);
    setProjectResult(null);
    try {
      const proj = projects.find((p) => p.id === selectedProject);
      setProjectName(proj?.name || String(selectedProject));
      await selectProject(selectedProject, proj?.name, true);
      setProjectResult({ ok: true, msg: `Project "${proj?.name}" selected and sync started` });
    } catch (e: any) {
      setProjectResult({ ok: false, msg: e.message });
    }
    setProjectLoading(false);
  };

  const handleSetSession = async () => {
    setSessionResult(null);
    try {
      const res = await setSession(sessionCookie);
      setSessionResult({ ok: true, msg: `Cookie stored (${res.length} chars)` });
      setSessionConfigured(true);
      setSessionCookie("");
    } catch (e: any) {
      setSessionResult({ ok: false, msg: e.message });
    }
  };

  // ---- Step content ----

  const steps = [
    // Step 0: Welcome
    {
      title: "Welcome to Jama Viewer",
      content: (
        <div className="space-y-4 text-center">
          <Rocket className="h-16 w-16 mx-auto text-blue-500" />
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Let&apos;s get you set up in a few quick steps.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You&apos;ll configure your Jama API credentials, select a project,
            and optionally set up a browser session for image downloads.
          </p>
          <div className="text-sm text-gray-400 space-y-1">
            <p>This takes about 2 minutes.</p>
            {!backendOnline && healthChecked && (
              <div className="flex items-center justify-center gap-2 text-red-500 mt-4">
                <XCircle className="h-4 w-4" />
                <span>Backend not reachable. Make sure it&apos;s running on port 8765.</span>
              </div>
            )}
            {backendOnline && (
              <div className="flex items-center justify-center gap-2 text-green-500 mt-4">
                <CheckCircle2 className="h-4 w-4" />
                <span>Backend is online</span>
              </div>
            )}
          </div>
        </div>
      ),
      canAdvance: backendOnline,
    },
    // Step 1: Credentials
    {
      title: "API Credentials",
      content: (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Key className="h-5 w-5 text-yellow-600" />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Enter your Jama OAuth Client ID and Secret. These will be stored securely in your OS keyring.
            </span>
          </div>
          <input
            type="text"
            placeholder="Client ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono"
          />
          <div className="relative">
            <input
              type={showSecret ? "text" : "password"}
              placeholder="Client Secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono pr-9"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button
            onClick={handleTestAndSave}
            disabled={!clientId || !clientSecret || credLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {credLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            Test & Save
          </button>
          {credResult && (
            <ResultBanner ok={credResult.ok} msg={credResult.msg} />
          )}
        </div>
      ),
      canAdvance: credConfigured,
    },
    // Step 2: Project Selection
    {
      title: "Select Project",
      content: (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <FolderTree className="h-5 w-5 text-green-600" />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Choose the Jama project to sync and browse.
            </span>
          </div>
          {projects.length === 0 ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading projects...</span>
            </div>
          ) : (
            <>
              <select
                className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                value={selectedProject ?? ""}
                onChange={(e) => setSelectedProject(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select a project...</option>
                {projects
                  .filter((p) => !p.is_folder && p.project_key)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.project_key})
                    </option>
                  ))}
              </select>
              <button
                onClick={handleSelectProject}
                disabled={!selectedProject || projectLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {projectLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Set Project & Sync
              </button>
            </>
          )}
          {projectResult && (
            <ResultBanner ok={projectResult.ok} msg={projectResult.msg} />
          )}
        </div>
      ),
      canAdvance: !!projectResult?.ok,
    },
    // Step 3: Sync Progress
    {
      title: "Initial Sync",
      content: (
        <div className="space-y-4 text-center">
          <RefreshCw className="h-12 w-12 mx-auto text-blue-500 animate-spin" />
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Syncing project <strong>{projectName || "..."}</strong> from Jama...
          </p>
          <p className="text-xs text-gray-400">
            This runs in the background. You can continue to the next step — sync will complete on its own.
          </p>
          <div className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 rounded-md p-3 text-xs">
            Tip: You can monitor sync progress from the main viewer page or the Settings panel.
          </div>
        </div>
      ),
      canAdvance: true,
    },
    // Step 4: Session Cookie (optional)
    {
      title: "Web Session (Optional)",
      content: (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Cookie className="h-5 w-5 text-orange-600" />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Paste your JSESSIONID cookie to enable downloading SAML-protected images and attachments.
              This step is optional — you can configure it later from Settings.
            </span>
          </div>
          <input
            type="text"
            placeholder="Paste JSESSIONID value or full cookie header"
            value={sessionCookie}
            onChange={(e) => setSessionCookie(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono"
          />
          <button
            onClick={handleSetSession}
            disabled={!sessionCookie}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Cookie className="h-4 w-4" />
            Set Cookie
          </button>
          {sessionResult && (
            <ResultBanner ok={sessionResult.ok} msg={sessionResult.msg} />
          )}
          {!sessionCookie && !sessionConfigured && (
            <p className="text-xs text-gray-400">
              You can skip this step and configure it later.
            </p>
          )}
        </div>
      ),
      canAdvance: true, // optional step
    },
    // Step 5: Done
    {
      title: "Setup Complete!",
      content: (
        <div className="space-y-4 text-center">
          <PartyPopper className="h-16 w-16 mx-auto text-green-500" />
          <p className="text-lg text-gray-600 dark:text-gray-300">
            You&apos;re all set!
          </p>
          <div className="text-left max-w-sm mx-auto space-y-2 text-sm">
            <SummaryRow ok={credConfigured} label="API Credentials" />
            <SummaryRow ok={!!projectResult?.ok} label={`Project: ${projectName || "(none)"}`} />
            <SummaryRow ok={sessionConfigured} label="Web Session Cookie" optional />
          </div>
          <button
            onClick={() => router.push("/settings")}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 mt-4"
          >
            Go to Settings
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ),
      canAdvance: false, // terminal step
    },
  ];

  const current = steps[step];

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-5 pb-2 flex items-center justify-between">
          <span className="text-xs text-gray-400 font-medium">
            Step {step + 1} of {TOTAL_STEPS}
          </span>
          {step > 0 && step < TOTAL_STEPS - 1 && (
            <button
              onClick={() => router.push("/settings")}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Skip setup
            </button>
          )}
        </div>

        {/* Title */}
        <div className="px-6 pb-2">
          <h1 className="text-xl font-bold">{current.title}</h1>
        </div>

        {/* Content */}
        <div className="px-6 py-4 min-h-[220px]">
          {current.content}
        </div>

        {/* Navigation */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-between">
          {step > 0 && step < TOTAL_STEPS - 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          ) : (
            <div />
          )}
          {step < TOTAL_STEPS - 1 && (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!current.canAdvance}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {step === 0 ? "Get Started" : "Next"}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Sub-components ----

function ResultBanner({ ok, msg }: { ok: boolean; msg: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-md p-3 text-sm ${
        ok
          ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400"
          : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
      )}
      <span>{msg}</span>
    </div>
  );
}

function SummaryRow({ ok, label, optional }: { ok: boolean; label: string; optional?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
      ) : optional ? (
        <span className="h-4 w-4 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0 flex items-center justify-center text-[8px] text-white">
          —
        </span>
      ) : (
        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
      )}
      <span className={ok ? "" : optional ? "text-gray-400" : "text-red-500"}>
        {label}
        {optional && !ok && " (skipped)"}
      </span>
    </div>
  );
}
