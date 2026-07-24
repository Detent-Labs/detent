import type { Actor, ClientError, InstanceView, SubmissionIssue } from "./types";

/** Thrown by every function below; `.error` is the typed, display-ready shape. */
export class PlayerClientError extends Error {
  constructor(readonly error: ClientError) {
    super(error.type === "validation" ? "validation" : error.type === "concurrency-conflict" ? "concurrency-conflict" : error.message);
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
  return { type: "internal", message: err?.message ?? `HTTP ${res.status}` };
}

async function request(serverUrl: string, path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${serverUrl}${path}`, init);
  } catch (err) {
    throw new PlayerClientError({ type: "internal", message: err instanceof Error ? err.message : String(err) });
  }
  if (!res.ok) throw new PlayerClientError(await parseErrorBody(res));
  return res;
}

/** The HTTP wrapper's dev resolver reads the actor from these headers only — never from a body/query `actor` field (design.md/CLAUDE.md). */
function actorHeaders(actor: Actor): Record<string, string> {
  return { "X-Actor-Id": actor.id, "X-Actor-Roles": actor.roles.join(",") };
}

export async function createInstance(
  serverUrl: string,
  processId: string,
  actor: Actor,
  opts: { version?: number; data?: Record<string, unknown> } = {},
): Promise<{ instanceId: string }> {
  const res = await request(serverUrl, `/processes/${encodeURIComponent(processId)}/instances`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders(actor) },
    body: JSON.stringify({ version: opts.version, data: opts.data }),
  });
  const body = (await res.json()) as { instanceId: string };
  return { instanceId: body.instanceId };
}

export async function getInstanceView(serverUrl: string, instanceId: string, actor: Actor): Promise<InstanceView> {
  const res = await request(serverUrl, `/instances/${encodeURIComponent(instanceId)}`, { headers: actorHeaders(actor) });
  return (await res.json()) as InstanceView;
}

export async function submit(
  serverUrl: string,
  instanceId: string,
  pathId: string,
  data: Record<string, unknown>,
  actor: Actor,
): Promise<void> {
  await request(serverUrl, `/instances/${encodeURIComponent(instanceId)}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders(actor) },
    body: JSON.stringify({ pathId, data }),
  });
}
