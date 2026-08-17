import type { BottleneckView, CycleTimeView, ProcessSummary, SlaView } from "./types.js";
import type { DateRange } from "../screens/reportingLogic.js";
import { AppClientError, getJson as get } from "../../../api/client.js";

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
