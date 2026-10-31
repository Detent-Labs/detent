import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "./types";
import type { DraftField } from "./fields";
import { isDraftViewField, type DraftViewEntry } from "./view-layout";
import type { EditorIssue } from "./issues";
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

/** One row of the Fields tab's entity rail. `depth` is capped at 1: a group
 * field's children indent once, and anything deeper takes a top-level row
 * instead. The cap is a rail-rendering rule, not a schema one —
 * `FieldDef`'s `group` nesting carries no depth limit and this adds none. */
export interface RailFieldRow {
  id: string;
  /** The field's own `key`, or `""` while the author has not typed one. */
  key: string;
  depth: 0 | 1;
}

/**
 * Depth-first flatten of the field catalog into rail rows, capping indentation
 * at two levels.
 *
 * A field at depth 0 or 1 keeps that depth. A field at depth 2 or deeper takes
 * depth 0, so it relocates to a top-level row rather than indenting further.
 *
 * A field with no `id` is skipped. The id is the rail's React key, the
 * selection, and the base of `fieldCatalogLogic.ts`'s `railEntryId`, and a
 * field without one can serve as none of them.
 */
export function flattenRailFields(fields: DraftField[] | undefined): RailFieldRow[] {
  const rows: RailFieldRow[] = [];
  const walk = (fs: DraftField[], depth: number) => {
    for (const f of fs) {
      if (f.id !== undefined) {
        rows.push({ id: f.id, key: f.key ?? "", depth: depth >= 2 ? 0 : (depth as 0 | 1) });
      }
      if (f.fields) walk(f.fields, depth + 1);
    }
  };
  if (fields) walk(fields, 0);
  return rows;
}

/** How many issues resolved to one specific entity — an entity rail row's own
 * per-entity mark. */
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
