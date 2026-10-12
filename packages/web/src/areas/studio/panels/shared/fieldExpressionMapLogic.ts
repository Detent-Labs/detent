import type { Expression, FieldId } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";

type Mapping = Partial<Record<FieldId, DraftOf<Expression>>>;

/**
 * What the editor reads off a target field. `DraftField` and a child's input
 * ref both fit. `type` is `unknown` because a plugin-typed `DraftField` carries
 * an envelope object there; the editor compares it to `"group"` only.
 */
export interface MapTargetField {
  id?: string;
  key?: string;
  type?: unknown;
}

export interface MapTarget {
  id: string;
  label: string;
}

export interface RowOption {
  value: string;
  label: string;
  disabled: boolean;
  unlisted: boolean;
}

/** An emptied CEL input keeps its row: the entry stays, with no text. */
export const EMPTY_EXPRESSION: DraftOf<Expression> = { lang: "cel", src: "" };

/** A group has no value of its own, so it is never a target. */
export function targetsOf(fields: readonly MapTargetField[]): MapTarget[] {
  const out: MapTarget[] = [];
  for (const f of fields) {
    if (f.id === undefined || f.type === "group") continue;
    out.push({ id: f.id, label: f.key ?? f.id });
  }
  return out;
}

/**
 * The options of one row's select. A target another row holds is disabled. A
 * stored key outside the targets is appended as an unlisted option, so the
 * select can show it.
 */
export function rowOptions(targets: readonly MapTarget[], usedKeys: readonly string[], rowKey: string): RowOption[] {
  const options: RowOption[] = targets.map((t) => ({
    value: t.id,
    label: t.label,
    disabled: t.id !== rowKey && usedKeys.includes(t.id),
    unlisted: false,
  }));
  if (!targets.some((t) => t.id === rowKey)) {
    options.push({ value: rowKey, label: rowKey, disabled: false, unlisted: true });
  }
  return options;
}

/** The first target no row holds, or `undefined` when none is left. */
export function nextUnusedTarget(fields: readonly MapTargetField[], usedKeys: readonly string[]): string | undefined {
  return targetsOf(fields).find((t) => !usedKeys.includes(t.id))?.id;
}

/** The map after the CEL input of one row changed. An emptied input keeps the row. */
export function editRow(mapping: Mapping | undefined, fieldId: string, expr: DraftOf<Expression> | undefined): Mapping {
  return { ...mapping, [fieldId]: expr ?? EMPTY_EXPRESSION };
}

/** The map without one row. */
export function removeRow(mapping: Mapping | undefined, fieldId: string): Mapping {
  const next = { ...mapping };
  delete next[fieldId as FieldId];
  return next;
}

/**
 * The map after a row changed its target. One computed map, not a remove plus
 * an edit: two calls would each read the same pre-change map and the remove
 * would be lost, duplicating the row under both field ids.
 */
export function moveRow(
  mapping: Mapping | undefined,
  oldFieldId: string,
  newFieldId: string,
  expr: DraftOf<Expression> | undefined,
): Mapping {
  const next = removeRow(mapping, oldFieldId);
  next[newFieldId as FieldId] = expr ?? EMPTY_EXPRESSION;
  return next;
}
