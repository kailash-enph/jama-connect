import * as vscode from "vscode";
import { JamaTestPlan, JamaTestCycle, JamaTestRun } from "../api";
import { getConfig } from "../utils/config";

interface TestRunStep {
  action: string;
  expectedResult: string;
  result: string;
  notes: string;
  status: string;
}

// Matches both REST API URLs (/rest/v1/attachments/{id}/file) and web UI URLs (/attachment/{id}/filename)
const JAMA_IMG_RE = /https?:\/\/[^"'\s]*?\/(?:rest\/v1\/(?:attachments|files)\/(\d+)(?:\/file)?|attachment\/(\d+)\/[^"'\s]*)/gi;

function getEditorBaseUrl(): string {
  return `http://localhost:${getConfig().port}/editor`;
}

function rewriteImageUrls(html: string): string {
  const base = getEditorBaseUrl();
  return html.replace(JAMA_IMG_RE, (_match, restId, webId) => {
    const id = restId || webId;
    return `${base}/api/proxy/image/${id}`;
  });
}

function getCspMeta(): string {
  const base = getEditorBaseUrl();
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: data: ${base};">`;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PASSED: { bg: "#166534", text: "#bbf7d0" },
  FAILED: { bg: "#991b1b", text: "#fecaca" },
  BLOCKED: { bg: "#854d0e", text: "#fef08a" },
  INPROGRESS: { bg: "#1e40af", text: "#bfdbfe" },
  IN_PROGRESS: { bg: "#1e40af", text: "#bfdbfe" },
  NOT_RUN: { bg: "#374151", text: "#d1d5db" },
};

function statusBadge(status: string): string {
  const s = status.toUpperCase();
  const c = STATUS_COLORS[s] ?? STATUS_COLORS.NOT_RUN;
  return `<span class="badge" style="background:${c.bg};color:${c.text};">${status}</span>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SHARED_CSS = `
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; margin: 0; }
  h1 { font-size: 22px; margin: 0 0 4px 0; }
  .meta { font-size: 13px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
  .section { margin-top: 20px; }
  .section h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground); margin: 0 0 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px 12px; font-size: 12px; color: var(--vscode-descriptionForeground); border-bottom: 2px solid var(--vscode-panel-border); }
  td { padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
  .desc { background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textLink-foreground); padding: 12px; border-radius: 4px; font-size: 14px; }
  .badge { padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .toolbar { position: sticky; top: 0; z-index: 100; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); padding: 8px 0; margin: -20px -20px 16px -20px; padding: 8px 20px; display: flex; gap: 8px; align-items: center; }
  .toolbar .status-msg { font-size: 12px; color: var(--vscode-descriptionForeground); margin-left: auto; }
  .btn { padding: 4px 14px; border-radius: 4px; border: none; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
  .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .editable-field { display: none; }
  .readonly-field { display: block; }
  body.editing .editable-field { display: block; }
  body.editing .readonly-field { display: none; }
  .field-input, .field-textarea { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-family: inherit; font-size: 13px; }
  .field-textarea { min-height: 80px; resize: vertical; }
  .field-select { padding: 6px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-family: inherit; font-size: 13px; }
  .dirty-indicator { display: none; width: 8px; height: 8px; border-radius: 50%; background: var(--vscode-gitDecoration-modifiedResourceForeground); }
  body.dirty .dirty-indicator { display: inline-block; }
  .summary-card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 16px; margin-bottom: 20px; }
  .summary-card .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 12px; }
  .summary-card .summary-item { display: flex; flex-direction: column; gap: 2px; }
  .summary-card .summary-label { font-size: 11px; font-weight: 600; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.3px; }
  .summary-card .summary-value { font-size: 14px; }
  .step-summary { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
  .step-summary .step-count { display: flex; align-items: center; gap: 4px; font-size: 12px; }
  .step-summary .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .progress-bar { height: 6px; border-radius: 3px; background: var(--vscode-input-background); overflow: hidden; margin-top: 6px; display: flex; }
  .progress-bar .seg { height: 100%; }
`;

const SHARED_SCRIPT_BASE = `
  const vscode = acquireVsCodeApi();
  let isEditing = false;
  let isDirty = false;

  function setEditing(val) {
    isEditing = val;
    document.body.classList.toggle('editing', val);
    document.getElementById('btnEdit').style.display = val ? 'none' : 'inline-block';
    document.getElementById('btnPush').style.display = val ? 'inline-block' : 'none';
    document.getElementById('btnCancel').style.display = val ? 'inline-block' : 'none';
  }

  function setDirty(val) {
    isDirty = val;
    document.body.classList.toggle('dirty', val);
  }

  function setStatus(msg) {
    document.getElementById('statusMsg').textContent = msg;
    setTimeout(() => { document.getElementById('statusMsg').textContent = ''; }, 4000);
  }

  document.getElementById('btnEdit').addEventListener('click', () => {
    vscode.postMessage({ type: 'edit' });
  });

  document.getElementById('btnCancel').addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
  });

  document.getElementById('btnPush').addEventListener('click', () => {
    vscode.postMessage({ type: 'push', fields: gatherFields() });
    document.getElementById('btnPush').disabled = true;
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'setEditing') {
      setEditing(msg.editing);
      if (msg.message) setStatus(msg.message);
    } else if (msg.type === 'pushResult') {
      setStatus(msg.message || 'Pushed to Jama');
      setDirty(false);
      document.getElementById('btnPush').disabled = false;
      if (msg.success) setEditing(false);
    } else if (msg.type === 'error') {
      setStatus(msg.message || 'Error');
      document.getElementById('btnPush').disabled = false;
    }
  });
`;

function toolbarHtml(): string {
  return `<div class="toolbar">
    <button class="btn btn-primary" id="btnEdit">Edit</button>
    <button class="btn btn-primary" id="btnPush" style="display:none;">Push to Jama</button>
    <button class="btn btn-secondary" id="btnCancel" style="display:none;">Cancel</button>
    <span class="dirty-indicator" title="Unsaved changes"></span>
    <span class="status-msg" id="statusMsg"></span>
  </div>`;
}

// ========== SHARED SUMMARY HELPERS ==========

function buildRunStatusSummary(runs: JamaTestRun[]): string {
  if (runs.length === 0) { return ""; }
  const counts: Record<string, number> = { PASSED: 0, FAILED: 0, BLOCKED: 0, INPROGRESS: 0, NOT_RUN: 0 };
  for (const r of runs) {
    const k = r.status?.toUpperCase() ?? "NOT_RUN";
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return buildProgressHtml(counts, runs.length, "Runs");
}

function buildProgressHtml(counts: Record<string, number>, total: number, label: string): string {
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
  const dotColors: Record<string, string> = {
    PASSED: "#22c55e", FAILED: "#ef4444", BLOCKED: "#eab308",
    INPROGRESS: "#3b82f6", NOT_RUN: "#6b7280",
  };
  const countBadges = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([status, n]) => `<span class="step-count"><span class="dot" style="background:${dotColors[status] ?? "#6b7280"};"></span>${n} ${status}</span>`)
    .join("");
  const progressSegs = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([status, n]) => `<div class="seg" style="width:${pct(n)}%;background:${dotColors[status] ?? "#6b7280"};"></div>`)
    .join("");
  return `
    <div class="summary-item" style="grid-column: 1 / -1;">
      <div class="summary-label">${label} Progress (${total})</div>
      <div class="progress-bar">${progressSegs}</div>
      <div class="step-summary">${countBadges}</div>
    </div>`;
}

// ========== TEST PLAN ==========

function buildTestPlanSummaryCard(plan: JamaTestPlan, cycles: JamaTestCycle[], allRuns: JamaTestRun[]): string {
  const items: string[] = [];
  items.push(`<div class="summary-item"><div class="summary-label">Plan ID</div><div class="summary-value">${plan.id}</div></div>`);
  items.push(`<div class="summary-item"><div class="summary-label">Project</div><div class="summary-value">${plan.project_id}</div></div>`);
  items.push(`<div class="summary-item"><div class="summary-label">Status</div><div class="summary-value">${statusBadge(plan.status)}</div></div>`);
  items.push(`<div class="summary-item"><div class="summary-label">Cycles</div><div class="summary-value">${cycles.length}</div></div>`);
  items.push(`<div class="summary-item"><div class="summary-label">Total Runs</div><div class="summary-value">${allRuns.length}</div></div>`);
  const runProgress = buildRunStatusSummary(allRuns);
  return `<div class="summary-card">
    <div style="font-size:13px;font-weight:600;color:var(--vscode-descriptionForeground);">SUMMARY</div>
    <div class="summary-grid">${items.join("\n")}${runProgress}</div>
  </div>`;
}

export function getTestPlanDetailHtml(
  _webview: vscode.Webview,
  plan: JamaTestPlan,
  cycles: JamaTestCycle[],
  allRuns?: JamaTestRun[]
): string {
  const cycleRows = cycles
    .map(
      (c) => `<tr style="cursor:pointer;" onclick="openCycle(${c.id})">
        <td>${escapeHtml(c.name)}</td>
        <td>${statusBadge(c.status)}</td>
        <td>${c.start_date ? new Date(c.start_date).toLocaleDateString() : "\u2014"}</td>
        <td>${c.end_date ? new Date(c.end_date).toLocaleDateString() : "\u2014"}</td>
      </tr>`
    )
    .join("");

  let fields: Record<string, unknown> = {};
  try { fields = JSON.parse(plan.fields_json || "{}"); } catch { /* ignore */ }
  const desc = rewriteImageUrls((fields.description as string) ?? plan.description ?? "");

  const summaryCard = buildTestPlanSummaryCard(plan, cycles, allRuns ?? []);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" />${getCspMeta()}<style>${SHARED_CSS}</style></head>
<body>
  ${toolbarHtml()}
  <div style="display:flex;align-items:center;gap:10px;">
    <div class="readonly-field"><h1>${escapeHtml(plan.name)}</h1></div>
    <div class="editable-field"><input class="field-input" id="f_name" value="${escapeHtml(plan.name)}" data-field="name" /></div>
    ${statusBadge(plan.status)}
  </div>

  ${summaryCard}

  <div class="section">
    <h2>Description</h2>
    <div class="readonly-field">${desc ? `<div class="desc">${desc}</div>` : '<span style="color:var(--vscode-descriptionForeground);">\u2014</span>'}</div>
    <div class="editable-field"><textarea class="field-textarea" id="f_description" data-field="description">${escapeHtml(typeof desc === 'string' ? desc.replace(/<[^>]*>/g, '') : '')}</textarea></div>
  </div>

  <div class="section">
    <h2>Test Cycles (${cycles.length})</h2>
    ${cycles.length > 0
      ? `<table><thead><tr><th>Cycle</th><th>Status</th><th>Start</th><th>End</th></tr></thead><tbody>${cycleRows}</tbody></table>`
      : '<p style="color:var(--vscode-descriptionForeground);">No test cycles in this plan.</p>'}
  </div>

  <script>
    ${SHARED_SCRIPT_BASE}
    function gatherFields() {
      const fields = {};
      document.querySelectorAll('[data-field]').forEach(el => {
        fields[el.dataset.field] = el.value;
      });
      return fields;
    }
    document.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('input', () => setDirty(true));
    });
    function openCycle(cycleId) {
      vscode.postMessage({ type: 'openCycle', cycleId });
    }
  </script>
</body>
</html>`;
}

// ========== TEST CYCLE ==========

function buildTestCycleSummaryCard(cycle: JamaTestCycle, runs: JamaTestRun[]): string {
  const items: string[] = [];
  items.push(`<div class="summary-item"><div class="summary-label">Cycle ID</div><div class="summary-value">${cycle.id}</div></div>`);
  items.push(`<div class="summary-item"><div class="summary-label">Plan ID</div><div class="summary-value">${cycle.test_plan_id}</div></div>`);
  items.push(`<div class="summary-item"><div class="summary-label">Status</div><div class="summary-value">${statusBadge(cycle.status)}</div></div>`);
  if (cycle.start_date) {
    items.push(`<div class="summary-item"><div class="summary-label">Start Date</div><div class="summary-value">${new Date(cycle.start_date).toLocaleDateString()}</div></div>`);
  }
  if (cycle.end_date) {
    items.push(`<div class="summary-item"><div class="summary-label">End Date</div><div class="summary-value">${new Date(cycle.end_date).toLocaleDateString()}</div></div>`);
  }
  if (cycle.start_date && cycle.end_date) {
    const days = Math.ceil((new Date(cycle.end_date).getTime() - new Date(cycle.start_date).getTime()) / 86400000);
    items.push(`<div class="summary-item"><div class="summary-label">Duration</div><div class="summary-value">${days} day${days !== 1 ? 's' : ''}</div></div>`);
  }
  items.push(`<div class="summary-item"><div class="summary-label">Total Runs</div><div class="summary-value">${runs.length}</div></div>`);
  const runProgress = buildRunStatusSummary(runs);
  return `<div class="summary-card">
    <div style="font-size:13px;font-weight:600;color:var(--vscode-descriptionForeground);">SUMMARY</div>
    <div class="summary-grid">${items.join("\n")}${runProgress}</div>
  </div>`;
}

export function getTestCycleDetailHtml(
  _webview: vscode.Webview,
  cycle: JamaTestCycle,
  runs: JamaTestRun[]
): string {
  const runRows = runs
    .map(
      (r) => `<tr style="cursor:pointer;" onclick="openRun(${r.id})">
        <td>${escapeHtml(r.name)}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${r.assigned_to ?? "\u2014"}</td>
        <td>${r.execution_date ? new Date(r.execution_date).toLocaleDateString() : "\u2014"}</td>
      </tr>`
    )
    .join("");

  let fields: Record<string, unknown> = {};
  try { fields = JSON.parse(cycle.fields_json || "{}"); } catch { /* ignore */ }
  const desc = rewriteImageUrls((fields.description as string) ?? cycle.description ?? "");

  const summaryCard = buildTestCycleSummaryCard(cycle, runs);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" />${getCspMeta()}<style>${SHARED_CSS}</style></head>
<body>
  ${toolbarHtml()}
  <div style="display:flex;align-items:center;gap:10px;">
    <div class="readonly-field"><h1>${escapeHtml(cycle.name)}</h1></div>
    <div class="editable-field"><input class="field-input" id="f_name" value="${escapeHtml(cycle.name)}" data-field="name" /></div>
    ${statusBadge(cycle.status)}
  </div>

  ${summaryCard}

  <div class="section">
    <h2>Description</h2>
    <div class="readonly-field">${desc ? `<div class="desc">${desc}</div>` : '<span style="color:var(--vscode-descriptionForeground);">\u2014</span>'}</div>
    <div class="editable-field"><textarea class="field-textarea" id="f_description" data-field="description">${escapeHtml(typeof desc === 'string' ? desc.replace(/<[^>]*>/g, '') : '')}</textarea></div>
  </div>

  <div class="section editable-field">
    <h2>Dates</h2>
    <div style="display:flex;gap:16px;">
      <div><label style="font-size:12px;display:block;margin-bottom:4px;">Start Date</label><input type="date" class="field-input" id="f_startDate" data-field="startDate" value="${cycle.start_date ? new Date(cycle.start_date).toISOString().slice(0, 10) : ""}" /></div>
      <div><label style="font-size:12px;display:block;margin-bottom:4px;">End Date</label><input type="date" class="field-input" id="f_endDate" data-field="endDate" value="${cycle.end_date ? new Date(cycle.end_date).toISOString().slice(0, 10) : ""}" /></div>
    </div>
  </div>

  <div class="section">
    <h2>Test Runs (${runs.length})</h2>
    ${runs.length > 0
      ? `<table><thead><tr><th>Test Run</th><th>Status</th><th>Assigned</th><th>Execution Date</th></tr></thead><tbody>${runRows}</tbody></table>`
      : '<p style="color:var(--vscode-descriptionForeground);">No test runs in this cycle.</p>'}
  </div>

  <script>
    ${SHARED_SCRIPT_BASE}
    function gatherFields() {
      const fields = {};
      document.querySelectorAll('[data-field]').forEach(el => {
        fields[el.dataset.field] = el.value;
      });
      return fields;
    }
    document.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('input', () => setDirty(true));
    });
    function openRun(runId) {
      vscode.postMessage({ type: 'openRun', runId });
    }
  </script>
</body>
</html>`;
}

// ========== TEST RUN ==========

const STATUS_OPTIONS = ["NOT_RUN", "PASSED", "FAILED", "BLOCKED", "INPROGRESS"];

function buildStepSummary(steps: TestRunStep[]): string {
  if (steps.length === 0) { return ""; }
  const counts: Record<string, number> = { PASSED: 0, FAILED: 0, BLOCKED: 0, INPROGRESS: 0, NOT_RUN: 0 };
  for (const s of steps) {
    const k = s.status?.toUpperCase() ?? "NOT_RUN";
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return buildProgressHtml(counts, steps.length, "Steps");
}

function buildTestRunSummaryCard(run: JamaTestRun, fields: Record<string, unknown>, steps: TestRunStep[]): string {
  const documentKey = (fields.documentKey as string) ?? "";
  const duration = fields.duration as number | undefined;
  const testGroup = (fields.testGroup as string) ?? "";
  const priority = (fields.priority as string) ?? "";

  const items: string[] = [];

  // Row 1: Key identifiers
  items.push(`<div class="summary-item"><div class="summary-label">Run ID</div><div class="summary-value">${run.id}</div></div>`);
  if (documentKey) {
    items.push(`<div class="summary-item"><div class="summary-label">Document Key</div><div class="summary-value">${escapeHtml(documentKey)}</div></div>`);
  }
  if (run.test_case_id) {
    items.push(`<div class="summary-item"><div class="summary-label">Test Case</div><div class="summary-value">${run.test_case_id}</div></div>`);
  }
  items.push(`<div class="summary-item"><div class="summary-label">Status</div><div class="summary-value">${statusBadge(run.status)}</div></div>`);

  // Row 2: People & dates
  if (run.assigned_to) {
    items.push(`<div class="summary-item"><div class="summary-label">Assigned To</div><div class="summary-value">${run.assigned_to}</div></div>`);
  }
  if (run.execution_date) {
    items.push(`<div class="summary-item"><div class="summary-label">Execution Date</div><div class="summary-value">${new Date(run.execution_date).toLocaleDateString()}</div></div>`);
  }
  if (duration != null && duration > 0) {
    const mins = Math.round(duration / 60000);
    items.push(`<div class="summary-item"><div class="summary-label">Duration</div><div class="summary-value">${mins > 0 ? mins + " min" : "<1 min"}</div></div>`);
  }

  // Row 3: Extra fields
  if (testGroup) {
    items.push(`<div class="summary-item"><div class="summary-label">Test Group</div><div class="summary-value">${escapeHtml(testGroup)}</div></div>`);
  }
  if (priority) {
    items.push(`<div class="summary-item"><div class="summary-label">Priority</div><div class="summary-value">${escapeHtml(priority)}</div></div>`);
  }

  const stepsSummary = buildStepSummary(steps);

  return `<div class="summary-card">
    <div style="font-size:13px;font-weight:600;color:var(--vscode-descriptionForeground);">SUMMARY</div>
    <div class="summary-grid">
      ${items.join("\n")}
      ${stepsSummary}
    </div>
  </div>`;
}

export function getTestRunDetailHtml(
  _webview: vscode.Webview,
  run: JamaTestRun
): string {
  let fields: Record<string, unknown> = {};
  try { fields = JSON.parse(run.fields_json || "{}"); } catch { /* ignore */ }

  const description = rewriteImageUrls((fields.description as string) ?? "");
  const steps = ((fields.testRunSteps as TestRunStep[]) ?? []).map(s => ({
    ...s,
    action: rewriteImageUrls(s.action || ""),
    expectedResult: rewriteImageUrls(s.expectedResult || ""),
    result: rewriteImageUrls(s.result || ""),
  }));
  const actualResults = rewriteImageUrls((fields.actualResults as string) ?? run.actual_results ?? "");

  const summaryCard = buildTestRunSummaryCard(run, fields, steps);

  const statusOptions = STATUS_OPTIONS
    .map(s => `<option value="${s}" ${s === run.status ? 'selected' : ''}>${s}</option>`)
    .join("");

  const stepsReadonly = steps
    .map(
      (step, i) => `
    <div style="border:1px solid var(--vscode-panel-border);border-radius:6px;margin-bottom:10px;overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:center;background:var(--vscode-sideBar-background);padding:8px 12px;font-size:12px;">
        <b>Step ${i + 1}</b>
        ${statusBadge(step.status)}
      </div>
      <div style="padding:12px;font-size:13px;">
        ${step.action ? `<div style="margin-bottom:8px;"><div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Action</div><div>${step.action}</div></div>` : ""}
        ${step.expectedResult ? `<div style="margin-bottom:8px;"><div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Expected Result</div><div>${step.expectedResult}</div></div>` : ""}
        ${step.result ? `<div style="margin-bottom:8px;"><div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Actual Result</div><div class="desc">${step.result}</div></div>` : ""}
        ${step.notes ? `<div><div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Notes</div><div style="font-size:12px;color:var(--vscode-descriptionForeground);">${escapeHtml(step.notes)}</div></div>` : ""}
      </div>
    </div>`
    )
    .join("");

  const stepsEditable = steps
    .map(
      (step, i) => `
    <div class="step-card" data-step-index="${i}" style="border:1px solid var(--vscode-panel-border);border-radius:6px;margin-bottom:10px;overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:center;background:var(--vscode-sideBar-background);padding:8px 12px;font-size:12px;">
        <b>Step ${i + 1}</b>
        <select class="field-select step-status" data-step="${i}" data-step-field="status">${STATUS_OPTIONS.map(s => `<option value="${s}" ${s === step.status ? 'selected' : ''}>${s}</option>`).join("")}</select>
      </div>
      <div style="padding:12px;font-size:13px;">
        ${step.action ? `<div style="margin-bottom:8px;"><div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Action</div><div>${step.action}</div></div>` : ""}
        ${step.expectedResult ? `<div style="margin-bottom:8px;"><div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Expected Result</div><div>${step.expectedResult}</div></div>` : ""}
        <div style="margin-bottom:8px;">
          <div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Actual Result</div>
          <textarea class="field-textarea step-field" data-step="${i}" data-step-field="result" rows="3">${escapeHtml(step.result || "")}</textarea>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:2px;">Notes</div>
          <textarea class="field-textarea step-field" data-step="${i}" data-step-field="notes" rows="2">${escapeHtml(step.notes || "")}</textarea>
        </div>
      </div>
    </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" />${getCspMeta()}<style>${SHARED_CSS}</style></head>
<body>
  ${toolbarHtml()}
  <div style="display:flex;align-items:center;gap:10px;">
    <h1>${escapeHtml(run.name || "Run " + run.id)}</h1>
    <div class="readonly-field">${statusBadge(run.status)}</div>
    ${steps.length === 0 ? `<div class="editable-field"><select class="field-select" id="f_testRunStatus" data-field="testRunStatus">${statusOptions}</select></div>` : `<div class="editable-field"><span style="font-size:12px;color:var(--vscode-descriptionForeground);">${statusBadge(run.status)} (derived from steps)</span></div>`}
  </div>

  ${summaryCard}

  ${description ? `<div class="section"><h2>Description</h2><div class="desc">${description}</div></div>` : ""}

  <div class="section">
    <h2>Actual Results</h2>
    <div class="readonly-field">${actualResults ? `<div class="desc">${actualResults}</div>` : '<span style="color:var(--vscode-descriptionForeground);">\u2014</span>'}</div>
    <div class="editable-field"><textarea class="field-textarea" id="f_actualResults" data-field="actualResults" rows="4">${escapeHtml(typeof actualResults === 'string' ? actualResults.replace(/<[^>]*>/g, '') : '')}</textarea></div>
  </div>

  ${run.planned_results ? `<div class="section"><h2>Planned Results</h2><div class="desc">${rewriteImageUrls(run.planned_results)}</div></div>` : ""}

  ${steps.length > 0 ? `
  <div class="section">
    <h2>Test Steps (${steps.length})</h2>
    <div class="readonly-field">${stepsReadonly}</div>
    <div class="editable-field">${stepsEditable}</div>
  </div>
  ` : ""}

  ${!description && steps.length === 0 && !actualResults ? '<p style="color:var(--vscode-descriptionForeground);text-align:center;padding:30px 0;">No additional details available for this test run.</p>' : ""}

  <script>
    const originalSteps = ${JSON.stringify(steps)};

    ${SHARED_SCRIPT_BASE}

    function gatherFields() {
      const fields = {};

      // Top-level fields
      document.querySelectorAll('[data-field]').forEach(el => {
        fields[el.dataset.field] = el.tagName === 'SELECT' ? el.value : el.value;
      });

      // Steps
      const stepCards = document.querySelectorAll('.step-card');
      if (stepCards.length > 0) {
        const stepsData = originalSteps.map((s, i) => ({ ...s }));
        stepCards.forEach(card => {
          const idx = parseInt(card.dataset.stepIndex, 10);
          card.querySelectorAll('[data-step-field]').forEach(el => {
            const field = el.dataset.stepField;
            stepsData[idx][field] = el.value;
          });
        });
        fields.testRunSteps = stepsData;
      }

      return fields;
    }

    // Dirty tracking
    document.querySelectorAll('[data-field], .step-field, .step-status').forEach(el => {
      el.addEventListener('input', () => setDirty(true));
      el.addEventListener('change', () => setDirty(true));
    });
  </script>
</body>
</html>`;
}
