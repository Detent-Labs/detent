import type {
  AuditEntryPage,
  AuditVerifyResult,
  DataListColumn,
  DataListDetail,
  DataListPage,
  GroupPage,
  GroupScope,
  GroupSummary,
  InstancePage,
  InstanceView,
  MigrationResult,
  OutboxPage,
  OutboxRow,
  PendingTimerPage,
  ProcessSummary,
  UiStringOverrideMap,
  UserPage,
  UserSummary,
  VersionSummary,
} from "./types.js";
import { AppClientError, getInstanceRecord, getJson, request } from "../../../api/client.js";

/** The admin area threw its own error class before the consolidation; this keeps the name its screens use. */
export { AppClientError as AdminClientError };
export { getInstanceRecord };

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
  return getJson<InstancePage>(`/instances?${query}`, token);
}

export async function getInstanceView(instanceId: string, token: string): Promise<InstanceView> {
  return getJson<InstanceView>(`/instances/${encodeURIComponent(instanceId)}`, token);
}

export async function cancelInstance(instanceId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/cancel`, token, { method: "POST" });
}

export async function redactInstance(instanceId: string, token: string): Promise<void> {
  await request(`/admin/instances/${encodeURIComponent(instanceId)}/redact`, token, { method: "POST" });
}

/** Same `{ limit, cursor }` query-parameter shape `getInstanceRecord` uses. */
export function listInstanceAudit(instanceId: string, token: string, opts: { limit?: number; cursor?: string } = {}): Promise<AuditEntryPage> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.cursor !== undefined) params.set("cursor", opts.cursor);
  const qs = params.toString();
  return getJson<AuditEntryPage>(`/admin/instances/${encodeURIComponent(instanceId)}/audit${qs ? `?${qs}` : ""}`, token);
}

export function verifyInstanceAudit(instanceId: string, token: string): Promise<AuditVerifyResult> {
  return getJson<AuditVerifyResult>(`/admin/instances/${encodeURIComponent(instanceId)}/audit/verify`, token);
}

export async function listVersions(processId: string, token: string): Promise<VersionSummary[]> {
  return getJson<VersionSummary[]>(`/processes/${encodeURIComponent(processId)}/versions`, token);
}

export async function listProcesses(token: string): Promise<ProcessSummary[]> {
  return getJson<ProcessSummary[]>("/processes", token);
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
  return getJson<OutboxPage>(`/admin/outbox?${query}`, token);
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
  return getJson<PendingTimerPage>(`/admin/timers?${query}`, token);
}

export async function listUsers(token: string, opts: { limit?: number; cursor?: string } = {}): Promise<UserPage> {
  const query = new URLSearchParams();
  if (opts.limit !== undefined) query.set("limit", String(opts.limit));
  if (opts.cursor !== undefined) query.set("cursor", opts.cursor);
  return getJson<UserPage>(`/admin/users?${query}`, token);
}

/** Creates a local account. A 409 means an account already holds that email. The password travels to its holder out of band: the engine sends no mail. */
export async function createUser(email: string, password: string, roles: string[], token: string): Promise<UserSummary> {
  const res = await request("/admin/users", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, roles }),
  });
  return (await res.json()) as UserSummary;
}

/** Sets an account's password on its holder's behalf. Does not revoke a token already issued to them: no JWT claim derives from the password. */
export async function setUserPassword(userId: string, password: string, token: string): Promise<UserSummary> {
  const res = await request(`/admin/users/${encodeURIComponent(userId)}/password`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return (await res.json()) as UserSummary;
}

export async function disableUser(userId: string, token: string): Promise<UserSummary> {
  const res = await request(`/admin/users/${encodeURIComponent(userId)}/disable`, token, { method: "POST" });
  return (await res.json()) as UserSummary;
}

export async function enableUser(userId: string, token: string): Promise<UserSummary> {
  const res = await request(`/admin/users/${encodeURIComponent(userId)}/enable`, token, { method: "POST" });
  return (await res.json()) as UserSummary;
}

/** Replaces the whole set: a role this array omits is a role removed. A 409 means the actor tried to remove `system:admin` from its own account. */
export async function setUserRoles(userId: string, roles: string[], token: string): Promise<UserSummary> {
  const res = await request(`/admin/users/${encodeURIComponent(userId)}/roles`, token, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roles }),
  });
  return (await res.json()) as UserSummary;
}

/** Sets the account's manager, or clears it with `null`. A 400 means the target names no account, or is the account itself. */
export async function setUserManager(userId: string, managerUserId: string | null, token: string): Promise<UserSummary> {
  const res = await request(`/admin/users/${encodeURIComponent(userId)}/manager`, token, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ managerUserId }),
  });
  return (await res.json()) as UserSummary;
}

// ---- groups ------------------------------------------------------------
// Assignment-candidate groups; the `org.group-members` assignment strategy
// resolves candidates from these at runtime. Behind `system:admin`, the same
// role every other Operations route carries.

/** Same `{ limit, cursor }` shape `listUsers` takes, and the same cursor-bearing page shape. */
export async function listGroups(token: string, opts: { limit?: number; cursor?: string } = {}): Promise<GroupPage> {
  const query = new URLSearchParams();
  if (opts.limit !== undefined) query.set("limit", String(opts.limit));
  if (opts.cursor !== undefined) query.set("cursor", opts.cursor);
  return getJson<GroupPage>(`/admin/groups?${query}`, token);
}

export async function createGroup(name: string, scope: GroupScope, token: string): Promise<GroupSummary> {
  const res = await request("/admin/groups", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, scope }),
  });
  return (await res.json()) as GroupSummary;
}

export async function renameGroup(groupId: string, name: string, token: string): Promise<GroupSummary> {
  const res = await request(`/admin/groups/${encodeURIComponent(groupId)}/name`, token, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as GroupSummary;
}

/** Replaces the whole member set: an id the array omits is a member removed. */
export async function setGroupMembers(groupId: string, members: string[], token: string): Promise<GroupSummary> {
  const res = await request(`/admin/groups/${encodeURIComponent(groupId)}/members`, token, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ members }),
  });
  return (await res.json()) as GroupSummary;
}

export async function setGroupScope(groupId: string, scope: GroupScope, token: string): Promise<GroupSummary> {
  const res = await request(`/admin/groups/${encodeURIComponent(groupId)}/scope`, token, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope }),
  });
  return (await res.json()) as GroupSummary;
}

/** A 409 means a published process's `allowedGroups` still names this group; `parseErrorBody` maps that to the `group-referenced` `ClientError` variant. */
export async function deleteGroup(groupId: string, token: string): Promise<void> {
  await request(`/admin/groups/${encodeURIComponent(groupId)}`, token, { method: "DELETE" });
}

export async function runMigration(processId: string, fromVersion: number, toVersion: number, token: string): Promise<MigrationResult> {
  const res = await request("/admin/migrations/run", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ processId, fromVersion, toVersion }),
  });
  return (await res.json()) as MigrationResult;
}

// ---- data lists -------------------------------------------------------------
// Behind `system:datalists`; the reads also accept `system:developer`, which is
// what lets the studio's data source panel offer the existing keys.

export async function listDataLists(token: string): Promise<DataListPage> {
  return getJson<DataListPage>("/admin/data-lists", token);
}

export async function createDataList(
  listKey: string,
  label: string,
  description: string | null,
  token: string,
  columns: DataListColumn[] = [],
): Promise<void> {
  await request("/admin/data-lists", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ listKey, label, description, columns }),
  });
}

export async function getDataList(listKey: string, token: string): Promise<DataListDetail> {
  return getJson<DataListDetail>(`/admin/data-lists/${encodeURIComponent(listKey)}`, token);
}

/** `columns` omitted leaves the declaration as it stands; an array replaces it, and `[]` clears it. */
export async function updateDataList(
  listKey: string,
  label: string,
  description: string | null,
  token: string,
  columns?: DataListColumn[],
): Promise<void> {
  await request(`/admin/data-lists/${encodeURIComponent(listKey)}`, token, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(columns === undefined ? { label, description } : { label, description, columns }),
  });
}

/** Sends the whole set: the route replaces it, deactivating what this omits. */
export async function putDataListValues(
  listKey: string,
  values: { value: string; label: Record<string, string>; attributes: Record<string, string | number | boolean>; sortOrder: number }[],
  token: string,
): Promise<void> {
  await request(`/admin/data-lists/${encodeURIComponent(listKey)}/values`, token, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });
}

export async function deleteDataList(listKey: string, token: string): Promise<void> {
  await request(`/admin/data-lists/${encodeURIComponent(listKey)}`, token, { method: "DELETE" });
}

/** The screen's own read. Same data the public `GET /ui-strings` returns, behind `system:admin`. */
export async function listUiStringOverrides(token: string): Promise<UiStringOverrideMap> {
  const body = await getJson<{ overrides: UiStringOverrideMap }>("/admin/ui-strings", token);
  return body.overrides;
}

/** A string sets the override; `null` deletes it. The route refuses an empty string, so a cleared input sends `null`. */
export async function putUiStringOverride(area: string, locale: string, key: string, value: string | null, token: string): Promise<void> {
  await request("/admin/ui-strings", token, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ area, locale, key, value }),
  });
}
