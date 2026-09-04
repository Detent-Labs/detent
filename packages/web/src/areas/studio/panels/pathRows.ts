/**
 * The Paths view derives one row per path across the whole draft, kept out
 * of React so it can be tested (`studio-app`'s Paths-view requirement).
 *
 * Nothing here mutates, and nothing here reads a locale. Both label values
 * stay `DraftLocalizedText`; `PathsView` resolves them against the draft's
 * own `contentLocale`. That keeps this module's test free of i18n setup.
 */
import type { Path, Step } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftLocalizedText } from "../draft/localized-text";

type DraftStep = DraftOf<Step>;
type DraftPath = DraftOf<Path>;

/**
 * One row of the table. `guardSrc` is present on every trigger, never on
 * `automatic` alone: `definition.ts` puts `guard` on the path beside
 * `trigger`, and `resolveAvailablePaths` evaluates a manual path's guard to
 * decide whether the participant is offered it at all.
 *
 * `targetKey` and `targetLabel` stay undefined when `to` names no step in the
 * draft. A draft is mid-edit and may hold a dangling reference, so the tab
 * falls back to the raw id rather than throwing.
 */
export interface PathRow {
  pathId: string;
  sourceKey: string;
  sourceLabel: DraftLocalizedText;
  targetId: string;
  targetKey: string | undefined;
  targetLabel: DraftLocalizedText;
  trigger: Path["trigger"] | undefined;
  priority: number | undefined;
  guardSrc: string | undefined;
}

/**
 * Rows in the draft's own order: the steps order them first, and each step's
 * own `paths` order orders them inside it. A `Path` carries no back-reference
 * to the step it leaves, so this walk supplies the source for free.
 */
export function pathRows(steps: DraftStep[] | undefined): PathRow[] {
  const list = steps ?? [];
  const byId = new Map(list.filter((s) => s.id !== undefined).map((s) => [s.id as string, s]));
  const rows: PathRow[] = [];
  for (const step of list) {
    for (const path of step.paths ?? []) {
      rows.push(rowFor(step, path, byId));
    }
  }
  return rows;
}

function rowFor(step: DraftStep, path: DraftPath, byId: Map<string, DraftStep>): PathRow {
  const targetId = path.to ?? "";
  const target = byId.get(targetId);
  return {
    pathId: path.id ?? "",
    sourceKey: step.key ?? step.id ?? "",
    sourceLabel: step.label,
    targetId,
    targetKey: target?.key ?? target?.id,
    targetLabel: target?.label,
    trigger: path.trigger,
    priority: path.priority,
    guardSrc: path.guard?.src,
  };
}
