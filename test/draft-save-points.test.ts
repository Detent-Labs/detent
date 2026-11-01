/**
 * src/engine/draft-save-points.ts: create, list, restore and delete against
 * `draft_save_points`, the name and count bounds, the draft row lock, and the
 * rule that only `drafts.ts` reads the draft. DB-backed: skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, withTransaction } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { getDraft, saveDraft, deleteDraft, lockDraft, DraftConflictError } from "../src/engine/drafts.js";
import {
  createSavePoint,
  listSavePoints,
  restoreSavePoint,
  deleteSavePoint,
  MAX_SAVE_POINTS,
  MAX_SAVE_POINT_NAME_LENGTH,
} from "../src/engine/draft-save-points.js";
import { RequestShapeError } from "../src/errors.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();

let n = 0;
const pid = () => `proc_sp_${++n}` as ProcessId;

const body = (label: string): ProcessBody =>
  ({
    key: "sp_wf",
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
  if (DB) await sql`TRUNCATE drafts, draft_save_points, definitions, process_access_roles`;
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

async function seedDraft(processId: ProcessId, label = "v1", layout: Record<string, unknown> = {}) {
  return saveDraft(processId, { body: body(label), layout, revision: 0, updatedBy: "user_a" }, sql);
}

async function countPoints(processId: ProcessId): Promise<number> {
  const rows = (await sql`SELECT count(*)::integer AS n FROM draft_save_points WHERE process_id = ${processId}`) as { n: number }[];
  return rows[0]!.n;
}

/** Inserts `count` points straight into the table, bypassing the module under test. */
async function seedPoints(processId: ProcessId, count: number): Promise<void> {
  await sql`
    INSERT INTO draft_save_points (save_point_id, process_id, name, body, layout, revision, created_by)
    SELECT 'spt_seed_' || ${processId} || '_' || g, ${processId}, 'seed ' || g, '{}'::jsonb, '{}'::jsonb, 0, 'user_seed'
    FROM generate_series(1, ${count}::integer) AS g
  `;
}

// ============================================================
// create
// ============================================================

test.skipIf(!DB)("a save point copies the persisted draft and moves nothing on it", async () => {
  const processId = pid();
  const draft = await seedDraft(processId, "v1", { step_a: { x: 1, y: 2 } });

  const point = await createSavePoint(processId, { name: "  Before the rewrite  ", revision: 0, createdBy: "user_b" }, sql);
  expect(point).toMatchObject({ processId, name: "Before the rewrite", revision: 0, createdBy: "user_b" });
  expect(point!.savePointId).toMatch(/^spt_[0-9a-f-]{36}$/);

  const rows = (await sql`SELECT body, layout, revision FROM draft_save_points WHERE save_point_id = ${point!.savePointId}`) as {
    body: unknown;
    layout: unknown;
    revision: number;
  }[];
  expect(rows[0]!.body).toEqual(draft.body as never);
  expect(rows[0]!.layout).toEqual({ step_a: { x: 1, y: 2 } });
  expect(rows[0]!.revision).toBe(0);

  const after = await getDraft(processId, sql);
  expect(after).toEqual(draft);
});

test.skipIf(!DB)("a save point on a process with no draft answers undefined and stores nothing", async () => {
  const processId = pid();
  expect(await createSavePoint(processId, { name: "x", revision: 0, createdBy: "u" }, sql)).toBeUndefined();
  expect(await countPoints(processId)).toBe(0);
});

test.skipIf(!DB)("a stale revision creates nothing and raises the draft conflict error", async () => {
  const processId = pid();
  await seedDraft(processId);
  await saveDraft(processId, { body: body("v2"), layout: {}, revision: 0, updatedBy: "user_a" }, sql);
  await expectRejects(createSavePoint(processId, { name: "x", revision: 0, createdBy: "u" }, sql), DraftConflictError);
  expect(await countPoints(processId)).toBe(0);
});

test.skipIf(!DB)("two save points may share a name", async () => {
  const processId = pid();
  await seedDraft(processId);
  await createSavePoint(processId, { name: "same", revision: 0, createdBy: "u" }, sql);
  await createSavePoint(processId, { name: "same", revision: 0, createdBy: "u" }, sql);
  expect(await countPoints(processId)).toBe(2);
});

test.skipIf(!DB)("the engine refuses an empty name, whitespace included, and a name past 200 characters", async () => {
  const processId = pid();
  await seedDraft(processId);
  for (const name of ["", "   \n\t"]) {
    await expectRejects(createSavePoint(processId, { name, revision: 0, createdBy: "u" }, sql), RequestShapeError);
  }
  await expectRejects(
    createSavePoint(processId, { name: "x".repeat(MAX_SAVE_POINT_NAME_LENGTH + 1), revision: 0, createdBy: "u" }, sql),
    RequestShapeError,
  );
  await createSavePoint(processId, { name: "x".repeat(MAX_SAVE_POINT_NAME_LENGTH), revision: 0, createdBy: "u" }, sql);
  expect(await countPoints(processId)).toBe(1);
});

test.skipIf(!DB)("a save point refuses a revision that is not a non-negative integer", async () => {
  const processId = pid();
  await seedDraft(processId);
  for (const revision of [-1, 1.5, "0" as unknown as number]) {
    await expectRejects(createSavePoint(processId, { name: "x", revision, createdBy: "u" }, sql), RequestShapeError);
  }
});

test.skipIf(!DB)("the fifty-first save point is refused and the draft still holds 50", async () => {
  const processId = pid();
  await seedDraft(processId);
  await seedPoints(processId, MAX_SAVE_POINTS);
  await expectRejects(createSavePoint(processId, { name: "one more", revision: 0, createdBy: "u" }, sql), RequestShapeError);
  expect(await countPoints(processId)).toBe(MAX_SAVE_POINTS);
});

test.skipIf(!DB)("the fiftieth save point is accepted", async () => {
  const processId = pid();
  await seedDraft(processId);
  await seedPoints(processId, MAX_SAVE_POINTS - 1);
  await createSavePoint(processId, { name: "last", revision: 0, createdBy: "u" }, sql);
  expect(await countPoints(processId)).toBe(MAX_SAVE_POINTS);
});

// ============================================================
// list
// ============================================================

test.skipIf(!DB)("the list names id, name, revision, actor and time, newest first, with no body or layout", async () => {
  const processId = pid();
  await seedDraft(processId);
  const first = await createSavePoint(processId, { name: "first", revision: 0, createdBy: "user_a" }, sql);
  await Bun.sleep(5);
  const second = await createSavePoint(processId, { name: "second", revision: 0, createdBy: "user_b" }, sql);
  const other = pid();
  await seedDraft(other);
  await createSavePoint(other, { name: "other process", revision: 0, createdBy: "u" }, sql);

  const items = await listSavePoints(processId, sql);
  expect(items.map((i) => i.name)).toEqual(["second", "first"]);
  expect(items[0]).toEqual(second!);
  expect(items[1]).toEqual(first!);
  for (const item of items) {
    expect(Object.keys(item).sort()).toEqual(["createdAt", "createdBy", "name", "processId", "revision", "savePointId"]);
  }
});

test.skipIf(!DB)("the list of a process with no draft is empty", async () => {
  expect(await listSavePoints(pid(), sql)).toEqual([]);
});

// ============================================================
// restore
// ============================================================

test.skipIf(!DB)("a restore puts the old state back at the next revision and keeps the current state as a new point", async () => {
  const processId = pid();
  await seedDraft(processId, "old", { step_a: { x: 1, y: 1 } });
  const point = await createSavePoint(processId, { name: "old state", revision: 0, createdBy: "user_a" }, sql);
  await saveDraft(processId, { body: body("new"), layout: { step_a: { x: 9, y: 9 } }, revision: 0, updatedBy: "user_a" }, sql);
  const current = await getDraft(processId, sql);
  expect(current!.revision).toBe(1);

  const restored = await restoreSavePoint(
    processId,
    point!.savePointId,
    { revision: 1, keepName: "Before restoring", restoredBy: "user_c" },
    sql,
  );
  expect(restored!.revision).toBe(2);
  expect(restored!.updatedBy).toBe("user_c");
  expect((restored!.body as { label: { en: string } }).label.en).toBe("old");
  expect(restored!.layout).toEqual({ step_a: { x: 1, y: 1 } });
  expect(await getDraft(processId, sql)).toEqual(restored!);

  const items = await listSavePoints(processId, sql);
  expect(items.map((i) => i.name).sort()).toEqual(["Before restoring", "old state"]);
  const kept = items.find((i) => i.name === "Before restoring")!;
  expect(kept.revision).toBe(1);
  expect(kept.createdBy).toBe("user_c");
  const rows = (await sql`SELECT body, layout FROM draft_save_points WHERE save_point_id = ${kept.savePointId}`) as {
    body: unknown;
    layout: unknown;
  }[];
  expect(rows[0]!.body).toEqual(current!.body as never);
  expect(rows[0]!.layout).toEqual({ step_a: { x: 9, y: 9 } });
});

test.skipIf(!DB)("a restore leaves base_version alone", async () => {
  const processId = pid();
  const published = await publishBody(processId, body("v1"), reg, dataSourceReg, sql);
  await saveDraft(processId, { body: body("v1"), layout: {}, revision: 0, updatedBy: "u", baseVersion: published.version }, sql);
  const point = await createSavePoint(processId, { name: "p", revision: 0, createdBy: "u" }, sql);
  const restored = await restoreSavePoint(processId, point!.savePointId, { revision: 0, keepName: "k", restoredBy: "u" }, sql);
  expect(restored!.baseVersion).toBe(published.version);
});

test.skipIf(!DB)("a restore answers undefined for no draft and for no such point, and changes nothing", async () => {
  const processId = pid();
  expect(await restoreSavePoint(processId, "spt_missing", { revision: 0, keepName: "k", restoredBy: "u" }, sql)).toBeUndefined();
  await seedDraft(processId);
  const before = await getDraft(processId, sql);
  expect(await restoreSavePoint(processId, "spt_missing", { revision: 0, keepName: "k", restoredBy: "u" }, sql)).toBeUndefined();
  expect(await getDraft(processId, sql)).toEqual(before);
  expect(await countPoints(processId)).toBe(0);
});

test.skipIf(!DB)("a point under another process id reads as absent for restore and delete", async () => {
  const mine = pid();
  const theirs = pid();
  await seedDraft(mine, "mine");
  await seedDraft(theirs, "theirs");
  const point = await createSavePoint(theirs, { name: "theirs", revision: 0, createdBy: "u" }, sql);
  const mineBefore = await getDraft(mine, sql);
  const theirsBefore = await getDraft(theirs, sql);

  expect(await restoreSavePoint(mine, point!.savePointId, { revision: 0, keepName: "k", restoredBy: "u" }, sql)).toBeUndefined();
  expect(await deleteSavePoint(mine, point!.savePointId, sql)).toBe(false);
  expect(await getDraft(mine, sql)).toEqual(mineBefore);
  expect(await getDraft(theirs, sql)).toEqual(theirsBefore);
  expect(await countPoints(theirs)).toBe(1);
  expect(await countPoints(mine)).toBe(0);
});

test.skipIf(!DB)("a stale restore changes neither the draft nor the points", async () => {
  const processId = pid();
  await seedDraft(processId);
  const point = await createSavePoint(processId, { name: "p", revision: 0, createdBy: "u" }, sql);
  await saveDraft(processId, { body: body("v2"), layout: {}, revision: 0, updatedBy: "u" }, sql);
  const before = await getDraft(processId, sql);
  await expectRejects(
    restoreSavePoint(processId, point!.savePointId, { revision: 0, keepName: "k", restoredBy: "u" }, sql),
    DraftConflictError,
  );
  expect(await getDraft(processId, sql)).toEqual(before);
  expect(await countPoints(processId)).toBe(1);
});

test.skipIf(!DB)("a restore at the bound changes neither the draft nor the points", async () => {
  const processId = pid();
  await seedDraft(processId);
  const point = await createSavePoint(processId, { name: "p", revision: 0, createdBy: "u" }, sql);
  await seedPoints(processId, MAX_SAVE_POINTS - 1);
  const before = await getDraft(processId, sql);
  await expectRejects(
    restoreSavePoint(processId, point!.savePointId, { revision: 0, keepName: "k", restoredBy: "u" }, sql),
    RequestShapeError,
  );
  expect(await getDraft(processId, sql)).toEqual(before);
  expect(await countPoints(processId)).toBe(MAX_SAVE_POINTS);
});

test.skipIf(!DB)("a restore refuses an empty kept name before it touches anything", async () => {
  const processId = pid();
  await seedDraft(processId);
  const point = await createSavePoint(processId, { name: "p", revision: 0, createdBy: "u" }, sql);
  await expectRejects(
    restoreSavePoint(processId, point!.savePointId, { revision: 0, keepName: "  ", restoredBy: "u" }, sql),
    RequestShapeError,
  );
  expect((await getDraft(processId, sql))!.revision).toBe(0);
  expect(await countPoints(processId)).toBe(1);
});

// ============================================================
// delete
// ============================================================

test.skipIf(!DB)("deleting a save point reports whether a row went", async () => {
  const processId = pid();
  await seedDraft(processId);
  const point = await createSavePoint(processId, { name: "p", revision: 0, createdBy: "u" }, sql);
  expect(await deleteSavePoint(processId, point!.savePointId, sql)).toBe(true);
  expect(await deleteSavePoint(processId, point!.savePointId, sql)).toBe(false);
  expect(await countPoints(processId)).toBe(0);
});

test.skipIf(!DB)("discarding a draft removes its two save points and leaves another process's point", async () => {
  const processId = pid();
  const other = pid();
  await seedDraft(processId);
  await seedDraft(other);
  await createSavePoint(processId, { name: "a", revision: 0, createdBy: "u" }, sql);
  await createSavePoint(processId, { name: "b", revision: 0, createdBy: "u" }, sql);
  await createSavePoint(other, { name: "kept", revision: 0, createdBy: "u" }, sql);

  expect(await deleteDraft(processId, sql)).toBe(true);
  expect(await countPoints(processId)).toBe(0);
  expect(await countPoints(other)).toBe(1);
  expect(await getDraft(other, sql)).toBeDefined();
});

test.skipIf(!DB)("discarding a draft is atomic: a failure after the draft delete rolls the draft back", async () => {
  const processId = pid();
  await seedDraft(processId);
  await createSavePoint(processId, { name: "a", revision: 0, createdBy: "u" }, sql);
  let err: unknown;
  try {
    await withTransaction(sql, async (tx) => {
      await deleteDraft(processId, tx);
      throw new Error("abort");
    });
  } catch (e) {
    err = e;
  }
  expect((err as Error).message).toBe("abort");
  expect(await getDraft(processId, sql)).toBeDefined();
  expect(await countPoints(processId)).toBe(1);
});

// ============================================================
// publish
// ============================================================

test.skipIf(!DB)("a draft holding save points publishes the same hash as one holding none, and keeps its points", async () => {
  const withPoints = pid();
  const without = pid();
  await seedDraft(withPoints);
  await seedDraft(without);
  await createSavePoint(withPoints, { name: "a", revision: 0, createdBy: "u" }, sql);
  await createSavePoint(withPoints, { name: "b", revision: 0, createdBy: "u" }, sql);

  const a = await publishBody(withPoints, (await getDraft(withPoints, sql))!.body as ProcessBody, reg, dataSourceReg, sql);
  const b = await publishBody(without, (await getDraft(without, sql))!.body as ProcessBody, reg, dataSourceReg, sql);
  expect(a.definitionHash).toBe(b.definitionHash);
  expect(await countPoints(withPoints)).toBe(2);
});

// ============================================================
// the row lock
// ============================================================

/**
 * A copy of `createSavePoint`'s transaction with a pause between the count and
 * the insert, so two runs interleave. `locked` picks the draft read: `lockDraft`
 * (`FOR UPDATE`) as the module does, or a plain `getDraft`.
 */
async function createPausing(processId: ProcessId, revision: number, locked: boolean): Promise<void> {
  await withTransaction(sql, async (tx) => {
    const draft = locked ? await lockDraft(processId, tx) : await getDraft(processId, tx);
    if (!draft || draft.revision !== revision) throw new DraftConflictError(processId);
    const rows = (await tx`SELECT count(*)::integer AS n FROM draft_save_points WHERE process_id = ${processId}`) as { n: number }[];
    if (rows[0]!.n >= MAX_SAVE_POINTS) throw new RequestShapeError("full");
    await Bun.sleep(100);
    await tx`
      INSERT INTO draft_save_points (save_point_id, process_id, name, body, layout, revision, created_by)
      VALUES (${`spt_${crypto.randomUUID()}`}, ${processId}, 'racer', ${draft.body}, ${draft.layout}, ${draft.revision}, 'u')
    `;
  });
}

test.skipIf(!DB)("two concurrent creates at 49 points leave 50, one of them refused", async () => {
  const processId = pid();
  await seedDraft(processId);
  await seedPoints(processId, MAX_SAVE_POINTS - 1);
  const results = await Promise.allSettled([
    createSavePoint(processId, { name: "a", revision: 0, createdBy: "u" }, sql),
    createSavePoint(processId, { name: "b", revision: 0, createdBy: "u" }, sql),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  expect(refused.reason).toBeInstanceOf(RequestShapeError);
  expect(await countPoints(processId)).toBe(MAX_SAVE_POINTS);
});

test.skipIf(!DB)("the paused copy of create holds the bound with the row lock, and breaks it without", async () => {
  const locked = pid();
  await seedDraft(locked);
  await seedPoints(locked, MAX_SAVE_POINTS - 1);
  await Promise.allSettled([createPausing(locked, 0, true), createPausing(locked, 0, true)]);
  expect(await countPoints(locked)).toBe(MAX_SAVE_POINTS);

  const unlocked = pid();
  await seedDraft(unlocked);
  await seedPoints(unlocked, MAX_SAVE_POINTS - 1);
  await Promise.allSettled([createPausing(unlocked, 0, false), createPausing(unlocked, 0, false)]);
  expect(await countPoints(unlocked)).toBe(MAX_SAVE_POINTS + 1);
});

// ============================================================
// only drafts.ts reads the draft
// ============================================================

/** Strips comments, so a mention in prose is not a read. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const TOUCHES_DRAFTS_TABLE = /\b(FROM|UPDATE|INTO|JOIN)\s+drafts\b/i;

test("the save point module never names the drafts table", async () => {
  const src = code(await Bun.file("src/engine/draft-save-points.ts").text());
  expect(src).not.toMatch(TOUCHES_DRAFTS_TABLE);
  expect(src).toContain("lockDraft(");
  expect(src).toContain("writeRestoredDraft(");
});

test("the table pin fails on a module that reads the drafts table", () => {
  expect(code("await tx`SELECT body FROM drafts WHERE process_id = ${p}`")).toMatch(TOUCHES_DRAFTS_TABLE);
  expect(code("await tx`UPDATE drafts SET body = ${b}`")).toMatch(TOUCHES_DRAFTS_TABLE);
});
