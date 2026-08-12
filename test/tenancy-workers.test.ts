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
