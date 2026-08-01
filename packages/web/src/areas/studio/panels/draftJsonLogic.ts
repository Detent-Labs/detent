import type { Draft } from "../draft/types";
import { checkDraftShape } from "../draft/load-guard";

/**
 * The JSON surface's parse/format boundary (studio-json-view), mirroring
 * `screens/migrationPlanLogic.ts`'s shape. Unlike a `MigrationSpec`, a
 * `Draft` has no remote gate — `replace()` writes straight into client
 * state every panel then destructures — so a successful `JSON.parse` also
 * runs `checkDraftShape` before the result is trusted as a `Draft`.
 */
export type ParsedDraft = { draft: Draft } | { error: string };

/** Never throws. Empty input is an empty draft, not an error — matching parseSpecText's convention. */
export function parseDraftText(text: string): ParsedDraft {
  if (text.trim() === "") return { draft: {} };

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "invalid JSON" };
  }

  const issues = checkDraftShape(value);
  if (issues.length > 0) {
    return { error: issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("\n") };
  }

  return { draft: value as Draft };
}

export function formatDraftText(draft: Draft): string {
  return JSON.stringify(draft, null, 2);
}
