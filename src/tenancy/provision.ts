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
import { insertTenant, listTenants, tenantByKey, type TenantRecord } from "./store.js";

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

export class TenantDatabaseTaken extends Error {
  constructor(key: string, owner: string, identity: string) {
    super(`tenancy: tenant ${key} cannot use database ${identity}, tenant ${owner} lists it already`);
    this.name = "TenantDatabaseTaken";
  }
}

/**
 * `host:port/database` of a connection URL. Credentials and query parameters
 * stay out, so a typo that differs only in password or `sslmode` still names the
 * same database. A `host` query parameter (a socket URL) replaces the hostname.
 * The port defaults to 5432 and the hostname is lowercase. Throws when the URL
 * does not parse.
 *
 * ponytail: the identity is a string. `localhost`, `127.0.0.1` and a DNS alias
 * of one server compare unequal, so the check catches a typo in the same host
 * spelling and nothing cleverer. The entry to close it is this function:
 * resolve the host, or compare through the server's own `inet_server_addr()`.
 */
export function databaseIdentity(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const host = (url.searchParams.get("host") || url.hostname).toLowerCase();
  return `${host}:${url.port || "5432"}/${url.pathname.replace(/^\//, "")}`;
}

function identityOrUndefined(databaseUrl: string): string | undefined {
  try {
    return databaseIdentity(databaseUrl);
  } catch {
    return undefined;
  }
}

/**
 * The URL `createDatabaseFor` connects with: the tenant URL with its database
 * replaced by `postgres`. Credentials, host, port and every query parameter
 * (`sslmode` included) stay.
 */
export function adminUrlFor(databaseUrl: string): string {
  const admin = new URL(databaseUrl);
  admin.pathname = "/postgres";
  return admin.toString();
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
  const admin = new SQL(adminUrlFor(databaseUrl));
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
 * The key and database pre-reads below are a courtesy that gives a clear
 * message; the unique constraints on `key` and `database_url` are what actually
 * decide, so a concurrent provisioning cannot slip between the check and the
 * write. The database check compares `databaseIdentity`, so it also catches a
 * URL that differs from a listed one in credentials or parameters, which the
 * `database_url` index cannot.
 */
export async function provisionTenant(control: SQL, opts: ProvisionOptions): Promise<TenantRecord> {
  if (!KEY_PATTERN.test(opts.key)) throw new InvalidTenantKey(opts.key);
  if (await tenantByKey(opts.key, control)) throw new TenantKeyTaken(opts.key);

  // A URL that does not parse has no identity; `createDatabase` rejects it.
  const identity = identityOrUndefined(opts.databaseUrl);
  if (identity) {
    for (const t of await listTenants(control)) {
      if (identityOrUndefined(t.databaseUrl) === identity) throw new TenantDatabaseTaken(opts.key, t.key, identity);
    }
  }

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
