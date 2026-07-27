import type { ClientError, InstanceView, LoginResponse, SubmissionIssue } from "./types";

/** Thrown by every function below; `.error` is the typed, display-ready shape. `.status` is the HTTP status (undefined on a network failure), used by the store to detect a 401 and return to login. */
export class PlayerClientError extends Error {
  constructor(readonly error: ClientError, readonly status?: number) {
    super(error.type);
    this.name = "PlayerClientError";
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
  if (err?.type === "validation") return { type: "validation", issues: (err.issues ?? []) as SubmissionIssue[] };
  if (err?.type === "guard-refused") return { type: "guard-refused", message: err.message ?? "the selected path is no longer available" };
  if (err?.type === "concurrency-conflict") return { type: "concurrency-conflict" };
  if (err?.type === "rate-limited") return { type: "rate-limited", message: err.message ?? "too many attempts, try again later" };
  return { type: "internal", message: err?.message ?? `HTTP ${res.status}` };
}

async function request(serverUrl: string, path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${serverUrl}${path}`, init);
  } catch (err) {
    throw new PlayerClientError({ type: "internal", message: err instanceof Error ? err.message : String(err) });
  }
  if (!res.ok) throw new PlayerClientError(await parseErrorBody(res), res.status);
  return res;
}

/** The HTTP wrapper's JWT resolver reads the actor from this header only — never from a body/query `actor` field (design.md/CLAUDE.md). */
function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function login(serverUrl: string, email: string, password: string): Promise<LoginResponse> {
  const res = await request(serverUrl, "/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return (await res.json()) as LoginResponse;
}

export async function createInstance(
  serverUrl: string,
  processId: string,
  token: string,
  opts: { version?: number; data?: Record<string, unknown> } = {},
): Promise<{ instanceId: string }> {
  const res = await request(serverUrl, `/processes/${encodeURIComponent(processId)}/instances`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ version: opts.version, data: opts.data }),
  });
  const body = (await res.json()) as { instanceId: string };
  return { instanceId: body.instanceId };
}

export async function getInstanceView(serverUrl: string, instanceId: string, token: string): Promise<InstanceView> {
  const res = await request(serverUrl, `/instances/${encodeURIComponent(instanceId)}`, { headers: authHeaders(token) });
  return (await res.json()) as InstanceView;
}

export async function submit(
  serverUrl: string,
  instanceId: string,
  pathId: string,
  data: Record<string, unknown>,
  token: string,
): Promise<void> {
  await request(serverUrl, `/instances/${encodeURIComponent(instanceId)}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ pathId, data }),
  });
}
