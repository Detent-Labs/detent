import type { EditorIssue, IssueSource } from "./issues";
import type { ValidationResult } from "./validation";

/** Group display order: the same order `authoring-invariants.md` runs its
 * checks in — zod first (everything else is held back without it), then the
 * write-path checks in `compileProcessBody`'s own sequence, then `view`
 * last: the studio's own findings, not an engine validator. */
export const CHECK_SOURCES: IssueSource[] = ["zod", "structural", "cel", "registry", "duration", "view"];

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
 * - `cel` holds back on `!structurallyValid` — it runs only against a
 *   compiled body.
 * - `registry` holds back on `!structurallyValid || !registryChecked` — it
 *   too runs only against a compiled body, and additionally stays held back
 *   for the whole studio session: no studio code path ever loads a live
 *   `Registry`, so `registryChecked` reads permanently `false`
 *   (fix-studio-registry-panel-example-mismatch).
 * - `duration` holds back on `!zodValid` alone — `validateDurations` runs
 *   directly against the parsed body, before compilation.
 * - `view` holds back on `!zodValid` alone too — `checkViewFlags` reads the
 *   Zod-parsed body directly and needs no compiled one, the same placement
 *   `duration` takes.
 */
function heldBackFor(
  source: IssueSource,
  validation: Pick<ValidationResult, "zodValid" | "structurallyValid" | "structuralChecked" | "registryChecked">,
): boolean {
  switch (source) {
    case "zod":
      return false;
    case "structural":
      return !validation.zodValid || !validation.structuralChecked;
    case "cel":
      return !validation.zodValid || !validation.structurallyValid;
    case "registry":
      return !validation.zodValid || !validation.structurallyValid || !validation.registryChecked;
    case "duration":
    case "view":
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

/** Whether the rail has nothing left to report: every group but `registry`
 * ran, and none of them carries an open issue. `registry` is excluded before
 * this check runs, not folded into it: it stays permanently held back for
 * the whole studio session (see `heldBackFor`), so folding it in would make
 * this function unable to ever return `true` again, on any draft. This no
 * longer tracks publishability alone either: the `view` group's entries
 * never block a publish (they are the studio's own findings, not an engine
 * validator), so a draft can be publishable while this reads false, on a
 * `view`-only entry. */
export function allChecksClear(groups: readonly CheckGroup[]): boolean {
  return groups.filter((g) => g.source !== "registry").every((g) => !g.heldBack && g.issues.length === 0);
}

/** The collapsed checks summary's one read of `groups`: a count, "clear", or
 * "held-back". Held-back outranks a raw sum on purpose — the collapsed-summary
 * requirement (`studio-checks-rail`) forbids a held-back group from reading as
 * clear or as a plain count of zero, the same rule the group-level held-back
 * state already carries into the expanded view. The `registry` group is
 * excluded from both the held-back check and the sum below, for the same
 * reason `allChecksClear` excludes it: it stays permanently held back for the
 * whole studio session, so folding it in would make this function return
 * `{kind: "held-back"}` for every draft, including one otherwise fully
 * clear. */
export type OpenIssueSummary = { kind: "count"; count: number } | { kind: "clear" } | { kind: "held-back" };

export function totalOpenIssueCount(groups: readonly CheckGroup[]): OpenIssueSummary {
  const counted = groups.filter((g) => g.source !== "registry");
  if (counted.some((g) => g.heldBack)) return { kind: "held-back" };
  const count = counted.reduce((sum, g) => sum + g.issues.length, 0);
  return count === 0 ? { kind: "clear" } : { kind: "count", count };
}
