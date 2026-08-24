/**
 * Data retention & erasure (roadmap #20): redactInstance and the automatic
 * sweep. DB-backed cases hit Postgres and skip when DATABASE_URL is unset —
 * a skip is visible, a false green is not. Bodies are hand-crafted and
 * created directly via `createInstance` (no publish needed): neither
 * `redactInstance` nor `sweepRetention` resolves a process body.
 */
import { test, expect, beforeAll, beforeEach, spyOn } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { findOrphanKeys } from "../src/engine/migration.js";
import { redactInstance, sweepRetention } from "../src/engine/retention.js";
import { saveInstanceDraft as engineSaveInstanceDraft, getInstanceDraft } from "../src/engine/instance-drafts.js";
import { NotFoundError, InstanceRunningError } from "../src/errors.js";
import type { ProcessBody, Instance, InstanceId } from "../src/schema/definition.js";

const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();

const DB = !!process.env.DATABASE_URL;
const pid = "proc_retention" as Instance["processId"];

const step = (id: string, over: Record<string, unknown> = {}) => ({ id, key: id, label: { en: id }, type: "task", ...over });
// step_a (non-terminal, so a fresh instance starts "running") --manual--> step_b (terminal).
const body = (): ProcessBody =>
  ({
    key: "retention_test",
    label: { en: "retention test" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [step("step_a", { paths: [{ id: "path_ab", key: "path_ab", label: "Ab", to: "step_b", trigger: "manual" }] }), step("step_b", { terminal: true })],
    },
  }) as unknown as ProcessBody;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, instance_comments, instance_attachments, instance_drafts`;
});

const mk = async (data: Record<string, unknown> = { field_x: "value" }): Promise<Instance> =>
  createInstance(body(), { processId: pid, version: 1, data: data as Instance["data"] }, sql);

const setStatus = (id: string, status: string) => sql`UPDATE instances SET body = body || ${{ status }}::jsonb WHERE instance_id = ${id}`;
const setEnteredAt = (id: string, iso: string) => sql`UPDATE instances SET body = body || ${{ currentStepEnteredAt: iso }}::jsonb WHERE instance_id = ${id}`;
// Bun's Postgres driver returns timestamptz as a Date, not a string — normalise
// so a caller can compare it against an ISO string without caring which.
const rowRedactedAt = async (id: string): Promise<string | null> => {
  const v = ((await sql`SELECT redacted_at FROM instances WHERE instance_id = ${id}`) as { redacted_at: string | Date | null }[])[0].redacted_at;
  return v === null ? null : new Date(v).toISOString();
};
const rowData = async (id: string): Promise<Record<string, unknown>> => {
  const r = (await sql`SELECT body->'data' AS d FROM instances WHERE instance_id = ${id}`) as { d: unknown }[];
  return (typeof r[0].d === "string" ? JSON.parse(r[0].d) : r[0].d) as Record<string, unknown>;
};
const commentCount = async (id: string): Promise<number> =>
  Number(((await sql`SELECT count(*) AS c FROM instance_comments WHERE instance_id = ${id}`) as { c: string }[])[0].c);
const attachmentCount = async (id: string): Promise<number> =>
  Number(((await sql`SELECT count(*) AS c FROM instance_attachments WHERE instance_id = ${id}`) as { c: string }[])[0].c);
const addComment = (id: string) =>
  sql`INSERT INTO instance_comments (id, instance_id, actor_id, text) VALUES (${`comment_${id}`}, ${id}, 'user_1', 'a note')`;
const addAttachment = (id: string) =>
  sql`INSERT INTO instance_attachments (id, instance_id, actor_id, filename, content_type, size_bytes, data)
    VALUES (${`attachment_${id}`}, ${id}, 'user_1', 'file.txt', 'text/plain', 4, ${Buffer.from("data")})`;

test.skipIf(!DB)("redactInstance clears data, stamps redacted_at, and deletes comment/attachment/draft rows", async () => {
  const i = await mk();
  await setStatus(i.instanceId, "completed");
  await addComment(i.instanceId);
  await addAttachment(i.instanceId);
  await engineSaveInstanceDraft(i.instanceId, i.currentStepId, { note: "wip" }, "user_1", sql);
  expect(await commentCount(i.instanceId)).toBe(1);
  expect(await attachmentCount(i.instanceId)).toBe(1);
  expect(await getInstanceDraft(i.instanceId, sql)).toBeDefined();

  const redacted = await redactInstance(i.instanceId, sql);
  expect(redacted.data).toEqual({});
  expect(redacted.redactedAt).toBeDefined();
  expect(await rowData(i.instanceId)).toEqual({});
  expect(await rowRedactedAt(i.instanceId)).not.toBeNull();
  expect(await commentCount(i.instanceId)).toBe(0);
  expect(await attachmentCount(i.instanceId)).toBe(0);
  expect(await getInstanceDraft(i.instanceId, sql)).toBeUndefined();
});

test.skipIf(!DB)("redactInstance leaves history_entries and instance_events untouched", async () => {
  // Neither table gets a row from createInstance/setStatus in this fixture,
  // so this asserts redactInstance adds none of its own — it must stay that
  // way, since neither relation is meant to change at all.
  const i = await mk();
  await setStatus(i.instanceId, "completed");
  await redactInstance(i.instanceId, sql);
  const hist = (await sql`SELECT 1 FROM history_entries WHERE instance_id = ${i.instanceId}`) as unknown[];
  const evts = (await sql`SELECT 1 FROM instance_events WHERE instance_id = ${i.instanceId}`) as unknown[];
  expect(hist).toHaveLength(0);
  expect(evts).toHaveLength(0);
});

test.skipIf(!DB)("redactInstance refuses a running instance, and its form draft survives", async () => {
  const i = await mk();
  await engineSaveInstanceDraft(i.instanceId, i.currentStepId, { note: "wip" }, "user_1", sql);
  await expect(redactInstance(i.instanceId, sql)).rejects.toBeInstanceOf(InstanceRunningError);
  expect(await rowRedactedAt(i.instanceId)).toBeNull();
  expect(await rowData(i.instanceId)).toEqual({ field_x: "value" });
  expect(await getInstanceDraft(i.instanceId, sql)).toBeDefined();
});

test.skipIf(!DB)("redactInstance is idempotent: a second call is a no-op, and re-runs no draft delete against an already-clear row", async () => {
  const i = await mk();
  await setStatus(i.instanceId, "completed");
  await redactInstance(i.instanceId, sql);
  const firstRedactedAt = await rowRedactedAt(i.instanceId);

  await addComment(i.instanceId); // proves the second call does not re-run the deletes
  const second = await redactInstance(i.instanceId, sql);
  expect(second.data).toEqual({});
  expect(await rowRedactedAt(i.instanceId)).toBe(firstRedactedAt);
  expect(await commentCount(i.instanceId)).toBe(1);
  expect(await getInstanceDraft(i.instanceId, sql)).toBeUndefined();
});

test.skipIf(!DB)("redactInstance throws NotFoundError for an unknown instance", async () => {
  await expect(redactInstance("inst_missing" as InstanceId, sql)).rejects.toBeInstanceOf(NotFoundError);
});

test.skipIf(!DB)("sweepRetention redacts an eligible completed instance past the window", async () => {
  const i = await mk();
  await setStatus(i.instanceId, "completed");
  await setEnteredAt(i.instanceId, "2020-01-01T00:00:00Z");

  await sweepRetention(sql, 30);
  expect(await rowRedactedAt(i.instanceId)).not.toBeNull();
});

test.skipIf(!DB)("sweepRetention redacts an eligible cancelled instance the same way", async () => {
  const i = await mk();
  await setStatus(i.instanceId, "cancelled");
  await setEnteredAt(i.instanceId, "2020-01-01T00:00:00Z");

  await sweepRetention(sql, 30);
  expect(await rowRedactedAt(i.instanceId)).not.toBeNull();
});

test.skipIf(!DB)("sweepRetention skips a completed instance still inside the window", async () => {
  const i = await mk();
  await setStatus(i.instanceId, "completed");
  // currentStepEnteredAt defaults to "now" from createInstance — well inside any window.

  await sweepRetention(sql, 30);
  expect(await rowRedactedAt(i.instanceId)).toBeNull();
});

test.skipIf(!DB)("sweepRetention never redacts a faulted instance, regardless of age", async () => {
  const i = await mk();
  await setStatus(i.instanceId, "faulted");
  await setEnteredAt(i.instanceId, "2020-01-01T00:00:00Z");

  await sweepRetention(sql, 30);
  expect(await rowRedactedAt(i.instanceId)).toBeNull();
});

test.skipIf(!DB)("sweepRetention falls back to startedAt for an instance predating currentStepEnteredAt", async () => {
  const i = await mk();
  await setStatus(i.instanceId, "completed");
  // Simulate a pre-existing instance: drop currentStepEnteredAt, backdate startedAt.
  await sql`UPDATE instances SET body = (body - 'currentStepEnteredAt') || ${{ startedAt: "2020-01-01T00:00:00Z" }}::jsonb
    WHERE instance_id = ${i.instanceId}`;

  await sweepRetention(sql, 30);
  expect(await rowRedactedAt(i.instanceId)).not.toBeNull();
});

test.skipIf(!DB)("sweepRetention redacts every eligible instance across several rows in one tick", async () => {
  const ids: string[] = [];
  for (let n = 0; n < 5; n++) {
    const i = await mk();
    await setStatus(i.instanceId, "completed");
    await setEnteredAt(i.instanceId, "2020-01-01T00:00:00Z");
    ids.push(i.instanceId);
  }

  await sweepRetention(sql, 30);
  for (const id of ids) {
    expect(await rowRedactedAt(id)).not.toBeNull();
  }
});

test.skipIf(!DB)("sweepRetention does not stop the batch when one instance's redaction fails", async () => {
  const i = await mk();
  await setStatus(i.instanceId, "completed");
  await setEnteredAt(i.instanceId, "2020-01-01T00:00:00Z");
  const other = await mk();
  await setStatus(other.instanceId, "completed");
  await setEnteredAt(other.instanceId, "2020-01-01T00:00:00Z");
  // Force the first id's redaction to fail without changing its `status`
  // text (the sweep's WHERE clause must still select it): `data` becomes a
  // string, which instanceSchema.parse rejects inside redactInstance.
  await sql`UPDATE instances SET body = body || '{"data": "not-an-object"}'::jsonb WHERE instance_id = ${i.instanceId}`;

  await sweepRetention(sql, 30);
  expect(await rowRedactedAt(other.instanceId)).not.toBeNull();
});

test.skipIf(!DB)("sweepRetention does nothing over an instance already redacted", async () => {
  const i = await mk();
  await setStatus(i.instanceId, "completed");
  await setEnteredAt(i.instanceId, "2020-01-01T00:00:00Z");
  await redactInstance(i.instanceId, sql);
  await addComment(i.instanceId);

  await sweepRetention(sql, 30);
  expect(await commentCount(i.instanceId)).toBe(1);
});

test.skipIf(!DB)("a redacted instance scans clean via findOrphanKeys, and its data stays empty", async () => {
  // Not migrateInstances: it selects only `running` instances (migration.ts's
  // population scan), and redactInstance only ever accepts a non-running one
  // — the two never meet. findOrphanKeys is the scan with no status filter,
  // covering a redacted instance too.
  const published = await publishBody(pid, body(), reg, dataSourceReg);
  const i = await createInstance(published.definition, { processId: pid, version: published.version, data: { field_x: "value" } as unknown as Instance["data"] }, sql);
  await setStatus(i.instanceId, "completed");
  const redacted = await redactInstance(i.instanceId, sql);
  expect(redacted.data).toEqual({});

  const scan = await findOrphanKeys(pid, published.version, sql);
  expect(scan.orphans).toEqual([]);
  expect(scan.unreadable).toEqual([]);
  expect(await rowData(i.instanceId)).toEqual({});
});

// --- the per-instance boundary logs -----------------------------------------

// surface-worker-failures: sweepRetention's per-instance catch used to discard
// its error with no line. The catch sits inside the sweep loop, so the tick
// returns normally and pollForever's own line never fires — a sweep failing on
// every instance was invisible.
test.skipIf(!DB)("an instance the sweep skips logs an error line carrying its id", async () => {
  const good = await mk();
  await setStatus(good.instanceId, "completed");
  await setEnteredAt(good.instanceId, "2020-01-01T00:00:00.000Z");

  // Eligible for the sweep's WHERE clause (completed, not redacted, old), but
  // `instanceSchema.parse` inside redactInstance rejects it. instance_id sorts
  // ahead of the good row's `inst_...`, so the sweep reaches it first.
  await sql`INSERT INTO instances (instance_id, transition_seq, body)
    VALUES (${"inst_0_unparseable"}, ${0},
      ${{ status: "completed", currentStepEnteredAt: "2020-01-01T00:00:00.000Z" }})`;

  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  await sweepRetention(sql, 30);
  const lines = errorSpy.mock.calls
    .map((c) => JSON.parse(c[0] as string) as Record<string, unknown>)
    .filter((l) => l.msg === "worker skipped a failing item");
  errorSpy.mockRestore();

  expect(lines).toHaveLength(1);
  expect(lines[0].level).toBe("error");
  expect(lines[0].worker).toBe("retention");
  expect(lines[0].instanceId).toBe("inst_0_unparseable");
  expect(typeof lines[0].error).toBe("string");

  // The sweep still redacted the rest of the batch.
  expect(await rowRedactedAt(good.instanceId)).not.toBeNull();
  expect(await rowData(good.instanceId)).toEqual({});
});
