import type { BottleneckView, CycleTimeView, ProcessSummary, SlaView } from "./types.js";
import type { DateRange } from "../screens/reportingLogic.js";
import { AppClientError, request } from "../../../api/client.js";

/** The reporting area threw its own error class before the consolidation; this keeps the name its screens use. */
export { AppClientError as ReportingClientError };

/** Every reporting route is a GET returning JSON, so one helper covers the area. */
async function get<T>(path: string, token: string): Promise<T> {
  const res = await request(path, token);
  return (await res.json()) as T;
}

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
