import type { ClientError, DraftRecord, DraftSummary, LoginResponse, ProcessSummary, VersionSummary } from "./types.js";

/** Same-origin by default (the app is deployed alongside its API); override
 * for local dev against the devcontainer's server via VITE_API_URL. */
const API_BASE = import.meta.env.VITE_API_URL ?? "";

/** Thrown by every function below; `.error` is the typed, display-ready shape. `.status` is the HTTP status (undefined on a network failure). */
export class StudioClientError extends Error {
  constructor(readonly error: ClientError, readonly status?: number) {
    super(error.type);
    this.name = "StudioClientError";
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
    case "draft-conflict":
      return { type: "draft-conflict", message };
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
    throw new StudioClientError({ type: "internal", message: err instanceof Error ? err.message : String(err) });
  }
  if (!res.ok) throw new StudioClientError(await parseErrorBody(res), res.status);
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

export async function listProcesses(token: string): Promise<ProcessSummary[]> {
  const res = await request("/processes", token);
  return (await res.json()) as ProcessSummary[];
}

export async function listVersions(processId: string, token: string): Promise<VersionSummary[]> {
  const res = await request(`/processes/${encodeURIComponent(processId)}/versions`, token);
  return (await res.json()) as VersionSummary[];
}

export async function listDrafts(token: string): Promise<DraftSummary[]> {
  const res = await request("/drafts", token);
  return (await res.json()) as DraftSummary[];
}

/** `undefined` for a process with no draft (404), never thrown — a missing draft is an expected, not exceptional, shape for this call. */
export async function getDraft(processId: string, token: string): Promise<DraftRecord | undefined> {
  try {
    const res = await request(`/drafts/${encodeURIComponent(processId)}`, token);
    return (await res.json()) as DraftRecord;
  } catch (err) {
    if (err instanceof StudioClientError && err.error.type === "not-found") return undefined;
    throw err;
  }
}

export interface SaveDraftInput {
  body: unknown;
  layout: Record<string, unknown>;
  revision: number;
}

/** `undefined` on a 409 — a save conflict is expected, resolved by the caller via reload, never a thrown control-flow error. */
export async function saveDraft(processId: string, input: SaveDraftInput, token: string): Promise<DraftRecord | undefined> {
  try {
    const res = await request(`/drafts/${encodeURIComponent(processId)}`, token, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return (await res.json()) as DraftRecord;
  } catch (err) {
    if (err instanceof StudioClientError && err.error.type === "draft-conflict") return undefined;
    throw err;
  }
}

export async function deleteDraft(processId: string, token: string): Promise<void> {
  await request(`/drafts/${encodeURIComponent(processId)}`, token, { method: "DELETE" });
}
