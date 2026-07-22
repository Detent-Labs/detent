/**
 * Cross-process publish validation: a subprocess step must reference a
 * resolvable, contracted child and map only into that child's declared inputs.
 * DB-backed; skips when DATABASE_URL is unset. The reference-resolvability cases
 * enforce child-first publish ordering.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody, CrossProcessValidationError, CelValidationError } from "../src/engine/definitions.js";
import { createRegistry } from "../src/engine/registry.js";
import { compileProcessBody } from "../src/schema/compile.js";
import { contractHash } from "../src/schema/hash.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
// Fixture bodies in this file declare no actions, so an empty registry is
// sufficient for every publishBody call here.
const reg = createRegistry();
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

// Same contracted child, plus a field its contract does NOT declare as output —
// used to prove an outputMapping/guard reaching past contract.outputFields is
// rejected at publish, not silently accepted as `child.data: dyn` would allow.
const childBodyWithInternalField = (): ProcessBody =>
  ({
    key: "child", label: "Child",
    contract: { inputFields: ["field_c_amount"], outputFields: ["field_c_amount"], outcomes: ["approved"] },
    fields: [
      { id: "field_c_amount", key: "amount", label: "Amount", type: "number" },
      { id: "field_c_internal", key: "internal", label: "Internal", type: "string" },
    ],
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
  const c = await publishBody(CHILD, childBody(), reg);
  await expectCrossProcessReject(publishBody(PARENT, parentBody("parent", pinned(c.version, "field_c_bogus")), reg));
  expect(await parentCount(PARENT)).toBe(0);
});

// --- reference must resolve to a contracted child (child-first) ---------------

test.skipIf(!DB)("a pinned reference to an unpublished child version is rejected", async () => {
  await expectCrossProcessReject(publishBody(PARENT, parentBody("parent", pinned(99, "field_c_amount")), reg));
  expect(await parentCount(PARENT)).toBe(0);
});

test.skipIf(!DB)("a latest-at-spawn contractRef matching no published child is rejected", async () => {
  await publishBody(CHILD, childBody(), reg);
  await expectCrossProcessReject(publishBody(PARENT, parentBody("parent", latest("sha256:nomatch", "field_c_amount")), reg));
});

test.skipIf(!DB)("a reference to a resolvable child that declares no contract is rejected", async () => {
  const nc = await publishBody(CHILD, noContractChildBody(), reg);
  await expectCrossProcessReject(publishBody(PARENT, parentBody("parent", pinned(nc.version, "field_c_amount")), reg));
});

// --- child-first round-trip: both bindings validate and publish ---------------

test.skipIf(!DB)("publishing the child first lets a pinned and a latest-at-spawn parent validate", async () => {
  const c = await publishBody(CHILD, childBody(), reg);

  const p1 = await publishBody(PARENT, parentBody("parent", pinned(c.version, "field_c_amount")), reg);
  expect(p1.version).toBe(1);

  // contractRef is the hash of the *compiled* child contract (what the store holds),
  // as spawn-time resolution computes it.
  const ref = contractHash(compileProcessBody(childBody()).contract!);
  const p2 = await publishBody(PARENT2, parentBody("parent2", latest(ref, "field_c_amount")), reg);
  expect(p2.version).toBe(1);
});

// --- outputMapping/guard child.data refs ⊆ child contract.outputFields --------

test.skipIf(!DB)("an outputMapping reference to a child field outside contract.outputFields is rejected; no version persisted", async () => {
  const c = await publishBody(CHILD, childBodyWithInternalField(), reg);
  const sub = { ...pinned(c.version, "field_c_amount"), outputMapping: { field_p_amount: cel("child.data.internal") } };
  let err: unknown;
  try {
    await publishBody(PARENT, parentBody("parent", sub), reg);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(CelValidationError);
  expect(await parentCount(PARENT)).toBe(0);
});

test.skipIf(!DB)("an outputMapping confined to the child's declared outputFields still publishes", async () => {
  const c = await publishBody(CHILD, childBodyWithInternalField(), reg);
  const sub = { ...pinned(c.version, "field_c_amount"), outputMapping: { field_p_amount: cel("child.data.amount") } };
  const p = await publishBody(PARENT, parentBody("parent", sub), reg);
  expect(p.version).toBe(1);
});

test.skipIf(!DB)("the shipped subprocess examples still publish under the tightened output-ref check", async () => {
  const child = JSON.parse(readFileSync(new URL("../examples/subprocess-credit-check-child.json", import.meta.url), "utf8"));
  const parent = JSON.parse(readFileSync(new URL("../examples/subprocess-loan-parent.json", import.meta.url), "utf8"));
  // The parent's subprocess step pins processId "proc_credit_check" — the child
  // must be published under exactly that id for the pinned binding to resolve.
  const c = await publishBody("proc_credit_check" as ProcessId, child, reg);
  expect(c.version).toBe(1);
  const p = await publishBody("proc_loan" as ProcessId, parent, reg);
  expect(p.version).toBe(1);
});
