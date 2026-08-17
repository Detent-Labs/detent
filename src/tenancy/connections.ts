/**
 * Key-to-database map. This is the one surface every tenant crosses, so a wrong
 * entry here is the whole isolation fault — nothing else in this model can leak
 * across tenants, because nothing else is shared. It gets the heaviest test in
 * this change for that reason.
 *
 * A pool opens lazily, on the first request that names its tenant, and stays
 * open. ponytail: no eviction. A deployment holding more idle tenants than
 * Postgres allows connections needs one, and the entry to add it is `close`
 * below. Nothing measures that today.
 */

import { SQL } from "bun";
import { listTenants, tenantByKey, type TenantRecord } from "./store.js";

/** A tenant's key and the handle its requests run against. */
export interface TenantHandle {
  key: string;
  db: SQL;
}

/** Raised when the control plane lists no such tenant. The dispatcher answers 401. */
export class UnknownTenant extends Error {
  constructor(key: string) {
    super(`tenancy: no tenant with key ${key}`);
    this.name = "UnknownTenant";
  }
}

/**
 * Raised when a listed tenant's database refuses the connection. The dispatcher
 * answers 503, not 401: that is a deployment fault rather than a caller fault,
 * and the two must not read alike to an operator reading logs.
 */
export class TenantUnreachable extends Error {
  constructor(key: string, cause: unknown) {
    super(`tenancy: tenant ${key} refused the connection: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "TenantUnreachable";
  }
}

export interface TenantConnections {
  /** The handle for `key`, opening it on first use. Raises `UnknownTenant` or `TenantUnreachable`. */
  handleFor: (key: string) => Promise<SQL>;
  /** Every currently-listed tenant, with its handle. Skips one whose database refuses. */
  live: () => Promise<TenantHandle[]>;
  close: () => void;
}

/**
 * `control` is the control-plane handle. `listAll` and `lookup` are injected so
 * a test drives this map without a control-plane database, the same seam
 * `ResolveBody` uses.
 */
export function createTenantConnections(
  control: SQL,
  deps: {
    lookup?: (key: string, db: SQL) => Promise<TenantRecord | undefined>;
    listAll?: (db: SQL) => Promise<TenantRecord[]>;
    connect?: (url: string) => SQL;
    onSkip?: (key: string, cause: unknown) => void;
  } = {},
): TenantConnections {
  const lookup = deps.lookup ?? tenantByKey;
  const listAll = deps.listAll ?? listTenants;
  const connect = deps.connect ?? ((url: string) => new SQL(url));
  const pools = new Map<string, SQL>();

  /**
   * Cached by key, and the control-plane row is the only source that fills it.
   * A key that resolved once keeps its handle: re-reading the row per request
   * would put a control-plane query in front of every request, and the URL for
   * a live tenant does not change under it.
   */
  async function handleFor(key: string): Promise<SQL> {
    const held = pools.get(key);
    if (held) return held;
    const record = await lookup(key, control);
    if (!record) throw new UnknownTenant(key);
    try {
      const db = connect(record.databaseUrl);
      // Prove the connection before caching it, so a refused database raises
      // TenantUnreachable now rather than failing inside a route handler that
      // has already begun its work.
      await db`SELECT 1`;
      pools.set(key, db);
      return db;
    } catch (cause) {
      throw new TenantUnreachable(key, cause);
    }
  }

  /**
   * One entry per listed tenant. A tenant whose database refuses is skipped
   * with a callback rather than raising: a worker tick must serve every other
   * tenant, and one unreachable database must not stop it.
   */
  async function live(): Promise<TenantHandle[]> {
    const records = await listAll(control);
    const out: TenantHandle[] = [];
    for (const record of records) {
      try {
        out.push({ key: record.key, db: await handleFor(record.key) });
      } catch (cause) {
        deps.onSkip?.(record.key, cause);
      }
    }
    return out;
  }

  return { handleFor, live, close: () => pools.clear() };
}
