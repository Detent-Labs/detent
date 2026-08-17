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
  TemplateSummary,
  TemplateRecord,
  StudioDataList,
} from "./types.js";
import { AppClientError, createInstance, getInstanceRecord, getJson, request, submitPath } from "../../../api/client.js";

/** The studio area threw its own error class before the consolidation; this keeps the name its screens use. */
export { AppClientError as StudioClientError };
export { createInstance, getInstanceRecord, submitPath };

export function listProcesses(token: string): Promise<ProcessSummary[]> {
  return getJson("/processes", token);
}

export function listVersions(processId: string, token: string): Promise<VersionSummary[]> {
  return getJson(`/processes/${encodeURIComponent(processId)}/versions`, token);
}

export function listDrafts(token: string): Promise<DraftSummary[]> {
  return getJson("/drafts", token);
}

/** `undefined` for a process with no draft (404), never thrown — a missing draft is an expected, not exceptional, shape for this call. */
export async function getDraft(processId: string, token: string): Promise<DraftRecord | undefined> {
  try {
    return await getJson(`/drafts/${encodeURIComponent(processId)}`, token);
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
export function getVersionBody(processId: string, version: number, token: string): Promise<unknown> {
  return getJson(`/processes/${encodeURIComponent(processId)}/versions/${version}`, token);
}

/** `undefined` for a key with no registered plan (404), never thrown — same "expected shape" reasoning as getDraft. */
export async function getMigrationPlan(processId: string, fromVersion: number, toVersion: number, token: string): Promise<MigrationPlan | undefined> {
  try {
    return await getJson(`/migration-plans/${encodeURIComponent(processId)}/${fromVersion}/${toVersion}`, token);
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

export function getOrphanKeys(processId: string, version: number, token: string): Promise<OrphanKeyScan> {
  return getJson(`/processes/${encodeURIComponent(processId)}/versions/${version}/orphan-keys`, token);
}

/**
 * The running server's registered action-handler, data-source and
 * assignment-strategy type names (studio-tools spec), plus a config-schema
 * description per type where one exists (studio-plugin-config-form spec).
 */
export function getRegistry(token: string): Promise<RegistryInfo> {
  return getJson("/registry", token);
}

// ============================================================
// Player (studio-player spec) — same Runtime API Layer routes
// the app area's TaskScreen already calls.
// ============================================================

export function getInstanceView(instanceId: string, token: string): Promise<InstanceView> {
  return getJson(`/instances/${encodeURIComponent(instanceId)}`, token);
}

export async function claimStep(instanceId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/claim`, token, { method: "POST" });
}

export async function releaseClaim(instanceId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/release`, token, { method: "POST" });
}

/**
 * The data lists the server holds, for the `"db.list"` picker and for the
 * field catalog's column-mapping editor. Reads the admin data list route,
 * which accepts `system:developer` for exactly this.
 *
 * Carries each list's declared columns beside its key. The route returns them,
 * and the mapping editor offers those keys rather than free text.
 */
export async function listDataLists(token: string): Promise<StudioDataList[]> {
  const page = await getJson<{ items: StudioDataList[] }>("/admin/data-lists", token);
  return page.items.map((item) => ({ listKey: item.listKey, columns: item.columns ?? [] }));
}

/**
 * The template routes. Reading accepts `system:developer`, so the picker works
 * for every author; writing and deleting need `system:templates`.
 */
export function listTemplates(token: string): Promise<TemplateSummary[]> {
  return getJson("/templates", token);
}

export function getTemplate(templateKey: string, token: string): Promise<TemplateRecord> {
  return getJson(`/templates/${encodeURIComponent(templateKey)}`, token);
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
