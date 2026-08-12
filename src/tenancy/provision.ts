/**
 * Tenant provisioning. Deliberately not an HTTP route: stage 24 put
 * self-service signup out of scope, so an operator provisions a tenant and
 * nothing else can.
 *
 * The order is load-bearing. Create the database, build its schema, and insert
 * the control-plane row LAST. A fault at any earlier step therefore leaves a
 * database nothing resolves, rather than a listed tenant whose schema is
 * missing — the dispatcher would send live requests at that one.
 */

import { SQL } from "bun";
import { initSchema } from "../engine/store.js";
import { insertTenant, tenantByKey, type TenantRecord } from "./store.js";

/** `key` is what a token's `tenant` claim carries, so it stays a slug a human types. */
const KEY_PATTERN = /^[a-z][a-z0-9_-]*$/;

export class InvalidTenantKey extends Error {
  constructor(key: string) {
    super(`tenancy: ${key} is not a valid tenant key (${KEY_PATTERN.source})`);
    this.name = "InvalidTenantKey";
  }
}

export class TenantKeyTaken extends Error {
  constructor(key: string) {
    super(`tenancy: a tenant with key ${key} exists already`);
    this.name = "TenantKeyTaken";
  }
}

export interface ProvisionOptions {
  key: string;
  name: string;
  databaseUrl: string;
  /** Injected so a test drives the order without creating a real database. */
  createDatabase?: (databaseUrl: string) => Promise<void>;
  connect?: (databaseUrl: string) => SQL;
  buildSchema?: (db: SQL) => Promise<void>;
}

/**
 * `CREATE DATABASE` for the tenant, run against the server's own `postgres`
 * database: a connection to the target cannot create the target.
 *
 * The name is interpolated rather than bound, because `CREATE DATABASE` takes
 * no parameter. `provisionTenant` has already checked `key` against
 * `KEY_PATTERN`, but the database NAME comes from the URL rather than the key,
 * so it is checked here too — a caller reaching this function directly must not
 * be able to smuggle SQL through a connection string.
 *
 * An existing database is left alone: `initSchema` runs next and is idempotent,
 * which is what makes re-provisioning onto a prepared database work.
 */
const DB_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;

async function createDatabaseFor(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, "");
  if (!DB_NAME_PATTERN.test(name)) {
    throw new Error(`tenancy: '${name}' is not a valid database name (${DB_NAME_PATTERN.source})`);
  }
  const admin = new SQL(`${url.protocol}//${url.username}:${url.password}@${url.host}/postgres`);
  try {
    const existing = (await admin`SELECT 1 FROM pg_database WHERE datname = ${name}`) as unknown[];
    if (existing.length === 0) await admin.unsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
}

/**
 * Create a tenant's database, build its schema, and list it.
 *
 * The pre-read below is a courtesy that gives a clear message; the unique
 * constraint on `key` is what actually decides, so a concurrent provisioning
 * cannot slip between the check and the write.
 */
export async function provisionTenant(control: SQL, opts: ProvisionOptions): Promise<TenantRecord> {
  if (!KEY_PATTERN.test(opts.key)) throw new InvalidTenantKey(opts.key);
  if (await tenantByKey(opts.key, control)) throw new TenantKeyTaken(opts.key);

  const createDatabase = opts.createDatabase ?? createDatabaseFor;
  const connect = opts.connect ?? ((url: string) => new SQL(url));
  const buildSchema = opts.buildSchema ?? initSchema;

  await createDatabase(opts.databaseUrl);
  await buildSchema(connect(opts.databaseUrl));

  const record: TenantRecord = {
    id: `tenant_${crypto.randomUUID()}`,
    key: opts.key,
    name: opts.name,
    databaseUrl: opts.databaseUrl,
  };
  await insertTenant(record, control);
  return record;
}
