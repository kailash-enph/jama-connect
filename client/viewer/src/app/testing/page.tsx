"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  AlertTriangle,
  X,
  ChevronRight,
  ListChecks,
  FileText,
} from "lucide-react";
import {
  getProjects,
  getTestPlans,
  getTestCycles,
  getTestRuns,
  getTestSummary,
  getPlanSummary,
  proxyJamaImages,
  type Project,
  type TestPlan,
  type TestCycle,
  type TestRun,
  type TestSummary,
  type PlanSummary,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_ICON: Record<string, React.ReactNode> = {
  PASSED: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  FAILED: <XCircle className="h-4 w-4 text-red-500" />,
  BLOCKED: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  INPROGRESS: <Clock className="h-4 w-4 text-blue-500" />,
  NOT_RUN: <MinusCircle className="h-4 w-4 text-gray-400" />,
};

const STATUS_COLOR: Record<string, string> = {
  PASSED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
  BLOCKED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400",
  INPROGRESS: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400",
  NOT_RUN: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

interface RunFields {
  description?: string;
  documentKey?: string;
  testRunSetName?: string;
  testRunSteps?: { action: string; expectedResult: string; result: string; notes: string; status: string }[];
  assignedTo?: number;
  duration?: number;
  modifiedDate?: string;
  executionDate?: string;
  testRunStatus?: string;
  forcePassed?: boolean;
}

function parseRunFields(run: TestRun): RunFields {
  try {
    return JSON.parse(run.fields_json || "{}");
  } catch {
    return {};
  }
}

export default function TestingPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [cycles, setCycles] = useState<TestCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [summary, setSummary] = useState<TestSummary | null>(null);
  const [planSummary, setPlanSummary] = useState<PlanSummary | null>(null);
  const [selectedRun, setSelectedRun] = useState<TestRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProjects()
      .then((p) => {
        setProjects(p);
        if (p.length > 0) setSelectedProject(p[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setPlans([]);
    setSelectedPlan(null);
    setCycles([]);
    setSelectedCycle(null);
    setRuns([]);
    setSummary(null);
    setPlanSummary(null);
    setSelectedRun(null);
    getTestPlans(selectedProject).then(setPlans).catch(() => {});
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedPlan) return;
    setCycles([]);
    setSelectedCycle(null);
    setRuns([]);
    setSummary(null);
    setPlanSummary(null);
    setSelectedRun(null);
    getTestCycles(selectedPlan).then(setCycles).catch(() => {});
    getPlanSummary(selectedPlan).then(setPlanSummary).catch(() => {});
  }, [selectedPlan]);

  useEffect(() => {
    if (!selectedCycle) return;
    setRuns([]);
    setSummary(null);
    setSelectedRun(null);
    Promise.all([
      getTestRuns(selectedCycle),
      getTestSummary(selectedCycle),
    ]).then(([r, s]) => {
      setRuns(r);
      setSummary(s);
    }).catch(() => {});
  }, [selectedCycle]);

  const selectedPlanObj = plans.find((p) => p.id === selectedPlan);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Test Management</h1>

      {/* Selectors row */}
      <div className="flex flex-wrap gap-3">
        <Select label="Project" value={selectedProject} onChange={setSelectedProject} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        <Select label="Test Plan" value={selectedPlan} onChange={setSelectedPlan} options={plans.map((p) => ({ value: p.id, label: p.name }))} />
        <Select label="Test Cycle" value={selectedCycle} onChange={setSelectedCycle} options={cycles.map((c) => ({ value: c.id, label: c.name }))} />
      </div>

      {/* Test Plan detail card */}
      {selectedPlanObj && (
        <PlanDetailCard plan={selectedPlanObj} planSummary={planSummary} cycles={cycles} onSelectCycle={setSelectedCycle} selectedCycle={selectedCycle} />
      )}

      {/* Cycle Summary bar */}
      {summary && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Cycle Summary</h3>
          <div className="flex gap-6">
            <SummaryPill label="Total" value={summary.total} color="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" />
            <SummaryPill label="Passed" value={summary.passed} color="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400" />
            <SummaryPill label="Failed" value={summary.failed} color="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400" />
            <SummaryPill label="Blocked" value={summary.blocked} color="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400" />
            <SummaryPill label="Not Run" value={summary.not_run} color="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" />
            <SummaryPill label="In Progress" value={summary.in_progress} color="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400" />
          </div>
          {summary.total > 0 && (
            <div className="mt-3 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex">
              <div className="bg-green-500 transition-all" style={{ width: `${(summary.passed / summary.total) * 100}%` }} />
              <div className="bg-red-500 transition-all" style={{ width: `${(summary.failed / summary.total) * 100}%` }} />
              <div className="bg-yellow-400 transition-all" style={{ width: `${(summary.blocked / summary.total) * 100}%` }} />
              <div className="bg-blue-400 transition-all" style={{ width: `${(summary.in_progress / summary.total) * 100}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Test runs table */}
      {runs.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-600 dark:text-gray-300">
              <tr>
                <th className="px-4 py-2.5 font-medium border-b border-gray-200 dark:border-gray-700">Test Case</th>
                <th className="px-4 py-2.5 font-medium border-b border-gray-200 dark:border-gray-700">Status</th>
                <th className="px-4 py-2.5 font-medium border-b border-gray-200 dark:border-gray-700">Steps</th>
                <th className="px-4 py-2.5 font-medium border-b border-gray-200 dark:border-gray-700">Assigned To</th>
                <th className="px-4 py-2.5 font-medium border-b border-gray-200 dark:border-gray-700">Execution Date</th>
                <th className="px-4 py-2.5 font-medium border-b border-gray-200 dark:border-gray-700 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {runs.map((run) => {
                const fields = parseRunFields(run);
                const stepCount = fields.testRunSteps?.length ?? 0;
                return (
                  <tr
                    key={run.id}
                    className={cn(
                      "hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors",
                      selectedRun?.id === run.id && "bg-blue-50 dark:bg-blue-950"
                    )}
                    onClick={() => setSelectedRun(run)}
                  >
                    <td className="px-4 py-2.5">
                      <div>{run.name || `Run ${run.id}`}</div>
                      {fields.documentKey && <div className="text-xs text-gray-400 font-mono">{fields.documentKey}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLOR[run.status] ?? STATUS_COLOR.NOT_RUN)}>
                        {STATUS_ICON[run.status] ?? STATUS_ICON.NOT_RUN}
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">
                      {stepCount > 0 ? `${stepCount} step${stepCount > 1 ? "s" : ""}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{run.assigned_to ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                      {run.execution_date ? new Date(run.execution_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedCycle && runs.length === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
          No test runs in this cycle.
        </div>
      )}

      {/* Test Run Detail slide-over */}
      {selectedRun && (
        <RunDetailPanel run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: number | null; onChange: (v: number) => void; options: { value: number; label: string }[] }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</label>
      <select
        className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px] dark:text-gray-200"
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        <option value="" disabled>Select...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function SummaryPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={cn("inline-block px-3 py-1 rounded-full text-lg font-bold", color)}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

/* ---------- Test Plan Detail Card ---------- */

function PlanDetailCard({
  plan,
  planSummary,
  cycles,
  onSelectCycle,
  selectedCycle,
}: {
  plan: TestPlan;
  planSummary: PlanSummary | null;
  cycles: TestCycle[];
  onSelectCycle: (id: number) => void;
  selectedCycle: number | null;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-purple-500" />
        <h3 className="text-sm font-semibold">Test Plan: {plan.name}</h3>
        <span className="text-xs text-gray-400 ml-auto">ID: {plan.id}</span>
      </div>
      <div className="p-4 space-y-3">
        {plan.description && (
          <div className="text-sm text-gray-600 dark:text-gray-400" dangerouslySetInnerHTML={{ __html: proxyJamaImages(plan.description) }} />
        )}

        {/* Plan-level summary */}
        {planSummary && planSummary.total && (
          <div className="flex gap-4 text-xs">
            <span className="font-medium text-gray-500 dark:text-gray-400">Plan total:</span>
            <span className="text-green-600 dark:text-green-400">{planSummary.total.passed} passed</span>
            <span className="text-red-600 dark:text-red-400">{planSummary.total.failed} failed</span>
            <span className="text-yellow-600 dark:text-yellow-400">{planSummary.total.blocked} blocked</span>
            <span className="text-gray-500 dark:text-gray-400">{planSummary.total.not_run} not run</span>
            <span className="text-blue-600 dark:text-blue-400">{planSummary.total.in_progress} in progress</span>
          </div>
        )}

        {/* Cycles list */}
        {cycles.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Cycles ({cycles.length})</h4>
            <div className="space-y-1.5">
              {cycles.map((c) => {
                const cycleSummary = planSummary?.cycles?.find((cs) => cs.cycle_id === c.id);
                const isActive = c.id === selectedCycle;
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelectCycle(c.id)}
                    className={cn(
                      "w-full text-left flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                      isActive
                        ? "bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent"
                    )}
                  >
                    <div>
                      <div className="font-medium">{c.name}</div>
                      {(c.start_date || c.end_date) && (
                        <div className="text-xs text-gray-400">
                          {c.start_date && new Date(c.start_date).toLocaleDateString()}
                          {c.start_date && c.end_date && " — "}
                          {c.end_date && new Date(c.end_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    {cycleSummary && (
                      <div className="flex gap-1 text-xs">
                        <span className="text-green-600">{cycleSummary.summary.passed}P</span>
                        <span className="text-red-600">{cycleSummary.summary.failed}F</span>
                        <span className="text-gray-400">{cycleSummary.summary.not_run}N</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {cycles.length === 0 && (
          <p className="text-sm text-gray-400">No test cycles in this plan.</p>
        )}
      </div>
    </div>
  );
}

/* ---------- Test Run Detail Panel ---------- */

const PANEL_MIN_W = 400;
const PANEL_MAX_W = 1200;
const PANEL_DEFAULT_W = 640;

function RunDetailPanel({ run, onClose }: { run: TestRun; onClose: () => void }) {
  const fields = parseRunFields(run);
  const steps = fields.testRunSteps ?? [];
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("run-panel-width");
      if (saved) return Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, Number(saved)));
    }
    return PANEL_DEFAULT_W;
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const newW = Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, window.innerWidth - e.clientX));
      setPanelWidth(newW);
    };
    const onUp = () => {
      setDragging(false);
      localStorage.setItem("run-panel-width", String(panelWidth));
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
  }, [dragging, panelWidth]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Drag handle */}
      <div
        className="relative w-1.5 shrink-0 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 bg-gray-300 dark:bg-gray-700 transition-colors z-10"
        onMouseDown={() => setDragging(true)}
        title="Drag to resize panel"
      />
      {/* Panel */}
      <div className="relative bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden" style={{ width: `${panelWidth}px` }}>
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-gray-400 shrink-0" />
              {fields.documentKey && <span className="text-xs font-mono text-gray-400">{fields.documentKey}</span>}
              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLOR[run.status] ?? STATUS_COLOR.NOT_RUN)}>
                {STATUS_ICON[run.status] ?? STATUS_ICON.NOT_RUN}
                {run.status}
              </span>
            </div>
            <h2 className="text-lg font-semibold leading-tight">{run.name || `Run ${run.id}`}</h2>
            <div className="flex gap-4 text-xs text-gray-400 mt-1">
              <span>ID: {run.id}</span>
              {fields.testRunSetName && <span>Set: {fields.testRunSetName}</span>}
              {fields.executionDate && <span>Executed: {new Date(fields.executionDate).toLocaleDateString()}</span>}
              {fields.duration != null && <span>Duration: {Math.round(fields.duration / 60000)}min</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md shrink-0 ml-3">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Description */}
          {fields.description && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Description</h3>
              <div className="prose prose-sm max-w-none dark:prose-invert text-sm" dangerouslySetInnerHTML={{ __html: proxyJamaImages(fields.description) }} />
            </section>
          )}

          {/* Actual Results */}
          {run.actual_results && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Actual Results</h3>
              <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-md p-3" dangerouslySetInnerHTML={{ __html: proxyJamaImages(run.actual_results) }} />
            </section>
          )}

          {/* Planned Results */}
          {run.planned_results && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Planned Results</h3>
              <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-md p-3" dangerouslySetInnerHTML={{ __html: proxyJamaImages(run.planned_results) }} />
            </section>
          )}

          {/* Steps */}
          {steps.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Test Steps ({steps.length})</h3>
              <div className="space-y-3">
                {steps.map((step, i) => (
                  <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs">
                      <span className="font-medium">Step {i + 1}</span>
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium", STATUS_COLOR[step.status] ?? STATUS_COLOR.NOT_RUN)}>
                        {STATUS_ICON[step.status] ?? STATUS_ICON.NOT_RUN}
                        {step.status}
                      </span>
                    </div>
                    <div className="p-3 space-y-2 text-sm">
                      {step.action && (
                        <div>
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">Action</div>
                          <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: proxyJamaImages(step.action) }} />
                        </div>
                      )}
                      {step.expectedResult && (
                        <div>
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">Expected Result</div>
                          <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: proxyJamaImages(step.expectedResult) }} />
                        </div>
                      )}
                      {step.result && (
                        <div>
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">Actual Result</div>
                          <div className="prose prose-sm max-w-none dark:prose-invert bg-gray-50 dark:bg-gray-800/50 rounded p-2" dangerouslySetInnerHTML={{ __html: proxyJamaImages(step.result) }} />
                        </div>
                      )}
                      {step.notes && (
                        <div>
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">Notes</div>
                          <div className="text-gray-600 dark:text-gray-400 text-xs">{step.notes}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {!fields.description && steps.length === 0 && !run.actual_results && (
            <p className="text-sm text-gray-400 text-center py-6">No additional details available for this test run.</p>
          )}
        </div>
      </div>
    </div>
  );
}
