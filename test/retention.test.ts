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
import { findOrphanKeys, registerMigrationPlan, migrateInstances } from "../src/engine/migration.js";
import { redactInstance, sweepRetention } from "../src/engine/retention.js";
import { saveInstanceDraft as engineSaveInstanceDraft, getInstanceDraft } from "../src/engine/instance-drafts.js";
import { NotFoundError, InstanceRunningError } from "../src/errors.js";
import type { ProcessBody, Instance, InstanceId, MigrationSpec } from "../src/schema/definition.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

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
  if (DB)
    await sql`TRUNCATE outbox, instances, history_entries, instance_events, instance_comments, instance_attachments, instance_drafts, definitions, migration_plans`;
  if (DB) await clearInstanceAudit();
});

// redactable-field-flag: redactInstance now resolves the instance's pinned
// definition body, so every instance must be created against a published
// version (no `definitions` row means resolveBody returns undefined and
// redactInstance throws). None of the tests below assert on field-level
// redaction scoping, only on body.data/comments/attachments/drafts, which
// stay unconditionally cleared regardless of `redactable`.
const mk = async (data: Record<string, unknown> = { field_x: "value" }): Promise<Instance> => {
  const published = await publishBody(pid, body(), reg, dataSourceReg);
  return createInstance(published.definition, { processId: pid, version: published.version, data: data as Instance["data"] }, sql);
};

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

// --- field-scoped redaction (redactable-field-flag) -------------------------
//
// redactInstance now resolves the redactable field-id set from the
// instance's currently pinned definition, so these cases publish a real
// field catalog rather than the empty one `body()` uses. A separate
// process id keeps their versions from interleaving with `pid`'s.

const pid2 = "proc_retention_fields" as Instance["processId"];
type Field = { id: string; key: string; label: { en: string }; type: string; redactable?: boolean };
const f = (key: string, opts: { redactable?: boolean } = {}): Field => ({ id: `field_${key}`, key, label: { en: key }, type: "string", ...opts });

const fieldsBody = (fields: Field[], tag: string): ProcessBody =>
  ({
    key: "retention_test_fields",
    label: { en: `retention test fields #${tag}` },
    baseLocale: "en",
    fields,
    workflow: {
      initialStep: "step_a",
      steps: [step("step_a", { paths: [{ id: "path_ab", key: "path_ab", label: "Ab", to: "step_b", trigger: "manual" }] }), step("step_b", { terminal: true })],
    },
  }) as unknown as ProcessBody;

const auditRows = async (id: string, fieldId: string): Promise<{ value: unknown; salt: Buffer | null; op: string }[]> =>
  (await sql`SELECT value, salt, op FROM instance_audit WHERE instance_id = ${id} AND field_id = ${fieldId} ORDER BY seq`) as {
    value: unknown;
    salt: Buffer | null;
    op: string;
  }[];

test.skipIf(!DB)("redactInstance clears only the fields the currently pinned version marks redactable", async () => {
  const published = await publishBody(pid2, fieldsBody([f("a", { redactable: true }), f("b")], "2-2"), reg, dataSourceReg);
  const i = await createInstance(
    published.definition,
    { processId: pid2, version: published.version, data: { field_a: "secret", field_b: "public" } as unknown as Instance["data"] },
    sql,
  );
  await setStatus(i.instanceId, "completed");

  await redactInstance(i.instanceId, sql);

  // redactInstance's unconditional `data -> {}` wipe (every field, regardless
  // of redactable) also appends its own "set" entry recording the drop to
  // JSON null — a real jsonb value, not SQL NULL, so instance_audit_append
  // still salts it. `salt IS NULL` is therefore the reliable signal that a
  // row was cleared BY redact_instance_fields, not merely superseded by the
  // wipe: only its own appended "redact" row and the rows its UPDATE clears
  // ever carry a null salt.
  const aRows = await auditRows(i.instanceId, "field_a");
  expect(aRows.some((r) => r.op === "redact")).toBe(true);
  for (const r of aRows) {
    expect(r.value).toBeNull();
    expect(r.salt).toBeNull();
  }
  const bRows = await auditRows(i.instanceId, "field_b");
  expect(bRows.some((r) => r.op === "redact")).toBe(false);
  expect(bRows[0].value).toBe("public");
  expect(bRows[0].salt).not.toBeNull();
});

test.skipIf(!DB)("a field removed from the currently pinned version's catalog keeps its history", async () => {
  const v1 = await publishBody(pid2, fieldsBody([f("removed", { redactable: true })], "2-3-v1"), reg, dataSourceReg);
  const v2 = await publishBody(pid2, fieldsBody([], "2-3-v2"), reg, dataSourceReg);
  await registerMigrationPlan(pid2, v1.version, v2.version, {} as MigrationSpec);
  const i = await createInstance(
    v1.definition,
    { processId: pid2, version: v1.version, data: { field_removed: "keepme" } as unknown as Instance["data"] },
    sql,
  );
  await migrateInstances(pid2, v1.version, v2.version, sql);
  await setStatus(i.instanceId, "completed");

  await redactInstance(i.instanceId, sql);

  // field_removed is absent from v2's catalog, so redact_instance_fields
  // never includes it — the unconditional data wipe still logs its own drop
  // to JSON null (a salted "set" row, see the test above), but the field's
  // own original row, and every row, keeps its salt: nothing ever clears one.
  const rows = await auditRows(i.instanceId, "field_removed");
  expect(rows.some((r) => r.op === "redact")).toBe(false);
  for (const r of rows) expect(r.salt).not.toBeNull();
  expect(rows[0].value).toBe("keepme");
});

test.skipIf(!DB)("the currently pinned version's flag governs, not an earlier one: redactable true -> false leaves values", async () => {
  const v1 = await publishBody(pid2, fieldsBody([f("flip", { redactable: true })], "2-4a-v1"), reg, dataSourceReg);
  const v2 = await publishBody(pid2, fieldsBody([f("flip", { redactable: false })], "2-4a-v2"), reg, dataSourceReg);
  await registerMigrationPlan(pid2, v1.version, v2.version, {} as MigrationSpec);
  const i = await createInstance(
    v1.definition,
    { processId: pid2, version: v1.version, data: { field_flip: "before" } as unknown as Instance["data"] },
    sql,
  );
  await migrateInstances(pid2, v1.version, v2.version, sql);
  await setStatus(i.instanceId, "completed");

  await redactInstance(i.instanceId, sql);

  const rows = await auditRows(i.instanceId, "field_flip");
  expect(rows.some((r) => r.op === "redact")).toBe(false);
  for (const r of rows) expect(r.salt).not.toBeNull();
  expect(rows[0].value).toBe("before");
});

test.skipIf(!DB)("the currently pinned version's flag governs, not a later one: redactable absent -> true clears values", async () => {
  const v1 = await publishBody(pid2, fieldsBody([f("flip2")], "2-4b-v1"), reg, dataSourceReg);
  const v2 = await publishBody(pid2, fieldsBody([f("flip2", { redactable: true })], "2-4b-v2"), reg, dataSourceReg);
  await registerMigrationPlan(pid2, v1.version, v2.version, {} as MigrationSpec);
  const i = await createInstance(
    v1.definition,
    { processId: pid2, version: v1.version, data: { field_flip2: "before" } as unknown as Instance["data"] },
    sql,
  );
  await migrateInstances(pid2, v1.version, v2.version, sql);
  await setStatus(i.instanceId, "completed");

  await redactInstance(i.instanceId, sql);

  const rows = await auditRows(i.instanceId, "field_flip2");
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows.filter((r) => r.op === "set")) {
    expect(r.value).toBeNull();
    expect(r.salt).toBeNull();
  }
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

// The age predicate compares ISO-8601 text on both sides since the
// promote-instance-assignment-columns change: `current_step_entered_at` and
// `started_at` are generated text columns (a timestamptz generation
// expression is not immutable), and the cutoff is rendered with `to_char` in
// the same statement. These three pin the boundary that rewrite moved.

const isoDaysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString();

test.skipIf(!DB)("sweepRetention redacts an instance one day past the window boundary", async () => {
  const i = await mk();
  await setStatus(i.instanceId, "completed");
  await setEnteredAt(i.instanceId, isoDaysAgo(31));

  await sweepRetention(sql, 30);
  expect(await rowRedactedAt(i.instanceId)).not.toBeNull();
});

test.skipIf(!DB)("sweepRetention leaves an instance one day inside the window boundary", async () => {
  const i = await mk();
  await setStatus(i.instanceId, "completed");
  await setEnteredAt(i.instanceId, isoDaysAgo(29));

  await sweepRetention(sql, 30);
  expect(await rowRedactedAt(i.instanceId)).toBeNull();
});

test.skipIf(!DB)("sweepRetention compares a currentStepEnteredAt written without milliseconds", async () => {
  // `timestamp` in definition.ts is a bare z.string(), so a hand-written body
  // can carry a second-precision form. Text comparison must still place it on
  // the right side of the cutoff.
  const past = await mk();
  await setStatus(past.instanceId, "completed");
  await setEnteredAt(past.instanceId, isoDaysAgo(31).replace(/\.\d{3}Z$/, "Z"));

  const inside = await mk();
  await setStatus(inside.instanceId, "completed");
  await setEnteredAt(inside.instanceId, isoDaysAgo(29).replace(/\.\d{3}Z$/, "Z"));

  await sweepRetention(sql, 30);
  expect(await rowRedactedAt(past.instanceId)).not.toBeNull();
  expect(await rowRedactedAt(inside.instanceId)).toBeNull();
});
