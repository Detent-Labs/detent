/**
 * Two-phase publish-time validation, shared by the engine's publish path
 * (`publishBody`, `src/engine/definitions.ts`) and the studio's live
 * `runValidation` (`packages/web/src/areas/studio/draft/validation.ts`).
 *
 * `validateStructure` runs first: the Zod gate, the compile pass's duration
 * check and its seven structural checks. It produces the compiled body
 * `validateReferences` requires — the compiled body is the ordering
 * convention that stops a caller running the reference checks before the
 * structure checks. `validateReferences` runs second: the three registry
 * type-resolution checks (plus, when the caller supplies a live registry
 * set, the matching config-validation checks), the single-body CEL check,
 * and the two synchronous cross-body comparison halves
 * (`checkSubprocessChildRefs`, `checkProcessChainingTarget`) against
 * whatever referenced-process bodies the caller has loaded.
 *
 * `validateProcessChaining` and `validateCrossProcess`
 * (`src/engine/definitions.ts`) stay outside this module: both are async and
 * DB-resolving, which neither a browser nor a synchronous caller can run.
 * `publishBody` calls them directly, after this module's own checks, in
 * their existing position. See design.md's chaining-split decision
 * (`openspec/changes/validation-sequence-module/design.md`).
 *
 * Lives at top-level `src/`, not inside `src/schema/`: it imports `Registry`
 * and the CEL library through `engine/registry-check.js` and `cel/check.js`,
 * both of which `definition.ts` must not depend on. `./cel/check` and
 * `./engine/registry-check` already sit outside `schema/` in the exports map
 * for the same reason.
 */

import { ZodError, type ZodIssue } from "zod";
import { authoredProcessBody, type ProcessBody } from "./schema/definition.js";
import { compileProcessBody, DurationValidationError, CompileValidationError, type DurationIssue, type CompileIssue } from "./schema/compile.js";
import {
  validateProcessBody as checkCelExpressions,
  checkSubprocessChildRefs,
  checkProcessChainingTarget,
  type CelIssue,
} from "./cel/check.js";
import {
  resolveType,
  checkConfigOnly,
  collectTypedActionSites,
  collectAssignmentSites,
  collectDataSourceSites,
  type RegistryIssue,
} from "./engine/registry-check.js";
import type { RegistryDescription, Registry, AssignmentRegistry, DataSourceRegistry } from "./engine/registry.js";
import { log } from "./log.js";

export interface StructureValidationResult {
  issues: (CompileIssue | DurationIssue)[];
  zodIssues: ZodIssue[];
  compiled: ProcessBody | undefined;
  discardedError: unknown | undefined;
  dimensions: {
    zod: "ran";
    duration: "ran" | "not-run";
    structural: "ran" | "not-run";
  };
}

/**
 * Runs duration validation, the seven structural checks, then the Zod gate,
 * in that order — `compileProcessBody`'s own order today, preserved exactly,
 * so a multi-violation body still raises the same precedence at publish. See
 * design.md's "Duration and structural checks keep running before the Zod
 * gate" decision for the full reasoning behind every branch below.
 *
 * Never throws for a duration, structural, or Zod issue, nor for a caught,
 * discarded exception. Every one of those is reported in the returned result
 * instead. `authored` is typed `unknown`, not `ProcessBody`: a raw studio
 * Draft can lack `workflow` entirely, and this function's own cheap shape
 * check runs before anything here trusts the input's shape.
 */
export function validateStructure(authored: unknown): StructureValidationResult {
  const zodResult = authoredProcessBody.safeParse(authored);
  const zodIssues: ZodIssue[] = zodResult.success ? [] : zodResult.error.issues;

  let compiled: ProcessBody | undefined;
  let issues: (CompileIssue | DurationIssue)[] = [];
  let discardedError: unknown | undefined;
  let duration: "ran" | "not-run" = "not-run";
  let structural: "ran" | "not-run" = "not-run";

  const shapeOk = Array.isArray((authored as { workflow?: { steps?: unknown } } | null | undefined)?.workflow?.steps);
  if (shapeOk) {
    try {
      compiled = compileProcessBody(authored as ProcessBody);
      duration = "ran";
      structural = "ran";
    } catch (err) {
      if (err instanceof DurationValidationError) {
        issues = err.issues;
        duration = "ran";
      } else if (err instanceof CompileValidationError) {
        issues = err.issues;
        duration = "ran";
        structural = "ran";
      } else if (err instanceof ZodError) {
        // compileProcessBody's own internal authoredProcessBody.parse() call
        // rejected a superRefine-only invariant (initialStep resolution,
        // path.to resolution, etc). The separate, unconditional safeParse
        // above already carries the same issues in zodIssues — no further
        // handling needed here beyond falling through to Zod-only reporting.
      } else if (err instanceof TypeError) {
        // The documented onFire-shape hazard, or any other null/undefined-
        // property access inside validateDurations or the seven structural
        // checks. Logged so the fault leaves a server-side trace once
        // discarded; carried in the result so a caller can recover it.
        log.error("validateStructure: caught TypeError during duration/structural compile", {
          name: err.name,
          message: err.message,
          stack: err.stack,
        });
        discardedError = err;
      } else {
        // Not one of the four tolerated types: an unrelated bug elsewhere in
        // compileProcessBody must not be silently misreported as "only Zod
        // issues".
        throw err;
      }
    }
  }

  // Whenever the separate, unconditional Zod parse rejects the body,
  // duration and structural both report "not-run", regardless of what
  // compileProcessBody itself did — covers both the internal-ZodError
  // fall-through above (issues stays [] there) and the idempotent branch's
  // own success (issues also stays [] there, since nothing was thrown). A
  // DurationValidationError/CompileValidationError outcome populates
  // `issues`, so this narrowing never overrides a real duration/structural
  // verdict.
  if (zodIssues.length > 0 && issues.length === 0) {
    duration = "not-run";
    structural = "not-run";
  }

  return {
    issues,
    zodIssues,
    compiled,
    discardedError,
    dimensions: { zod: "ran", duration, structural },
  };
}

export interface ReferenceValidationInputs {
  registryDescription: RegistryDescription;
  /** Loaded subprocess child bodies, keyed by the subprocess step's own id. */
  loadedChildren: Record<string, ProcessBody>;
  /** Loaded process.start chaining target bodies, keyed by the site's `collect()` loc. */
  targetsByLoc: Record<string, ProcessBody>;
  /** Only `publishBody` supplies this. The studio never holds a live registry, so its calls always omit it. */
  registries?: {
    registry: Registry;
    assignmentRegistry: AssignmentRegistry;
    dataSourceRegistry: DataSourceRegistry;
  };
}

export interface ReferenceValidationResult {
  actionTypeIssues: RegistryIssue[];
  assignmentTypeIssues: RegistryIssue[];
  dataSourceTypeIssues: RegistryIssue[];
  actionConfigIssues: RegistryIssue[];
  assignmentConfigIssues: RegistryIssue[];
  dataSourceConfigIssues: RegistryIssue[];
  celIssues: CelIssue[];
  dimensions: {
    actionType: "ran" | "not-run";
    assignmentType: "ran" | "not-run";
    dataSourceType: "ran" | "not-run";
    registryConfig: "ran" | "not-run";
    cel: "ran" | "not-run";
  };
}

/**
 * Runs the three registry type-resolution checks against
 * `inputs.registryDescription`, the single-body CEL check, and the two
 * synchronous cross-body comparison halves against whatever the caller has
 * loaded. `body` must already be compiled — only `validateStructure`
 * produces one.
 *
 * When `inputs.registries` is supplied (only `publishBody` ever supplies
 * it), also runs the three config-validation checks against those live
 * registries. `dimensions.registryConfig` is one shared flag across all
 * three config arrays: config validation is all-or-nothing per call, since
 * the caller supplies the live registry set as one bundle or not at all.
 *
 * Never calls `validateProcessChaining` or `validateCrossProcess` — both stay
 * async and DB-resolving, and run only inside `publishBody`, after this
 * function.
 */
export function validateReferences(body: ProcessBody, inputs: ReferenceValidationInputs): ReferenceValidationResult {
  const { registryDescription, loadedChildren, targetsByLoc, registries } = inputs;

  const actionSites = collectTypedActionSites(body);
  const assignmentSites = collectAssignmentSites(body);
  const dataSourceSites = collectDataSourceSites(body);

  const actionTypeIssues = resolveType(actionSites, registryDescription.actionTypes, "action");
  const assignmentTypeIssues = resolveType(assignmentSites, registryDescription.assignmentStrategyTypes, "assignment strategy");
  const dataSourceTypeIssues = resolveType(dataSourceSites, registryDescription.dataSourceTypes, "data source");

  let actionConfigIssues: RegistryIssue[] = [];
  let assignmentConfigIssues: RegistryIssue[] = [];
  let dataSourceConfigIssues: RegistryIssue[] = [];
  if (registries) {
    actionConfigIssues = checkConfigOnly(actionSites, (type) => registries.registry.get(type));
    assignmentConfigIssues = checkConfigOnly(assignmentSites, (type) => registries.assignmentRegistry.get(type));
    dataSourceConfigIssues = checkConfigOnly(dataSourceSites, (type) => registries.dataSourceRegistry.get(type));
  }

  const celIssues: CelIssue[] = [...checkCelExpressions(body)];
  body.workflow.steps.forEach((step, stepIndex) => {
    if (step.type !== "subprocess") return;
    const childBody = loadedChildren[step.id];
    if (!childBody) return;
    celIssues.push(...checkSubprocessChildRefs(body, stepIndex, childBody));
  });
  celIssues.push(...checkProcessChainingTarget(body, targetsByLoc));

  return {
    actionTypeIssues,
    assignmentTypeIssues,
    dataSourceTypeIssues,
    actionConfigIssues,
    assignmentConfigIssues,
    dataSourceConfigIssues,
    celIssues,
    dimensions: {
      actionType: "ran",
      assignmentType: "ran",
      dataSourceType: "ran",
      registryConfig: registries ? "ran" : "not-run",
      cel: "ran",
    },
  };
}
