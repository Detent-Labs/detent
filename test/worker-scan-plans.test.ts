/**
 * Plan guards for the polling workers' scans (bound-worker-scan-costs). Each
 * test seeds enough rows for a real choice of access path, runs ANALYZE, and
 * asserts the index NAME in the plan and the absence of filtered-out rows,
 * never a timing. A table of one page reads sequentially whatever index exists.
 * DB-backed; skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { claimSelect, CLAIM_LEASE_MS } from "../src/engine/resolution.js";

const DB = !!process.env.DATABASE_URL;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (!DB) return;
  await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
});

type PlanNode = {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Actual Rows"?: number;
  "Rows Removed by Filter"?: number;
  Plans?: PlanNode[];
};

/** Every node of one `EXPLAIN (ANALYZE)` plan over a SQL fragment, flattened. */
async function planNodes(statement: unknown): Promise<PlanNode[]> {
  const rows = (await sql`EXPLAIN (ANALYZE, FORMAT JSON) ${statement}`) as unknown as Record<string, unknown>[];
  const root = (Object.values(rows[0]!)[0] as { Plan: PlanNode }[])[0]!.Plan;
  const out: PlanNode[] = [];
  const walk = (n: PlanNode) => {
    out.push(n);
    (n.Plans ?? []).forEach(walk);
  };
  walk(root);
  return out;
}

const removedByFilter = (nodes: PlanNode[]) => nodes.reduce((sum, n) => sum + (n["Rows Removed by Filter"] ?? 0), 0);

/** One instance row written directly: these tests exercise the scan, not the engine's write path. */
const instanceRow = (status: string) => ({
  processId: "proc_scan",
  version: 1,
  definitionHash: "h",
  currentStepId: "step_a",
  transitionSeq: 0,
  data: {},
  status,
  startedAt: "2026-01-01T00:00:00.000Z",
});

const resolveStateOf = async (id: string): Promise<string> =>
  ((await sql`SELECT resolve_state FROM instances WHERE instance_id = ${id}`) as { resolve_state: string }[])[0]!.resolve_state;

// ============================================================
// Resolution claim (automatic-transitions, "A finished instance has no
// re-resolution mark")
// ============================================================

const FINISHED = 20_000;
const LIVE = 2_000;

/**
 * `FINISHED` completed instances with no mark, beside `LIVE` running ones carrying
 * one. `LIVE` is large, and the ids are zero-padded so the heap follows the key,
 * because the planner then reads the index in `instance_id` order. With a handful
 * of marks it picks a bitmap scan and sorts them: cheap, but it proves less.
 */
async function seedClaimBulk() {
  await sql`INSERT INTO instances (instance_id, transition_seq, body, resolve_state)
    SELECT 'inst_f' || lpad(g::text, 6, '0'), 0,
      jsonb_build_object('instanceId', 'inst_f' || lpad(g::text, 6, '0')) || ((${[instanceRow("completed")]}::jsonb) -> 0),
      'idle'
    FROM generate_series(1, ${FINISHED}) g`;
  await sql`INSERT INTO instances (instance_id, transition_seq, body, resolve_state)
    SELECT 'inst_l' || lpad(g::text, 6, '0'), 0,
      jsonb_build_object('instanceId', 'inst_l' || lpad(g::text, 6, '0')) || ((${[instanceRow("running")]}::jsonb) -> 0),
      'pending'
    FROM generate_series(1, ${LIVE}) g`;
  await sql`ANALYZE instances`;
}

test.skipIf(!DB)("the resolution claim reads the marked rows through the partial index and filters none", async () => {
  await seedClaimBulk();
  const nodes = await planNodes(claimSelect(sql, CLAIM_LEASE_MS));

  // The rejected form read `body->>'status'` over `instances_resolve_idx
  // (resolve_state)` and filtered out every finished row: measured at 1119.6 ms
  // and 290,000 rows removed over 300,000 instances. The partial index holds
  // the marked rows only, so the scan reads what is live.
  expect(nodes.some((n) => n["Index Name"] === "instances_resolve_open_idx")).toBe(true);
  expect(nodes.some((n) => n["Node Type"] === "Seq Scan")).toBe(false);
  expect(nodes.some((n) => n["Node Type"] === "Sort")).toBe(false);
  expect(removedByFilter(nodes)).toBe(0);
});

test.skipIf(!DB)("initSchema clears the mark of an instance that is not running and keeps a running one's", async () => {
  await sql`INSERT INTO instances (instance_id, transition_seq, body, resolve_state) VALUES
    ('inst_done', 0, ${{ instanceId: "inst_done", ...instanceRow("completed") }}, 'pending'),
    ('inst_gone', 0, ${{ instanceId: "inst_gone", ...instanceRow("cancelled") }}, 'claimed'),
    ('inst_live', 0, ${{ instanceId: "inst_live", ...instanceRow("running") }}, 'pending')`;

  await initSchema();

  expect(await resolveStateOf("inst_done")).toBe("idle");
  expect(await resolveStateOf("inst_gone")).toBe("idle");
  expect(await resolveStateOf("inst_live")).toBe("pending");
});

test.skipIf(!DB)("initSchema leaves the partial index and no longer builds the full-column one", async () => {
  await initSchema();
  const names = ((await sql`SELECT indexname FROM pg_indexes WHERE tablename = 'instances'`) as { indexname: string }[]).map((r) => r.indexname);
  expect(names).toContain("instances_resolve_open_idx");
  expect(names).not.toContain("instances_resolve_idx");
});
