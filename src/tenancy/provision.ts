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
 * Create a tenant's database, build its schema, and list it.
 *
 * The pre-read below is a courtesy that gives a clear message; the unique
 * constraint on `key` is what actually decides, so a concurrent provisioning
 * cannot slip between the check and the write.
 */
export async function provisionTenant(control: SQL, opts: ProvisionOptions): Promise<TenantRecord> {
  if (!KEY_PATTERN.test(opts.key)) throw new InvalidTenantKey(opts.key);
  if (await tenantByKey(opts.key, control)) throw new TenantKeyTaken(opts.key);

  const createDatabase = opts.createDatabase ?? (async () => {});
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
