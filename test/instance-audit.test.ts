/**
 * instance-audit-log-chain: the trigger (instance_audit_diff/
 * instance_audit_append), actor/source attribution (setAuditAttribution),
 * chain verification (verify_instance_chain / verifyInstanceChain), and
 * redaction's interaction with the log (redact_instance_fields). DB-backed —
 * skips when DATABASE_URL is unset, a skip is visible, a false green is not.
 */
import { createHash } from "node:crypto";
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance, withTransaction, setAuditAttribution } from "../src/engine/store.js";
import { executeManualTransition, claimStep } from "../src/engine/transition.js";
import { publishBody } from "../src/engine/definitions.js";
import { registerMigrationPlan, migrateInstances } from "../src/engine/migration.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { redactInstance } from "../src/engine/retention.js";
import { verifyInstanceChain } from "../src/engine/admin-queries.js";
import type { ProcessBody, Instance, Step, MigrationSpec } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const cel = (src: string) => ({ lang: "cel", src });

const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();

const step = (id: string, over: Record<string, unknown> = {}): Step => ({ id, key: id, label: { en: id }, type: "task", ...over }) as unknown as Step;
const manualPath = (id: string, to: string) => ({ id, key: id, label: `Path ${id}`, to, trigger: "manual" });

// step_a (non-terminal) --manual--> step_b (terminal). field_x/field_y are
// declared so a real submitted patch validates.
const simpleBody = (): ProcessBody =>
  ({
    key: "audit_test",
    label: { en: "audit test" },
    baseLocale: "en",
    fields: [
      { id: "field_x", key: "x", label: { en: "X" }, type: "string" },
      { id: "field_y", key: "y", label: { en: "Y" }, type: "string" },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [step("step_a", { paths: [manualPath("path_ab", "step_b")] }), step("step_b", { terminal: true })],
    },
  }) as unknown as ProcessBody;

const pid = () => `proc_audit_${crypto.randomUUID()}` as Instance["processId"];

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, instance_comments, instance_attachments, instance_drafts, definitions`;
  if (DB) await clearInstanceAudit();
});

// ---- fixtures ----------------------------------------------------------------

const mk = async (data: Record<string, unknown> = {}, over: { assignment?: unknown } = {}): Promise<Instance> =>
  createInstance(simpleBody(), { processId: pid(), version: 1, data: data as Instance["data"], ...over } as Parameters<typeof createInstance>[1], sql);

/** Raw jsonb shallow-merge into `body.data`, bypassing the runtime API — exercises the trigger alone. */
const setData = (id: string, patch: Record<string, unknown>) =>
  sql`UPDATE instances SET body = jsonb_set(body, '{data}', (body->'data') || ${patch}::jsonb) WHERE instance_id = ${id}`;
const removeDataKey = (id: string, key: string) =>
  sql`UPDATE instances SET body = jsonb_set(body, '{data}', (body->'data') - ${key}) WHERE instance_id = ${id}`;
const setStatus = (id: string, status: string) => sql`UPDATE instances SET body = body || ${{ status }}::jsonb WHERE instance_id = ${id}`;

type AuditRow = {
  seq: string;
  transition_seq: string;
  field_id: string;
  op: string;
  value: unknown;
  actor: string | null;
  source: string | null;
  reason: string | null;
  at: Date;
  salt: Buffer | null;
  value_hash: Buffer;
  prev_hash: Buffer;
  hash: Buffer;
};
const auditRows = async (id: string): Promise<AuditRow[]> =>
  (await sql`SELECT seq, transition_seq, field_id, op, value, actor, source, reason, at, salt, value_hash, prev_hash, hash
    FROM instance_audit WHERE instance_id = ${id} ORDER BY seq`) as AuditRow[];

const emptyHash = () => createHash("sha256").update(Buffer.alloc(0)).digest();

// ============================================================
// 1. Schema
// ============================================================

test.skipIf(!DB)("1.1 initSchema installs pgcrypto into schema public, and a second run is a no-op", async () => {
  const before = (await sql`
    SELECT e.extname, n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pgcrypto'
  `) as { extname: string; nspname: string }[];
  expect(before).toHaveLength(1);
  expect(before[0].nspname).toBe("public");
  await initSchema();
  const after = (await sql`SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'`) as unknown[];
  expect(after).toHaveLength(1);
});

test.skipIf(!DB)("1.3 pg_indexes lists instance_audit's primary key index", async () => {
  const rows = (await sql`SELECT indexname FROM pg_indexes WHERE tablename = 'instance_audit'`) as { indexname: string }[];
  expect(rows.map((r) => r.indexname)).toContain("instance_audit_pkey");
});

test.skipIf(!DB)("1.5 a second initSchema run leaves instance_audit and its rows untouched", async () => {
  const i = await mk({ field_x: "hi" });
  const before = await auditRows(i.instanceId);
  expect(before).toHaveLength(1);
  await initSchema();
  const after = await auditRows(i.instanceId);
  expect(after).toEqual(before);
});

// ============================================================
// 2. Trigger
// ============================================================

test.skipIf(!DB)("2.3 a direct INSERT writes one row per key", async () => {
  const i = await mk({ field_x: "a", field_y: "b" });
  const rows = await auditRows(i.instanceId);
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.field_id).sort()).toEqual(["field_x", "field_y"]);
  expect(rows.every((r) => r.op === "set")).toBe(true);
});

test.skipIf(!DB)("2.4 an UPDATE writes one row per differing key", async () => {
  const i = await mk({ field_x: "a", field_y: "b" });
  await setData(i.instanceId, { field_x: "a2" }); // field_y untouched
  const rows = await auditRows(i.instanceId);
  expect(rows).toHaveLength(3); // 2 from insert + 1 from update
  expect(rows[2].field_id).toBe("field_x");
  expect(rows[2].value).toBe("a2"); // Bun.sql deserializes jsonb to a native JS value already
});

test.skipIf(!DB)("2.5 two rows of one value differ in value_hash", async () => {
  const i = await mk({ field_x: "same" });
  await setData(i.instanceId, { field_x: "other" });
  await setData(i.instanceId, { field_x: "same" }); // same value as row 1
  const rows = await auditRows(i.instanceId);
  const row1 = rows[0];
  const row3 = rows[2];
  expect(row1.value).toBe(row3.value);
  expect(Buffer.from(row1.value_hash).equals(Buffer.from(row3.value_hash))).toBe(false);
});

test.skipIf(!DB)("2.6 value_hash matches a hand-computed digest", async () => {
  const i = await mk({ field_x: "hi" });
  const [row] = (await sql`SELECT salt, value::text AS value_text, value_hash FROM instance_audit WHERE instance_id = ${i.instanceId}`) as {
    salt: Buffer;
    value_text: string;
    value_hash: Buffer;
  }[];
  const expected = createHash("sha256")
    .update(Buffer.concat([Buffer.from(row.salt), Buffer.from(row.value_text, "utf8")]))
    .digest();
  expect(Buffer.from(row.value_hash).equals(expected)).toBe(true);
});

test.skipIf(!DB)("2.7 a three-row chain links head to tail", async () => {
  const i = await mk({ field_x: "1" });
  await setData(i.instanceId, { field_x: "2" });
  await setData(i.instanceId, { field_x: "3" });
  const rows = await auditRows(i.instanceId);
  expect(rows).toHaveLength(3);
  expect(Buffer.from(rows[1].prev_hash).equals(Buffer.from(rows[0].hash))).toBe(true);
  expect(Buffer.from(rows[2].prev_hash).equals(Buffer.from(rows[1].hash))).toBe(true);
});

test.skipIf(!DB)("2.8 an instance's first row chains from sha256(''::bytea)", async () => {
  const i = await mk({ field_x: "1" });
  const [row] = await auditRows(i.instanceId);
  expect(Buffer.from(row.prev_hash).equals(emptyHash())).toBe(true);
});

test.skipIf(!DB)("2.9 a join on instance and transition sequence returns that transition's audit rows", async () => {
  const p = pid();
  const published = await publishBody(p, simpleBody(), reg, dataSourceReg);
  const created = await createInstance(published.definition, { processId: p, version: published.version, data: {} as Instance["data"] }, sql);
  await executeManualTransition(created, "path_ab", published.definition, actor, sql, { field_x: "submitted" } as unknown as Instance["data"]);

  const hist = (await sql`SELECT transition_seq FROM history_entries WHERE instance_id = ${created.instanceId}`) as { transition_seq: number }[];
  expect(hist).toHaveLength(1);
  const joined = (await sql`
    SELECT ia.field_id FROM instance_audit ia
    JOIN history_entries he ON he.instance_id = ia.instance_id AND he.transition_seq = ia.transition_seq
    WHERE ia.instance_id = ${created.instanceId} AND he.transition_seq = ${hist[0].transition_seq}
  `) as { field_id: string }[];
  expect(joined.map((r) => r.field_id)).toContain("field_x");
});

test.skipIf(!DB)("2.10 a write that removes a key writes a set entry with JSON null value and a non-null value_hash", async () => {
  const i = await mk({ field_x: "gone" });
  await removeDataKey(i.instanceId, "field_x");
  const rows = await auditRows(i.instanceId);
  const removalRow = rows[1];
  expect(removalRow.op).toBe("set");
  expect(removalRow.value).toBeNull(); // JSON null (deserializes to JS null), not SQL NULL
  expect(removalRow.value_hash).not.toBeNull();
  expect(removalRow.salt).not.toBeNull(); // salted like any other `set` row
});

test.skipIf(!DB)("2.x a write that corrupts data to a non-object does not crash the underlying UPDATE, and writes no audit row", async () => {
  const i = await mk({ field_x: "1" });
  await sql`UPDATE instances SET body = body || '{"data": "not-an-object"}'::jsonb WHERE instance_id = ${i.instanceId}`;
  const rows = await auditRows(i.instanceId);
  expect(rows).toHaveLength(1); // only the creation row; the corrupting write added none
});

test.skipIf(!DB)("2.12 a write touching only assignment or status leaves the relation empty", async () => {
  const i = await mk({}, { assignment: { candidates: ["user_1"] } });
  await setStatus(i.instanceId, "cancelled");
  await sql`UPDATE instances SET body = jsonb_set(body, '{assignment,claimedBy}', '"user_1"') WHERE instance_id = ${i.instanceId}`;
  expect(await auditRows(i.instanceId)).toHaveLength(0);
});

test.skipIf(!DB)("2.13 the resolution worker's claim UPDATE writes no audit row", async () => {
  const i = await mk({}, { assignment: { candidates: ["user_1"] } });
  await claimStep(i.instanceId, actor, sql);
  expect(await auditRows(i.instanceId)).toHaveLength(0);
});

test.skipIf(!DB)("2.14 a second initSchema run leaves ownership and grants as the first run set them", async () => {
  await mk({ field_x: "hi" });
  const before = (await sql`
    SELECT c.relowner::regrole::text AS table_owner, p.proowner::regrole::text AS fn_owner
    FROM pg_class c, pg_proc p
    WHERE c.relname = 'instance_audit' AND p.proname = 'redact_instance_fields'
  `) as { table_owner: string; fn_owner: string }[];
  await initSchema();
  const after = (await sql`
    SELECT c.relowner::regrole::text AS table_owner, p.proowner::regrole::text AS fn_owner
    FROM pg_class c, pg_proc p
    WHERE c.relname = 'instance_audit' AND p.proname = 'redact_instance_fields'
  `) as { table_owner: string; fn_owner: string }[];
  expect(after).toEqual(before);
});

// ============================================================
// 3. Actor and source
// ============================================================

test.skipIf(!DB)("3.1 set_config's setting is readable via current_setting inside one transaction", async () => {
  await withTransaction(sql, async (tx) => {
    await setAuditAttribution(tx, "user_1", "submit");
    const [row] = (await tx`SELECT current_setting('detent.actor', true) AS a, current_setting('detent.source', true) AS s`) as {
      a: string;
      s: string;
    }[];
    expect(row.a).toBe("user_1");
    expect(row.s).toBe("submit");
  });
});

test.skipIf(!DB)("3.2/3.3 a row carries the actor and source set immediately before it; unset carries null with a full record", async () => {
  const i = await mk({ field_x: "1" });
  await withTransaction(sql, async (tx) => {
    await setAuditAttribution(tx, "user_9", "submit");
    await tx`UPDATE instances SET body = jsonb_set(body, '{data}', (body->'data') || '{"field_x":"attributed"}'::jsonb) WHERE instance_id = ${i.instanceId}`;
  });
  const attributed = (await auditRows(i.instanceId)).at(-1)!;
  expect(attributed.actor).toBe("user_9");
  expect(attributed.source).toBe("submit");

  // Unset on a fresh connection: current_setting(name, true) itself returns NULL.
  await setData(i.instanceId, { field_x: "unattributed" });
  const unattributed = (await auditRows(i.instanceId)).at(-1)!;
  expect(unattributed.actor).toBeNull();
  expect(unattributed.source).toBeNull();
  expect(unattributed.value).toBe("unattributed");
});

test.skipIf(!DB)("3.3 a connection that already committed a transaction writing both values resets to empty string, still read back as null", async () => {
  const i = await mk({ field_x: "1" });
  const reserved = await sql.reserve();
  try {
    await withTransaction(reserved, async (tx) => {
      await setAuditAttribution(tx, "user_9", "submit");
      await tx`SELECT 1`; // commits a transaction that wrote both placeholders
    });
    // A second transaction on the SAME connection that does not call
    // setAuditAttribution again: current_setting(..., true) now reads back
    // as '' rather than NULL (design.md "Actor and source arrive through
    // set_config") — the nullif in the trigger must still collapse it.
    await withTransaction(reserved, async (tx) => {
      await tx`UPDATE instances SET body = jsonb_set(body, '{data}', (body->'data') || '{"field_x":"reset-path"}'::jsonb) WHERE instance_id = ${i.instanceId}`;
    });
  } finally {
    reserved.release();
  }
  const row = (await auditRows(i.instanceId)).at(-1)!;
  expect(row.actor).toBeNull();
  expect(row.source).toBeNull();
});

test.skipIf(!DB)("3.4 creation carries source=creation and the actor from opts.startedBy; a subprocess-style spawn (no startedBy) carries a null actor", async () => {
  const withActor = await createInstance(simpleBody(), { processId: pid(), version: 1, data: { field_x: "seed" } as Instance["data"], startedBy: "user_5" }, sql);
  const row1 = (await auditRows(withActor.instanceId))[0];
  expect(row1.source).toBe("creation");
  expect(row1.actor).toBe("user_5");

  const noActor = await createInstance(simpleBody(), { processId: pid(), version: 1, data: { field_x: "seed" } as Instance["data"] }, sql);
  const row2 = (await auditRows(noActor.instanceId))[0];
  expect(row2.source).toBe("creation");
  expect(row2.actor).toBeNull();
});

test.skipIf(!DB)("3.5 a participant submit carries source=submit and the submitting actor", async () => {
  const p = pid();
  const published = await publishBody(p, simpleBody(), reg, dataSourceReg);
  const created = await createInstance(published.definition, { processId: p, version: published.version, data: {} as Instance["data"] }, sql);
  await executeManualTransition(created, "path_ab", published.definition, actor, sql, { field_x: "submitted" } as unknown as Instance["data"]);
  const row = (await auditRows(created.instanceId)).find((r) => r.field_id === "field_x")!;
  expect(row.source).toBe("submit");
  expect(row.actor).toBe(actor.id);
});

test.skipIf(!DB)("3.6 a migration row differs from a submit row (source=migration, no actor)", async () => {
  const p = pid();
  const v1 = simpleBody();
  const v2 = { ...simpleBody(), label: { en: "audit test v2" } } as ProcessBody;
  const pub1 = await publishBody(p, v1, reg, dataSourceReg);
  const pub2 = await publishBody(p, v2, reg, dataSourceReg);
  await registerMigrationPlan(p, pub1.version, pub2.version, { transforms: { field_x: cel("'migrated'") } } as unknown as MigrationSpec);
  const created = await createInstance(pub1.definition, { processId: p, version: pub1.version, data: {} as Instance["data"] }, sql);

  const res = await migrateInstances(p, pub1.version, pub2.version, sql);
  expect(res.migrated).toContain(created.instanceId);

  const row = (await auditRows(created.instanceId)).find((r) => r.field_id === "field_x")!;
  expect(row.source).toBe("migration");
  expect(row.actor).toBeNull();
});

// ============================================================
// 4. Chain verification
// ============================================================

test.skipIf(!DB)("4.1 an untampered chain verifies", async () => {
  const i = await mk({ field_x: "1", field_y: "2" });
  await setData(i.instanceId, { field_x: "3" });
  const [row] = (await sql`SELECT * FROM verify_instance_chain(${i.instanceId})`) as { ok: boolean; failed_seq: number | null }[];
  expect(row.ok).toBe(true);
  expect(row.failed_seq).toBeNull();
});

const asOwner = (fn: (tx: import("bun").SQL) => Promise<unknown>) =>
  withTransaction(sql, async (tx) => {
    await tx`SET LOCAL ROLE detent_audit_owner`;
    await fn(tx);
  });

test.skipIf(!DB)("4.2 rewriting one row's value makes verification name that row's sequence", async () => {
  const i = await mk({ field_x: "1" });
  await setData(i.instanceId, { field_x: "2" });
  const rows = await auditRows(i.instanceId);
  await asOwner((tx) => tx`UPDATE instance_audit SET value = '"tampered"'::jsonb WHERE instance_id = ${i.instanceId} AND seq = ${rows[0].seq}`);
  const [v] = (await sql`SELECT * FROM verify_instance_chain(${i.instanceId})`) as { ok: boolean; failed_seq: number }[];
  expect(v.ok).toBe(false);
  expect(String(v.failed_seq)).toBe(rows[0].seq);
});

test.skipIf(!DB)("4.3 deleting a middle row makes verification name the following row", async () => {
  const i = await mk({ field_x: "1" });
  await setData(i.instanceId, { field_x: "2" });
  await setData(i.instanceId, { field_x: "3" });
  const rows = await auditRows(i.instanceId);
  await asOwner((tx) => tx`DELETE FROM instance_audit WHERE instance_id = ${i.instanceId} AND seq = ${rows[1].seq}`);
  const [v] = (await sql`SELECT * FROM verify_instance_chain(${i.instanceId})`) as { ok: boolean; failed_seq: number }[];
  expect(v.ok).toBe(false);
  expect(String(v.failed_seq)).toBe(rows[2].seq);
});

test.skipIf(!DB)("4.4 rewriting two rows in one chain names the earlier one", async () => {
  const i = await mk({ field_x: "1" });
  await setData(i.instanceId, { field_x: "2" });
  await setData(i.instanceId, { field_x: "3" });
  const rows = await auditRows(i.instanceId);
  await asOwner(async (tx) => {
    await tx`UPDATE instance_audit SET value = '"tampered1"'::jsonb WHERE instance_id = ${i.instanceId} AND seq = ${rows[0].seq}`;
    await tx`UPDATE instance_audit SET value = '"tampered2"'::jsonb WHERE instance_id = ${i.instanceId} AND seq = ${rows[1].seq}`;
  });
  const [v] = (await sql`SELECT * FROM verify_instance_chain(${i.instanceId})`) as { ok: boolean; failed_seq: number }[];
  expect(v.ok).toBe(false);
  expect(String(v.failed_seq)).toBe(rows[0].seq);
});

test.skipIf(!DB)("4.5 verifyInstanceChain returns the SQL function's verdict unchanged", async () => {
  const i = await mk({ field_x: "1" });
  const holding = await verifyInstanceChain(i.instanceId as Instance["instanceId"], sql);
  expect(holding).toEqual({ ok: true, failedSeq: null });

  const [row] = await auditRows(i.instanceId);
  await asOwner((tx) => tx`UPDATE instance_audit SET value = '"tampered"'::jsonb WHERE instance_id = ${i.instanceId} AND seq = ${row.seq}`);
  const broken = await verifyInstanceChain(i.instanceId as Instance["instanceId"], sql);
  expect(broken.ok).toBe(false);
  expect(String(broken.failedSeq)).toBe(row.seq);
});

test.skipIf(!DB)("4.6 two rows differing only in which of actor/source holds null carry different hashes", async () => {
  // Same field, same value, same transition_seq shape — only which of
  // actor/source is null, and the surviving one carries the SAME string in
  // both rows. A bare concat_ws drops a null argument together with its
  // separator, so without the trigger's coalesce these two would shift into
  // one identical digest (design.md "The chain hashes in SQL").
  const i1 = await mk({});
  const i2 = await mk({});
  await withTransaction(sql, async (tx) => {
    await tx`SELECT set_config('detent.actor', 'user_9', true)`;
    await tx`SELECT set_config('detent.source', NULL, true)`;
    await tx`UPDATE instances SET body = jsonb_set(body, '{data}', (body->'data') || '{"field_x":"1"}'::jsonb) WHERE instance_id = ${i1.instanceId}`;
  });
  await withTransaction(sql, async (tx) => {
    await tx`SELECT set_config('detent.actor', NULL, true)`;
    await tx`SELECT set_config('detent.source', 'user_9', true)`;
    await tx`UPDATE instances SET body = jsonb_set(body, '{data}', (body->'data') || '{"field_x":"1"}'::jsonb) WHERE instance_id = ${i2.instanceId}`;
  });
  const row1 = (await auditRows(i1.instanceId))[0];
  const row2 = (await auditRows(i2.instanceId))[0];
  expect(row1.actor).toBe("user_9");
  expect(row1.source).toBeNull();
  expect(row2.actor).toBeNull();
  expect(row2.source).toBe("user_9");
  expect(Buffer.from(row1.hash).equals(Buffer.from(row2.hash))).toBe(false);
});

test.skipIf(!DB)("4.6b a rewrite forcing transition_seq to NULL is rejected, closing the field_id/transition_seq collision", async () => {
  const i = await mk({ field_x: "1" });
  const [row] = await auditRows(i.instanceId);
  await expect(
    asOwner(
      (tx) =>
        tx`UPDATE instance_audit SET transition_seq = NULL, field_id = ${"7" + "\x1e" + "fld_a"} WHERE instance_id = ${i.instanceId} AND seq = ${row.seq}`,
    ),
  ).rejects.toThrow();
});

test.skipIf(!DB)("4.7 swapping two rows' seq values makes verification name the earlier of the two", async () => {
  const i = await mk({ field_x: "1" });
  await setData(i.instanceId, { field_x: "2" });
  const rows = await auditRows(i.instanceId);
  await asOwner(async (tx) => {
    await tx`UPDATE instance_audit SET seq = -1 WHERE instance_id = ${i.instanceId} AND seq = ${rows[0].seq}`;
    await tx`UPDATE instance_audit SET seq = ${rows[0].seq} WHERE instance_id = ${i.instanceId} AND seq = ${rows[1].seq}`;
    await tx`UPDATE instance_audit SET seq = ${rows[1].seq} WHERE instance_id = ${i.instanceId} AND seq = -1`;
  });
  const [v] = (await sql`SELECT * FROM verify_instance_chain(${i.instanceId})`) as { ok: boolean; failed_seq: number }[];
  expect(v.ok).toBe(false);
  expect(String(v.failed_seq)).toBe(rows[0].seq); // the earlier seq position, walked first
});

// ============================================================
// 6. Redaction
// ============================================================

test.skipIf(!DB)("6.2/6.3 redaction appends one redact row per field and clears every prior value of those fields", async () => {
  const i = await mk({ field_x: "1" });
  await setData(i.instanceId, { field_x: "2" });
  await setData(i.instanceId, { field_y: "a" });
  await setStatus(i.instanceId, "completed");

  await redactInstance(i.instanceId as Instance["instanceId"], sql, { actor: "admin_1", reason: "gdpr" });

  const rows = await auditRows(i.instanceId);
  const redactRows = rows.filter((r) => r.op === "redact");
  expect(redactRows.map((r) => r.field_id).sort()).toEqual(["field_x", "field_y"]);
  const setRows = rows.filter((r) => r.op === "set");
  expect(setRows.every((r) => r.value === null && r.salt === null)).toBe(true);
});

test.skipIf(!DB)("6.4 redactInstance calls the redaction after the body.data wipe, and the set/redact entries share the actor", async () => {
  const i = await mk({ field_x: "1" }); // creation row: actor null, not part of the redaction
  await setStatus(i.instanceId, "completed");
  await redactInstance(i.instanceId as Instance["instanceId"], sql, { actor: "admin_1" });
  const rows = await auditRows(i.instanceId);
  // The trigger's own wipe-driven `set` row (data -> {}) and the definer
  // function's `redact` row both attribute to this same redaction call.
  const postWipeRows = rows.slice(1);
  expect(postWipeRows.length).toBeGreaterThanOrEqual(2);
  expect(postWipeRows.every((r) => r.actor === "admin_1")).toBe(true);
  const redactRow = rows.find((r) => r.op === "redact")!;
  expect(redactRow.source).toBe("redaction");
});

test.skipIf(!DB)("6.5 a second instance's entries keep their values in clear text", async () => {
  const redacted = await mk({ field_x: "1" });
  const other = await mk({ field_x: "keep-me" });
  await setStatus(redacted.instanceId, "completed");
  await redactInstance(redacted.instanceId as Instance["instanceId"], sql);
  const otherRow = (await auditRows(other.instanceId))[0];
  expect(otherRow.value).toBe("keep-me");
});

test.skipIf(!DB)("6.6 verify_instance_chain still reports holding after a redaction", async () => {
  const i = await mk({ field_x: "1" });
  await setData(i.instanceId, { field_x: "2" });
  await setStatus(i.instanceId, "completed");
  await redactInstance(i.instanceId as Instance["instanceId"], sql);
  const holding = await verifyInstanceChain(i.instanceId as Instance["instanceId"], sql);
  expect(holding).toEqual({ ok: true, failedSeq: null });
});

test.skipIf(!DB)("6.7 the redaction's own entries carry no value", async () => {
  const i = await mk({ field_x: "1" });
  await setStatus(i.instanceId, "completed");
  await redactInstance(i.instanceId as Instance["instanceId"], sql);
  const redactRow = (await auditRows(i.instanceId)).find((r) => r.op === "redact")!;
  expect(redactRow.value).toBeNull();
  expect(redactRow.salt).toBeNull();
});

test.skipIf(!DB)("6.8 a second redactInstance call appends no second redact entry and nulls nothing further", async () => {
  const i = await mk({ field_x: "1" });
  await setStatus(i.instanceId, "completed");
  await redactInstance(i.instanceId as Instance["instanceId"], sql);
  const before = await auditRows(i.instanceId);
  await redactInstance(i.instanceId as Instance["instanceId"], sql);
  const after = await auditRows(i.instanceId);
  expect(after).toEqual(before);
});

test.skipIf(!DB)("6.9 redactInstance's reason lands on each redact row, and is null when unsupplied", async () => {
  const withReason = await mk({ field_x: "1" });
  await setStatus(withReason.instanceId, "completed");
  await redactInstance(withReason.instanceId as Instance["instanceId"], sql, { reason: "gdpr-request" });
  const r1 = (await auditRows(withReason.instanceId)).find((r) => r.op === "redact")!;
  expect(r1.reason).toBe("gdpr-request");

  const noReason = await mk({ field_x: "1" });
  await setStatus(noReason.instanceId, "completed");
  await redactInstance(noReason.instanceId as Instance["instanceId"], sql);
  const r2 = (await auditRows(noReason.instanceId)).find((r) => r.op === "redact")!;
  expect(r2.reason).toBeNull();
});

test.skipIf(!DB)("6.10 each redact row's transition_seq equals the instance's own at redaction time", async () => {
  const i = await mk({ field_x: "1" });
  await setStatus(i.instanceId, "completed");
  const [{ transition_seq: expectedSeq }] = (await sql`SELECT transition_seq FROM instances WHERE instance_id = ${i.instanceId}`) as {
    transition_seq: number;
  }[];
  await redactInstance(i.instanceId as Instance["instanceId"], sql);
  const redactRow = (await auditRows(i.instanceId)).find((r) => r.op === "redact")!;
  expect(Number(redactRow.transition_seq)).toBe(expectedSeq);
});
