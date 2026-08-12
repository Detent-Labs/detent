/**
 * The key-to-database map. This is the one surface every tenant crosses, so a
 * wrong entry is the whole isolation fault — nothing else in this model is
 * shared. Pure: the lookup and the connect step are both injected, so no
 * DATABASE_URL is needed.
 */
import { test, expect } from "bun:test";
import type { SQL } from "bun";
import { createTenantConnections, UnknownTenant, TenantUnreachable } from "../src/tenancy/connections.js";
import type { TenantRecord } from "../src/tenancy/store.js";

const control = {} as SQL;

const record = (key: string): TenantRecord => ({
  id: `tenant_${key}`,
  key,
  name: key.toUpperCase(),
  databaseUrl: `postgres://host/${key}`,
});

/** A stand-in handle that answers the connection probe and remembers its url. */
const fakeDb = (url: string, refuse = false): SQL => {
  const fn = () => (refuse ? Promise.reject(new Error("connection refused")) : Promise.resolve([]));
  (fn as unknown as { url: string }).url = url;
  return fn as unknown as SQL;
};

const urlOf = (db: SQL): string => (db as unknown as { url: string }).url;

function mapOver(keys: string[], refusing: string[] = [], onSkip?: (k: string, c: unknown) => void) {
  const records = keys.map(record);
  return createTenantConnections(control, {
    lookup: async (key) => records.find((r) => r.key === key),
    listAll: async () => records,
    connect: (url) => fakeDb(url, refusing.some((k) => url.endsWith(`/${k}`))),
    ...(onSkip ? { onSkip } : {}),
  });
}

test("a key reaches its own database and no other", async () => {
  const map = mapOver(["acme", "globex"]);
  expect(urlOf(await map.handleFor("acme"))).toBe("postgres://host/acme");
  expect(urlOf(await map.handleFor("globex"))).toBe("postgres://host/globex");
});

test("a key's handle is cached, so a second call opens no second pool", async () => {
  let opened = 0;
  const records = [record("acme")];
  const map = createTenantConnections(control, {
    lookup: async (key) => records.find((r) => r.key === key),
    listAll: async () => records,
    connect: (url) => {
      opened += 1;
      return fakeDb(url);
    },
  });
  await map.handleFor("acme");
  await map.handleFor("acme");
  expect(opened).toBe(1);
});

test("an unlisted key raises UnknownTenant", async () => {
  const map = mapOver(["acme"]);
  let caught: unknown;
  try {
    await map.handleFor("nobody");
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(UnknownTenant);
});

test("a listed tenant whose database refuses raises TenantUnreachable, not UnknownTenant", async () => {
  // The two must not read alike: one is a caller fault answering 401, the other
  // a deployment fault answering 503.
  const map = mapOver(["acme"], ["acme"]);
  let caught: unknown;
  try {
    await map.handleFor("acme");
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(TenantUnreachable);
  expect((caught as Error).message).toContain("acme");
});

test("a refused tenant is not cached, so a later attempt can still succeed", async () => {
  const records = [record("acme")];
  let refuse = true;
  const map = createTenantConnections(control, {
    lookup: async (key) => records.find((r) => r.key === key),
    listAll: async () => records,
    connect: (url) => fakeDb(url, refuse),
  });
  await expect(map.handleFor("acme")).rejects.toBeInstanceOf(TenantUnreachable);
  refuse = false;
  expect(urlOf(await map.handleFor("acme"))).toBe("postgres://host/acme");
});

test("live() answers one handle per listed tenant", async () => {
  const map = mapOver(["acme", "globex", "initech"]);
  const live = await map.live();
  expect(live.map((h) => h.key)).toEqual(["acme", "globex", "initech"]);
  expect(live.map((h) => urlOf(h.db))).toEqual([
    "postgres://host/acme",
    "postgres://host/globex",
    "postgres://host/initech",
  ]);
});

test("live() skips an unreachable tenant and still serves the others", async () => {
  // The property a worker tick depends on: one bad tenant must not stop the
  // rest, and the skip must be visible rather than silent.
  const skipped: string[] = [];
  const map = mapOver(["acme", "globex", "initech"], ["globex"], (k) => skipped.push(k));
  const live = await map.live();
  expect(live.map((h) => h.key)).toEqual(["acme", "initech"]);
  expect(skipped).toEqual(["globex"]);
});

test("live() answers nothing when the control plane lists nothing", async () => {
  const map = mapOver([]);
  expect(await map.live()).toEqual([]);
});
