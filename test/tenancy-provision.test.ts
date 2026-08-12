/**
 * Tenant provisioning, and the control-plane table itself. The order matters
 * more than any single step: the control-plane row lands LAST, so a fault
 * before it leaves a database nothing resolves rather than a listed tenant the
 * dispatcher would send live requests at.
 *
 * DB-backed, and deliberately against the ordinary test database rather than a
 * second one: `tenants` is just a table here, and creating a real per-tenant
 * database is what the injected seams below stand in for.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import type { SQL } from "bun";
import { sql } from "../src/engine/store.js";
import { initControlPlane, listTenants, tenantByKey } from "../src/tenancy/store.js";
import { provisionTenant, InvalidTenantKey, TenantKeyTaken } from "../src/tenancy/provision.js";

const DB = !!process.env.DATABASE_URL;

beforeAll(async () => {
  if (DB) {
    await initControlPlane(sql);
    await initControlPlane(sql); // idempotent: a second run must not throw
  }
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE tenants`;
});

/** Records the order the steps ran in, so the test asserts sequence, not just outcome. */
function seams(opts: { failSchema?: boolean } = {}) {
  const steps: string[] = [];
  return {
    steps,
    createDatabase: async () => {
      steps.push("create");
    },
    connect: (() => (() => Promise.resolve([])) as unknown as SQL) as (url: string) => SQL,
    buildSchema: async () => {
      steps.push("schema");
      if (opts.failSchema) throw new Error("schema build failed");
    },
  };
}

test.skipIf(!DB)("provisioning creates the database, builds the schema, then lists the tenant", async () => {
  const s = seams();
  const tenant = await provisionTenant(sql, {
    key: "acme",
    name: "Acme",
    databaseUrl: "postgres://host/acme",
    createDatabase: s.createDatabase,
    connect: s.connect,
    buildSchema: s.buildSchema,
  });
  expect(s.steps).toEqual(["create", "schema"]);
  expect(tenant.id).toStartWith("tenant_");
  expect((await tenantByKey("acme", sql))!.databaseUrl).toBe("postgres://host/acme");
});

test.skipIf(!DB)("a fault before the row lands leaves nothing resolvable", async () => {
  const s = seams({ failSchema: true });
  let caught: unknown;
  try {
    await provisionTenant(sql, {
      key: "acme",
      name: "Acme",
      databaseUrl: "postgres://host/acme",
      createDatabase: s.createDatabase,
      connect: s.connect,
      buildSchema: s.buildSchema,
    });
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeDefined();
  expect(await tenantByKey("acme", sql)).toBeUndefined();
});

test.skipIf(!DB)("a duplicate key is refused and leaves the original alone", async () => {
  const s = seams();
  const opts = { createDatabase: s.createDatabase, connect: s.connect, buildSchema: s.buildSchema };
  await provisionTenant(sql, { key: "acme", name: "Acme", databaseUrl: "postgres://host/acme", ...opts });
  let caught: unknown;
  try {
    await provisionTenant(sql, { key: "acme", name: "Acme Two", databaseUrl: "postgres://host/other", ...opts });
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(TenantKeyTaken);
  const all = await listTenants(sql);
  expect(all).toHaveLength(1);
  expect(all[0]!.name).toBe("Acme");
});

test.skipIf(!DB)("a key outside the slug grammar is refused before anything is created", async () => {
  const s = seams();
  let caught: unknown;
  try {
    await provisionTenant(sql, {
      key: "Acme Corp",
      name: "Acme",
      databaseUrl: "postgres://host/acme",
      createDatabase: s.createDatabase,
      connect: s.connect,
      buildSchema: s.buildSchema,
    });
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(InvalidTenantKey);
  expect(s.steps).toEqual([]);
});

test.skipIf(!DB)("an unlisted key resolves to nothing", async () => {
  expect(await tenantByKey("nobody", sql)).toBeUndefined();
});

test.skipIf(!DB)("listTenants answers in key order", async () => {
  const s = seams();
  const opts = { createDatabase: s.createDatabase, connect: s.connect, buildSchema: s.buildSchema };
  await provisionTenant(sql, { key: "globex", name: "Globex", databaseUrl: "postgres://host/g", ...opts });
  await provisionTenant(sql, { key: "acme", name: "Acme", databaseUrl: "postgres://host/a", ...opts });
  expect((await listTenants(sql)).map((t) => t.key)).toEqual(["acme", "globex"]);
});

test.skipIf(!DB)("initSchema does not create tenants in a tenant database", async () => {
  // A tenant that could list its siblings is the leak this model exists to
  // prevent, so the control-plane table stays out of initSchema.
  const source = await Bun.file("src/engine/store.ts").text();
  expect(source).not.toContain("CREATE TABLE IF NOT EXISTS tenants");
});

// `CREATE DATABASE` takes no bound parameter, so the name is interpolated. The
// database NAME comes from the connection string rather than from `key`, which
// `KEY_PATTERN` already checks, so it is checked on its own. These run against
// the real `createDatabase` default — the check runs before any connection
// opens, so no database is created and none is needed.
for (const [label, url] of [
  ["a quoted injection", "postgres://u:p@h:5432/x\"; DROP DATABASE cp; --"],
  ["a hyphen", "postgres://u:p@h:5432/t-acme"],
  ["a leading digit", "postgres://u:p@h:5432/1acme"],
  ["an empty name", "postgres://u:p@h:5432/"],
] as const) {
  test.skipIf(!DB)(`provisioning refuses ${label} in the database name`, async () => {
    let caught: unknown;
    try {
      await provisionTenant(sql, { key: "acme", name: "Acme", databaseUrl: url });
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toContain("is not a valid database name");
    expect(await tenantByKey("acme", sql)).toBeUndefined();
  });
}
