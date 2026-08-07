import type { EditorIssue, IssueSource } from "./issues";
import type { ValidationResult } from "./validation";

/** Group display order: the same order `authoring-invariants.md` runs its
 * checks in — zod first (everything else is held back without it), then the
 * write-path checks in `compileProcessBody`'s own sequence. */
export const CHECK_SOURCES: IssueSource[] = ["zod", "structural", "cel", "registry", "duration"];

export interface CheckGroup {
  source: IssueSource;
  issues: EditorIssue[];
  /** True when this group's checks did not run for the loaded draft — never
   * "empty" and never "passing". See `studio-checks-rail`'s "held-back
   * state" requirement. */
  heldBack: boolean;
}

/** Per-group held-back state (studio-checks-rail spec, design.md's
 * "structural group needs its own 'did it run' flag" decision):
 * - `zod` never holds back — it is the first check and always runs.
 * - `structural` holds back on `!structuralChecked`, not `!zodValid` alone:
 *   a Zod-valid, duration-failing draft never reaches `structuralIssues`.
 * - `cel`/`registry` hold back on `!structurallyValid` — they run only
 *   against a compiled body.
 * - `duration` holds back on `!zodValid` alone — `validateDurations` runs
 *   directly against the parsed body, before compilation.
 */
function heldBackFor(source: IssueSource, validation: Pick<ValidationResult, "zodValid" | "structurallyValid" | "structuralChecked">): boolean {
  switch (source) {
    case "zod":
      return false;
    case "structural":
      return !validation.zodValid || !validation.structuralChecked;
    case "cel":
    case "registry":
      return !validation.zodValid || !validation.structurallyValid;
    case "duration":
      return !validation.zodValid;
  }
}

/** The checks rail's one read of `validation`: every source in display
 * order, each carrying its own issues and held-back state. */
export function groupChecksBySource(validation: ValidationResult): CheckGroup[] {
  return CHECK_SOURCES.map((source) => ({
    source,
    issues: validation.issues.filter((i) => i.source === source),
    heldBack: heldBackFor(source, validation),
  }));
}

/** Whether the rail has nothing left to report: every group ran, and none
 * carries an open issue. An author can publish once this is true. */
export function allChecksClear(groups: readonly CheckGroup[]): boolean {
  return groups.every((g) => !g.heldBack && g.issues.length === 0);
}
