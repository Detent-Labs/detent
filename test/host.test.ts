/**
 * host.ts's DATA_RETENTION_DAYS gate: unset skips the sweep silently (the
 * pre-existing default), a positive integer enables it, anything else fails
 * startup outright. No DB is touched here — parseRetentionDays does no I/O,
 * and startEngine's own DB-touching calls (createDefinitionStore,
 * registerSubprocessHandlers) build closures only, never querying until
 * invoked, so the invalid-value case throws before any of that runs.
 *
 * The last test is DB-backed: it starts the engine on the real database and
 * asserts the outbox worker hands its assignment registry to a handler.
 */
import { test, expect, afterEach } from "bun:test";
import { parseRetentionDays, startEngine } from "../src/engine/host.js";
import { createRegistry, createAssignmentRegistry, type AssignmentRegistry } from "../src/engine/registry.js";
import { sql, initSchema } from "../src/engine/store.js";

const DB = !!process.env.DATABASE_URL;
const ORIGINAL = process.env.DATA_RETENTION_DAYS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DATA_RETENTION_DAYS;
  else process.env.DATA_RETENTION_DAYS = ORIGINAL;
});

test("parseRetentionDays returns undefined when unset", () => {
  delete process.env.DATA_RETENTION_DAYS;
  expect(parseRetentionDays()).toBeUndefined();
});

test("parseRetentionDays accepts a positive integer", () => {
  process.env.DATA_RETENTION_DAYS = "30";
  expect(parseRetentionDays()).toBe(30);
});

test.each(["0", "-5", "abc", "1.5"])("parseRetentionDays throws for '%s'", (value) => {
  process.env.DATA_RETENTION_DAYS = value;
  expect(() => parseRetentionDays()).toThrow();
});

test("startEngine throws at startup for an invalid DATA_RETENTION_DAYS, before any worker starts", () => {
  process.env.DATA_RETENTION_DAYS = "not-a-number";
  expect(() => startEngine(undefined, createRegistry())).toThrow();
});

// The worker is the production path to a handler's context. A direct
// drainOutbox call cannot tell whether startEngine forwards its registry.
test.skipIf(!DB)("the outbox worker hands startEngine's assignment registry to the handler context", async () => {
  delete process.env.DATA_RETENTION_DAYS;
  await initSchema();
  await sql`TRUNCATE outbox`; // the worker drains the whole table; keep only this test's row

  const sentinel = createAssignmentRegistry();
  sentinel.set("test.sentinel", { resolve: async () => [] });

  let seen: AssignmentRegistry | undefined;
  const registry = createRegistry();
  registry.set("test.probe", {
    handler: async (ctx) => {
      seen = ctx.assignmentRegistry;
      return {};
    },
  });

  const action = { id: "action_probe", type: "test.probe", config: {} };
  await sql`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
    VALUES (${"idem_host_probe"}, ${"inst_host_probe"}, ${1}, ${action.id}, ${action})`;

  const engine = startEngine(sql, registry, sentinel);
  try {
    // pollForever schedules its first tick at 500ms, so wait past it.
    const deadline = Date.now() + 5000;
    while (seen === undefined && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  } finally {
    engine.stop();
  }

  expect(seen).toBe(sentinel);
});
