import type {
  BottleneckView,
  ColumnChoice,
  CycleTimeView,
  ProcessSummary,
  Report,
  ReportExecutionResult,
  ReportInput,
  ReportPatch,
  ReportQuery,
  ReportColumn,
  SlaView,
} from "./types.js";
import type { DateRange } from "../screens/reportingLogic.js";
import { AppClientError, getJson as get, request } from "../../../api/client.js";

export { AppClientError };

export async function listProcesses(token: string): Promise<ProcessSummary[]> {
  const body = await get<{ processes: ProcessSummary[] }>("/reporting/processes", token);
  return body.processes;
}

/** The range is always sent explicitly — the server applies no default of its own. */
function query(range: DateRange): string {
  return `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
}

export function fetchCycleTime(processId: string, range: DateRange, token: string): Promise<CycleTimeView> {
  return get(`/reporting/${encodeURIComponent(processId)}/cycle-time${query(range)}`, token);
}

export function fetchBottleneck(processId: string, range: DateRange, token: string): Promise<BottleneckView> {
  return get(`/reporting/${encodeURIComponent(processId)}/bottleneck${query(range)}`, token);
}

export function fetchSla(processId: string, range: DateRange, token: string): Promise<SlaView> {
  return get(`/reporting/${encodeURIComponent(processId)}/sla${query(range)}`, token);
}

// ============================================================
// Saved reports: CRUD, execution, and the unsaved-draft preview
// ============================================================

export function listMyReports(token: string): Promise<{ reports: Report[] }> {
  return get("/reporting/reports", token);
}

export async function createReport(input: ReportInput, token: string): Promise<Report> {
  const res = await request("/reporting/reports", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await res.json()) as Report;
}

export function getReport(reportId: string, token: string): Promise<Report> {
  return get(`/reporting/reports/${encodeURIComponent(reportId)}`, token);
}

export async function updateReport(reportId: string, patch: ReportPatch, token: string): Promise<Report> {
  const res = await request(`/reporting/reports/${encodeURIComponent(reportId)}`, token, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  return (await res.json()) as Report;
}

export async function deleteReport(reportId: string, token: string): Promise<void> {
  await request(`/reporting/reports/${encodeURIComponent(reportId)}`, token, { method: "DELETE" });
}

export function executeReport(reportId: string, token: string): Promise<ReportExecutionResult> {
  return get(`/reporting/reports/${encodeURIComponent(reportId)}/table`, token);
}

/** The raw CSV bytes as a `Blob`, auth carried on the bearer header — a plain `<a href>` cannot, so the caller drives the download itself. */
export async function downloadReportCsv(reportId: string, token: string): Promise<Blob> {
  const res = await request(`/reporting/reports/${encodeURIComponent(reportId)}/table.csv`, token);
  return res.blob();
}

export async function previewReport(
  draft: { processId: string; query?: ReportQuery; columns?: ReportColumn[] },
  token: string,
): Promise<ReportExecutionResult> {
  const res = await request("/reporting/reports/preview", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(draft),
  });
  return (await res.json()) as ReportExecutionResult;
}

export async function fetchReportColumnChoices(processId: string, columnQuery: ReportQuery, token: string): Promise<ColumnChoice[]> {
  const res = await request("/reporting/reports/columns", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ processId, query: columnQuery }),
  });
  return ((await res.json()) as { choices: ColumnChoice[] }).choices;
}
