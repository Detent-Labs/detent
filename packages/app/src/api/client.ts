import type { ClientError, CommentPage, InstanceComment, InstancePage, InstanceView, LoginResponse, ProcessSummary, SubmissionIssue } from "./types.js";

/** Same-origin by default (the app is deployed alongside its API); override
 * for local dev against the devcontainer's server via VITE_API_URL. */
const API_BASE = import.meta.env.VITE_API_URL ?? "";

/** Thrown by every function below; `.error` is the typed, display-ready shape. `.status` is the HTTP status (undefined on a network failure). */
export class AppClientError extends Error {
  constructor(readonly error: ClientError, readonly status?: number) {
    super(error.type);
    this.name = "AppClientError";
  }
}

async function parseErrorBody(res: Response): Promise<ClientError> {
  let parsed: { error?: { type?: string; message?: string; issues?: unknown[] } } | undefined;
  try {
    parsed = (await res.json()) as typeof parsed;
  } catch {
    // response body wasn't JSON — fall through to the generic mapping below
  }
  const err = parsed?.error;
  const message = err?.message ?? `HTTP ${res.status}`;
  switch (err?.type) {
    case "validation":
      return { type: "validation", issues: (err.issues ?? []) as SubmissionIssue[] };
    case "already-claimed":
      return { type: "already-claimed", message };
    case "not-a-candidate":
      return { type: "not-a-candidate", message };
    case "not-claimed":
      return { type: "not-claimed", message };
    case "not-claimant":
      return { type: "not-claimant", message };
    case "not-assigned":
      return { type: "not-assigned", message };
    case "guard-refused":
      return { type: "guard-refused", message };
    case "concurrency-conflict":
      return { type: "concurrency-conflict" };
    case "authorization":
      return { type: "authorization", message };
    case "actor-resolution":
      return { type: "actor-resolution", message };
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
    throw new AppClientError({ type: "internal", message: err instanceof Error ? err.message : String(err) });
  }
  if (!res.ok) throw new AppClientError(await parseErrorBody(res), res.status);
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

export async function listMyTasks(token: string, opts: { limit?: number; cursor?: string } = {}): Promise<InstancePage> {
  const params = new URLSearchParams({ scope: "mine" });
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.cursor !== undefined) params.set("cursor", opts.cursor);
  const res = await request(`/instances?${params}`, token);
  return (await res.json()) as InstancePage;
}

export async function getInstanceView(instanceId: string, token: string): Promise<InstanceView> {
  const res = await request(`/instances/${encodeURIComponent(instanceId)}`, token);
  return (await res.json()) as InstanceView;
}

export async function claim(instanceId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/claim`, token, { method: "POST" });
}

export async function release(instanceId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/release`, token, { method: "POST" });
}

export async function delegate(instanceId: string, toActorId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/delegate`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toActorId }),
  });
}

export async function postComment(instanceId: string, text: string, token: string): Promise<InstanceComment> {
  const res = await request(`/instances/${encodeURIComponent(instanceId)}/comments`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return (await res.json()) as InstanceComment;
}

export async function listComments(instanceId: string, token: string, cursor?: string): Promise<CommentPage> {
  const params = new URLSearchParams();
  if (cursor !== undefined) params.set("cursor", cursor);
  const qs = params.toString();
  const res = await request(`/instances/${encodeURIComponent(instanceId)}/comments${qs ? `?${qs}` : ""}`, token);
  return (await res.json()) as CommentPage;
}

export async function submitPath(instanceId: string, pathId: string, data: Record<string, unknown>, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/submit`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pathId, data }),
  });
}

export async function cancelInstance(instanceId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/cancel`, token, { method: "POST" });
}

export async function listProcesses(token: string): Promise<ProcessSummary[]> {
  const res = await request("/processes", token);
  return (await res.json()) as ProcessSummary[];
}

export async function createInstance(processId: string, token: string): Promise<{ instanceId: string }> {
  const res = await request(`/processes/${encodeURIComponent(processId)}/instances`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  return (await res.json()) as { instanceId: string };
}
