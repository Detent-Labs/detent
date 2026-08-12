/**
 * The tenancy control plane: the list of tenants and nothing else.
 *
 * This database holds no instance, no definition, no account and no outbox
 * row. Every one of those lives in a tenant's own database, which is what makes
 * a forgotten `WHERE` unable to leak across tenants — there is no filter to
 * forget. A tenant's own database therefore never carries `tenants` either: a
 * tenant that could list its siblings is the leak this model exists to prevent,
 * so `initSchema` and this function stay separate.
 *
 * `TENANT_CONTROL_PLANE_URL` selects the mode. Unset, the server runs against
 * its own `DATABASE_URL` for every request, exactly as it does today, and none
 * of this opens a connection.
 */

import { SQL } from "bun";

export interface TenantRecord {
  id: string;
  key: string;
  name: string;
  databaseUrl: string;
}

/**
 * Read per call, not once at module load, so a test can set the variable after
 * import — the convention `readSmtpEnv` and `resolutionTimeoutMs` already
 * follow. The server bootstrap reads it once at startup to decide the mode;
 * every later read is this one.
 */
export function controlPlaneUrl(): string | undefined {
  return process.env.TENANT_CONTROL_PLANE_URL || undefined;
}

/** True when the deployment runs many tenants behind one process. */
export function saasMode(): boolean {
  return controlPlaneUrl() !== undefined;
}

/**
 * Connect to the control plane. Throws when the variable is unset, so a caller
 * reaching here without checking `saasMode()` fails loudly rather than opening
 * a connection to nothing.
 */
export function controlPlane(): SQL {
  const url = controlPlaneUrl();
  if (!url) throw new Error("tenancy: TENANT_CONTROL_PLANE_URL is not configured");
  return new SQL(url);
}

/**
 * Create the one control-plane table. Deliberately not part of `initSchema`:
 * that function builds a TENANT's schema, and this table must never appear
 * there.
 */
export async function initControlPlane(db: SQL): Promise<void> {
  await db`CREATE TABLE IF NOT EXISTS tenants (
    id           text PRIMARY KEY,
    key          text UNIQUE NOT NULL,
    name         text NOT NULL,
    database_url text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
  )`;
}

const toRecord = (r: { id: string; key: string; name: string; database_url: string }): TenantRecord => ({
  id: r.id,
  key: r.key,
  name: r.name,
  databaseUrl: r.database_url,
});

/** Every tenant, key order. Read by the worker tenant source once per poll tick. */
export async function listTenants(db: SQL): Promise<TenantRecord[]> {
  const rows = (await db`SELECT id, key, name, database_url FROM tenants ORDER BY key`) as Parameters<typeof toRecord>[0][];
  return rows.map(toRecord);
}

/**
 * One tenant by key, or `undefined` when the control plane lists none. The
 * dispatcher answers 401 on `undefined`, the same answer an unverifiable token
 * gets: a caller must not learn which tenant keys exist by probing.
 */
export async function tenantByKey(key: string, db: SQL): Promise<TenantRecord | undefined> {
  const rows = (await db`SELECT id, key, name, database_url FROM tenants WHERE key = ${key}`) as Parameters<typeof toRecord>[0][];
  const row = rows[0];
  return row ? toRecord(row) : undefined;
}

/**
 * Insert a tenant. The unique constraint on `key` refuses a duplicate rather
 * than a pre-read deciding it, so a concurrent provisioning cannot slip between
 * a check and the write — the rule `PATCH /admin/users/:id/manager` already
 * follows for its own foreign key.
 *
 * Provisioning calls this LAST, after the tenant's database exists and carries
 * its schema. A fault before this row lands leaves nothing the dispatcher can
 * resolve, which is what keeps a half-provisioned tenant unreachable.
 */
export async function insertTenant(t: TenantRecord, db: SQL): Promise<void> {
  await db`INSERT INTO tenants (id, key, name, database_url)
    VALUES (${t.id}, ${t.key}, ${t.name}, ${t.databaseUrl})`;
}
