import { authoredProcessBody, type ProcessBody } from "workflow-engine/schema";
import { compileProcessBody, validateDurations, DurationValidationError } from "workflow-engine/schema/compile";
import { validateProcessBody, checkSubprocessChildRefs } from "workflow-engine/cel/check";
import { checkActionRegistry } from "workflow-engine/engine/registry-check";
import type { Registry } from "workflow-engine/engine/registry";
import type { Draft } from "./types";
import { resolveLoc, type EditorIssue, type IssueSource } from "./issues";

function pushIssues(
  issues: EditorIssue[],
  body: Draft,
  items: readonly { loc: string; message: string }[],
  source: IssueSource,
): void {
  for (const item of items) {
    issues.push({ ...resolveLoc(body, item.loc), message: item.message, source });
  }
}

export interface ValidationResult {
  zodValid: boolean;
  issues: EditorIssue[];
  /** false = no Registry loaded; every action's registry dimension is "not checked" (never a false pass). */
  registryChecked: boolean;
  /** Per subprocess-type step (keyed by its entity id): whether a child body is loaded to check cross-process refs against. */
  subprocessStepStatus: Record<string, "checked" | "not-checked">;
}

/**
 * Runs the engine's own, unmodified publish-time validators against the
 * Draft — no second rule set (editor-live-validation spec). Zod gates
 * everything else: `validateProcessBody`/`checkActionRegistry`/
 * `validateDurations` are written against a structurally-complete
 * `ProcessBody` (they walk `body.workflow.steps` etc. unconditionally), so
 * running them against a still-incomplete Draft would throw a TypeError,
 * not produce a located issue. A Zod-invalid Draft only ever shows its Zod
 * issues; the CEL/registry/duration/cross-process dimensions all report
 * "not checked" (via an empty result) until the Draft parses.
 *
 * Runs registry/CEL checks against the *compiled* body (mirroring
 * `publishBody`'s own ordering) so a check sees exactly what publish would
 * — including the injected cancel-sink step, per design.md decision 2's
 * reason for exporting `./schema/compile`. The sink is appended at the end
 * of `steps`, so every authored step's index is unchanged and `resolveLoc`
 * is always called against the pre-compile `body` (which has no sink) —
 * safe because the sink carries no CEL/actions, so no issue can ever be
 * rooted there.
 */
export function runValidation(
  draft: Draft,
  registry: Registry | undefined,
  loadedChildren: Record<string, ProcessBody>,
): ValidationResult {
  const parsed = authoredProcessBody.safeParse(draft);

  if (!parsed.success) {
    return {
      zodValid: false,
      issues: parsed.error.issues.map((issue) => ({
        ...resolveLoc(draft, issue.path),
        message: issue.message,
        source: "zod",
      })),
      registryChecked: false,
      subprocessStepStatus: {},
    };
  }

  const body = parsed.data;
  const issues: EditorIssue[] = [];

  pushIssues(issues, body, validateDurations(body), "duration");

  let compiled: ProcessBody | undefined;
  try {
    compiled = compileProcessBody(body);
  } catch (e) {
    if (!(e instanceof DurationValidationError)) throw e;
    compiled = undefined; // already reported via the direct validateDurations call above
  }

  const registryChecked = registry !== undefined;

  if (compiled) {
    if (registry) pushIssues(issues, body, checkActionRegistry(compiled, registry), "registry");
    pushIssues(issues, body, validateProcessBody(compiled), "cel");
  }

  const subprocessStepStatus: Record<string, "checked" | "not-checked"> = {};
  body.workflow.steps.forEach((step, stepIndex) => {
    if (step.type !== "subprocess") return;
    const childBody = loadedChildren[step.id];
    if (!childBody) {
      subprocessStepStatus[step.id] = "not-checked";
      return;
    }
    subprocessStepStatus[step.id] = "checked";
    pushIssues(issues, body, checkSubprocessChildRefs(body, stepIndex, childBody), "cel");
  });

  return { zodValid: true, issues, registryChecked, subprocessStepStatus };
}
