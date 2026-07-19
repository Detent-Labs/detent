/**
 * Definition store: persist published versions and resolve an instance's frozen
 * body from its {processId, version} pin. This is the production backing for the
 * resolution/timer workers' injected `resolveBody`.
 *
 * Publish is immutable and idempotent-on-identical: compile -> hash -> if a
 * version with that hash exists for the processId return it (no-op), else assign
 * the next monotonic version and insert. The (process_id, version) PK forbids a
 * body overwrite.
 */

import { SQL } from "bun";
import {
  processBody,
  type ProcessBody,
  type ProcessId,
  type ProcessVersion,
} from "../schema/definition.js";
import { compileProcessBody } from "../schema/compile.js";
import { definitionHash } from "../schema/hash.js";
import { sql } from "./store.js";
import type { ResolveBody } from "./resolution.js";

function parseBody(raw: unknown): ProcessBody {
  return processBody.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
}

/**
 * Publish an authored body: compile it (cancel-sink injection), hash the compiled
 * body, and persist it as an immutable version. An identical body already
 * published for this processId is a no-op returning the existing version;
 * otherwise the next monotonic version is assigned.
 *
 * ponytail: MAX(version)+1 is check-then-insert; the (process_id, version) PK is
 * the backstop if two publishes race. v1 publish is not concurrent — a per-process
 * sequence only if that changes.
 */
export async function publishBody(
  processId: ProcessId,
  authoredBody: ProcessBody,
  db: SQL = sql,
): Promise<ProcessVersion> {
  const body = compileProcessBody(authoredBody);
  const hash = definitionHash(body);

  const existing = (await db`SELECT version, definition_hash, status, published_at, body
    FROM definitions WHERE process_id = ${processId} AND definition_hash = ${hash}
    LIMIT 1`) as { version: number; status: string; published_at: string; body: unknown }[];
  if (existing.length > 0) {
    const row = existing[0];
    return {
      processId,
      version: row.version,
      definitionHash: hash,
      status: row.status as ProcessVersion["status"],
      publishedAt: new Date(row.published_at).toISOString(),
      definition: parseBody(row.body),
    };
  }

  const max = (await db`SELECT COALESCE(MAX(version), 0) AS m FROM definitions
    WHERE process_id = ${processId}`) as { m: number }[];
  const version = Number(max[0].m) + 1;
  const status: ProcessVersion["status"] = "published";
  // Bind the object directly so Bun.sql stores a jsonb object (not a scalar string).
  const inserted = (await db`INSERT INTO definitions (process_id, version, definition_hash, status, body)
    VALUES (${processId}, ${version}, ${hash}, ${status}, ${body})
    RETURNING published_at`) as { published_at: string }[];

  return {
    processId,
    version,
    definitionHash: hash,
    status,
    publishedAt: new Date(inserted[0].published_at).toISOString(),
    definition: body,
  };
}

/**
 * A DB-backed `resolveBody` with a process-local cache. Published versions are
 * immutable, so a cached body is never stale and the cache only grows.
 */
export function createDefinitionStore(db: SQL = sql): { resolveBody: ResolveBody } {
  const cache = new Map<string, ProcessBody>();
  const resolveBody: ResolveBody = async (processId, version) => {
    const key = `${processId}:${version}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const rows = (await db`SELECT body FROM definitions
      WHERE process_id = ${processId} AND version = ${version} LIMIT 1`) as { body: unknown }[];
    if (rows.length === 0) return undefined;
    const body = parseBody(rows[0].body);
    cache.set(key, body);
    return body;
  };
  return { resolveBody };
}
