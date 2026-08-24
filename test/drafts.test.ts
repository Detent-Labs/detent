/**
 * src/engine/drafts.ts: get/save/list/delete against the `drafts` table,
 * revision-checked optimistic concurrency, the envelope-only validation of a
 * saved body, and the layout/hash independence invariant. DB-backed — skips
 * when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { getDraft, saveDraft, listDrafts, deleteDraft, markDraftPublished, DraftConflictError } from "../src/engine/drafts.js";
import { RequestShapeError } from "../src/errors.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();

let n = 0;
const pid = () => `proc_draft_${++n}` as ProcessId;

/** A structurally invalid authored body: one step, no exit, no timer — legal for a draft, illegal for publish. */
const invalidBody = (label: string): unknown => ({
  key: "draft_wf",
  label: { en: label },
  baseLocale: "en",
  fields: [],
  workflow: {
    initialStep: "step_a",
    steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task" }],
  },
});

const validBody = (label: string): ProcessBody =>
  ({
    key: "draft_wf",
    label: { en: label },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE drafts, definitions`;
});

/** `.rejects` on a promise running Bun.sql queries can wedge the pool under bun:test; await-then-catch instead. */
async function expectRejects(p: Promise<unknown>, ctor: new (...args: never[]) => Error): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ctor);
}

// ============================================================
// save / get round-trip
// ============================================================

test.skipIf(!DB)("a save at the matching revision persists body and layout and increments revision", async () => {
  const processId = pid();
  const created = await saveDraft(processId, { body: invalidBody("v1"), layout: {}, revision: 0, updatedBy: "user_a" }, sql);
  expect(created.revision).toBe(0);

  const updated = await saveDraft(
    processId,
    { body: invalidBody("v2"), layout: { step_a: { x: 1, y: 2 } }, revision: 0, updatedBy: "user_a" },
    sql,
  );
  expect(updated.revision).toBe(1);
  expect(updated.layout).toEqual({ step_a: { x: 1, y: 2 } });

  const fetched = await getDraft(processId, sql);
  expect(fetched?.revision).toBe(1);
  expect((fetched?.body as { label: { en: string } }).label.en).toBe("v2");
});

test.skipIf(!DB)("a stale save raises DraftConflictError and leaves the row byte-identical", async () => {
  const processId = pid();
  await saveDraft(processId, { body: invalidBody("v1"), layout: {}, revision: 0, updatedBy: "user_a" }, sql);
  await saveDraft(processId, { body: invalidBody("v2"), layout: {}, revision: 0, updatedBy: "user_a" }, sql); // -> revision 1

  await expectRejects(saveDraft(processId, { body: invalidBody("v3"), layout: {}, revision: 0, updatedBy: "user_b" }, sql), DraftConflictError);

  const stored = await getDraft(processId, sql);
  expect(stored?.revision).toBe(1);
  expect((stored?.body as { label: { en: string } }).label.en).toBe("v2");
  expect(stored?.updatedBy).toBe("user_a");
});

test.skipIf(!DB)("a structurally invalid body saves and reads back unchanged", async () => {
  const processId = pid();
  await saveDraft(processId, { body: invalidBody("no-exit"), layout: {}, revision: 0, updatedBy: "user_a" }, sql);
  const fetched = await getDraft(processId, sql);
  expect(fetched?.body).toEqual(invalidBody("no-exit"));
});

test.skipIf(!DB)("a layout key for an undeclared step round-trips", async () => {
  const processId = pid();
  await saveDraft(
    processId,
    { body: invalidBody("v1"), layout: { step_ghost: { x: 5, y: 5 } }, revision: 0, updatedBy: "user_a" },
    sql,
  );
  const fetched = await getDraft(processId, sql);
  expect(fetched?.layout).toEqual({ step_ghost: { x: 5, y: 5 } });
});

test.skipIf(!DB)("getDraft on an absent process returns undefined", async () => {
  expect(await getDraft(pid(), sql)).toBeUndefined();
});

test.skipIf(!DB)("listDrafts carries no body", async () => {
  const processId = pid();
  await saveDraft(processId, { body: invalidBody("v1"), layout: {}, revision: 0, updatedBy: "user_a" }, sql);
  const list = await listDrafts(sql);
  const entry = list.find((d) => d.processId === processId);
  expect(entry).toBeDefined();
  expect(entry).not.toHaveProperty("body");
  expect(entry?.updatedBy).toBe("user_a");
});

test.skipIf(!DB)("deleteDraft leaves published versions intact", async () => {
  const processId = pid();
  const version = await publishBody(processId, validBody("published"), reg, dataSourceReg, sql);
  await saveDraft(processId, { body: invalidBody("draft"), layout: {}, revision: 0, updatedBy: "user_a" }, sql);

  const removed = await deleteDraft(processId, sql);
  expect(removed).toBe(true);
  expect(await getDraft(processId, sql)).toBeUndefined();

  const rows = (await sql`SELECT version FROM definitions WHERE process_id = ${processId}`) as { version: number }[];
  expect(rows.map((r) => r.version)).toEqual([version.version]);
});

test.skipIf(!DB)("deleteDraft on an absent draft reports nothing removed", async () => {
  expect(await deleteDraft(pid(), sql)).toBe(false);
});

test.skipIf(!DB)("markDraftPublished stamps base_version without changing revision, body, or layout", async () => {
  const processId = pid();
  await saveDraft(processId, { body: invalidBody("v1"), layout: { step_a: { x: 1, y: 2 } }, revision: 0, updatedBy: "user_a" }, sql);
  await saveDraft(processId, { body: invalidBody("v2"), layout: { step_a: { x: 1, y: 2 } }, revision: 0, updatedBy: "user_a" }, sql); // -> revision 1

  await markDraftPublished(processId, 3, sql);

  const stored = await getDraft(processId, sql);
  expect(stored?.baseVersion).toBe(3);
  expect(stored?.revision).toBe(1);
  expect((stored?.body as { label: { en: string } }).label.en).toBe("v2");
});

test.skipIf(!DB)("a second markDraftPublished replaces the earlier base_version", async () => {
  const processId = pid();
  await saveDraft(processId, { body: invalidBody("v1"), layout: {}, revision: 0, updatedBy: "user_a" }, sql);
  await markDraftPublished(processId, 1, sql);
  await markDraftPublished(processId, 2, sql);
  expect((await getDraft(processId, sql))?.baseVersion).toBe(2);
});

// ============================================================
// envelope validation
// ============================================================

const envelopeCases: { name: string; input: { body?: unknown; layout?: unknown; revision?: unknown } }[] = [
  { name: "body as an array", input: { body: [], layout: {}, revision: 0 } },
  { name: "body as a string", input: { body: "oops", layout: {}, revision: 0 } },
  { name: "body as a number", input: { body: 1, layout: {}, revision: 0 } },
  { name: "body as null", input: { body: null, layout: {}, revision: 0 } },
  { name: "layout as a non-object", input: { body: {}, layout: "oops", revision: 0 } },
  { name: "revision as a negative number", input: { body: {}, layout: {}, revision: -1 } },
  { name: "revision as a non-integer", input: { body: {}, layout: {}, revision: 1.5 } },
  { name: "revision as a non-number", input: { body: {}, layout: {}, revision: "0" } },
];

for (const { name, input } of envelopeCases) {
  test.skipIf(!DB)(`saveDraft rejects ${name}`, async () => {
    const processId = pid();
    await expectRejects(saveDraft(processId, { body: {}, layout: {}, revision: 0, ...input, updatedBy: "user_a" } as never, sql), RequestShapeError);
    expect(await getDraft(processId, sql)).toBeUndefined();
  });
}

test.skipIf(!DB)("an envelope violation on an existing draft leaves the stored row untouched", async () => {
  const processId = pid();
  await saveDraft(processId, { body: invalidBody("v1"), layout: {}, revision: 0, updatedBy: "user_a" }, sql);
  await expectRejects(saveDraft(processId, { body: [], layout: {}, revision: 0, updatedBy: "user_b" } as never, sql), RequestShapeError);
  const stored = await getDraft(processId, sql);
  expect(stored?.revision).toBe(0);
  expect((stored?.body as { label: { en: string } }).label.en).toBe("v1");
});

// harden-publish-validation: the envelope check also bounds the serialized
// size of body+layout together — the same reasoning that gave the HTTP server
// its own maxRequestBodySize (src/http/server.ts), restated here since
// drafts.ts is a module boundary in its own right and may be reached by a
// non-HTTP caller.
test.skipIf(!DB)("saveDraft rejects an over-size body/layout pair and leaves any stored draft untouched", async () => {
  const processId = pid();
  await saveDraft(processId, { body: invalidBody("v1"), layout: {}, revision: 0, updatedBy: "user_a" }, sql);
  const oversizedBody = { key: "p", padding: "x".repeat(9 * 1024 * 1024) };
  await expectRejects(
    saveDraft(processId, { body: oversizedBody, layout: {}, revision: 0, updatedBy: "user_b" } as never, sql),
    RequestShapeError,
  );
  const stored = await getDraft(processId, sql);
  expect(stored?.revision).toBe(0);
  expect((stored?.body as { label: { en: string } }).label.en).toBe("v1");
});

test.skipIf(!DB)("saveDraft accepts a draft of the size a real process definition reaches", async () => {
  const processId = pid();
  const realisticBody = { ...(invalidBody("v1") as Record<string, unknown>), padding: "x".repeat(200_000) }; // ~200 KB, well under the bound
  const saved = await saveDraft(processId, { body: realisticBody, layout: {}, revision: 0, updatedBy: "user_a" }, sql);
  expect(saved.revision).toBe(0);
});

// ============================================================
// hash invariant: layout never affects definitionHash
// ============================================================

test.skipIf(!DB)("a layout-only change does not mint a new version at the next publish", async () => {
  const processId = pid();
  const body = validBody("hash-invariant");
  const first = await publishBody(processId, body, reg, dataSourceReg, sql);

  await saveDraft(processId, { body, layout: {}, revision: 0, updatedBy: "user_a" }, sql);
  await saveDraft(processId, { body, layout: { step_a: { x: 9, y: 9 } }, revision: 0, updatedBy: "user_a" }, sql);

  const draft = await getDraft(processId, sql);
  const second = await publishBody(processId, draft!.body as ProcessBody, reg, dataSourceReg, sql);

  expect(second.definitionHash).toBe(first.definitionHash);
  expect(second.version).toBe(first.version);

  const rows = (await sql`SELECT version FROM definitions WHERE process_id = ${processId}`) as { version: number }[];
  expect(rows.length).toBe(1);
});

// ============================================================
// baseVersion: a save may declare the published version it derives from
// ============================================================

test.skipIf(!DB)("a save declares its base version", async () => {
  const processId = pid();
  const published = await publishBody(processId, validBody("v1"), reg, dataSourceReg, sql);

  const saved = await saveDraft(
    processId,
    { body: invalidBody("seeded"), layout: {}, revision: 0, updatedBy: "user_a", baseVersion: published.version },
    sql,
  );

  expect(saved.baseVersion).toBe(published.version);
  const summaries = await listDrafts(sql);
  expect(summaries.find((s) => s.processId === processId)?.baseVersion).toBe(published.version);
});

test.skipIf(!DB)("a save without baseVersion preserves the stored base", async () => {
  const processId = pid();
  const published = await publishBody(processId, validBody("v1"), reg, dataSourceReg, sql);
  await saveDraft(
    processId,
    { body: invalidBody("seeded"), layout: {}, revision: 0, updatedBy: "user_a", baseVersion: published.version },
    sql,
  );

  const edited = await saveDraft(processId, { body: invalidBody("edited"), layout: {}, revision: 0, updatedBy: "user_a" }, sql);

  expect(edited.revision).toBe(1);
  expect(edited.baseVersion).toBe(published.version);
});

test.skipIf(!DB)("a baseVersion naming no published version is refused", async () => {
  const processId = pid();
  await publishBody(processId, validBody("v1"), reg, dataSourceReg, sql);

  await expectRejects(
    saveDraft(processId, { body: invalidBody("seeded"), layout: {}, revision: 0, updatedBy: "user_a", baseVersion: 7 }, sql),
    RequestShapeError,
  );
  expect(await getDraft(processId, sql)).toBeUndefined();
});

test.skipIf(!DB)("a malformed baseVersion is refused and leaves the stored draft unchanged", async () => {
  const processId = pid();
  await publishBody(processId, validBody("v1"), reg, dataSourceReg, sql);
  await saveDraft(processId, { body: invalidBody("v1"), layout: {}, revision: 0, updatedBy: "user_a", baseVersion: 1 }, sql);

  for (const bad of [0, -1, 1.5, "1", null]) {
    await expectRejects(
      saveDraft(
        processId,
        { body: invalidBody("v2"), layout: {}, revision: 0, updatedBy: "user_b", baseVersion: bad } as never,
        sql,
      ),
      RequestShapeError,
    );
  }

  const stored = await getDraft(processId, sql);
  expect(stored?.revision).toBe(0);
  expect(stored?.baseVersion).toBe(1);
  expect((stored?.body as { label: { en: string } }).label.en).toBe("v1");
});

test.skipIf(!DB)("publishing still stamps its own base version over a seeded one", async () => {
  const processId = pid();
  const first = await publishBody(processId, validBody("v1"), reg, dataSourceReg, sql);
  await saveDraft(
    processId,
    { body: invalidBody("seeded"), layout: {}, revision: 0, updatedBy: "user_a", baseVersion: first.version },
    sql,
  );

  await markDraftPublished(processId, first.version + 1, sql);

  expect((await getDraft(processId, sql))?.baseVersion).toBe(first.version + 1);
});
