/**
 * Definition store: persist published versions and resolve an instance's frozen
 * body from its {processId, version} pin. This is the production backing for the
 * resolution/timer workers' injected `resolveBody`.
 *
 * Publish is immutable and idempotent-on-identical: compile -> hash -> if a
 * version with that hash exists for the processId return it (no-op), else
 * validate (action registry, then expressions, then cross-process wiring),
 * assign the next monotonic version and insert. The (process_id, version) PK
 * forbids a body overwrite.
 *
 * Publish is the enforcement point for every check that may tighten over time.
 * `definition.ts` is also the deserializer every read goes through, so a check
 * placed there would make an already-published definition throw on READ and its
 * pinned instances unrehydratable.
 */

import { SQL } from "bun";
import {
  processBody,
  type ProcessBody,
  type ProcessId,
  type ProcessVersion,
} from "../schema/definition.js";
import { compileProcessBody } from "../schema/compile.js";
import { definitionHash, contractHash } from "../schema/hash.js";
import { validateProcessBody, checkSubprocessChildRefs, type CelIssue } from "../cel/check.js";
import { checkActionRegistry, checkAssignmentRegistry, checkDataSourceRegistry, type RegistryIssue } from "./registry-check.js";
import { sql } from "./store.js";
import type { ResolveBody } from "./resolution.js";
import type { Registry, DataSourceRegistry } from "./registry.js";

/** Resolve the newest child version whose contract signature equals `contractRef`. */
export type ResolveLatestByContract = (
  processId: ProcessId,
  contractRef: string,
) => Promise<{ version: number; body: ProcessBody } | undefined>;

/** Resolve the newest published version for a processId, regardless of contract. */
export type ResolveLatest = (processId: ProcessId) => Promise<{ version: number; body: ProcessBody } | undefined>;

/** A subprocess step's wiring is invalid against the child it references. */
export class CrossProcessValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossProcessValidationError";
  }
}

/**
 * A body about to be published carries an expression the engine cannot evaluate.
 * Every located issue is retained, not just the first, so one publish surfaces one
 * publish's worth of fixes.
 */
export class CelValidationError extends Error {
  constructor(readonly issues: CelIssue[]) {
    super(issues.map((i) => `${i.loc}: ${i.message} (${JSON.stringify(i.src)})`).join("; "));
    this.name = "CelValidationError";
  }
}

/**
 * A body about to be published carries an action whose `type` is not
 * registered, or whose `config` violates its handler's declared
 * `configSchema`. Same "every located issue, not just the first" contract as
 * `CelValidationError`.
 */
export class RegistryValidationError extends Error {
  constructor(readonly issues: RegistryIssue[]) {
    super(issues.map((i) => `${i.loc}: ${i.message} (type '${i.type}')`).join("; "));
    this.name = "RegistryValidationError";
  }
}

/**
 * A body about to be published carries a step whose `assignment.strategy.type`
 * is not registered, or whose `config` violates that strategy's declared
 * `configSchema`. Same "every located issue, not just the first" contract as
 * `RegistryValidationError`.
 */
export class AssignmentRegistryValidationError extends Error {
  constructor(readonly issues: RegistryIssue[]) {
    super(issues.map((i) => `${i.loc}: ${i.message} (type '${i.type}')`).join("; "));
    this.name = "AssignmentRegistryValidationError";
  }
}

/**
 * A body about to be published carries a data source whose `type` is not
 * registered, or whose `config` violates that type's declared `configSchema`.
 * Same "every located issue, not just the first" contract as
 * `RegistryValidationError`.
 */
export class DataSourceRegistryValidationError extends Error {
  constructor(readonly issues: RegistryIssue[]) {
    super(issues.map((i) => `${i.loc}: ${i.message} (type '${i.type}')`).join("; "));
    this.name = "DataSourceRegistryValidationError";
  }
}

function parseBody(raw: unknown): ProcessBody {
  return processBody.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
}

/**
 * Publish-time cross-process check: every subprocess step must reference a
 * resolvable, contracted child and map only into that child's declared inputs.
 * Throws before any persist; child-first ordering falls out of resolvability.
 */
async function validateCrossProcess(
  body: ProcessBody,
  resolvers: { resolveBody: ResolveBody; resolveLatestByContract: ResolveLatestByContract },
): Promise<void> {
  // Collected across every subprocess step, then thrown once: matches
  // CelValidationError's contract of surfacing every located issue, not just the
  // first. The inputMapping/resolvability checks above keep their existing
  // early-throw behavior — an unresolvable child makes its output schema
  // unknowable anyway, so that error should surface first regardless.
  const celIssues: CelIssue[] = [];

  for (const [stepIndex, s] of body.workflow.steps.entries()) {
    const spec = s.subprocess;
    if (!spec) continue;

    let child: ProcessBody | undefined;
    if (spec.versionBinding === "pinned") {
      child = await resolvers.resolveBody(spec.processId, spec.pinnedVersion!);
    } else {
      const r = await resolvers.resolveLatestByContract(spec.processId, spec.contractRef!);
      child = r?.body;
    }
    if (!child) {
      const ref = spec.versionBinding === "pinned" ? `version ${spec.pinnedVersion}` : `contractRef ${spec.contractRef}`;
      throw new CrossProcessValidationError(
        `subprocess step '${s.key}' references child '${spec.processId}' (${ref}) which is not published`,
      );
    }
    if (!child.contract) {
      throw new CrossProcessValidationError(
        `subprocess step '${s.key}' references child '${spec.processId}' which declares no contract`,
      );
    }
    const inputs = new Set<string>(child.contract.inputFields ?? []);
    for (const target of Object.keys(spec.inputMapping)) {
      if (!inputs.has(target)) {
        throw new CrossProcessValidationError(
          `subprocess step '${s.key}' maps into child field '${target}', not in child '${spec.processId}' contract.inputFields`,
        );
      }
    }

    celIssues.push(...checkSubprocessChildRefs(body, stepIndex, child));
  }

  if (celIssues.length > 0) throw new CelValidationError(celIssues);
}

/**
 * Publish an authored body: compile it (cancel-sink injection), hash the compiled
 * body, and persist it as an immutable version. An identical body already
 * published for this processId is a no-op returning the existing version;
 * otherwise the body's expressions and subprocess wiring are validated and the
 * next monotonic version is assigned.
 *
 * A body carrying an invalid expression is rejected here rather than at runtime,
 * where the failure is silent and per-instance: a broken guard is total, so it
 * evaluates false forever and parks the instance on a wait-state nothing reports;
 * a broken mapping throws inside outbox delivery, re-invoking the external handler
 * on each retry before dead-lettering and parking the parent. Neither is fixable
 * without a re-publish the pinned instances will not adopt.
 *
 * ponytail: MAX(version)+1 is check-then-insert; the (process_id, version) PK is
 * the backstop if two publishes race. v1 publish is not concurrent — a per-process
 * sequence only if that changes.
 */
export async function publishBody(
  processId: ProcessId,
  authoredBody: ProcessBody,
  registry: Registry,
  dataSourceRegistry: DataSourceRegistry,
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

  // New version about to be inserted. All three remaining checks run on the
  // COMPILED body, so a step the compile pass injected is held to the same rule
  // as an authored one, and all three sit AFTER the hash-hit return above: a
  // re-publish of a body that predates a tightening of any of them stays a
  // no-op rather than becoming an error for a version instances are already
  // pinned to. (Duration validation cannot take this position — it lives inside
  // the compile pass the hash itself derives from.)
  //
  // Registry first: an unresolvable action type or an invalid config is a more
  // fundamental defect than a bad guard, and the check is in-process (no DB
  // round-trip, unlike cross-process validation below).
  const registryIssues = checkActionRegistry(body, registry);
  if (registryIssues.length > 0) throw new RegistryValidationError(registryIssues);

  // Same placement as the action registry check, immediately alongside it.
  const assignmentIssues = checkAssignmentRegistry(body);
  if (assignmentIssues.length > 0) throw new AssignmentRegistryValidationError(assignmentIssues);

  // Same placement again: in-process, no DB round-trip.
  const dataSourceIssues = checkDataSourceRegistry(body, dataSourceRegistry);
  if (dataSourceIssues.length > 0) throw new DataSourceRegistryValidationError(dataSourceIssues);

  // Then expressions: also checked in-process, and the issues an author can fix
  // without inspecting another process.
  const celIssues = validateProcessBody(body);
  if (celIssues.length > 0) throw new CelValidationError(celIssues);

  // Then subprocess wiring, against the (immutable, already-validated) published
  // children. Nothing above this point has persisted.
  await validateCrossProcess(body, createDefinitionStore(db));

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
export function createDefinitionStore(
  db: SQL = sql,
): { resolveBody: ResolveBody; resolveLatestByContract: ResolveLatestByContract; resolveLatest: ResolveLatest } {
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
  // ponytail: hash each candidate's contract on read (newest-first, stop at the
  // first match) rather than storing a contract-hash column — no migration, and
  // v1 has few versions per process. Add a persisted column if this ever scans hot.
  const resolveLatestByContract: ResolveLatestByContract = async (processId, contractRef) => {
    const rows = (await db`SELECT version, body FROM definitions
      WHERE process_id = ${processId} ORDER BY version DESC`) as { version: number; body: unknown }[];
    for (const row of rows) {
      const body = parseBody(row.body);
      if (body.contract && contractHash(body.contract) === contractRef) {
        cache.set(`${processId}:${row.version}`, body);
        return { version: Number(row.version), body };
      }
    }
    return undefined;
  };
  // Newest published version for a processId, no contract filter. Mirrors
  // resolveLatestByContract minus the contractHash check.
  const resolveLatest: ResolveLatest = async (processId) => {
    const rows = (await db`SELECT version, body FROM definitions
      WHERE process_id = ${processId} ORDER BY version DESC LIMIT 1`) as { version: number; body: unknown }[];
    if (rows.length === 0) return undefined;
    const body = parseBody(rows[0].body);
    cache.set(`${processId}:${rows[0].version}`, body);
    return { version: Number(rows[0].version), body };
  };
  return { resolveBody, resolveLatestByContract, resolveLatest };
}
