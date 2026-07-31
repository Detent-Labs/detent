import type { BottleneckView, ClientError, CycleTimeView, LoginResponse, ProcessSummary, SlaView } from "./types.js";
import type { DateRange } from "../screens/reportingLogic.js";

/** Same-origin by default (the app is deployed alongside its API); override
 * for local dev against the devcontainer's server via VITE_API_URL. */
const API_BASE = import.meta.env.VITE_API_URL ?? "";

/** Thrown by every function below; `.error` is the typed, display-ready shape. `.status` is the HTTP status (undefined on a network failure). */
export class ReportingClientError extends Error {
  constructor(readonly error: ClientError, readonly status?: number) {
    super(error.type);
    this.name = "ReportingClientError";
  }
}

async function parseErrorBody(res: Response): Promise<ClientError> {
  let parsed: { error?: { type?: string; message?: string } } | undefined;
  try {
    parsed = (await res.json()) as typeof parsed;
  } catch {
    // response body wasn't JSON — fall through to the generic mapping below
  }
  const err = parsed?.error;
  const message = err?.message ?? `HTTP ${res.status}`;
  switch (err?.type) {
    case "authorization":
      return { type: "authorization", message };
    case "actor-resolution":
      return { type: "actor-resolution", message };
    case "request-shape":
      return { type: "request-shape", message };
    case "not-found":
      return { type: "not-found", message };
    default:
      return { type: "internal", message };
  }
}

async function get<T>(path: string, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (cause) {
    throw new ReportingClientError({ type: "network", message: cause instanceof Error ? cause.message : "network request failed" });
  }
  if (!res.ok) throw new ReportingClientError(await parseErrorBody(res), res.status);
  return (await res.json()) as T;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (cause) {
    throw new ReportingClientError({ type: "network", message: cause instanceof Error ? cause.message : "network request failed" });
  }
  if (!res.ok) throw new ReportingClientError(await parseErrorBody(res), res.status);
  return (await res.json()) as LoginResponse;
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
