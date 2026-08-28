/**
 * Saved reports (instance-data-tables): schema (src/engine/store.ts),
 * CRUD + membership authorization, and execution (src/runtime/api.ts).
 * DB-backed — skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { redactInstance } from "../src/engine/retention.js";
import { createGroup, setGroupMembers, getGroupsForMember } from "../src/auth/groups.js";
import { ADMIN_ROLE, AuthorizationError } from "../src/auth/authorize.js";
import {
  createReport,
  updateReport,
  deleteReport,
  getReport,
  listMyReports,
  executeReport,
  previewReportDraft,
  resolveReportColumnChoices,
  previewReportColumnChoices,
  queryInstances,
  ReportOwnerInvariantError,
  type ReportColumn,
} from "../src/runtime/api.js";
import type { ProcessBody, ProcessId, FieldId, Instance } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();

let n = 0;
const pid = (prefix: string) => `proc_rep_${prefix}_${++n}` as ProcessId;

const owner: Actor = { id: "user_owner", roles: [] };
const editorActor: Actor = { id: "user_editor", roles: [] };
const viewerActor: Actor = { id: "user_viewer", roles: [] };
const stranger: Actor = { id: "user_stranger", roles: [] };
const roleActor: Actor = { id: "user_role_holder", roles: ["finance-team"] };
const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions, reports, report_principals, groups, auth_users`;
  if (DB) await clearInstanceAudit();
});

// ============================================================
// Fixture bodies: a single terminal initial step, so createInstance
// produces a "completed" instance immediately (see store.ts::createInstance,
// "target.terminal ? completed : running") with no need to drive it through
// a real transition.
// ============================================================

type FieldSpec = { id: string; key: string; type?: string; redactable?: boolean; fields?: FieldSpec[] };

function fieldDef(f: FieldSpec): unknown {
  return {
    id: f.id,
    key: f.key,
    label: { en: f.key },
    type: f.type ?? "string",
    ...(f.redactable !== undefined ? { redactable: f.redactable } : {}),
    ...(f.fields ? { fields: f.fields.map(fieldDef) } : {}),
  };
}

function reportBody(key: string, fields: FieldSpec[]): ProcessBody {
  return {
    key,
    label: { en: key },
    baseLocale: "en",
    fields: fields.map(fieldDef),
    workflow: {
      initialStep: "step_done",
      steps: [{ id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true }],
    },
  } as unknown as ProcessBody;
}

// ============================================================
// 1. Storage
// ============================================================

test.skipIf(!DB)("1.1 schema init creates the reports table, idempotently", async () => {
  await initSchema();
  const rows = (await sql`SELECT tablename FROM pg_tables WHERE tablename = 'reports'`) as { tablename: string }[];
  expect(rows).toHaveLength(1);
});

test.skipIf(!DB)("1.2 report_principals rejects a duplicate (instance_report_id, list, principal) row", async () => {
  const PID = pid("storage_dup");
  await publishBody(PID, reportBody("dup", []), reg, dataSourceReg);
  const report = await createReport(owner, { processId: PID, name: "R" }, sql);
  let raised: unknown;
  try {
    await sql`INSERT INTO report_principals (instance_report_id, list, principal) VALUES (${report.reportId}, 'editor', ${owner.id})`;
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeDefined();
});

test.skipIf(!DB)("1.3 pg_indexes lists report_principals_principal_list_idx", async () => {
  const rows = (await sql`SELECT indexname FROM pg_indexes WHERE tablename = 'report_principals'`) as { indexname: string }[];
  expect(rows.map((r) => r.indexname)).toContain("report_principals_principal_list_idx");
});

// ============================================================
// 2. Report CRUD
// ============================================================

test.skipIf(!DB)("2.1 createReport/getReport/updateReport/deleteReport/listMyReports each cover their own happy path", async () => {
  const PID = pid("crud_happy");
  await publishBody(PID, reportBody("happy", []), reg, dataSourceReg);

  const created = await createReport(owner, { processId: PID, name: "My report" }, sql);
  expect(created.owner).toBe(owner.id);
  expect(created.editors).toEqual([owner.id]);
  expect(created.viewers).toEqual([]);

  const fetched = await getReport(created.reportId, owner, sql);
  expect(fetched).toEqual(created);

  const updated = await updateReport(created.reportId, owner, { name: "Renamed" }, sql);
  expect(updated?.name).toBe("Renamed");

  const listed = await listMyReports(owner, sql);
  expect(listed.map((r) => r.reportId)).toContain(created.reportId);

  const result = await deleteReport(created.reportId, owner, sql);
  expect(result).toEqual({ deleted: true });
  expect(await getReport(created.reportId, owner, sql)).toBeUndefined();
});

test.skipIf(!DB)("2.1 deleteReport leaves no orphaned report_principals row behind", async () => {
  const PID = pid("crud_cascade");
  await publishBody(PID, reportBody("cascade", []), reg, dataSourceReg);
  const created = await createReport(owner, { processId: PID, name: "R", viewers: [viewerActor.id], editors: [editorActor.id] }, sql);

  await deleteReport(created.reportId, owner, sql);
  const rows = (await sql`SELECT 1 FROM report_principals WHERE instance_report_id = ${created.reportId}`) as unknown[];
  expect(rows).toHaveLength(0);
});

test.skipIf(!DB)("2.2 removing the owner from editors is rejected", async () => {
  const PID = pid("owner_invariant_remove");
  await publishBody(PID, reportBody("owner1", []), reg, dataSourceReg);
  const created = await createReport(owner, { processId: PID, name: "R", editors: [editorActor.id] }, sql);

  let raised: unknown;
  try {
    await updateReport(created.reportId, owner, { editors: [editorActor.id] }, sql);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(ReportOwnerInvariantError);
  const stillIntact = await getReport(created.reportId, owner, sql);
  expect(stillIntact?.editors).toContain(owner.id);
});

test.skipIf(!DB)("2.2 reassigning the owner to a non-editor is rejected", async () => {
  const PID = pid("owner_invariant_reassign");
  await publishBody(PID, reportBody("owner2", []), reg, dataSourceReg);
  const created = await createReport(owner, { processId: PID, name: "R" }, sql);

  let raised: unknown;
  try {
    await updateReport(created.reportId, owner, { owner: stranger.id }, sql);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(ReportOwnerInvariantError);
  const stillIntact = await getReport(created.reportId, owner, sql);
  expect(stillIntact?.owner).toBe(owner.id);
});

test.skipIf(!DB)("2.3 report access is owner, editor or viewer, checked by membership", async () => {
  const PID = pid("membership");
  await publishBody(PID, reportBody("membership", []), reg, dataSourceReg);
  const group = await createGroup("Report viewers", { type: "global" }, sql);
  const groupMember: Actor = { id: "user_group_member", roles: [] };
  // getGroupMembers joins auth_users (it also excludes a disabled account) —
  // a group's live-resolution read needs a real account row, unlike the
  // reverse getGroupsForMember lookup 2.5 exercises.
  await sql`INSERT INTO auth_users (user_id, email, password_hash) VALUES (${groupMember.id}, ${"group-member@example.com"}, ${"x"})`;
  await setGroupMembers(group.groupId, [groupMember.id], sql);

  const created = await createReport(
    owner,
    { processId: PID, name: "R", editors: [editorActor.id], viewers: [viewerActor.id, group.groupId] },
    sql,
  );

  // Editor may update.
  const editorUpdate = await updateReport(created.reportId, editorActor, { name: "Edited by editor" }, sql);
  expect(editorUpdate?.name).toBe("Edited by editor");

  // Viewer may read but not update.
  expect((await getReport(created.reportId, viewerActor, sql))?.reportId).toBe(created.reportId);
  let viewerWrite: unknown;
  try {
    await updateReport(created.reportId, viewerActor, { name: "Should fail" }, sql);
  } catch (e) {
    viewerWrite = e;
  }
  expect(viewerWrite).toBeInstanceOf(AuthorizationError);

  // Unrelated actor is refused entirely.
  let strangerRead: unknown;
  try {
    await getReport(created.reportId, stranger, sql);
  } catch (e) {
    strangerRead = e;
  }
  expect(strangerRead).toBeInstanceOf(AuthorizationError);

  // A group member named nowhere else on the report reads via the group.
  expect((await getReport(created.reportId, groupMember, sql))?.reportId).toBe(created.reportId);
});

test.skipIf(!DB)("2.3 a role listed on a report grants access to any actor holding it", async () => {
  const PID = pid("membership_role");
  await publishBody(PID, reportBody("membership_role", []), reg, dataSourceReg);
  const created = await createReport(owner, { processId: PID, name: "R", viewers: ["finance-team"] }, sql);
  expect((await getReport(created.reportId, roleActor, sql))?.reportId).toBe(created.reportId);
});

test.skipIf(!DB)("2.4 saving a report never rejects on a viewer/editor lacking process read access", async () => {
  const PID = pid("share_unblocked");
  await publishBody(PID, reportBody("share_unblocked", []), reg, dataSourceReg);
  // stranger holds no read permission on PID at all — save must still succeed.
  const created = await createReport(owner, { processId: PID, name: "R", viewers: [stranger.id] }, sql);
  expect(created.viewers).toEqual([stranger.id]);
});

test.skipIf(!DB)("2.5 a report shared only through a group appears in listMyReports for its members", async () => {
  const PID = pid("group_listing");
  await publishBody(PID, reportBody("group_listing", []), reg, dataSourceReg);
  const group = await createGroup("Only-group share", { type: "global" }, sql);
  const groupMember: Actor = { id: "user_only_in_group", roles: [] };
  await setGroupMembers(group.groupId, [groupMember.id], sql);

  const created = await createReport(owner, { processId: PID, name: "Group-shared", viewers: [group.groupId] }, sql);

  expect(await getGroupsForMember(groupMember.id, sql)).toContain(group.groupId);
  const listed = await listMyReports(groupMember, sql);
  expect(listed.map((r) => r.reportId)).toContain(created.reportId);
});

// ============================================================
// 3. Report execution
// ============================================================

test.skipIf(!DB)("3.2 executeReport's rows match an equivalent direct queryInstances call", async () => {
  const PID = pid("execute_matches_query");
  const v = await publishBody(PID, reportBody("execute_matches_query", [{ id: "field_x", key: "x" }]), reg, dataSourceReg);
  const i1 = await createInstance(v.definition, { processId: PID, version: v.version, data: { field_x: "a" } as Instance["data"] }, sql);
  const i2 = await createInstance(v.definition, { processId: PID, version: v.version, data: { field_x: "b" } as Instance["data"] }, sql);

  // Executed as `admin`: process `read` is a second, independent gate (3.3)
  // beside report membership, so the owner alone would see an empty table.
  const report = await createReport(
    owner,
    { processId: PID, name: "R", columns: [{ type: "field", fieldId: "field_x" as FieldId }], viewers: [admin.id] },
    sql,
  );
  const executed = await executeReport(report.reportId, admin, sql);
  const direct = await queryInstances({ processId: PID }, {}, sql);

  expect(new Set(executed?.rows.map((r) => r.instanceId))).toEqual(new Set([i1.instanceId, i2.instanceId]));
  expect(new Set(executed?.rows.map((r) => r.instanceId))).toEqual(new Set(direct.items.map((i) => i.instanceId)));
});

test.skipIf(!DB)("3.3 report sharing narrows access, never widens it", async () => {
  const PID = pid("narrows_access");
  const v = await publishBody(PID, reportBody("narrows_access", [{ id: "field_x", key: "x" }]), reg, dataSourceReg);
  await createInstance(v.definition, { processId: PID, version: v.version, data: { field_x: "v" } as Instance["data"] }, sql);

  const report = await createReport(
    owner,
    { processId: PID, name: "R", columns: [{ type: "field", fieldId: "field_x" as FieldId }], viewers: [viewerActor.id] },
    sql,
  );

  // Membership passes, process read fails (viewerActor holds no read grant/role) -> empty table, not a refusal.
  const noRead = await executeReport(report.reportId, viewerActor, sql);
  expect(noRead?.rows).toEqual([]);
  expect(noRead?.truncated).toBe(false);

  // Membership passes, process read passes (ADMIN_ROLE) -> full table. Share
  // the viewer principal with the admin actor to isolate the read-permission axis.
  const reportForAdmin = await createReport(
    owner,
    { processId: PID, name: "R2", columns: [{ type: "field", fieldId: "field_x" as FieldId }], viewers: [admin.id] },
    sql,
  );
  const withRead = await executeReport(reportForAdmin.reportId, admin, sql);
  expect(withRead?.rows).toHaveLength(1);

  // Membership fails outright -> refused, not an empty table.
  let refused: unknown;
  try {
    await executeReport(report.reportId, stranger, sql);
  } catch (e) {
    refused = e;
  }
  expect(refused).toBeInstanceOf(AuthorizationError);
});

test.skipIf(!DB)("3.4 column choices union every in-range version's catalog, tagged with which versions declare each field", async () => {
  const PID = pid("column_union");
  const v1 = await publishBody(
    PID,
    reportBody("column_union", [{ id: "field_old", key: "old" }, { id: "field_common", key: "common" }]),
    reg,
    dataSourceReg,
  );
  await createInstance(v1.definition, { processId: PID, version: v1.version, data: { field_old: "x", field_common: "c1" } as Instance["data"] }, sql);

  const v2 = await publishBody(PID, reportBody("column_union", [{ id: "field_common", key: "common" }]), reg, dataSourceReg);
  await createInstance(v2.definition, { processId: PID, version: v2.version, data: { field_common: "c2" } as Instance["data"] }, sql);

  const choices = await resolveReportColumnChoices(PID, {}, sql);
  const byId = new Map(choices.map((c) => [c.fieldId, c.versions]));
  expect(byId.get("field_old" as FieldId)).toEqual([v1.version]);
  expect(byId.get("field_common" as FieldId)?.sort()).toEqual([v1.version, v2.version].sort());
});

test.skipIf(!DB)("3.4 a group container field is never offered as a column choice", async () => {
  const PID = pid("column_group_excluded");
  const v = await publishBody(
    PID,
    reportBody("column_group_excluded", [{ id: "field_grp", key: "grp", type: "group", fields: [{ id: "field_child", key: "child" }] }]),
    reg,
    dataSourceReg,
  );
  await createInstance(v.definition, { processId: PID, version: v.version, data: { field_child: "v" } as Instance["data"] }, sql);

  const choices = await resolveReportColumnChoices(PID, {}, sql);
  const ids = choices.map((c) => c.fieldId);
  expect(ids).not.toContain("field_grp" as FieldId);
  expect(ids).toContain("field_child" as FieldId);
});

test.skipIf(!DB)("3.5 a cell distinguishes no-value, not-in-version and redacted", async () => {
  const PID = pid("cell_states");
  const v1 = await publishBody(PID, reportBody("cell_states", [{ id: "field_p", key: "p" }]), reg, dataSourceReg);
  const withValue = await createInstance(v1.definition, { processId: PID, version: v1.version, data: { field_p: "hi" } as Instance["data"] }, sql);
  const noValue = await createInstance(v1.definition, { processId: PID, version: v1.version, data: {} }, sql);

  const v2 = await publishBody(PID, reportBody("cell_states", []), reg, dataSourceReg);
  const notInVersion = await createInstance(v2.definition, { processId: PID, version: v2.version, data: {} }, sql);

  const redactedTarget = await createInstance(v1.definition, { processId: PID, version: v1.version, data: { field_p: "secret" } as Instance["data"] }, sql);
  await redactInstance(redactedTarget.instanceId, sql);

  const report = await createReport(
    owner,
    { processId: PID, name: "R", columns: [{ type: "field", fieldId: "field_p" as FieldId }], viewers: [admin.id] },
    sql,
  );
  const result = await executeReport(report.reportId, admin, sql);
  const cellFor = (id: string) => result?.rows.find((r) => r.instanceId === id)?.cells[0];

  expect(cellFor(withValue.instanceId)).toEqual({ kind: "value", value: "hi" });
  expect(cellFor(noValue.instanceId)).toEqual({ kind: "no-value" });
  expect(cellFor(notInVersion.instanceId)).toEqual({ kind: "not-in-version" });
  expect(cellFor(redactedTarget.instanceId)).toEqual({ kind: "redacted" });
});

test.skipIf(!DB)("3.5 a redactable:false field still reads as redacted on a redacted instance", async () => {
  const PID = pid("cell_redactable_false");
  const v = await publishBody(PID, reportBody("cell_redactable_false", [{ id: "field_p", key: "p", redactable: false }]), reg, dataSourceReg);
  const inst = await createInstance(v.definition, { processId: PID, version: v.version, data: { field_p: "value" } as Instance["data"] }, sql);
  await redactInstance(inst.instanceId, sql);

  const report = await createReport(
    owner,
    { processId: PID, name: "R", columns: [{ type: "field", fieldId: "field_p" as FieldId }], viewers: [admin.id] },
    sql,
  );
  const result = await executeReport(report.reportId, admin, sql);
  expect(result?.rows[0]?.cells[0]).toEqual({ kind: "redacted" });
});

test.skipIf(!DB)("3.6 a merge column takes the first non-empty source and marks a collision, with a reported count", async () => {
  const PID = pid("merge_column");
  const v = await publishBody(
    PID,
    reportBody("merge_column", [{ id: "field_m1", key: "m1" }, { id: "field_m2", key: "m2" }]),
    reg,
    dataSourceReg,
  );
  const noCollision = await createInstance(v.definition, { processId: PID, version: v.version, data: { field_m2: "second" } as Instance["data"] }, sql);
  const collision = await createInstance(
    v.definition,
    { processId: PID, version: v.version, data: { field_m1: "first", field_m2: "second" } as Instance["data"] },
    sql,
  );

  const column: ReportColumn = { type: "merge", fieldIds: ["field_m1" as FieldId, "field_m2" as FieldId] };
  const report = await createReport(owner, { processId: PID, name: "R", columns: [column], viewers: [admin.id] }, sql);
  const result = await executeReport(report.reportId, admin, sql);
  const cellFor = (id: string) => result?.rows.find((r) => r.instanceId === id)?.cells[0];

  expect(cellFor(noCollision.instanceId)).toEqual({ kind: "value", value: "second", collision: false });
  expect(cellFor(collision.instanceId)).toEqual({ kind: "value", value: "first, second", collision: true });
  expect(result?.columns[0]).toEqual({ type: "merge", fieldIds: column.fieldIds, collisions: 1 });
});

test.skipIf(!DB)("3.6 a merge column on a redacted instance renders redacted, not an ordinary empty value", async () => {
  const PID = pid("merge_redacted");
  const v = await publishBody(
    PID,
    reportBody("merge_redacted", [{ id: "field_m1", key: "m1" }, { id: "field_m2", key: "m2" }]),
    reg,
    dataSourceReg,
  );
  const inst = await createInstance(v.definition, { processId: PID, version: v.version, data: { field_m1: "x" } as Instance["data"] }, sql);
  await redactInstance(inst.instanceId, sql);

  const column: ReportColumn = { type: "merge", fieldIds: ["field_m1" as FieldId, "field_m2" as FieldId] };
  const report = await createReport(owner, { processId: PID, name: "R", columns: [column], viewers: [admin.id] }, sql);
  const result = await executeReport(report.reportId, admin, sql);
  expect(result?.rows[0]?.cells[0]).toEqual({ kind: "redacted" });
});

test.skipIf(!DB)("3.7 report execution reuses queryInstances's own bounding", async () => {
  const PID = pid("truncation");
  const v = await publishBody(PID, reportBody("truncation", []), reg, dataSourceReg);
  // DEFAULT_LIST_LIMIT is 50 (private in src/runtime/api.ts) — one over it trips truncation.
  for (let i = 0; i < 51; i++) await createInstance(v.definition, { processId: PID, version: v.version }, sql);

  const report = await createReport(owner, { processId: PID, name: "R", viewers: [admin.id] }, sql);
  const result = await executeReport(report.reportId, admin, sql);
  expect(result?.truncated).toBe(true);
  expect(result?.rows).toHaveLength(50);
});

test.skipIf(!DB)("3.7 a result within the bound is not marked truncated", async () => {
  const PID = pid("no_truncation");
  const v = await publishBody(PID, reportBody("no_truncation", []), reg, dataSourceReg);
  await createInstance(v.definition, { processId: PID, version: v.version }, sql);

  const report = await createReport(owner, { processId: PID, name: "R", viewers: [admin.id] }, sql);
  const result = await executeReport(report.reportId, admin, sql);
  expect(result?.truncated).toBe(false);
});

// ============================================================
// Unsaved-draft preview
// ============================================================

test.skipIf(!DB)("a preview for a process the actor cannot read shows no data, and agrees with the equivalent saved execution", async () => {
  const PID = pid("preview_gate");
  const v = await publishBody(PID, reportBody("preview_gate", [{ id: "field_x", key: "x" }]), reg, dataSourceReg);
  await createInstance(v.definition, { processId: PID, version: v.version, data: { field_x: "v" } as Instance["data"] }, sql);

  const draft = { processId: PID, query: {}, columns: [{ type: "field" as const, fieldId: "field_x" as FieldId }] };
  const preview = await previewReportDraft(draft, stranger, sql);
  expect(preview.rows).toEqual([]);

  const columnChoices = await previewReportColumnChoices(PID, {}, stranger, sql);
  expect(columnChoices).toEqual([]);

  const saved = await createReport(owner, { processId: PID, name: "R", columns: draft.columns, viewers: [stranger.id] }, sql);
  const savedExecution = await executeReport(saved.reportId, stranger, sql);
  expect(savedExecution?.rows).toEqual(preview.rows);
});
