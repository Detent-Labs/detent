import type {
  DataListDetail,
  DataListPage,
  InstancePage,
  InstanceRecordPage,
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
import { AppClientError, request } from "../../../api/client.js";

/** The admin area threw its own error class before the consolidation; this keeps the name its screens use. */
export { AppClientError as AdminClientError };

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
  const res = await request(`/instances?${query}`, token);
  return (await res.json()) as InstancePage;
}

export async function getInstanceView(instanceId: string, token: string): Promise<InstanceView> {
  const res = await request(`/instances/${encodeURIComponent(instanceId)}`, token);
  return (await res.json()) as InstanceView;
}

export async function getInstanceRecord(instanceId: string, token: string, opts: { limit?: number; cursor?: string } = {}): Promise<InstanceRecordPage> {
  const query = new URLSearchParams();
  if (opts.limit !== undefined) query.set("limit", String(opts.limit));
  if (opts.cursor !== undefined) query.set("cursor", opts.cursor);
  const qs = query.toString();
  const res = await request(`/instances/${encodeURIComponent(instanceId)}/record${qs ? `?${qs}` : ""}`, token);
  return (await res.json()) as InstanceRecordPage;
}

export async function cancelInstance(instanceId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/cancel`, token, { method: "POST" });
}

export async function redactInstance(instanceId: string, token: string): Promise<void> {
  await request(`/admin/instances/${encodeURIComponent(instanceId)}/redact`, token, { method: "POST" });
}

export async function listVersions(processId: string, token: string): Promise<VersionSummary[]> {
  const res = await request(`/processes/${encodeURIComponent(processId)}/versions`, token);
  return (await res.json()) as VersionSummary[];
}

export async function listProcesses(token: string): Promise<ProcessSummary[]> {
  const res = await request("/processes", token);
  return (await res.json()) as ProcessSummary[];
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
  const res = await request(`/admin/outbox?${query}`, token);
  return (await res.json()) as OutboxPage;
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
  const res = await request(`/admin/timers?${query}`, token);
  return (await res.json()) as PendingTimerPage;
}

export async function listUsers(token: string): Promise<UserPage> {
  const res = await request("/admin/users", token);
  return (await res.json()) as UserPage;
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
  const res = await request("/admin/data-lists", token);
  return (await res.json()) as DataListPage;
}

export async function createDataList(listKey: string, label: string, description: string | null, token: string): Promise<void> {
  await request("/admin/data-lists", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ listKey, label, description }),
  });
}

export async function getDataList(listKey: string, token: string): Promise<DataListDetail> {
  const res = await request(`/admin/data-lists/${encodeURIComponent(listKey)}`, token);
  return (await res.json()) as DataListDetail;
}

export async function updateDataList(listKey: string, label: string, description: string | null, token: string): Promise<void> {
  await request(`/admin/data-lists/${encodeURIComponent(listKey)}`, token, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label, description }),
  });
}

/** Sends the whole set: the route replaces it, deactivating what this omits. */
export async function putDataListValues(
  listKey: string,
  values: { value: string; label: Record<string, string>; sortOrder: number }[],
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
  const res = await request("/admin/ui-strings", token);
  const body = (await res.json()) as { overrides: UiStringOverrideMap };
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
