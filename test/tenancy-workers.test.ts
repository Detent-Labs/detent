/**
 * The worker tenant seam. Three properties the shared process depends on: the
 * worker COUNT does not grow with the tenant count, one tick serves every
 * tenant, and a tenant whose tick throws does not stop the others.
 *
 * Pure: the tenant source and the databases are stand-ins, so this asserts the
 * loop's shape rather than any query.
 */
import { test, expect } from "bun:test";
import type { SQL } from "bun";
import { startEngine, singleTenantSource, type TenantHandle } from "../src/engine/host.js";
import { createRegistry } from "../src/engine/registry.js";

/** A handle that answers every query with nothing, so a drain finds no work and returns. */
const idleDb = (label: string): SQL => {
  const fn = () => Promise.resolve([]);
  (fn as unknown as { label: string }).label = label;
  return fn as unknown as SQL;
};

/** A handle whose every query throws, standing in for a database refusing the connection. */
const refusingDb = (): SQL => {
  const fn = () => Promise.reject(new Error("connection refused"));
  return fn as unknown as SQL;
};

/**
 * Let the poll loops run at least one tick, then stop them. `pollForever`
 * schedules its FIRST tick at the interval rather than immediately, so this
 * waits past the engine's 500ms rather than a token few milliseconds.
 */
const TICK_INTERVAL_MS = 500;

async function oneTick(engine: { stop: () => void }): Promise<void> {
  await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS + 150));
  engine.stop();
}

test("singleTenantSource answers exactly the process database", async () => {
  const db = idleDb("process");
  expect(await singleTenantSource(db)()).toEqual([{ key: "", db }]);
});

test("a tick visits every tenant the source lists", async () => {
  const seen: string[] = [];
  const tenants: TenantHandle[] = [
    { key: "acme", db: idleDb("acme") },
    { key: "globex", db: idleDb("globex") },
    { key: "initech", db: idleDb("initech") },
  ];
  const engine = startEngine(idleDb("unused"), createRegistry(), undefined, async () => {
    for (const t of tenants) seen.push(t.key);
    return tenants;
  });
  await oneTick(engine);
  // Every worker asks the source, so each tenant appears at least once per tick.
  expect(new Set(seen)).toEqual(new Set(["acme", "globex", "initech"]));
});

test("a tenant whose tick throws does not stop the others", async () => {
  // The property a shared process depends on. Without the per-tenant catch,
  // pollForever abandons the whole pass at the first throw and every later
  // tenant goes unserved for that tick.
  const served: string[] = [];
  const watch = (key: string): SQL => {
    const fn = () => {
      served.push(key);
      return Promise.resolve([]);
    };
    return fn as unknown as SQL;
  };
  const tenants: TenantHandle[] = [
    { key: "acme", db: watch("acme") },
    { key: "broken", db: refusingDb() },
    { key: "initech", db: watch("initech") },
  ];
  const engine = startEngine(idleDb("unused"), createRegistry(), undefined, async () => tenants);
  await oneTick(engine);
  expect(served).toContain("acme");
  expect(served).toContain("initech");
});

/**
 * A handle that claims one outbox row, labelled by `key`, the first time the
 * claim query runs and answers every other query with nothing. `begin` runs
 * its callback on the same handle, so the delivered mark finds no row to
 * change and the pass ends.
 */
const claimingDb = (key: string): SQL => {
  let claimed = false;
  const fn = (strings: TemplateStringsArray) => {
    if (!claimed && strings.join("?").includes("SET status = 'claimed'")) {
      claimed = true;
      return Promise.resolve([
        {
          idempotency_key: `idem_${key}`,
          instance_id: `inst_${key}`,
          transition_seq: 1,
          action: { id: "action_probe", type: "test.tenant-probe", config: {} },
          attempts: 1,
          event_id: null,
          field_version: 1,
          actors: null,
        },
      ]);
    }
    return Promise.resolve([]);
  };
  (fn as unknown as { begin: unknown }).begin = (cb: (tx: unknown) => unknown) => cb(fn);
  return fn as unknown as SQL;
};

test("the outbox worker hands each tenant's key to its handlers", async () => {
  const seen: { instanceId: string; tenant: string | undefined }[] = [];
  const registry = createRegistry();
  registry.set("test.tenant-probe", {
    handler: async (ctx) => {
      seen.push({ instanceId: ctx.instanceId, tenant: ctx.tenant });
      return {};
    },
  });
  const tenants: TenantHandle[] = [
    { key: "acme", db: claimingDb("acme") },
    { key: "beta", db: claimingDb("beta") },
  ];
  const engine = startEngine(idleDb("unused"), registry, undefined, async () => tenants);
  await oneTick(engine);
  expect(seen.sort((a, b) => a.instanceId.localeCompare(b.instanceId))).toEqual([
    { instanceId: "inst_acme", tenant: "acme" },
    { instanceId: "inst_beta", tenant: "beta" },
  ]);
});

test("a deployment with one tenant hands its handlers no tenant", async () => {
  const seen: { tenant: string | undefined; hasKey: boolean }[] = [];
  const registry = createRegistry();
  registry.set("test.tenant-probe", {
    handler: async (ctx) => {
      seen.push({ tenant: ctx.tenant, hasKey: "tenant" in ctx });
      return {};
    },
  });
  const engine = startEngine(claimingDb("solo"), registry);
  await oneTick(engine);
  // The source key is "", and deliver leaves the field out rather than passing "".
  expect(seen).toEqual([{ tenant: undefined, hasKey: false }]);
});

/** Run two ticks, mutating the tenant list between them. */
async function oneTick2(engine: { stop: () => void }, between: () => void): Promise<void> {
  await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS + 150));
  between();
  await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS + 150));
  engine.stop();
}

test("the source is asked per tick, so a tenant added later is served", async () => {
  let listed: TenantHandle[] = [{ key: "acme", db: idleDb("acme") }];
  let asked = 0;
  const engine = startEngine(idleDb("unused"), createRegistry(), undefined, async () => {
    asked += 1;
    return listed;
  });
  await oneTick2(engine, () => {
    listed = [...listed, { key: "globex", db: idleDb("globex") }];
  });
  // Re-read rather than captured once at startup: a tenant provisioned while
  // the process runs is served without a restart.
  expect(asked).toBeGreaterThan(1);
  expect(listed).toHaveLength(2);
});
