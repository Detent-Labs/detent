import { processBody, type ProcessBody } from "workflow-engine/schema";
import { checkDraftShape, type LoadGuardIssue } from "./load-guard";
import type { Draft } from "./types";

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
  const candidate = value !== null && typeof value === "object" && "definition" in value ? (value as { definition: unknown }).definition : value;
  return processBody.parse(candidate);
}
