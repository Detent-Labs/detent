import type { ActionId, ProcessBody } from "workflow-engine/schema";
import { validateStructure, validateReferences } from "workflow-engine/validate";
import { collect } from "workflow-engine/engine/registry-check";
import { PROCESS_START_ACTION_TYPE, type RegistryDescription } from "workflow-engine/engine/registry";
import type { Draft } from "./types";
import { resolveLoc, type EditorIssue, type IssueSource } from "./issues";
import { checkViewFlags, checkUnwrittenTechnicalFields } from "./view-flags";

function pushIssues(
  issues: EditorIssue[],
  body: Draft,
  items: readonly { loc: string; message: string }[],
  source: IssueSource,
): void {
  for (const item of items) {
    issues.push({ ...resolveLoc(body, item.loc), message: item.message, source, loc: item.loc });
  }
}

/** A Zod issue's path array in the dotted-and-bracketed form every other
 * validator already reports: a number segment becomes a bracketed index on the
 * segment before it, so `["fields", 0, "validation", "pattern"]` reads
 * `fields[0].validation.pattern`. `resolveLoc` takes either form; a reader
 * placing a check inside an entity needs one form alone. */
function joinLoc(path: readonly (string | number)[]): string {
  return path.reduce<string>((acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc === "" ? seg : `${acc}.${seg}`), "");
}

/** Every dimension `validateStructure`/`validateReferences` report, merged
 * into one record. `zod` always reads "ran" — the safeParse call runs
 * unconditionally. */
export type Dimension =
  | "zod"
  | "duration"
  | "structural"
  | "actionType"
  | "assignmentType"
  | "dataSourceType"
  | "registryConfig"
  | "cel";

export interface ValidationResult {
  zodValid: boolean;
  issues: EditorIssue[];
  dimensions: Record<Dimension, "ran" | "not-run">;
  /** Per subprocess-type step (keyed by its entity id): whether a child body is loaded to check cross-process refs against. */
  subprocessStepStatus: Record<string, "checked" | "not-checked">;
  /** Per `process.start` action site (keyed by the action's own id): whether
   * its chaining target body is loaded to check its inputMapping against. A
   * site absent from this record, or reading "not-checked", never counts as
   * a clear pass in the CEL group. */
  chainingSiteStatus: Record<ActionId, "checked" | "not-checked">;
}

const EMPTY_REGISTRY_DESCRIPTION: RegistryDescription = { actionTypes: [], assignmentStrategyTypes: [], dataSourceTypes: [] };

/**
 * Runs the engine's own, unmodified publish-time validators against the
 * Draft, via the two-phase module both this function and `publishBody`
 * (`src/engine/definitions.ts`) share (`validateStructure`/
 * `validateReferences`, `src/validate.ts`), plus two studio-owned passes,
 * `checkViewFlags` and `checkUnwrittenTechnicalFields`.
 *
 * `validateStructure` runs unconditionally: it owns the Zod gate, duration
 * and the seven structural checks, in that fixed order, and produces the
 * compiled body every check below needs. `checkViewFlags`/
 * `checkUnwrittenTechnicalFields` run once the draft is Zod-valid — never
 * gated on a compiled body existing, so they still report when duration or
 * structural compilation fails.
 *
 * `validateReferences` runs once a compiled body exists, independent of
 * whether `registry` has resolved: the CEL group (the single-body check,
 * subprocess child refs, and process-chaining targets) needs no registry at
 * all. Only the three registry type-resolution issue arrays are gated on
 * `registry` being defined — while it is `undefined` (still loading, or
 * resolved to nothing after a failed fetch), those three dimensions report
 * "not-run" and nothing from that half reaches `issues`, even though
 * `validateReferences` itself still ran (against an empty placeholder
 * description) to produce the CEL results. The studio never holds a live
 * plugin registry, so the config-validation half always reads "not-run".
 */
export function runValidation(
  draft: Draft,
  registry: RegistryDescription | undefined,
  loadedChildren: Record<string, ProcessBody>,
  loadedChainingTargets: Record<ActionId, ProcessBody>,
): ValidationResult {
  const structure = validateStructure(draft);
  const zodValid = structure.zodIssues.length === 0;
  const issues: EditorIssue[] = [];

  for (const issue of structure.zodIssues) {
    // Zod v4 widened an issue path to `PropertyKey[]`. A JSON body carries
    // no symbol key, so a symbol segment addresses nothing here.
    const path = issue.path.filter((seg): seg is string | number => typeof seg !== "symbol");
    issues.push({
      ...resolveLoc(draft, path),
      message: issue.message,
      source: "zod",
      loc: joinLoc(path),
    });
  }

  if (structure.issues.length > 0) {
    // compileProcessBody throws exactly one of DurationValidationError or
    // CompileValidationError, never both — `structure.dimensions.structural`
    // reading "ran" alongside a non-empty issues array is what tells the two
    // apart (structural is only reached once duration has already passed).
    const source: IssueSource = structure.dimensions.structural === "ran" ? "structural" : "duration";
    pushIssues(issues, draft, structure.issues, source);
  }

  if (zodValid) {
    issues.push(...checkViewFlags(draft));
    issues.push(...checkUnwrittenTechnicalFields(draft));
  }

  const subprocessStepStatus: Record<string, "checked" | "not-checked"> = {};
  const chainingSiteStatus: Record<ActionId, "checked" | "not-checked"> = {};

  let dimensions: Record<Dimension, "ran" | "not-run"> = {
    zod: "ran",
    duration: structure.dimensions.duration,
    structural: structure.dimensions.structural,
    actionType: "not-run",
    assignmentType: "not-run",
    dataSourceType: "not-run",
    registryConfig: "not-run",
    cel: "not-run",
  };

  if (structure.compiled) {
    const body = structure.compiled;

    const targetsByLoc: Record<string, ProcessBody> = {};
    for (const site of collect(body).filter((s) => s.action.type === PROCESS_START_ACTION_TYPE)) {
      const target = loadedChainingTargets[site.action.id as ActionId];
      if (target) {
        targetsByLoc[site.loc] = target;
        chainingSiteStatus[site.action.id as ActionId] = "checked";
      } else {
        chainingSiteStatus[site.action.id as ActionId] = "not-checked";
      }
    }

    const refs = validateReferences(body, {
      registryDescription: registry ?? EMPTY_REGISTRY_DESCRIPTION,
      loadedChildren,
      targetsByLoc,
    });

    dimensions = {
      ...dimensions,
      actionType: registry ? refs.dimensions.actionType : "not-run",
      assignmentType: registry ? refs.dimensions.assignmentType : "not-run",
      dataSourceType: registry ? refs.dimensions.dataSourceType : "not-run",
      registryConfig: refs.dimensions.registryConfig,
      cel: refs.dimensions.cel,
    };

    if (registry) {
      pushIssues(issues, draft, refs.actionTypeIssues, "registry");
      pushIssues(issues, draft, refs.assignmentTypeIssues, "registry");
      pushIssues(issues, draft, refs.dataSourceTypeIssues, "registry");
      pushIssues(issues, draft, refs.actionConfigIssues, "registry");
      pushIssues(issues, draft, refs.assignmentConfigIssues, "registry");
      pushIssues(issues, draft, refs.dataSourceConfigIssues, "registry");
    }
    pushIssues(issues, draft, refs.celIssues, "cel");

    body.workflow.steps.forEach((step) => {
      if (step.type !== "subprocess") return;
      subprocessStepStatus[step.id] = loadedChildren[step.id] ? "checked" : "not-checked";
    });
  }

  return {
    zodValid,
    issues,
    dimensions,
    subprocessStepStatus,
    chainingSiteStatus,
  };
}
