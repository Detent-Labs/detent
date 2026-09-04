import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "./types";
import type { DraftField } from "./fields";
import { isDraftViewField, type DraftViewEntry } from "./view-layout";
import type { EditorIssue, EntityType, IssueSource } from "./issues";
import type { PanelView } from "../routing";

type DraftStep = DraftOf<Step>;

/**
 * How many entities each process-wide view holds, for the count beside its
 * name. Two rails read it — the panels screen's index rail and the canvas edit
 * rail's Process section — and both showed the same number from their own copy
 * of these three expressions before this lived here.
 *
 * `fields` counts rail rows, not catalog entries: a group field contributes
 * itself and its children, which is what either rail lists.
 *
 * `matrix` counts live cells: every field entry across every step, the same
 * total the field matrix's grid draws one live cell per. A note occupies no
 * cell, so it raises this count by none.
 */
export function panelEntityCounts(draft: {
  fields?: DraftField[];
  dataSources?: unknown[];
  contract?: { outcomes?: unknown[] };
  workflow?: { steps?: { view?: { fields?: DraftViewEntry[] }; paths?: unknown[] }[] };
}): Record<PanelView, number> {
  return {
    fields: flattenRailFields(draft.fields).length,
    dataSources: (draft.dataSources ?? []).length,
    contract: (draft.contract?.outcomes ?? []).length,
    matrix: (draft.workflow?.steps ?? []).reduce(
      (sum, step) => sum + (step.view?.fields?.filter(isDraftViewField).length ?? 0),
      0,
    ),
    // The Changes count is the difference against the base version, which no
    // draft-only expression can produce: it needs a fetch. `ChangesView`
    // reports its own count up to the rail, and 0 stands until that lands.
    changes: 0,
    paths: (draft.workflow?.steps ?? []).reduce((sum, step) => sum + (step.paths?.length ?? 0), 0),
  };
}

/** One row of the panels screen's index rail under the Fields view. `depth` is
 * capped at 1: a group field's children indent once, and anything deeper takes
 * a top-level row instead. The cap is a rail-rendering rule, not a schema one —
 * `FieldDef`'s `group` nesting carries no depth limit and this adds none. */
export interface RailFieldRow {
  id: string;
  /** The field's own `key`, or `""` while the author has not typed one. */
  key: string;
  depth: 0 | 1;
  /** The id of the TOP-LEVEL field this row sits under — equal to `id` for a
   * top-level row. A relocated (depth-2+) row keeps its real ancestor here
   * even though `depth` reads 0, so selecting it opens the group editor that
   * actually contains it. */
  rootId: string;
}

/**
 * Depth-first flatten of the field catalog into rail rows, capping indentation
 * at two levels.
 *
 * A field at depth 0 or 1 keeps that depth. A field at depth 2 or deeper takes
 * depth 0, so it relocates to a top-level row rather than indenting further.
 * The relocation stays visible: the row still carries the field's own key.
 * `rootId` is unaffected by the relocation — it always names the real
 * top-level ancestor.
 *
 * A field with no `id` is skipped. The id is the rail's React key and the
 * anchor a row scrolls to, and a mid-edit catalog can hold neither.
 */
export function flattenRailFields(fields: DraftField[] | undefined): RailFieldRow[] {
  const rows: RailFieldRow[] = [];
  const walk = (fs: DraftField[], depth: number, rootId: string | undefined) => {
    for (const f of fs) {
      const root = rootId ?? f.id;
      if (f.id !== undefined && root !== undefined) {
        rows.push({ id: f.id, key: f.key ?? "", depth: depth >= 2 ? 0 : (depth as 0 | 1), rootId: root });
      }
      if (f.fields) walk(f.fields, depth + 1, root);
    }
  };
  if (fields) walk(fields, 0, undefined);
  return rows;
}

/** How many issues the rail's own view carries. One `EntityType` per view:
 * `field` for Fields, `dataSource` for Data sources, `contract` for Contract. */
export function issueCountForEntityType(issues: readonly EditorIssue[], entityType: EntityType): number {
  return issues.filter((i) => i.entityType === entityType).length;
}

/** The field matrix's own issue count, filtered by `source` rather than
 * `entityType`: `checkViewFlags` issues carry `entityType: "step"`, the same
 * type every other per-step issue (a path's CEL issue, an action's registry
 * issue) already carries, so `issueCountForEntityType` cannot isolate them.
 *
 * Since technical-field-marker, the `view` source also holds
 * `checkUnwrittenTechnicalFields`' finding, which anchors on the field
 * (`entityType: "field"`) rather than a step. This count therefore
 * over-reports by one per such field, with nothing in the grid to point at —
 * an accepted trade-off (design.md Risks). The field catalog's own
 * `issueCountForEntityType` badge surfaces that finding correctly. */
export function issueCountForSource(issues: readonly EditorIssue[], source: IssueSource): number {
  return issues.filter((i) => i.source === source).length;
}

/** How many issues resolved to one specific entity — a rail sub-list row's own
 * per-entity mark, beside `issueCountForEntityType`'s per-view total. */
export function issueCountForEntityId(issues: readonly EditorIssue[], entityId: string): number {
  return issues.filter((i) => i.entityId === entityId).length;
}

/**
 * Every entity id an issue on this step can resolve to: the step's own id, plus
 * the ids of its paths, its timers, and its actions in all five positions
 * (`onEntry`, `onExit`, `onCancel`, each path's `onPath`, each timer's
 * `onFire.actions`).
 *
 * `resolveLoc` returns the DEEPEST entity it finds, so a guard's CEL issue
 * names the path and a timer's duration issue names the timer. A count over the
 * step's own id alone therefore reads zero on a step whose only issues sit in
 * its paths.
 */
export function stepEntityIds(step: DraftStep): string[] {
  const ids: string[] = [];
  const push = (id: string | undefined) => {
    if (id !== undefined) ids.push(id);
  };
  const pushActions = (actions: DraftStep["onEntry"]) => {
    for (const a of actions ?? []) push(a.id);
  };

  push(step.id);
  pushActions(step.onEntry);
  pushActions(step.onExit);
  pushActions(step.onCancel);
  for (const p of step.paths ?? []) {
    push(p.id);
    pushActions(p.onPath);
  }
  for (const timer of step.timers ?? []) {
    push(timer.id);
    pushActions(timer.onFire?.actions);
  }
  return ids;
}

/** One issue count for the selected step as a whole — the step and everything
 * under it. See `stepEntityIds` for why the step's own id is not enough. */
export function stepIssueCount(issues: readonly EditorIssue[], step: DraftStep): number {
  const ids = new Set(stepEntityIds(step));
  return issues.filter((i) => ids.has(i.entityId)).length;
}
