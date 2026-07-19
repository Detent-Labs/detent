/**
 * Cross-process publish validation: a subprocess step must reference a
 * resolvable, contracted child and map only into that child's declared inputs.
 * DB-backed; skips when DATABASE_URL is unset. The reference-resolvability cases
 * enforce child-first publish ordering.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody, CrossProcessValidationError } from "../src/engine/definitions.js";
import { compileProcessBody } from "../src/schema/compile.js";
import { contractHash } from "../src/schema/hash.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const CHILD = "proc_cpv_child" as ProcessId;
const PARENT = "proc_cpv_parent" as ProcessId;
const PARENT2 = "proc_cpv_parent2" as ProcessId;
const cel = (src: string) => ({ lang: "cel", src });

// Contracted child: one input field, single manual step to a terminal outcome.
const childBody = (): ProcessBody =>
  ({
    key: "child", label: "Child",
    contract: { inputFields: ["field_c_amount"], outputFields: ["field_c_amount"], outcomes: ["approved"] },
    fields: [{ id: "field_c_amount", key: "amount", label: "Amount", type: "number" }],
    workflow: {
      initialStep: "step_c",
      steps: [
        { id: "step_c", key: "c", label: "C", type: "task", paths: [{ id: "path_c", key: "c", to: "step_done", trigger: "manual" }] },
        { id: "step_done", key: "done", label: "Done", type: "task", terminal: true, outcome: "approved" },
      ],
    },
  }) as unknown as ProcessBody;

// Same shape without a contract — publishable on its own, but not subprocess-callable.
const noContractChildBody = (): ProcessBody =>
  ({
    key: "nc", label: "NC",
    fields: [{ id: "field_c_amount", key: "amount", label: "Amount", type: "number" }],
    workflow: {
      initialStep: "step_c",
      steps: [
        { id: "step_c", key: "c", label: "C", type: "task", paths: [{ id: "path_c", key: "c", to: "step_done", trigger: "manual" }] },
        { id: "step_done", key: "done", label: "Done", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// Parent: entry (auto) -> subprocess wait-state guarding on child.outcome -> terminal.
// `sub` is the subprocess spec (binding + inputMapping) under test.
const parentBody = (parentKey: string, sub: Record<string, unknown>): ProcessBody =>
  ({
    key: parentKey, label: parentKey,
    fields: [{ id: "field_p_amount", key: "amount", label: "Amount", type: "number" }],
    workflow: {
      initialStep: "step_p_entry",
      steps: [
        { id: "step_p_entry", key: "p_entry", label: "Entry", type: "task", paths: [{ id: "path_p_sub", key: "p_sub", to: "step_p_sub", trigger: "automatic" }] },
        { id: "step_p_sub", key: "p_sub", label: "Sub", type: "subprocess",
          subprocess: sub,
          paths: [{ id: "path_p_done", key: "p_done", to: "step_p_done", trigger: "automatic", priority: 1, guard: cel('child.outcome == "approved"') }] },
        { id: "step_p_done", key: "p_done", label: "Done", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

const pinned = (childVersion: number, mapKey: string) => ({
  processId: CHILD, versionBinding: "pinned", pinnedVersion: childVersion,
  inputMapping: { [mapKey]: cel("data.amount") }, outputMapping: {},
});
const latest = (contractRef: string, mapKey: string) => ({
  processId: CHILD, versionBinding: "latest-at-spawn", contractRef,
  inputMapping: { [mapKey]: cel("data.amount") }, outputMapping: {},
});

const parentCount = async (pid: ProcessId) =>
  ((await sql`SELECT count(*)::int AS n FROM definitions WHERE process_id = ${pid}`) as { n: number }[])[0].n;

// A try/catch assertion, not `expect(...).rejects`: the async matcher wedges the
// Bun.sql pool under bun:test on this host, so await-then-assert is used instead.
async function expectCrossProcessReject(p: Promise<unknown>): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(CrossProcessValidationError);
}

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE definitions`;
});

// --- inputMapping ⊆ child inputFields -----------------------------------------

test.skipIf(!DB)("an inputMapping target outside the child's inputFields is rejected; no version persisted", async () => {
  const c = await publishBody(CHILD, childBody());
  await expectCrossProcessReject(publishBody(PARENT, parentBody("parent", pinned(c.version, "field_c_bogus"))));
  expect(await parentCount(PARENT)).toBe(0);
});

// --- reference must resolve to a contracted child (child-first) ---------------

test.skipIf(!DB)("a pinned reference to an unpublished child version is rejected", async () => {
  await expectCrossProcessReject(publishBody(PARENT, parentBody("parent", pinned(99, "field_c_amount"))));
  expect(await parentCount(PARENT)).toBe(0);
});

test.skipIf(!DB)("a latest-at-spawn contractRef matching no published child is rejected", async () => {
  await publishBody(CHILD, childBody());
  await expectCrossProcessReject(publishBody(PARENT, parentBody("parent", latest("sha256:nomatch", "field_c_amount"))));
});

test.skipIf(!DB)("a reference to a resolvable child that declares no contract is rejected", async () => {
  const nc = await publishBody(CHILD, noContractChildBody());
  await expectCrossProcessReject(publishBody(PARENT, parentBody("parent", pinned(nc.version, "field_c_amount"))));
});

// --- child-first round-trip: both bindings validate and publish ---------------

test.skipIf(!DB)("publishing the child first lets a pinned and a latest-at-spawn parent validate", async () => {
  const c = await publishBody(CHILD, childBody());

  const p1 = await publishBody(PARENT, parentBody("parent", pinned(c.version, "field_c_amount")));
  expect(p1.version).toBe(1);

  // contractRef is the hash of the *compiled* child contract (what the store holds),
  // as spawn-time resolution computes it.
  const ref = contractHash(compileProcessBody(childBody()).contract!);
  const p2 = await publishBody(PARENT2, parentBody("parent2", latest(ref, "field_c_amount")));
  expect(p2.version).toBe(1);
});
