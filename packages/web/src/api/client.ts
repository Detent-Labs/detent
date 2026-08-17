/**
 * The shared half of the HTTP client: the API base, the error type every area
 * throws, error-body parsing, and the one authenticated `request`. An area
 * keeps its own route functions and its own domain types on top of this.
 *
 * Login lives here rather than in an area, because the shell owns the login
 * screen and must not import downward from an area.
 */
import type { AccountView, ClientError, InstanceRecordPage, LoginResponse, PublishIssue, SubmissionIssue } from "./types.js";

/** Same-origin by default (the engine serves this bundle); override for local dev via VITE_API_URL. */
export const API_BASE = import.meta.env.VITE_API_URL ?? "";

/** Thrown by every request below; `.error` is the typed, display-ready shape. `.status` is the HTTP status (undefined on a network failure). */
export class AppClientError extends Error {
  constructor(
    readonly error: ClientError,
    readonly status?: number,
  ) {
    super(error.type);
    this.name = "AppClientError";
  }
}

/** The server's publish rejections carry either `loc` or a `path` array; both become `loc`. */
function toPublishIssues(raw: unknown): PublishIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((i) => {
    const issue = i as { loc?: unknown; path?: unknown; message?: unknown };
    const loc = typeof issue.loc === "string" ? issue.loc : Array.isArray(issue.path) ? issue.path.join(".") : "";
    return { loc, message: typeof issue.message === "string" ? issue.message : JSON.stringify(i) };
  });
}

export async function parseErrorBody(res: Response): Promise<ClientError> {
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
    case "unknown-delegate":
      return { type: "unknown-delegate", message };
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
    case "request-shape":
      return { type: "request-shape", message };
    case "not-found":
      return { type: "not-found", message };
    case "conflict":
      return { type: "conflict", message };
    case "draft-conflict":
      return { type: "draft-conflict", message };
    case "migration-plan":
      return { type: "migration-plan", message };
    case "self-role-strip":
      return { type: "self-role-strip", message };
    case "self-manager":
      return { type: "self-manager", message };
    case "unknown-manager":
      return { type: "unknown-manager", message };
    case "email-in-use":
      return { type: "email-in-use", message };
    case "registry-validation":
    case "cel-validation":
    case "duration-validation":
    case "compile-validation":
    case "schema-validation":
      return { type: "publish-validation", kind: err.type, issues: toPublishIssues(err.issues) };
    case "cross-process-validation":
      return { type: "cross-process-validation", message };
    default:
      return { type: "internal", message };
  }
}

export async function request(path: string, token: string | undefined, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch (err) {
    throw new AppClientError({ type: "network", message: err instanceof Error ? err.message : String(err) });
  }
  if (!res.ok) throw new AppClientError(await parseErrorBody(res), res.status);
  return res;
}

/** Every GET route that returns JSON as-is fits this one line; the four area clients call it instead of repeating it. */
export async function getJson<T>(path: string, token: string): Promise<T> {
  const res = await request(path, token);
  return (await res.json()) as T;
}

/** Two areas declared this byte-for-byte (admin, studio); it moved up rather than staying duplicated. */
export function getInstanceRecord(instanceId: string, token: string, opts: { limit?: number; cursor?: string } = {}): Promise<InstanceRecordPage> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.cursor !== undefined) params.set("cursor", opts.cursor);
  const qs = params.toString();
  return getJson(`/instances/${encodeURIComponent(instanceId)}/record${qs ? `?${qs}` : ""}`, token);
}

/** Two areas declared this identically (app, studio); it moved up rather than staying duplicated. */
export async function createInstance(processId: string, token: string): Promise<{ instanceId: string }> {
  const res = await request(`/processes/${encodeURIComponent(processId)}/instances`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  return (await res.json()) as { instanceId: string };
}

/** Two areas declared this identically (app, studio); it moved up rather than staying duplicated. */
export async function submitPath(instanceId: string, pathId: string, data: Record<string, unknown>, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/submit`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pathId, data }),
  });
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await request("/auth/login", undefined, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return (await res.json()) as LoginResponse;
}

/**
 * The actor's own account. Sits beside `login` for the same reason: the shell
 * owns the session these two fill, and must not import downward from an area.
 * The route takes no id — it reads the caller's own from the token.
 */
export async function fetchAccount(token: string): Promise<AccountView> {
  const res = await request("/account/me", token);
  return (await res.json()) as AccountView;
}

/**
 * The two fields the actor owns. The route answers with the whole account, so
 * the caller refreshes its view from the response rather than assuming its own
 * change landed verbatim. `displayName: null` clears the stored name.
 */
export async function patchAccount(token: string, changes: { displayName?: string | null; locale?: string }): Promise<AccountView> {
  const res = await request("/account/me", token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  return (await res.json()) as AccountView;
}

/**
 * Display text for any variant, including the three that carry no `message`.
 * An area with its own copy for a variant it renders specially still uses that;
 * this is the fallback that makes `ClientError` printable everywhere.
 */
export function errorText(error: ClientError): string {
  switch (error.type) {
    case "validation":
      return `${error.issues.length} field(s) were rejected.`;
    case "publish-validation":
      return `${error.issues.length} issue(s) in ${error.kind}.`;
    case "concurrency-conflict":
      return "This moved on while you were working on it.";
    default:
      return error.message;
  }
}
