/**
 * src/engine/templates.ts: get/list/save/delete against the `templates` table,
 * the envelope-only validation a template body gets, the key format check, and
 * the list projection that carries a label but no body. DB-backed — skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { getTemplate, listTemplates, saveTemplate, deleteTemplate } from "../src/engine/templates.js";
import { MAX_DRAFT_ENVELOPE_BYTES } from "../src/engine/drafts.js";
import { RequestShapeError } from "../src/errors.js";

const DB = !!process.env.DATABASE_URL;

let n = 0;
const key = () => `tpl_${++n}`;

/** A structurally invalid authored body: one step, no exit, no timer — legal for a draft, so legal for a template. */
const invalidBody = (label: string): unknown => ({
  key: "tpl_wf",
  label: { en: label },
  description: { en: `${label} description` },
  baseLocale: "en",
  fields: [],
  workflow: {
    initialStep: "step_a",
    steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task" }],
  },
});

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE templates`;
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

test.skipIf(!DB)("a save persists body and layout and a get returns them unchanged", async () => {
  const k = key();
  const body = invalidBody("v1");
  const layout = { step_a: { x: 10, y: 20 } };
  const saved = await saveTemplate(k, { body, layout, createdBy: "user_a" }, sql);
  expect(saved.templateKey).toBe(k);
  expect(saved.body).toEqual(body);
  expect(saved.layout).toEqual(layout);
  expect(saved.createdBy).toBe("user_a");

  const read = await getTemplate(k, sql);
  expect(read?.body).toEqual(body);
  expect(read?.layout).toEqual(layout);
});

test.skipIf(!DB)("a body no schema accepts is stored as authored", async () => {
  const k = key();
  // One step with no exit: publish would reject this body, a template must not.
  await saveTemplate(k, { body: invalidBody("unpublishable"), layout: {}, createdBy: "user_a" }, sql);
  const read = await getTemplate(k, sql);
  expect((read?.body as { workflow: { steps: unknown[] } }).workflow.steps).toHaveLength(1);
});

test.skipIf(!DB)("a get for an unknown key returns undefined", async () => {
  expect(await getTemplate("tpl_absent", sql)).toBeUndefined();
});

// ============================================================
// one key holds at most one template
// ============================================================

test.skipIf(!DB)("a second save under one key replaces the first and leaves one row", async () => {
  const k = key();
  await saveTemplate(k, { body: invalidBody("first"), layout: {}, createdBy: "user_a" }, sql);
  await saveTemplate(k, { body: invalidBody("second"), layout: {}, createdBy: "user_b" }, sql);

  const read = await getTemplate(k, sql);
  expect((read?.body as { label: { en: string } }).label.en).toBe("second");
  expect(read?.createdBy).toBe("user_b");

  const rows = (await sql`SELECT template_key FROM templates WHERE template_key = ${k}`) as unknown[];
  expect(rows).toHaveLength(1);
});

// ============================================================
// envelope validation
// ============================================================

test.skipIf(!DB)("a non-object body is rejected and writes no row", async () => {
  const k = key();
  await expectRejects(saveTemplate(k, { body: [1, 2], layout: {}, createdBy: "user_a" }, sql), RequestShapeError);
  expect(await getTemplate(k, sql)).toBeUndefined();
});

test.skipIf(!DB)("a non-object layout is rejected and writes no row", async () => {
  const k = key();
  await expectRejects(
    saveTemplate(k, { body: invalidBody("v1"), layout: "not-an-object", createdBy: "user_a" }, sql),
    RequestShapeError,
  );
  expect(await getTemplate(k, sql)).toBeUndefined();
});

test.skipIf(!DB)("an envelope over the bound is rejected and writes no row", async () => {
  const k = key();
  const oversized = { ...(invalidBody("big") as object), filler: "x".repeat(MAX_DRAFT_ENVELOPE_BYTES) };
  await expectRejects(saveTemplate(k, { body: oversized, layout: {}, createdBy: "user_a" }, sql), RequestShapeError);
  expect(await getTemplate(k, sql)).toBeUndefined();
});

test.skipIf(!DB)("a key outside the slug grammar is rejected", async () => {
  for (const bad of ["Tpl_Upper", "tpl key", "-leading-dash", "tpl/slash", ""]) {
    await expectRejects(saveTemplate(bad, { body: invalidBody("v1"), layout: {}, createdBy: "user_a" }, sql), RequestShapeError);
  }
});

// ============================================================
// list projection
// ============================================================

test.skipIf(!DB)("the list carries the body's label and description but no body", async () => {
  const k = key();
  await saveTemplate(k, { body: invalidBody("Listed"), layout: { step_a: { x: 1, y: 2 } }, createdBy: "user_a" }, sql);

  const list = await listTemplates(sql);
  expect(list).toHaveLength(1);
  expect(list[0]!.templateKey).toBe(k);
  expect(list[0]!.label).toEqual({ en: "Listed" });
  expect(list[0]!.description).toEqual({ en: "Listed description" });
  // The projection is the point: a body may reach MAX_DRAFT_ENVELOPE_BYTES.
  expect(list[0]).not.toHaveProperty("body");
  expect(list[0]).not.toHaveProperty("layout");
});

test.skipIf(!DB)("a body declaring no label lists a null label rather than dropping the row", async () => {
  const k = key();
  await saveTemplate(k, { body: { baseLocale: "en" }, layout: {}, createdBy: "user_a" }, sql);
  const list = await listTemplates(sql);
  expect(list).toHaveLength(1);
  expect(list[0]!.templateKey).toBe(k);
  expect(list[0]!.label).toBeNull();
});

test.skipIf(!DB)("the list is newest-saved first", async () => {
  const older = key();
  const newer = key();
  await saveTemplate(older, { body: invalidBody("older"), layout: {}, createdBy: "user_a" }, sql);
  await sql`UPDATE templates SET updated_at = now() - interval '1 hour' WHERE template_key = ${older}`;
  await saveTemplate(newer, { body: invalidBody("newer"), layout: {}, createdBy: "user_a" }, sql);

  const list = await listTemplates(sql);
  expect(list.map((t) => t.templateKey)).toEqual([newer, older]);
});

test.skipIf(!DB)("an empty table lists nothing", async () => {
  expect(await listTemplates(sql)).toEqual([]);
});

// ============================================================
// delete
// ============================================================

test.skipIf(!DB)("a delete removes the row and reports that one existed", async () => {
  const k = key();
  await saveTemplate(k, { body: invalidBody("v1"), layout: {}, createdBy: "user_a" }, sql);
  expect(await deleteTemplate(k, sql)).toBe(true);
  expect(await getTemplate(k, sql)).toBeUndefined();
});

test.skipIf(!DB)("a delete of a missing key reports that none existed", async () => {
  expect(await deleteTemplate("tpl_absent", sql)).toBe(false);
});
