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
import type { Action, DataSourceDef, ProcessBody, Step } from "../schema/definition.js";
import {
  resolve,
  type Registry,
  resolveAssignmentStrategy,
  type AssignmentRegistry,
  resolveDataSource,
  type DataSourceRegistry,
} from "./registry.js";

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

interface TypedSite {
  loc: string;
  type: string;
  config: unknown;
}

/**
 * Shared resolve -> not-registered -> configSchema-safeParse-and-map loop used
 * by checkActionRegistry, checkAssignmentRegistry and checkDataSourceRegistry:
 * only the resolve function and the "not registered" entity label differ
 * between them.
 */
function checkTypedConfig(
  sites: TypedSite[],
  resolveFn: (type: string) => { configSchema?: z.ZodTypeAny } | undefined,
  entityLabel: string,
): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  for (const { loc, type, config } of sites) {
    const def = resolveFn(type);
    if (!def) {
      issues.push({ loc, type, message: `${entityLabel} type '${type}' is not registered` });
      continue;
    }
    if (def.configSchema) {
      const result = def.configSchema.safeParse(config);
      if (!result.success) issues.push(...mapConfigIssues(loc, type, result.error.issues));
    }
  }
  return issues;
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
  const sites = collect(body).map(({ action, loc }) => ({ loc, type: action.type, config: action.config }));
  return checkTypedConfig(sites, (type) => resolve(registry, type), "action");
}

interface AssignmentSite {
  step: Step;
  loc: string;
}

/** Collect every step declaring an `assignment`, with a locating path. */
function collectAssignments(body: ProcessBody): AssignmentSite[] {
  const sites: AssignmentSite[] = [];
  body.workflow.steps.forEach((s, si) => {
    if (s.assignment) sites.push({ step: s, loc: `steps[${si}].assignment` });
  });
  return sites;
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
  const sites = collectAssignments(body)
    .map(({ step, loc }) => ({ loc, type: step.assignment!.strategy.type, config: step.assignment!.strategy.config }));
  return checkTypedConfig(sites, (type) => resolveAssignmentStrategy(assignmentRegistry, type), "assignment strategy");
}

interface DataSourceSite {
  dataSource: DataSourceDef;
  loc: string;
}

/** Collect every declared data source, with a locating path. */
function collectDataSources(body: ProcessBody): DataSourceSite[] {
  return (body.dataSources ?? []).map((dataSource, i) => ({ dataSource, loc: `dataSources[${i}]` }));
}

/**
 * Validate every data source in `body` against `dataSourceRegistry`. Returns
 * every located issue rather than throwing on the first, mirroring
 * `checkActionRegistry`. Unlike that check, there is one collection point
 * (`body.dataSources`), not several action positions to visit.
 */
export function checkDataSourceRegistry(body: ProcessBody, dataSourceRegistry: DataSourceRegistry): RegistryIssue[] {
  const sites = collectDataSources(body)
    .map(({ dataSource, loc }) => ({ loc, type: dataSource.type, config: dataSource.config }));
  return checkTypedConfig(sites, (type) => resolveDataSource(dataSourceRegistry, type), "data source");
}
