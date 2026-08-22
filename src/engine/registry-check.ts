/**
 * Authoring-time registry validation: resolve every action's `type` against the
 * handler `Registry` and, when resolved, check its `config` against the
 * handler's declared `configSchema`. Mirrors `src/cel/check.ts`'s shape (a
 * `collect()` over every action position, then a per-site check, then a batch
 * of located issues) so an unknown handler type or a malformed plugin config is
 * a publish error, not a silent runtime dead-letter.
 *
 * Lives in `src/engine/` (not `src/schema/`) because it needs the `Registry`,
 * which is an engine-owned, in-process concept `definition.ts` must not depend
 * on — the same reason `src/cel/check.ts` stays out of `definition.ts`.
 *
 * `checkAssignmentRegistry` and `checkDataSourceRegistry` below apply the same
 * shape to `Step.assignment.strategy` and to `body.dataSources`, each against
 * its own injected registry.
 */

import { z } from "zod";
import type { Action, ProcessBody } from "../schema/definition.js";
import { type Registry, type AssignmentRegistry, type DataSourceRegistry, describeTypeNames } from "./registry.js";

export interface RegistryIssue {
  loc: string;
  type: string;
  message: string;
}

export interface Site {
  action: Action;
  loc: string;
}

/** Map a failed configSchema parse's Zod issues to located RegistryIssues. */
function mapConfigIssues(loc: string, type: string, zodIssues: z.ZodIssue[]): RegistryIssue[] {
  return zodIssues.map((issue) => {
    const path = issue.path.length > 0 ? `.config.${issue.path.join(".")}` : ".config";
    return { loc: `${loc}${path}`, type, message: issue.message };
  });
}

export interface TypedSite {
  loc: string;
  type: string;
  config: unknown;
}

/**
 * The shared not-registered check every dimension's type-resolution half
 * calls. Reports a `TypedSite` whose `type` is absent from `typeNames`; emits
 * nothing else. `validateReferences` (`src/validate.ts`) calls this directly
 * against a caller-supplied `RegistryDescription`, needing no live registry.
 */
export function resolveType(sites: TypedSite[], typeNames: readonly string[], entityLabel: string): RegistryIssue[] {
  const known = new Set(typeNames);
  const issues: RegistryIssue[] = [];
  for (const { loc, type } of sites) {
    if (!known.has(type)) issues.push({ loc, type, message: `${entityLabel} type '${type}' is not registered` });
  }
  return issues;
}

/**
 * The shared config-only check: validates a site's `config` against its
 * resolved type's `configSchema`, needing a live registry's resolver.
 * Skips a site whose type does not resolve, with no issue of its own —
 * `resolveType` already reports that site, and this emits only
 * `mapConfigIssues` output, which carries no entity label and no
 * "not registered" message.
 */
export function checkConfigOnly(
  sites: TypedSite[],
  resolveFn: (type: string) => { configSchema?: z.ZodTypeAny } | undefined,
): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  for (const { loc, type, config } of sites) {
    const def = resolveFn(type);
    if (!def || !def.configSchema) continue;
    const result = def.configSchema.safeParse(config);
    if (!result.success) issues.push(...mapConfigIssues(loc, type, result.error.issues));
  }
  return issues;
}

/**
 * Shared resolve -> not-registered -> configSchema-safeParse-and-map loop used
 * by checkActionRegistry, checkAssignmentRegistry and checkDataSourceRegistry:
 * composes `resolveType` and `checkConfigOnly` rather than reimplementing
 * either half inline. `checkConfigOnly` already skips a site `resolveType`
 * rejected, so the concatenation needs no separate filtering step.
 */
function checkTypedConfig(
  sites: TypedSite[],
  typeNames: readonly string[],
  resolveFn: (type: string) => { configSchema?: z.ZodTypeAny } | undefined,
  entityLabel: string,
): RegistryIssue[] {
  return [...resolveType(sites, typeNames, entityLabel), ...checkConfigOnly(sites, resolveFn)];
}

/**
 * Collect every Action in the body with a locating path, mirroring
 * src/cel/check.ts's collect(). Exported for `validateProcessChaining`
 * (definitions.ts), which needs the same five-position walk to find every
 * `process.start` action — an author-visible action, unlike `subprocess`,
 * which lives once per step and needs no such walk.
 */
export function collect(body: ProcessBody): Site[] {
  const sites: Site[] = [];
  const push = (actions: readonly Action[] | undefined, loc: string) => {
    (actions ?? []).forEach((a, i) => sites.push({ action: a, loc: `${loc}[${i}]` }));
  };

  body.workflow.steps.forEach((s, si) => {
    const sloc = `steps[${si}]`;
    push(s.onEntry, `${sloc}.onEntry`);
    push(s.onExit, `${sloc}.onExit`);
    push(s.onCancel, `${sloc}.onCancel`);
    (s.paths ?? []).forEach((p, pi) => push(p.onPath, `${sloc}.paths[${pi}].onPath`));
    (s.timers ?? []).forEach((t, ti) => push(t.onFire.actions, `${sloc}.timers[${ti}].onFire.actions`));
  });

  return sites;
}

/**
 * Validate every action in `body` against `registry`. Returns every located
 * issue rather than throwing on the first, so a publish rejection is fixable
 * in one pass (same contract as `validateProcessBody`).
 *
 * No action type is exempt, including one using the reserved `core.` prefix.
 * The previous exemption rested on the premise that such a type "can never be
 * present in an authored body" — falsified by `compileProcessBody`'s
 * idempotent early return, which skipped the only check enforcing it
 * (`harden-publish-validation`). The reserved-prefix ban now runs inside the
 * compile pass itself, ahead of both compile branches
 * (`src/schema/compile.ts::checkReservedActionPrefix`), so a `core.`-prefixed
 * action cannot reach this check from a published body at all; resolving it
 * here anyway, rather than special-casing it away, means a future path that
 * did produce one would be validated instead of waved through. The engine's
 * two internal handlers (`SPAWN_ACTION_TYPE`, `RETURN_ACTION_TYPE`) register
 * with `configSchema`s of their own (`src/engine/subprocess.ts`) for exactly
 * that reason.
 */
export function checkActionRegistry(body: ProcessBody, registry: Registry): RegistryIssue[] {
  const sites = collectTypedActionSites(body);
  return checkTypedConfig(sites, describeTypeNames(registry), (type) => registry.get(type), "action");
}

/**
 * Every action site in `body`, as `TypedSite[]`: `collect()`'s own `Site[]`
 * mapped down to `{loc, type, config}`. Named `collectTypedActionSites`, not
 * `collectActionSites` — `src/schema/compile.ts` already has an unexported,
 * differently-shaped `collectActionSites(body: any): ActionSite[]` used by
 * `checkReservedActionPrefix`, in a different file.
 */
export function collectTypedActionSites(body: ProcessBody): TypedSite[] {
  return collect(body).map(({ action, loc }) => ({ loc, type: action.type, config: action.config }));
}

/**
 * Validate every step's `assignment.strategy` against `assignmentRegistry`,
 * through the same resolve-then-parse loop the action and data-source checks
 * use. A step with no `assignment` is not visited.
 *
 * The reserved `core.` prefix is not exempt here: no internal dispatch reaches
 * an assignment strategy, so a `core.` type is an unknown type like any other.
 */
export function checkAssignmentRegistry(body: ProcessBody, assignmentRegistry: AssignmentRegistry): RegistryIssue[] {
  const sites = collectAssignmentSites(body);
  return checkTypedConfig(sites, describeTypeNames(assignmentRegistry), (type) => assignmentRegistry.get(type), "assignment strategy");
}

/** Every step's `assignment.strategy` in `body` carrying one, as `TypedSite[]`. */
export function collectAssignmentSites(body: ProcessBody): TypedSite[] {
  const sites: TypedSite[] = [];
  body.workflow.steps.forEach((s, si) => {
    if (s.assignment) sites.push({ loc: `steps[${si}].assignment`, type: s.assignment.strategy.type, config: s.assignment.strategy.config });
  });
  return sites;
}

/**
 * Validate every data source in `body` against `dataSourceRegistry`. Returns
 * every located issue rather than throwing on the first, mirroring
 * `checkActionRegistry`. Unlike that check, there is one collection point
 * (`body.dataSources`), not several action positions to visit.
 */
export function checkDataSourceRegistry(body: ProcessBody, dataSourceRegistry: DataSourceRegistry): RegistryIssue[] {
  const sites = collectDataSourceSites(body);
  return checkTypedConfig(sites, describeTypeNames(dataSourceRegistry), (type) => dataSourceRegistry.get(type), "data source");
}

/** Every data source in `body`, as `TypedSite[]`. */
export function collectDataSourceSites(body: ProcessBody): TypedSite[] {
  return (body.dataSources ?? []).map((dataSource, i) => ({
    loc: `dataSources[${i}]`,
    type: dataSource.type,
    config: dataSource.config,
  }));
}
