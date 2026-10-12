/**
 * The worker tenant seam. Three properties the shared process depends on: the
 * worker COUNT does not grow with the tenant count, one tick serves every
 * tenant, and a tenant whose tick throws does not stop the others.
 *
 * Pure: the tenant source and the databases are stand-ins, so this asserts the
 * loop's shape rather than any query.
 */
import { test, expect, spyOn } from "bun:test";
import type { SQL } from "bun";
import { startEngine, singleTenantSource, createTenantPool, TENANT_TICK_CONCURRENCY, type TenantHandle } from "../src/engine/host.js";
import { log } from "../src/log.js";
import { createRegistry } from "../src/engine/registry.js";

/** A handle that answers every query with nothing, so a drain finds no work and returns. */
const idleDb = (label: string): SQL => {
  const fn = () => Promise.resolve([]);
  (fn as unknown as { label: string }).label = label;
  return fn as unknown as SQL;
};

/**
 * A handle whose every query throws, standing in for a database refusing the
 * connection. The query rejects when awaited, as a real one does: a fragment
 * built and nested into a statement (drainResolutions' claim) is never awaited.
 */
const refusingDb = (): SQL => {
  const fn = () => ({ then: (_resolve: unknown, reject: (e: Error) => void) => reject(new Error("connection refused")) });
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
 * A handle whose queries stay pending until `release()`, then (and from then
 * on) answer with nothing. `calls` counts every query issued. Releasing at the
 * end of a test lets the detached drains finish, so none outlives it.
 */
function gatedDb() {
  let open = false;
  const pending: Array<() => void> = [];
  const state = {
    calls: 0,
    release: () => {
      open = true;
      pending.splice(0).forEach((resolve) => resolve());
    },
  };
  const fn = () => {
    state.calls += 1;
    if (open) return Promise.resolve([]);
    return new Promise<never[]>((resolve) => pending.push(() => resolve([])));
  };
  return { db: fn as unknown as SQL, state };
}

/** A handle that answers with nothing and counts its queries. */
function countingDb() {
  const state = { calls: 0 };
  const fn = () => {
    state.calls += 1;
    return Promise.resolve([]);
  };
  return { db: fn as unknown as SQL, state };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("a tenant whose drain never ends delays no tenant listed after it, on any tick", async () => {
  const hung = gatedDb();
  const healthy = countingDb();
  const engine = startEngine(idleDb("unused"), createRegistry(), undefined, async () => [
    { key: "hung", db: hung.db },
    { key: "healthy", db: healthy.db },
  ]);
  try {
    await wait(TICK_INTERVAL_MS + 150);
    const afterFirstTick = healthy.state.calls;
    expect(afterFirstTick).toBeGreaterThan(0);
    await wait(TICK_INTERVAL_MS);
    expect(healthy.state.calls).toBeGreaterThan(afterFirstTick);
  } finally {
    engine.stop();
    hung.state.release();
    await wait(50);
  }
});

test("a slow tenant's drain does not hold back a tenant listed after it in the same tick", async () => {
  const slow = gatedDb();
  const healthy = countingDb();
  const engine = startEngine(idleDb("unused"), createRegistry(), undefined, async () => [
    { key: "slow", db: slow.db },
    { key: "healthy", db: healthy.db },
  ]);
  // The slow tenant's queries resolve about 1.2s in, well after the first tick.
  const releaseTimer = setTimeout(slow.state.release, 1200);
  try {
    await wait(TICK_INTERVAL_MS + 150);
    expect(slow.state.calls).toBeGreaterThan(0);
    expect(healthy.state.calls).toBeGreaterThan(0);
  } finally {
    clearTimeout(releaseTimer);
    engine.stop();
    slow.state.release();
    await wait(50);
  }
});

test("a drain still running at the next tick starts no second drain for that tenant", async () => {
  const hung = gatedDb();
  const engine = startEngine(idleDb("unused"), createRegistry(), undefined, async () => [{ key: "hung", db: hung.db }]);
  try {
    await wait(TICK_INTERVAL_MS + 150);
    const afterFirstTick = hung.state.calls;
    // Each worker's first drain issues its queries, then hangs on the first.
    expect(afterFirstTick).toBeGreaterThan(0);
    await wait(2 * TICK_INTERVAL_MS);
    expect(hung.state.calls).toBe(afterFirstTick);
  } finally {
    engine.stop();
    hung.state.release();
    await wait(50);
  }
});

test("a tenant whose drain throws logs one warning per worker per tick and is drained again", async () => {
  const warn = spyOn(log, "warn").mockImplementation(() => {});
  const engine = startEngine(idleDb("unused"), createRegistry(), undefined, async () => [{ key: "broken", db: refusingDb() }]);
  try {
    await wait(TICK_INTERVAL_MS + 150);
    const perWorker = (): Record<string, number> => {
      const counts: Record<string, number> = {};
      for (const [msg, ctx] of warn.mock.calls) {
        if (msg !== "tenant tick skipped") continue;
        const { worker, tenant } = ctx as { worker: string; tenant: string };
        expect(tenant).toBe("broken");
        counts[worker] = (counts[worker] ?? 0) + 1;
      }
      return counts;
    };
    expect(perWorker()).toEqual({ outbox: 1, resolution: 1, timers: 1 });
    // The failed drain released its slot and its key: the next tick runs it again.
    await wait(TICK_INTERVAL_MS);
    expect(perWorker()).toEqual({ outbox: 2, resolution: 2, timers: 2 });
  } finally {
    engine.stop();
    await wait(50);
    warn.mockRestore();
  }
});

/** Let the microtask queue and one macrotask turn drain. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A drain the test finishes by hand, one deferred promise per start. */
function controlledDrains() {
  const started: string[] = [];
  const finish = new Map<string, () => void>();
  const failWith = new Map<string, (e: Error) => void>();
  let running = 0;
  let maxRunning = 0;
  const drain = (t: TenantHandle) => {
    started.push(t.key);
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    return new Promise<void>((resolve, reject) => {
      finish.set(t.key, () => {
        running -= 1;
        resolve();
      });
      failWith.set(t.key, (e) => {
        running -= 1;
        reject(e);
      });
    });
  };
  return { drain, started, finish, failWith, running: () => running, maxRunning: () => maxRunning };
}

const handles = (n: number): TenantHandle[] => Array.from({ length: n }, (_, i) => ({ key: `t${i}`, db: idleDb(`t${i}`) }));

test("TENANT_TICK_CONCURRENCY is eight", () => {
  expect(TENANT_TICK_CONCURRENCY).toBe(8);
});

test("the pool starts a drain without awaiting it, so a later tenant starts in the same call", async () => {
  const pool = createTenantPool();
  const c = controlledDrains();
  await pool(handles(3), c.drain, () => {});
  expect(c.started).toEqual(["t0", "t1", "t2"]);
});

test("the pool starts no second drain for a tenant whose drain still runs", async () => {
  const pool = createTenantPool();
  const c = controlledDrains();
  const [only] = handles(1);
  await pool([only], c.drain, () => {});
  await pool([only], c.drain, () => {});
  await pool([only], c.drain, () => {});
  expect(c.started).toEqual(["t0"]);
  c.finish.get("t0")!();
  await settle();
  await pool([only], c.drain, () => {});
  expect(c.started).toEqual(["t0", "t0"]);
  c.finish.get("t0")!();
  await settle();
});

test("nine tenants, none slow: every tenant is drained and no more than eight run at once", async () => {
  const pool = createTenantPool();
  const started: string[] = [];
  let running = 0;
  let maxRunning = 0;
  const drain = async (t: TenantHandle) => {
    started.push(t.key);
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await settle();
    running -= 1;
  };
  await pool(handles(9), drain, () => {});
  await settle();
  expect(new Set(started).size).toBe(9);
  expect(maxRunning).toBe(TENANT_TICK_CONCURRENCY);
});

test("the ninth tenant waits for a free slot, and the tick returns once a drain ends", async () => {
  const pool = createTenantPool();
  const c = controlledDrains();
  let returned = false;
  const tick = pool(handles(9), c.drain, () => {}).then(() => {
    returned = true;
  });
  await settle();
  expect(c.started).toHaveLength(8);
  expect(c.running()).toBe(8);
  expect(returned).toBe(false);
  c.finish.get("t3")!();
  await tick;
  expect(c.started).toHaveLength(9);
  expect(c.started[8]).toBe("t8");
  expect(c.maxRunning()).toBe(8);
  for (const key of c.started) c.finish.get(key)!();
  await settle();
});

test("waiters get a freed slot in list order", async () => {
  const pool = createTenantPool(1);
  const c = controlledDrains();
  const tick = pool(handles(3), c.drain, () => {});
  await settle();
  expect(c.started).toEqual(["t0"]);
  c.finish.get("t0")!();
  await settle();
  expect(c.started).toEqual(["t0", "t1"]);
  c.finish.get("t1")!();
  await tick;
  expect(c.started).toEqual(["t0", "t1", "t2"]);
  c.finish.get("t2")!();
  await settle();
});

test("a drain that throws reaches onError once, releases its slot, and is drained again", async () => {
  const pool = createTenantPool(1);
  const c = controlledDrains();
  const errors: string[] = [];
  const onError = (t: TenantHandle, e: unknown) => errors.push(`${t.key}:${(e as Error).message}`);
  const [a, b] = handles(2);
  const tick = pool([a, b], c.drain, onError);
  await settle();
  expect(c.started).toEqual(["t0"]);
  c.failWith.get("t0")!(new Error("boom"));
  await tick;
  expect(errors).toEqual(["t0:boom"]);
  expect(c.started).toEqual(["t0", "t1"]);
  c.finish.get("t1")!();
  await settle();
  await pool([a], c.drain, onError);
  expect(c.started).toEqual(["t0", "t1", "t0"]);
  expect(errors).toHaveLength(1);
  c.finish.get("t0")!();
  await settle();
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
