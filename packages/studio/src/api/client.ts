import type {
  ClientError,
  DraftRecord,
  DraftSummary,
  LoginResponse,
  ProcessSummary,
  VersionSummary,
  PublishResult,
  MigrationPlan,
  OrphanKeyScan,
  RegistryInfo,
  InstanceView,
  InstanceRecordPage,
  SubmissionIssue,
} from "./types.js";

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
  let parsed: { error?: { type?: string; message?: string; issues?: unknown[] } } | undefined;
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
    case "migration-plan":
      return { type: "migration-plan", message };
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
  /** Set only when seeding a draft from a published version; omitted leaves the stored base alone. */
  baseVersion?: number;
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

/** Publishes the *persisted* draft server-side — there is nothing for the caller to supply beyond the process id (studio-publish spec). */
export async function publishDraft(processId: string, token: string): Promise<PublishResult> {
  const res = await request(`/drafts/${encodeURIComponent(processId)}/publish`, token, { method: "POST" });
  return (await res.json()) as PublishResult;
}

/** The compiled body of one published version — opaque JSON, used for diffing (process-version-inspection spec). */
export async function getVersionBody(processId: string, version: number, token: string): Promise<unknown> {
  const res = await request(`/processes/${encodeURIComponent(processId)}/versions/${version}`, token);
  return await res.json();
}

/** `undefined` for a key with no registered plan (404), never thrown — same "expected shape" reasoning as getDraft. */
export async function getMigrationPlan(processId: string, fromVersion: number, toVersion: number, token: string): Promise<MigrationPlan | undefined> {
  try {
    const res = await request(`/migration-plans/${encodeURIComponent(processId)}/${fromVersion}/${toVersion}`, token);
    return (await res.json()) as MigrationPlan;
  } catch (err) {
    if (err instanceof StudioClientError && err.error.type === "not-found") return undefined;
    throw err;
  }
}

/** `spec` is opaque JSON (parsed from the plan editor's textarea) — validated server-side, same as saveDraft's `body`. */
export async function putMigrationPlan(processId: string, fromVersion: number, toVersion: number, spec: unknown, token: string): Promise<MigrationPlan> {
  const res = await request(`/migration-plans/${encodeURIComponent(processId)}/${fromVersion}/${toVersion}`, token, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(spec),
  });
  return (await res.json()) as MigrationPlan;
}

export async function getOrphanKeys(processId: string, version: number, token: string): Promise<OrphanKeyScan> {
  const res = await request(`/processes/${encodeURIComponent(processId)}/versions/${version}/orphan-keys`, token);
  return (await res.json()) as OrphanKeyScan;
}

/** The running server's registered action-handler and data-source type names (studio-tools spec). */
export async function getRegistry(token: string): Promise<RegistryInfo> {
  const res = await request("/registry", token);
  return (await res.json()) as RegistryInfo;
}

// ============================================================
// Player (studio-player spec) — same Runtime API Layer routes
// packages/app's TaskScreen already calls.
// ============================================================

export async function createInstance(processId: string, token: string): Promise<{ instanceId: string }> {
  const res = await request(`/processes/${encodeURIComponent(processId)}/instances`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  return (await res.json()) as { instanceId: string };
}

export async function getInstanceView(instanceId: string, token: string): Promise<InstanceView> {
  const res = await request(`/instances/${encodeURIComponent(instanceId)}`, token);
  return (await res.json()) as InstanceView;
}

export async function submitPath(instanceId: string, pathId: string, data: Record<string, unknown>, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/submit`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pathId, data }),
  });
}

export async function claimStep(instanceId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/claim`, token, { method: "POST" });
}

export async function releaseClaim(instanceId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/release`, token, { method: "POST" });
}

/** The merged transition/event record beside the Player (studio-player spec). Authorized either by `system:admin` or, additively, by `system:developer` plus having started the instance (authorization spec). */
export async function getInstanceRecord(instanceId: string, token: string, opts: { limit?: number; cursor?: string } = {}): Promise<InstanceRecordPage> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.cursor !== undefined) params.set("cursor", opts.cursor);
  const qs = params.toString();
  const res = await request(`/instances/${encodeURIComponent(instanceId)}/record${qs ? `?${qs}` : ""}`, token);
  return (await res.json()) as InstanceRecordPage;
}
