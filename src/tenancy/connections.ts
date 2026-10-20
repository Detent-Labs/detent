/**
 * Key-to-database map. This is the one surface every tenant crosses, so a wrong
 * entry here is the whole isolation fault — nothing else in this model can leak
 * across tenants, because nothing else is shared. It gets the heaviest test in
 * this change for that reason.
 *
 * A pool opens on the first call that names its tenant: a request, or the
 * outbox, resolution, timers and retention workers, which open every listed
 * tenant at their first tick. Concurrent first calls share one open sequence.
 * The pool stays open until `close`. ponytail: no eviction. A deployment
 * holding more idle tenants than Postgres allows connections needs one, and
 * the entry to add it is `close` below. Nothing measures that today.
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

interface TenantConnections {
  /** The handle for `key`, opening it on first use. Raises `UnknownTenant` or `TenantUnreachable`. */
  handleFor: (key: string) => Promise<SQL>;
  /** Every currently-listed tenant, with its handle. Skips one whose database refuses. */
  live: () => Promise<TenantHandle[]>;
  /** Ends every pool, including one still opening. */
  close: () => Promise<void>;
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
  const pools = new Map<string, Promise<SQL>>();

  /** Lookup, connect and probe. A refused probe ends the pool it opened. */
  async function open(key: string): Promise<SQL> {
    const record = await lookup(key, control);
    if (!record) throw new UnknownTenant(key);
    let db: SQL | undefined;
    try {
      db = connect(record.databaseUrl);
      // Prove the connection before handing it out, so a refused database raises
      // TenantUnreachable now rather than failing inside a route handler that
      // has already begun its work.
      await db`SELECT 1`;
      return db;
    } catch (cause) {
      // The probe already failed, so an error from ending the pool adds nothing.
      try {
        await db?.end();
      } catch {
        // ignored
      }
      throw new TenantUnreachable(key, cause);
    }
  }

  /**
   * Cached by key, and the control-plane row is the only source that fills it.
   * The map holds the promise of the whole open sequence, so concurrent first
   * calls share one pool. A key that resolved once keeps its handle:
   * re-reading the row per request would put a control-plane query in front of
   * every request, and the URL for a live tenant does not change under it.
   * A rejection removes the entry, so the next call retries.
   */
  function handleFor(key: string): Promise<SQL> {
    const held = pools.get(key);
    if (held) return held;
    const opening: Promise<SQL> = open(key).catch((cause) => {
      if (pools.get(key) === opening) pools.delete(key);
      throw cause;
    });
    pools.set(key, opening);
    return opening;
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

  async function close(): Promise<void> {
    const held = [...pools.values()];
    pools.clear();
    const settled = await Promise.allSettled(held);
    // A rejected entry opened no pool that survives, so only fulfilled ones end.
    await Promise.allSettled(settled.map(async (s) => (s.status === "fulfilled" ? s.value.end() : undefined)));
  }

  return { handleFor, live, close };
}
