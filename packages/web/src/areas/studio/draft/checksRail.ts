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
  /** Set on the registry group alone, always `true`: the studio holds no
   * live plugin registry, so the config-validation half stays held back for
   * the whole session, independent of `heldBack` — the type-resolution half
   * can read clear or issue-carrying at the same time. */
  registryConfigHeldBack?: boolean;
  /** Set on the structural group alone, always `true`: `checkUnknownKeys`
   * needs the raw authored body, and the studio holds only the Zod-parsed,
   * already-stripped one — independent of `heldBack`, the same shape as
   * `registryConfigHeldBack`. */
  unknownKeysHeldBack?: boolean;
}

/** Per-group held-back state (studio-checks-rail spec, design.md's
 * "Duration and structural checks keep running before the Zod gate"
 * section):
 * - `zod` never holds back — it is the first check and always runs.
 * - `structural` holds back on `dimensions.structural !== "ran"` — a
 *   duration failure, or a Zod-invalid draft, stops `compileProcessBody`
 *   before it ever reaches the structural checks.
 * - `cel`/`registry` hold back when `dimensions.structural !== "ran"`, OR
 *   the structural group's own issue list is non-empty — `dimensions.structural`
 *   alone reads "ran" both when the six structural checks pass cleanly and
 *   when they run and raise a `CompileValidationError`, so the issue-list
 *   check is what tells "compiled cleanly" apart from "ran and failed."
 *   `registry` additionally holds back when `dimensions.actionType !==
 *   "ran"` — the three type-resolution dimensions run together off one
 *   `registryDescription` input, so any one of them stands in for whether
 *   that input has resolved.
 * - `duration`/`view` hold back on `!validation.zodValid` alone —
 *   `validateDurations` and `checkViewFlags` both read the Zod-parsed body
 *   directly, needing no compiled one.
 */
function heldBackFor(
  source: IssueSource,
  validation: Pick<ValidationResult, "zodValid" | "dimensions">,
  structuralIssueCount: number,
): boolean {
  switch (source) {
    case "zod":
      return false;
    case "structural":
      return validation.dimensions.structural !== "ran";
    case "cel":
      return validation.dimensions.structural !== "ran" || structuralIssueCount > 0;
    case "registry":
      return validation.dimensions.structural !== "ran" || structuralIssueCount > 0 || validation.dimensions.actionType !== "ran";
    case "duration":
    case "view":
      return !validation.zodValid;
  }
}

/** The checks rail's one read of `validation`: every source in display
 * order, each carrying its own issues and held-back state. */
export function groupChecksBySource(validation: ValidationResult): CheckGroup[] {
  const structuralIssueCount = validation.issues.filter((i) => i.source === "structural").length;
  return CHECK_SOURCES.map((source) => {
    const group: CheckGroup = {
      source,
      issues: validation.issues.filter((i) => i.source === source),
      heldBack: heldBackFor(source, validation, structuralIssueCount),
    };
    if (source === "registry") group.registryConfigHeldBack = true;
    if (source === "structural") group.unknownKeysHeldBack = true;
    return group;
  });
}

/** Whether the rail has nothing left to report: every group ran, and none of
 * them carries an open issue. `registryConfigHeldBack`/`unknownKeysHeldBack`
 * never factor in — both stay `true` in the studio session on purpose, and
 * neither blocks "all clear" (see `studio-checks-rail`'s "A held-back
 * registry group does not block publish" and "A held-back structural
 * group's unknown-key check does not block publish" scenarios). This no
 * longer tracks publishability alone either: the `view` group's entries
 * never block a publish (they are the studio's own findings, not an engine
 * validator), so a draft can be publishable while this reads false, on a
 * `view`-only entry. */
export function allChecksClear(groups: readonly CheckGroup[]): boolean {
  return groups.every((g) => !g.heldBack && g.issues.length === 0);
}

/** The collapsed checks summary's one read of `groups`: a count, "clear", or
 * "held-back". Held-back outranks a raw sum on purpose — the collapsed-summary
 * requirement (`studio-checks-rail`) forbids a held-back group from reading as
 * clear or as a plain count of zero, the same rule the group-level held-back
 * state already carries into the expanded view. `registryConfigHeldBack`/
 * `unknownKeysHeldBack` are excluded from both checks below, for the same
 * reason `allChecksClear` excludes them: they stay permanently held back for
 * the whole studio session, so folding either in would make this function
 * return `{kind: "held-back"}` for every draft, including one otherwise
 * fully clear. */
export type OpenIssueSummary = { kind: "count"; count: number } | { kind: "clear" } | { kind: "held-back" };

export function totalOpenIssueCount(groups: readonly CheckGroup[]): OpenIssueSummary {
  if (groups.some((g) => g.heldBack)) return { kind: "held-back" };
  const count = groups.reduce((sum, g) => sum + g.issues.length, 0);
  return count === 0 ? { kind: "clear" } : { kind: "count", count };
}
