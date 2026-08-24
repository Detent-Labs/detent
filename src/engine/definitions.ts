/**
 * Definition store: persist published versions and resolve an instance's frozen
 * body from its {processId, version} pin. This is the production backing for the
 * resolution/timer workers' injected `resolveBody`.
 *
 * Publish is immutable and idempotent-on-identical: validate the structure
 * (`validateStructure`, `src/validate.ts`) -> hash -> if a version with that
 * hash exists for the processId return it (no-op), else validate the
 * references (`validateReferences`, same module) and the cross-process/
 * chaining wiring below, assign the next monotonic version and insert. The
 * (process_id, version) PK forbids a body overwrite.
 *
 * Publish is the enforcement point for every check an unbypassable-check
 * criterion places here rather than in `definition.ts` — see
 * `definition-contract`'s placement requirement.
 */

import { SQL } from "bun";
import {
  processBody,
  type ProcessBody,
  type ProcessId,
  type ProcessVersion,
  type LocalizedText,
  type LocaleCode,
} from "../schema/definition.js";
import { DurationValidationError, CompileValidationError } from "../schema/compile.js";
import { definitionHash, contractHash } from "../schema/hash.js";
import { checkSubprocessChildRefs, checkProcessChainingTarget, type CelIssue } from "../cel/check.js";
import { collect, type RegistryIssue } from "./registry-check.js";
import { sql } from "./store.js";
import type { ResolveBody } from "./resolution.js";
import {
  createDefaultAssignmentRegistry,
  describeTypeNames,
  PROCESS_START_ACTION_TYPE,
  type Registry,
  type DataSourceRegistry,
  type AssignmentRegistry,
  type RegistryDescription,
} from "./registry.js";
import { validateStructure, validateReferences } from "../validate.js";
import { ZodError } from "zod";
import { getGroupScopes } from "../auth/groups.js";

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
 * Shared shape for every publish-time registry-validation error: same
 * "every located issue, not just the first" contract, differing only in
 * `name`.
 */
class RegistryValidationErrorBase extends Error {
  constructor(
    readonly issues: RegistryIssue[],
    name: string,
  ) {
    super(issues.map((i) => `${i.loc}: ${i.message} (type '${i.type}')`).join("; "));
    this.name = name;
  }
}

/**
 * A body about to be published carries an action whose `type` is not
 * registered, or whose `config` violates its handler's declared
 * `configSchema`.
 */
export class RegistryValidationError extends RegistryValidationErrorBase {
  constructor(issues: RegistryIssue[]) {
    super(issues, "RegistryValidationError");
  }
}

/**
 * A body about to be published carries a step whose `assignment.strategy.type`
 * is not registered, or whose `config` violates that strategy's declared
 * `configSchema`.
 */
export class AssignmentRegistryValidationError extends RegistryValidationErrorBase {
  constructor(issues: RegistryIssue[]) {
    super(issues, "AssignmentRegistryValidationError");
  }
}

/**
 * A body about to be published carries a data source whose `type` is not
 * registered, or whose `config` violates that type's declared `configSchema`.
 */
export class DataSourceRegistryValidationError extends RegistryValidationErrorBase {
  constructor(issues: RegistryIssue[]) {
    super(issues, "DataSourceRegistryValidationError");
  }
}

function parseBody(raw: unknown): ProcessBody {
  return processBody.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
}

/** One `allowedGroups` entry that does not exist in the groups store, or whose scope does not permit the publishing process. */
export interface GroupScopeIssue {
  groupId: string;
  reason: "not-found" | "scope-mismatch";
}

/**
 * A body about to be published carries an `allowedGroups` entry naming no
 * group in the store, or a `"processes"`-scoped group that does not list this
 * process. Every located issue is retained, matching the other publish-time
 * validation errors' "every issue, not just the first" contract.
 */
export class GroupScopeValidationError extends Error {
  constructor(readonly issues: GroupScopeIssue[]) {
    super(issues.map((i) => `'${i.groupId}': ${i.reason}`).join("; "));
    this.name = "GroupScopeValidationError";
  }
}

/**
 * Publish-time group-scope check (`group-scope-validation`): every entry in
 * the compiled body's `allowedGroups` must name a group the store holds, whose
 * scope permits `processId`. A third DB-resolving check, alongside
 * `validateCrossProcess`/`validateProcessChaining`, at the same placement —
 * after the hash-hit no-op return, using the same per-request `db`.
 */
async function validateGroupScope(body: ProcessBody, processId: ProcessId, db: SQL): Promise<void> {
  const groupIds = body.allowedGroups ?? [];
  if (groupIds.length === 0) return;
  const scopes = await getGroupScopes(groupIds, db);
  const issues: GroupScopeIssue[] = [];
  for (const groupId of groupIds) {
    const scope = scopes.get(groupId);
    if (!scope) {
      issues.push({ groupId, reason: "not-found" });
    } else if (scope.type === "processes" && !scope.processIds.includes(processId)) {
      issues.push({ groupId, reason: "scope-mismatch" });
    }
  }
  if (issues.length > 0) throw new GroupScopeValidationError(issues);
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
 * Publish-time process-chaining check: every `process.start` action must
 * reference a resolvable process, and map only into that process's declared
 * fields. Unlike the subprocess check above, no `contract` is required — a
 * chain target declares none — and the walk covers all five action
 * positions `collect` visits, not one step-level field, since `process.start`
 * is an ordinary action an author may place anywhere.
 *
 * Resolves every site's target first, building `targetsByLoc`, then delegates
 * the field-membership comparison to `checkProcessChainingTarget`
 * (`src/cel/check.ts`) over all of them at once — collecting issues from
 * every site rather than stopping at the first. The thrown message still
 * names only the first collected issue, in `collect()` order, matching
 * today's single-violation reporting.
 */
async function validateProcessChaining(body: ProcessBody, resolvers: { resolveLatest: ResolveLatest }): Promise<void> {
  const sites = collect(body).filter((s) => s.action.type === PROCESS_START_ACTION_TYPE);

  const targetsByLoc: Record<string, ProcessBody> = {};
  for (const { action, loc } of sites) {
    const config = action.config as { processId?: string };
    const target = config.processId ? await resolvers.resolveLatest(config.processId as ProcessId) : undefined;
    if (!target) {
      throw new CrossProcessValidationError(
        `process.start action at '${loc}' references process '${config.processId}' which is not published`,
      );
    }
    targetsByLoc[loc] = target.body;
  }

  const issues = checkProcessChainingTarget(body, targetsByLoc);
  if (issues.length > 0) {
    const first = issues[0];
    throw new CrossProcessValidationError(`process.start action at '${first.loc}': ${first.message}`);
  }
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
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<ProcessVersion> {
  // Structure first: the Zod gate, duration and the nine structural checks,
  // via the module both this function and the studio's live validation
  // share (src/validate.ts). Reconstructed from the result rather than
  // re-running compileProcessBody, at the same precedence it has today:
  // duration beats structural beats a bare ZodError. The fourth branch is
  // the one reachable state the first three leave uncovered — a caught,
  // discarded exception unrelated to any Zod-detectable shape problem,
  // against a body that is otherwise Zod-valid.
  const structure = validateStructure(authoredBody);
  if (!structure.compiled) {
    if (structure.issues.length > 0) {
      if (structure.dimensions.structural === "ran") throw new CompileValidationError(structure.issues);
      throw new DurationValidationError(structure.issues);
    }
    if (structure.zodIssues.length > 0) throw new ZodError(structure.zodIssues);
    throw structure.discardedError;
  }
  const body = structure.compiled;
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

  // New version about to be inserted. Every remaining check runs on the
  // COMPILED body, so a step the compile pass injected is held to the same
  // rule as an authored one, and all of them sit AFTER the hash-hit return
  // above: a re-publish of a body that predates a tightening of any of them
  // stays a no-op rather than becoming an error for a version instances are
  // already pinned to. (Duration and structural validation cannot take this
  // position — they live inside validateStructure, ahead of the hash.)
  //
  // The three registry checks and the single-body CEL check run through
  // validateReferences, the stages src/validate.ts owns for every caller.
  // publishBody supplies no loaded child/chaining bodies here: its own
  // cross-process and chaining verdict comes from the separate,
  // DB-resolving step below, which runs checkSubprocessChildRefs/
  // checkProcessChainingTarget directly on what it resolves.
  const registryDescription: RegistryDescription = {
    actionTypes: describeTypeNames(registry),
    assignmentStrategyTypes: describeTypeNames(assignmentRegistry),
    dataSourceTypes: describeTypeNames(dataSourceRegistry),
  };
  const refs = validateReferences(body, {
    registryDescription,
    loadedChildren: {},
    targetsByLoc: {},
    registries: { registry, assignmentRegistry, dataSourceRegistry },
  });

  // Registry first: an unresolvable action type or an invalid config is a more
  // fundamental defect than a bad guard, and the check is in-process (no DB
  // round-trip, unlike cross-process validation below).
  const registryIssues = [...refs.actionTypeIssues, ...refs.actionConfigIssues];
  if (registryIssues.length > 0) throw new RegistryValidationError(registryIssues);

  // Same placement as the action registry check, immediately alongside it.
  const assignmentIssues = [...refs.assignmentTypeIssues, ...refs.assignmentConfigIssues];
  if (assignmentIssues.length > 0) throw new AssignmentRegistryValidationError(assignmentIssues);

  // Same placement again: in-process, no DB round-trip.
  const dataSourceIssues = [...refs.dataSourceTypeIssues, ...refs.dataSourceConfigIssues];
  if (dataSourceIssues.length > 0) throw new DataSourceRegistryValidationError(dataSourceIssues);

  // Then expressions: also checked in-process, and the issues an author can fix
  // without inspecting another process.
  if (refs.celIssues.length > 0) throw new CelValidationError(refs.celIssues);

  // Then subprocess wiring and process-chaining targets, against the
  // (immutable, already-validated) published processes they reference.
  // Nothing above this point has persisted. One store instance serves both
  // checks, so a process referenced by both a subprocess step and a
  // process.start action resolves from one cache, not two.
  const definitionStore = createDefinitionStore(db);
  await validateCrossProcess(body, definitionStore);
  await validateProcessChaining(body, definitionStore);
  await validateGroupScope(body, processId, db);

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

/** One process's newest published version, with its display metadata — never the body. */
export type ProcessSummary = {
  processId: ProcessId;
  version: number;
  definitionHash: string;
  status: ProcessVersion["status"];
  publishedAt: string;
  key: string;
  label: LocalizedText;
  baseLocale: LocaleCode;
};

/** One published version of a process — never the body. */
export type VersionSummary = {
  version: number;
  definitionHash: string;
  status: ProcessVersion["status"];
  publishedAt: string;
};

/**
 * List every process with at least one published version, each entry
 * describing its newest version. `DISTINCT ON (process_id)` combined with
 * `ORDER BY process_id, version DESC` picks exactly the newest row per
 * process and leaves the result ordered by `processId` in the same pass — no
 * second query, no in-memory re-sort.
 */
export async function listProcesses(db: SQL = sql): Promise<ProcessSummary[]> {
  const rows = (await db`
    SELECT DISTINCT ON (process_id) process_id, version, definition_hash, status, published_at, body
    FROM definitions
    ORDER BY process_id, version DESC
  `) as { process_id: string; version: number; definition_hash: string; status: string; published_at: string; body: unknown }[];
  return rows.map((r) => {
    const body = parseBody(r.body);
    return {
      processId: r.process_id as ProcessId,
      version: Number(r.version),
      definitionHash: r.definition_hash,
      status: r.status as ProcessVersion["status"],
      publishedAt: new Date(r.published_at).toISOString(),
      key: body.key,
      label: body.label,
      baseLocale: body.baseLocale,
    };
  });
}

/**
 * List every published version of one process, oldest first. An unpublished
 * `processId` returns an empty list rather than throwing, matching
 * `resolveLatest`'s own "no rows" behavior.
 */
export async function listVersions(processId: ProcessId, db: SQL = sql): Promise<VersionSummary[]> {
  const rows = (await db`
    SELECT version, definition_hash, status, published_at FROM definitions
    WHERE process_id = ${processId}
    ORDER BY version ASC
  `) as { version: number; definition_hash: string; status: string; published_at: string }[];
  return rows.map((r) => ({
    version: Number(r.version),
    definitionHash: r.definition_hash,
    status: r.status as ProcessVersion["status"],
    publishedAt: new Date(r.published_at).toISOString(),
  }));
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
