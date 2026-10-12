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
import { initControlPlane, insertTenant, listTenants, tenantByKey } from "../src/tenancy/store.js";
import {
  provisionTenant,
  adminUrlFor,
  databaseIdentity,
  InvalidTenantKey,
  TenantKeyTaken,
  TenantDatabaseTaken,
} from "../src/tenancy/provision.js";

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

// The admin connection runs `CREATE DATABASE`. It differs from the tenant URL in
// the database name alone, so a server that demands TLS still accepts it.
test("the admin URL keeps sslmode and the credentials", () => {
  expect(adminUrlFor("postgres://u:p@db/tenant_x?sslmode=require")).toBe("postgres://u:p@db/postgres?sslmode=require");
});

test("the admin URL works with no parameters", () => {
  expect(adminUrlFor("postgres://u:p@db:5433/tenant_x")).toBe("postgres://u:p@db:5433/postgres");
});

test("the admin URL works with no credentials", () => {
  expect(adminUrlFor("postgres://db/tenant_x?sslmode=require")).toBe("postgres://db/postgres?sslmode=require");
});

test("a database identity ignores credentials and parameters, lowercases the host, defaults the port", () => {
  expect(databaseIdentity("postgres://u:p@DB.example/tenant_x?sslmode=require")).toBe("db.example:5432/tenant_x");
  expect(databaseIdentity("postgres://other:pw@db.example:5432/tenant_x")).toBe("db.example:5432/tenant_x");
});

test("a host parameter replaces the hostname of a socket URL", () => {
  expect(databaseIdentity("postgres://u:p@localhost/tenant_x?host=/var/run/a")).toBe("/var/run/a:5432/tenant_x");
});

/** Provision `acme` onto a URL, then try `beta` onto another; returns what the second attempt did. */
async function provisionSecond(acmeUrl: string, betaUrl: string) {
  const first = seams();
  await provisionTenant(sql, {
    key: "acme",
    name: "Acme",
    databaseUrl: acmeUrl,
    createDatabase: first.createDatabase,
    connect: first.connect,
    buildSchema: first.buildSchema,
  });
  const second = seams();
  let caught: unknown;
  try {
    await provisionTenant(sql, {
      key: "beta",
      name: "Beta",
      databaseUrl: betaUrl,
      createDatabase: second.createDatabase,
      connect: second.connect,
      buildSchema: second.buildSchema,
    });
  } catch (e) {
    caught = e;
  }
  return { caught, steps: second.steps };
}

test.skipIf(!DB)("a second tenant on a listed database is refused before anything is created", async () => {
  const { caught, steps } = await provisionSecond("postgres://u:p@db/tenant_acme", "postgres://u:p@db/tenant_acme");
  expect(caught).toBeInstanceOf(TenantDatabaseTaken);
  expect((caught as Error).message).toContain("acme");
  expect((caught as Error).message).toContain("tenant_acme");
  expect(steps).toEqual([]);
  expect(await tenantByKey("beta", sql)).toBeUndefined();
});

test.skipIf(!DB)("another password and sslmode do not hide a listed database", async () => {
  const { caught, steps } = await provisionSecond(
    "postgres://u:p@db/tenant_acme",
    "postgres://u:other@db/tenant_acme?sslmode=require",
  );
  expect(caught).toBeInstanceOf(TenantDatabaseTaken);
  expect(steps).toEqual([]);
});

test.skipIf(!DB)("a socket URL with the same host parameter and database is refused", async () => {
  const { caught } = await provisionSecond("postgres://u:p@localhost/tenant_acme?host=/var/run/a", "postgres://u:p@localhost/tenant_acme?host=/var/run/a");
  expect(caught).toBeInstanceOf(TenantDatabaseTaken);
});

test.skipIf(!DB)("socket URLs with different host parameters do not collide", async () => {
  const { caught, steps } = await provisionSecond("postgres://u:p@localhost/tenant_acme?host=/var/run/a", "postgres://u:p@localhost/tenant_acme?host=/var/run/b");
  expect(caught).toBeUndefined();
  expect(steps).toEqual(["create", "schema"]);
});

test.skipIf(!DB)("a distinct database on the same host is provisioned", async () => {
  const { caught, steps } = await provisionSecond("postgres://u:p@db/tenant_acme", "postgres://u:p@db/tenant_beta");
  expect(caught).toBeUndefined();
  expect(steps).toEqual(["create", "schema"]);
  expect((await listTenants(sql)).map((t) => t.key)).toEqual(["acme", "beta"]);
});

test.skipIf(!DB)("the control plane refuses one URL under two keys", async () => {
  const databaseUrl = "postgres://u:p@db/tenant_acme";
  await insertTenant({ id: "tenant_1", key: "acme", name: "Acme", databaseUrl }, sql);
  let caught: unknown;
  try {
    await insertTenant({ id: "tenant_2", key: "beta", name: "Beta", databaseUrl }, sql);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeDefined();
  const rows = (await sql`SELECT key FROM tenants WHERE database_url = ${databaseUrl}`) as { key: string }[];
  expect(rows.map((r) => r.key)).toEqual(["acme"]);
});

test.skipIf(!DB)("add-tenant prints the taken-database message and exits 1", async () => {
  // The identity check precedes `CREATE DATABASE`, so the child opens no tenant database.
  await insertTenant({ id: "tenant_1", key: "acme", name: "Acme", databaseUrl: "postgres://u:p@db/tenant_acme" }, sql);
  const child = Bun.spawn(["bun", "run", "src/tenancy/cli.ts", "add-tenant", "beta", "Beta", "postgres://u:other@db/tenant_acme"], {
    env: { ...process.env, TENANT_CONTROL_PLANE_URL: process.env.DATABASE_URL },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  expect(exitCode).toBe(1);
  expect(stderr).toContain("tenant acme lists it already");
  expect(await tenantByKey("beta", sql)).toBeUndefined();
});
