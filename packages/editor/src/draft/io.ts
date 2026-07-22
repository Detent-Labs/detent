import { processBody, CANCEL_SINK_STEP_ID, RESERVED_CANCEL_OUTCOME, type ProcessBody } from "workflow-engine/schema";
import { checkDraftShape, type LoadGuardIssue } from "./load-guard";
import type { Draft } from "./types";

/**
 * A `DefinitionVersion` wrapper (`examples/*.json`, anything pulled from the
 * definition store) carries its real content under `.definition`; a raw
 * `ProcessBody` carries it at the top level. Shared by every entry point
 * that accepts either on-disk shape.
 */
function unwrapDefinitionVersion(value: unknown): unknown {
  return value !== null && typeof value === "object" && "definition" in value ? (value as { definition: unknown }).definition : value;
}

/**
 * Inverse of `compileProcessBody`'s (src/schema/compile.ts) sole injection:
 * the engine-owned cancel-sink step and, for a contracted process, the
 * reserved cancellation outcome it appends to `contract.outcomes`. Both are
 * removed together — `processBody`'s own superRefine requires every
 * declared outcome to be reached by a terminal step, so leaving one behind
 * without the other would hand back a Draft that is already one step away
 * from a broken contract. A no-op on a body that was never compiled (e.g.
 * a hand-authored `examples/*.json` fixture), so both cases converge on the
 * same importable Draft.
 */
export function stripReservedCancelIdentity(body: ProcessBody): ProcessBody {
  const steps = body.workflow.steps.filter((s) => s.id !== CANCEL_SINK_STEP_ID);
  const contract = body.contract && { ...body.contract, outcomes: body.contract.outcomes?.filter((o) => o !== RESERVED_CANCEL_OUTCOME) };
  return { ...body, contract, workflow: { ...body.workflow, steps } };
}

export class DraftLoadError extends Error {
  readonly issues: LoadGuardIssue[];

  constructor(issues: LoadGuardIssue[]) {
    super(`draft failed the load guard: ${issues.map((i) => `${i.path || "<root>"}: ${i.message}`).join("; ")}`);
    this.issues = issues;
  }
}

/**
 * Load-time entry point: a generic structural check (load-guard.ts), then a
 * type-level cast — Draft has no independent runtime schema, so there is
 * nothing else to transform (design.md decision 3).
 */
export function parseDraftJson(text: string): Draft {
  const value: unknown = JSON.parse(text);
  const issues = checkDraftShape(value);
  if (issues.length > 0) throw new DraftLoadError(issues);
  return value as Draft;
}

export function stringifyDraft(draft: Draft): string {
  return JSON.stringify(draft, null, 2);
}

/**
 * A locally loaded child process JSON (task 4.7) for cross-process checks
 * (`checkSubprocessChildRefs`). Unlike the Draft being edited, this is a
 * real, complete file, so it's parsed straight through the actual
 * `processBody` schema — no load-guard relaxation needed. Tolerates the same
 * two on-disk shapes the round-trip test found in `examples/`: a published
 * `ProcessVersion` wrapper (body under `.definition`) or a raw, unwrapped
 * body.
 */
export function parseChildProcessJson(text: string): ProcessBody {
  const value: unknown = JSON.parse(text);
  return processBody.parse(unwrapDefinitionVersion(value));
}

/**
 * Import entry point (distinct from `parseDraftJson`'s Draft round-trip):
 * accepts a `DefinitionVersion` wrapper or a raw `ProcessBody`, parses it
 * strictly through the real contract schema — it claims to be a *complete*
 * process, unlike an in-progress Draft — strips the engine-injected cancel
 * identity (see `stripReservedCancelIdentity`), and hands back the result
 * as an editable Draft. Throws the underlying `ZodError`/`SyntaxError` on a
 * file that isn't shaped like a process body at all.
 */
export function parseImportedProcessJson(text: string): Draft {
  const value: unknown = JSON.parse(text);
  const body = processBody.parse(unwrapDefinitionVersion(value));
  return stripReservedCancelIdentity(body) as Draft;
}
