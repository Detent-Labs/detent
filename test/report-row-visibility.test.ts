/**
 * report-row-visibility: a report's rows narrow to what the reader may see,
 * by the same rule the `scope=visible` list and the direct read apply.
 * DB-backed — skips when DATABASE_URL is unset.
 *
 * The reader under test is a grant holder, not an operator. `can(actor,
 * "read", …)` admits `ADMIN_ROLE` or a per-process grant, and `ADMIN_ROLE`
 * skips the narrowing, so only the grant holder exercises it.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance, withTransaction, appendInstancePrincipals } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createReport, executeReport, previewReportDraft, reportResultToCsv, queryInstances, revokeVisibility, type ReportColumn } from "../src/runtime/api.js";
import { writeGrant } from "../src/auth/grants.js";
import { ADMIN_ROLE } from "../src/auth/authorize.js";
import type { ProcessBody, ProcessId, FieldId, InstanceId, Instance } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();

const READ_ROLE = "finance-team";
const owner: Actor = { id: "user_owner", roles: [] };
const viewer: Actor = { id: "user_viewer", roles: [READ_ROLE] };
const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };

let n = 0;
const pid = () => `proc_rrv_${++n}` as ProcessId;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (!DB) return;
  await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions, reports, report_principals, groups, auth_users, permission_grants`;
  await sql`TRUNCATE instance_principals, instance_principals_denied`;
  await clearInstanceAudit();
});

/** One terminal initial step, so `createInstance` returns a completed instance with no transition to drive. */
const body = (): ProcessBody =>
  ({
    key: "rrv",
    label: { en: "RRV" },
    baseLocale: "en",
    fields: [{ id: "field_x", key: "x", label: { en: "x" }, type: "string" }],
    workflow: {
      initialStep: "step_done",
      steps: [{ id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true }],
    },
  }) as unknown as ProcessBody;

const COLUMNS: ReportColumn[] = [{ type: "field", fieldId: "field_x" as FieldId }];

/**
 * A process, a `read` grant on it for the viewer's role, and a report the
 * viewer may execute. Every instance is started by the owner, so the viewer
 * reaches one only through a principal a test appends.
 */
async function fixture(count: number): Promise<{ processId: ProcessId; reportId: string; ids: InstanceId[] }> {
  const processId = pid();
  const v = await publishBody(processId, body(), reg, dataSourceReg);
  const ids: InstanceId[] = [];
  for (let i = 0; i < count; i++) {
    const inst = await createInstance(
      v.definition,
      { processId, version: v.version, startedBy: owner.id, data: { field_x: `v${i}` } as Instance["data"] },
      sql,
    );
    ids.push(inst.instanceId);
  }
  await writeGrant({ role: READ_ROLE, permission: "read", scope: { type: "process", config: { processId } } }, sql);
  // Both readers are viewers: membership is gate one and this file tests
  // gate three, so neither reader may fail on the wrong gate.
  const report = await createReport(owner, { processId, name: "R", columns: COLUMNS, viewers: [viewer.id, admin.id] }, sql);
  return { processId, reportId: report.reportId, ids };
}

const see = (instanceId: InstanceId, principal: string) =>
  withTransaction(sql, (tx) => appendInstancePrincipals(tx, instanceId, [principal]));

async function rowIds(reportId: string, actor: Actor): Promise<string[]> {
  const result = await executeReport(reportId, actor, sql);
  return (result?.rows ?? []).map((r) => r.instanceId as string);
}

test.skipIf(!DB)("a viewer sees only the rows they may see; the operator sees every one", async () => {
  const { reportId, ids } = await fixture(3);
  await see(ids[0]!, viewer.id);

  expect(await rowIds(reportId, viewer)).toEqual([ids[0]!]);
  expect((await rowIds(reportId, admin)).sort()).toEqual([...ids].sort());
});

test.skipIf(!DB)("a revoked viewer loses one row and keeps the rest", async () => {
  const { reportId, ids } = await fixture(3);
  await see(ids[0]!, viewer.id);
  await see(ids[1]!, viewer.id);
  await revokeVisibility(ids[0]!, viewer.id, admin, sql);

  expect(await rowIds(reportId, viewer)).toEqual([ids[1]!]);
});

test.skipIf(!DB)("a revoked viewer holding the current claim keeps that row", async () => {
  const { reportId, ids } = await fixture(2);
  await see(ids[0]!, viewer.id);
  await revokeVisibility(ids[0]!, viewer.id, admin, sql);
  // A live claim outranks the revocation, the rule the list and the direct
  // read already carry. Written onto the row directly: this fixture's one
  // step is terminal, so no transition can claim it.
  await sql`UPDATE instances SET body = jsonb_set(body, '{assignment}', ${{ candidates: [], claimedBy: viewer.id }}) WHERE instance_id = ${ids[0]!}`;

  expect(await rowIds(reportId, viewer)).toEqual([ids[0]!]);
});

test.skipIf(!DB)("the CSV export holds exactly the rows the table holds", async () => {
  const { reportId, ids } = await fixture(3);
  await see(ids[0]!, viewer.id);

  const table = await executeReport(reportId, viewer, sql);
  const csv = reportResultToCsv(table!);
  // One header line plus one data line: the two rows the viewer cannot see
  // never reach the renderer.
  expect(csv.trimEnd().split("\n")).toHaveLength(2);
  expect(csv).toContain("v0");
  expect(csv).not.toContain("v1");
});

test.skipIf(!DB)("a preview narrows per row the way a saved execution does", async () => {
  const { processId, ids } = await fixture(3);
  await see(ids[0]!, viewer.id);

  const preview = await previewReportDraft({ processId, query: {}, columns: COLUMNS }, viewer, sql);
  expect(preview.rows.map((r) => r.instanceId)).toEqual([ids[0]!]);
});

test.skipIf(!DB)("truncation reports the narrowed set, not the matched one", async () => {
  // DEFAULT_LIST_LIMIT is 50 and runReportQuery passes no limit.
  const { reportId, ids } = await fixture(60);
  for (const id of ids.slice(0, 51)) await see(id, viewer.id);

  const over = await executeReport(reportId, viewer, sql);
  expect(over?.rows).toHaveLength(50);
  expect(over?.truncated).toBe(true);

  await sql`DELETE FROM instance_principals WHERE instance_id = ${ids[50]!} AND principal = ${viewer.id}`;
  const exact = await executeReport(reportId, viewer, sql);
  expect(exact?.rows).toHaveLength(50);
  expect(exact?.truncated).toBe(false);
});

test.skipIf(!DB)("queryInstances narrows with visibleTo and returns every match without it", async () => {
  const { processId, ids } = await fixture(3);
  await see(ids[0]!, viewer.id);

  const narrowed = await queryInstances(
    { processId, visibleTo: { actorId: viewer.id, principals: [viewer.id, READ_ROLE] } },
    { limit: 10 },
    sql,
  );
  expect(narrowed.items.map((i) => i.instanceId)).toEqual([ids[0]!]);

  const wide = await queryInstances({ processId }, { limit: 10 }, sql);
  expect(wide.items).toHaveLength(3);
});

test.skipIf(!DB)("the instance.query data source keeps today's rows, since it passes no visibleTo", async () => {
  const { processId, ids } = await fixture(2);
  // No principal anywhere: an actor-less engine read still sees both.
  const page = await queryInstances({ processId }, { limit: 10 }, sql);
  expect(page.items.map((i) => i.instanceId).sort()).toEqual([...ids].sort());
});
