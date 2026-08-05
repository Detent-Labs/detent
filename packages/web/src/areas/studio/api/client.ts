import type {
  DraftRecord,
  DraftSummary,
  ProcessSummary,
  VersionSummary,
  PublishResult,
  MigrationPlan,
  OrphanKeyScan,
  RegistryInfo,
  InstanceView,
  InstanceRecordPage,
  TemplateSummary,
  TemplateRecord,
} from "./types.js";
import { AppClientError, request } from "../../../api/client.js";

/** The studio area threw its own error class before the consolidation; this keeps the name its screens use. */
export { AppClientError as StudioClientError };

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
    if (err instanceof AppClientError && err.error.type === "not-found") return undefined;
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
    if (err instanceof AppClientError && err.error.type === "draft-conflict") return undefined;
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

/**
 * Publishes a caller-supplied body under a caller-supplied process id — the
 * import half of environment promotion (environment-promotion spec), and the
 * only caller of `POST /processes` in Studio. Distinct from `publishDraft`,
 * which publishes the persisted draft server-side and accepts no body, so it
 * cannot carry a definition that arrived from another environment.
 *
 * `body` goes out exactly as the promotion file carried it. The route needs
 * `system:publish`, which `system:developer` does not imply.
 */
export async function publishProcess(processId: string, body: unknown, token: string): Promise<PublishResult> {
  const res = await request("/processes", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ processId, body }),
  });
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
    if (err instanceof AppClientError && err.error.type === "not-found") return undefined;
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

/**
 * The running server's registered action-handler, data-source and
 * assignment-strategy type names (studio-tools spec), plus a config-schema
 * description per type where one exists (studio-plugin-config-form spec).
 */
export async function getRegistry(token: string): Promise<RegistryInfo> {
  const res = await request("/registry", token);
  return (await res.json()) as RegistryInfo;
}

// ============================================================
// Player (studio-player spec) — same Runtime API Layer routes
// the app area's TaskScreen already calls.
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

/**
 * The data list keys the server holds, for the `"db.list"` picker. Reads the
 * admin data list route, which accepts `system:developer` for exactly this.
 */
export async function listDataListKeys(token: string): Promise<string[]> {
  const res = await request("/admin/data-lists", token);
  const page = (await res.json()) as { items: { listKey: string }[] };
  return page.items.map((item) => item.listKey);
}

/**
 * The template routes. Reading accepts `system:developer`, so the picker works
 * for every author; writing and deleting need `system:templates`.
 */
export async function listTemplates(token: string): Promise<TemplateSummary[]> {
  const res = await request("/templates", token);
  return (await res.json()) as TemplateSummary[];
}

export async function getTemplate(templateKey: string, token: string): Promise<TemplateRecord> {
  const res = await request(`/templates/${encodeURIComponent(templateKey)}`, token);
  return (await res.json()) as TemplateRecord;
}

export async function saveTemplate(templateKey: string, body: unknown, layout: Record<string, unknown>, token: string): Promise<TemplateRecord> {
  const res = await request(`/templates/${encodeURIComponent(templateKey)}`, token, {
    method: "PUT",
    body: JSON.stringify({ body, layout }),
  });
  return (await res.json()) as TemplateRecord;
}

export async function deleteTemplate(templateKey: string, token: string): Promise<void> {
  await request(`/templates/${encodeURIComponent(templateKey)}`, token, { method: "DELETE" });
}
