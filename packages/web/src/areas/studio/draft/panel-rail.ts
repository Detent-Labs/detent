import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "./types";
import type { DraftField } from "./fields";
import type { EditorIssue, EntityType } from "./issues";

type DraftStep = DraftOf<Step>;

/** One row of the shared modal's left rail under the Fields view. `depth` is
 * capped at 1: a group field's children indent once, and anything deeper takes
 * a top-level row instead. The cap is a rail-rendering rule, not a schema one —
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
 * The relocation stays visible: the row still carries the field's own key.
 *
 * A field with no `id` is skipped. The id is the rail's React key and the
 * anchor a row scrolls to, and a mid-edit catalog can hold neither.
 */
export function flattenRailFields(fields: DraftField[] | undefined): RailFieldRow[] {
  const rows: RailFieldRow[] = [];
  const walk = (fs: DraftField[], depth: number) => {
    for (const f of fs) {
      if (f.id !== undefined) rows.push({ id: f.id, key: f.key ?? "", depth: depth >= 2 ? 0 : (depth as 0 | 1) });
      if (f.fields) walk(f.fields, depth + 1);
    }
  };
  if (fields) walk(fields, 0);
  return rows;
}

/** How many issues the rail's own view carries. One `EntityType` per view:
 * `field` for Fields, `dataSource` for Data sources, `contract` for Contract. */
export function issueCountForEntityType(issues: readonly EditorIssue[], entityType: EntityType): number {
  return issues.filter((i) => i.entityType === entityType).length;
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
