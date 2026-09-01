/**
 * instance-visibility-set: the principal set, its revocation relation, and the
 * `scope=visible` read that joins them. DB-backed — skips when DATABASE_URL is
 * unset.
 *
 * The plan guards at the end are unusual for this repo and deliberate. The
 * read's design rests on one measured property: it touches rows in proportion
 * to the page size, never to the size of the reader's match set (design.md,
 * "The read is a UNION ALL per principal"). Two rejected forms return the same
 * rows while reading the whole match set. A row-level test cannot tell those
 * apart, so these two measure what the planner actually read.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, appendInstancePrincipals, withTransaction } from "../src/engine/store.js";
import { listInstances, buildVisibleRowSet } from "../src/runtime/api.js";

const DB = !!process.env.DATABASE_URL;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (!DB) return;
  await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
  await sql`TRUNCATE instance_principals, instance_principals_denied`;
});

/** An instance row written directly: these tests exercise the read, not the engine's write path. */
async function seedInstance(id: string, opts: { kind?: string; candidates?: string[]; claimedBy?: string } = {}) {
  const assignment =
    opts.candidates || opts.claimedBy
      ? { candidates: opts.candidates ?? [], ...(opts.claimedBy ? { claimedBy: opts.claimedBy } : {}) }
      : null;
  await sql`INSERT INTO instances (instance_id, transition_seq, body, kind) VALUES (
    ${id}, 0,
    ${{
      instanceId: id,
      processId: "proc_vis",
      version: 1,
      definitionHash: "h",
      currentStepId: "step_a",
      transitionSeq: 0,
      data: {},
      status: "running",
      startedAt: "2026-01-01T00:00:00.000Z",
      assignment,
    }},
    ${opts.kind ?? "published"})`;
}

const visible = (actorId: string, principals: string[]) => ({ actorId, principals });

// includeDegraded, because these fixtures write instance rows without
// publishing a definition: without it every row resolves to undefined and
// listInstances drops it, which would hide the read under test.
async function idsOf(visibleTo: { actorId: string; principals: string[] }, limit = 50, cursor?: string) {
  const page = await listInstances({ visibleTo, includeDegraded: true }, { limit, cursor }, sql);
  return { ids: page.items.map((i) => i.instanceId as string), cursor: page.cursor };
}

test.skipIf(!DB)("a principal match returns the instance, an unrelated actor sees nothing", async () => {
  await seedInstance("inst_p1");
  await withTransaction(sql, (tx) => appendInstancePrincipals(tx, "inst_p1", ["group_hr"]));

  expect((await idsOf(visible("user_anna", ["user_anna", "group_hr"]))).ids).toEqual(["inst_p1"]);
  expect((await idsOf(visible("user_nobody", ["user_nobody"]))).ids).toEqual([]);
});

test.skipIf(!DB)("a revocation names the person, not the principal they matched by", async () => {
  await seedInstance("inst_p2");
  await withTransaction(sql, (tx) => appendInstancePrincipals(tx, "inst_p2", ["group_hr"]));
  await sql`INSERT INTO instance_principals_denied (instance_id, actor_id) VALUES ('inst_p2', 'user_anna')`;

  expect((await idsOf(visible("user_anna", ["user_anna", "group_hr"]))).ids).toEqual([]);
  // Every other holder of that same principal keeps it.
  expect((await idsOf(visible("user_carl", ["user_carl", "group_hr"]))).ids).toEqual(["inst_p2"]);
});

test.skipIf(!DB)("a live assignment outranks a revocation, and ends with it", async () => {
  // Revoked, and currently an eligible candidate through her group.
  await seedInstance("inst_p3", { candidates: ["group_hr"] });
  await withTransaction(sql, (tx) => appendInstancePrincipals(tx, "inst_p3", ["group_hr"]));
  await sql`INSERT INTO instance_principals_denied (instance_id, actor_id) VALUES ('inst_p3', 'user_anna')`;

  expect((await idsOf(visible("user_anna", ["user_anna", "group_hr"]))).ids).toEqual(["inst_p3"]);

  // The instance moves to a step that does not assign her: the override ends.
  await sql`UPDATE instances SET body = jsonb_set(body, '{assignment}', 'null') WHERE instance_id = 'inst_p3'`;
  expect((await idsOf(visible("user_anna", ["user_anna", "group_hr"]))).ids).toEqual([]);

  // The revocation was never deleted by any of that.
  const rows = (await sql`SELECT count(*) AS n FROM instance_principals_denied
    WHERE instance_id = 'inst_p3' AND actor_id = 'user_anna'`) as { n: string }[];
  expect(Number(rows[0]!.n)).toBe(1);
});

test.skipIf(!DB)("a filter that excludes branch rows does not truncate the page", async () => {
  // The regression this read was rewritten for: a per-branch LIMIT whose rows
  // are filtered afterwards under-fills the page, and keysetPage reads
  // hasMore off the row count, so the walk stops while instances remain.
  for (let k = 0; k < 12; k++) {
    await seedInstance(`inst_f${k}`, { kind: k < 6 ? "test" : "published" });
    await withTransaction(sql, (tx) => appendInstancePrincipals(tx, `inst_f${k}`, ["group_hr"]));
  }
  const anna = visible("user_anna", ["user_anna", "group_hr"]);

  const first = await idsOf(anna, 5);
  expect(first.ids).toHaveLength(5);
  expect(first.cursor).toBeDefined();

  // The whole walk reaches all six published instances and stops only there.
  const seen = new Set<string>();
  let cursor: string | undefined = undefined;
  for (let guard = 0; guard < 20; guard++) {
    const page = await idsOf(anna, 2, cursor);
    page.ids.forEach((id) => seen.add(id));
    cursor = page.cursor;
    if (!cursor) break;
  }
  expect(seen.size).toBe(6);
});

test.skipIf(!DB)("an absent visibleTo leaves the existing read untouched", async () => {
  await seedInstance("inst_u1");
  const page = await listInstances({ includeDegraded: true }, { limit: 50 }, sql);
  expect(page.items.map((i) => i.instanceId as string)).toEqual(["inst_u1"]);
});

// ============================================================
// Plan guards (design.md, "The read is a UNION ALL per principal")
// ============================================================

const BULK = 20_000;

/** `BULK` instances, every one carrying `group_hr`, exactly one also `user_rare`. */
async function seedBulk() {
  await sql`INSERT INTO instances (instance_id, transition_seq, body, kind, created_at)
    SELECT 'inst_m' || g, 0,
      jsonb_build_object(
        'instanceId', 'inst_m' || g, 'processId', 'proc_vis', 'version', 1, 'definitionHash', 'h',
        'currentStepId', 'step_a', 'transitionSeq', 0, 'data', '{}'::jsonb, 'status', 'running',
        'startedAt', '2026-01-01T00:00:00.000Z', 'assignment', NULL),
      'published', now() - (g || ' seconds')::interval
    FROM generate_series(1, ${BULK}) g`;
  await sql`INSERT INTO instance_principals (instance_id, principal, created_at)
    SELECT i.instance_id, 'group_hr', i.created_at FROM instances i`;
  await sql`INSERT INTO instance_principals (instance_id, principal, created_at)
    SELECT i.instance_id, 'user_rare', i.created_at FROM instances i WHERE i.instance_id = 'inst_m1'`;
  await sql`ANALYZE instances`;
  await sql`ANALYZE instance_principals`;
  await sql`ANALYZE instance_principals_denied`;
}

type PlanNode = { "Node Type": string; "Relation Name"?: string; "Actual Rows"?: number; Plans?: PlanNode[] };

/** Every node of one `EXPLAIN (ANALYZE)` plan, flattened. */
async function explainVisibleRowSet(actorId: string, principals: string[]): Promise<PlanNode[]> {
  const fragment = buildVisibleRowSet({}, { actorId, principals }, 21, undefined, undefined, sql);
  const rows = (await sql`EXPLAIN (ANALYZE, FORMAT JSON) ${fragment}`) as unknown as Record<string, unknown>[];
  const root = (Object.values(rows[0]!)[0] as { Plan: PlanNode }[])[0]!.Plan;
  const out: PlanNode[] = [];
  const walk = (n: PlanNode) => {
    out.push(n);
    (n.Plans ?? []).forEach(walk);
  };
  walk(root);
  return out;
}

const principalNodes = (nodes: PlanNode[]) => nodes.filter((n) => n["Relation Name"] === "instance_principals");
const rowsRead = (nodes: PlanNode[]) => principalNodes(nodes).reduce((sum, n) => sum + (n["Actual Rows"] ?? 0), 0);

test.skipIf(!DB)(
  "a reader holding a widespread role pages in proportion to the page, not the match set",
  async () => {
    await seedBulk();
    const nodes = await explainVisibleRowSet("user_anna", ["user_anna", "group_hr"]);

    // `group_hr` matches all BULK rows. The rejected form (`principal = ANY(...)`
    // with a DISTINCT) reads every one and sorts them, spilling to disk once the
    // set is large enough — measured at 31.7 ms over 601k rows. The chosen form
    // stops each branch at the page bound, so the count stays near 21 whatever
    // BULK is.
    expect(principalNodes(nodes).length).toBeGreaterThan(0);
    expect(rowsRead(nodes)).toBeLessThan(200);
    expect(nodes.some((n) => /external/i.test(String(n["Node Type"])))).toBe(false);
  },
);

test.skipIf(!DB)("a narrow reader pages without a sequential scan over the principal set", async () => {
  await seedBulk();
  const nodes = await explainVisibleRowSet("user_rare", ["user_rare"]);

  // The rejected form (one predicate over `instances` with an OR) scans the
  // principal relation and walks the instance table — measured at 59-61 ms
  // whatever the reader's breadth. Every read of the principal set here goes
  // through the paging index.
  expect(principalNodes(nodes).length).toBeGreaterThan(0);
  expect(principalNodes(nodes).every((n) => n["Node Type"] !== "Seq Scan")).toBe(true);
  expect(rowsRead(nodes)).toBeLessThan(200);
});
