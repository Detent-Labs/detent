import type {
  ClientError,
  InstancePage,
  InstanceRecordPage,
  InstanceView,
  LoginResponse,
  OutboxPage,
  OutboxRow,
  PendingTimerPage,
  ProcessSummary,
  UserPage,
  UserSummary,
  VersionSummary,
} from "./types.js";

/** Same-origin by default (the app is deployed alongside its API); override
 * for local dev against the devcontainer's server via VITE_API_URL. */
const API_BASE = import.meta.env.VITE_API_URL ?? "";

/** Thrown by every function below; `.error` is the typed, display-ready shape. `.status` is the HTTP status (undefined on a network failure). */
export class AdminClientError extends Error {
  constructor(readonly error: ClientError, readonly status?: number) {
    super(error.type);
    this.name = "AdminClientError";
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
    case "conflict":
      return { type: "conflict", message };
    default:
      return { type: "internal", message };
  }
}

async function request(path: string, token: string | undefined, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch (err) {
    throw new AdminClientError({ type: "internal", message: err instanceof Error ? err.message : String(err) });
  }
  if (!res.ok) throw new AdminClientError(await parseErrorBody(res), res.status);
  return res;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await request("/auth/login", undefined, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return (await res.json()) as LoginResponse;
}

export interface InstanceListParams {
  processId?: string;
  status?: string;
  currentStepId?: string;
  startedBy?: string;
  claimedBy?: string;
  limit?: number;
  cursor?: string;
}

export async function listInstances(token: string, params: InstanceListParams = {}): Promise<InstancePage> {
  const query = new URLSearchParams({ scope: "all" });
  if (params.processId) query.set("processId", params.processId);
  if (params.status) query.set("status", params.status);
  if (params.currentStepId) query.set("currentStepId", params.currentStepId);
  if (params.startedBy) query.set("startedBy", params.startedBy);
  if (params.claimedBy) query.set("claimedBy", params.claimedBy);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.cursor !== undefined) query.set("cursor", params.cursor);
  const res = await request(`/instances?${query}`, token);
  return (await res.json()) as InstancePage;
}

export async function getInstanceView(instanceId: string, token: string): Promise<InstanceView> {
  const res = await request(`/instances/${encodeURIComponent(instanceId)}`, token);
  return (await res.json()) as InstanceView;
}

export async function getInstanceRecord(instanceId: string, token: string, opts: { limit?: number; cursor?: string } = {}): Promise<InstanceRecordPage> {
  const query = new URLSearchParams();
  if (opts.limit !== undefined) query.set("limit", String(opts.limit));
  if (opts.cursor !== undefined) query.set("cursor", opts.cursor);
  const qs = query.toString();
  const res = await request(`/instances/${encodeURIComponent(instanceId)}/record${qs ? `?${qs}` : ""}`, token);
  return (await res.json()) as InstanceRecordPage;
}

export async function cancelInstance(instanceId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/cancel`, token, { method: "POST" });
}

export async function listVersions(processId: string, token: string): Promise<VersionSummary[]> {
  const res = await request(`/processes/${encodeURIComponent(processId)}/versions`, token);
  return (await res.json()) as VersionSummary[];
}

export async function listProcesses(token: string): Promise<ProcessSummary[]> {
  const res = await request("/processes", token);
  return (await res.json()) as ProcessSummary[];
}

export interface OutboxListParams {
  status?: string[];
  instanceId?: string;
  limit?: number;
  cursor?: string;
}

export async function listOutbox(token: string, params: OutboxListParams = {}): Promise<OutboxPage> {
  const query = new URLSearchParams();
  for (const s of params.status ?? []) query.append("status", s);
  if (params.instanceId) query.set("instanceId", params.instanceId);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.cursor !== undefined) query.set("cursor", params.cursor);
  const res = await request(`/admin/outbox?${query}`, token);
  return (await res.json()) as OutboxPage;
}

export async function retryOutboxRow(idempotencyKey: string, token: string): Promise<OutboxRow> {
  const res = await request(`/admin/outbox/${encodeURIComponent(idempotencyKey)}/retry`, token, { method: "POST" });
  return (await res.json()) as OutboxRow;
}

export async function discardOutboxRow(idempotencyKey: string, token: string): Promise<OutboxRow> {
  const res = await request(`/admin/outbox/${encodeURIComponent(idempotencyKey)}/discard`, token, { method: "POST" });
  return (await res.json()) as OutboxRow;
}

export async function listPendingTimers(token: string, opts: { limit?: number; cursor?: string } = {}): Promise<PendingTimerPage> {
  const query = new URLSearchParams();
  if (opts.limit !== undefined) query.set("limit", String(opts.limit));
  if (opts.cursor !== undefined) query.set("cursor", opts.cursor);
  const res = await request(`/admin/timers?${query}`, token);
  return (await res.json()) as PendingTimerPage;
}

export async function listUsers(token: string): Promise<UserPage> {
  const res = await request("/admin/users", token);
  return (await res.json()) as UserPage;
}

export async function disableUser(userId: string, token: string): Promise<UserSummary> {
  const res = await request(`/admin/users/${encodeURIComponent(userId)}/disable`, token, { method: "POST" });
  return (await res.json()) as UserSummary;
}

export async function enableUser(userId: string, token: string): Promise<UserSummary> {
  const res = await request(`/admin/users/${encodeURIComponent(userId)}/enable`, token, { method: "POST" });
  return (await res.json()) as UserSummary;
}
