import { authoredProcessBody, type ProcessBody } from "workflow-engine/schema";
import { compileProcessBody, validateDurations, DurationValidationError, CompileValidationError } from "workflow-engine/schema/compile";
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
  /** True iff `compileProcessBody` produced a compiled body (`compiled !==
   * undefined`). False on a Zod-invalid draft, on a duration failure, and on
   * a structural (`CompileValidationError`) failure alike. */
  structurallyValid: boolean;
  /** True iff the six structural checks (`compile.ts::structuralIssues`) ran
   * at all — distinct from `structurallyValid`, which also reads false when
   * they never ran. False on a Zod-invalid draft (nothing past Zod ran) and
   * on a duration failure (`compileProcessBody` raises before reaching
   * `structuralIssues`). True on a `CompileValidationError` (they ran and
   * reported real issues) and when compilation raises nothing (they ran and
   * passed). See design.md's "structural group needs its own 'did it run'
   * flag" decision. */
  structuralChecked: boolean;
}

/**
 * Runs the engine's own, unmodified publish-time validators against the
 * Draft — no second rule set. Zod gates
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
 *
 * KNOWN GAP (harden-publish-validation): `compileProcessBody`'s unknown-key
 * check (`checkUnknownKeys`) can never fire from THIS function. It runs here
 * against `authoredProcessBody.safeParse(draft).data` — already Zod-parsed,
 * which strips undeclared keys before `compileProcessBody` ever sees them —
 * whereas `publishBody` (src/engine/definitions.ts) calls `compileProcessBody`
 * on the raw, un-parsed authored body, which is the only place an unknown key
 * is actually visible. So an unknown key is silently absent from Studio's
 * live validation and surfaces only at the real publish call. The other five
 * structural checks (reserved prefix, pattern, id resolution, field-key
 * format, length bounds) are unaffected — they inspect DECLARED values,
 * which survive the Zod parse intact.
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
        // Zod v4 widened an issue path to `PropertyKey[]`. A JSON body carries
        // no symbol key, so a symbol segment addresses nothing here.
        ...resolveLoc(
          draft,
          issue.path.filter((seg): seg is string | number => typeof seg !== "symbol"),
        ),
        message: issue.message,
        source: "zod",
      })),
      registryChecked: false,
      subprocessStepStatus: {},
      // Nothing past Zod ran for this load; the checks rail's structural,
      // CEL, registry and duration groups all read as held back.
      structurallyValid: false,
      structuralChecked: false,
    };
  }

  const body = parsed.data;
  const issues: EditorIssue[] = [];

  pushIssues(issues, body, validateDurations(body), "duration");

  let compiled: ProcessBody | undefined;
  let structuralChecked = true;
  try {
    compiled = compileProcessBody(body);
  } catch (e) {
    if (e instanceof DurationValidationError) {
      compiled = undefined; // already reported via the direct validateDurations call above
      // compileProcessBody raises here before it ever calls structuralIssues
      // (design.md): the structural checks did not run for this load.
      structuralChecked = false;
    } else if (e instanceof CompileValidationError) {
      // harden-publish-validation: the six write-path structural checks
      // (unknown keys, reserved action prefix, pattern compile/length,
      // outputMapping/contract id resolution, field-key format, length
      // bounds) — reported the same way duration issues are, and for the
      // same reason: a structurally invalid body has no compiled form to run
      // the registry/CEL checks below against.
      pushIssues(issues, body, e.issues, "structural");
      compiled = undefined;
    } else {
      throw e;
    }
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

  return {
    zodValid: true,
    issues,
    registryChecked,
    subprocessStepStatus,
    structurallyValid: compiled !== undefined,
    structuralChecked,
  };
}
