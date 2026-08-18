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

/**
 * Every one of these 19 kinds returns the byte-identical `{type, message}`
 * shape below — the type itself IS the payload, so a membership check
 * replaces 19 `case` labels that would otherwise carry no per-type
 * information over the `Set` lookup.
 */
const PASSTHROUGH = new Set<ClientError["type"]>([
  "already-claimed",
  "not-a-candidate",
  "not-claimed",
  "not-claimant",
  "unknown-delegate",
  "not-assigned",
  "guard-refused",
  "authorization",
  "actor-resolution",
  "request-shape",
  "not-found",
  "conflict",
  "draft-conflict",
  "migration-plan",
  "self-role-strip",
  "self-manager",
  "unknown-manager",
  "email-in-use",
  "cross-process-validation",
]);

/** The server's six publish-time error classes collapse to one `ClientError` shape; five of the six (all but `cross-process-validation`, folded into `PASSTHROUGH` above) land here. */
const PUBLISH_VALIDATION = new Set(["registry-validation", "cel-validation", "duration-validation", "compile-validation", "schema-validation"]);

export async function parseErrorBody(res: Response): Promise<ClientError> {
  let parsed: { error?: { type?: string; message?: string; issues?: unknown[] } } | undefined;
  try {
    parsed = (await res.json()) as typeof parsed;
  } catch {
    // response body wasn't JSON — fall through to the generic mapping below
  }
  const err = parsed?.error;
  const message = err?.message ?? `HTTP ${res.status}`;
  const type = err?.type;
  if (type !== undefined && PASSTHROUGH.has(type as ClientError["type"])) {
    return { type, message } as ClientError;
  }
  if (type !== undefined && PUBLISH_VALIDATION.has(type)) {
    return { type: "publish-validation", kind: type, issues: toPublishIssues(err?.issues) };
  }
  if (type === "validation") {
    return { type: "validation", issues: (err?.issues ?? []) as SubmissionIssue[] };
  }
  if (type === "concurrency-conflict") {
    return { type: "concurrency-conflict" };
  }
  return { type: "internal", message };
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
