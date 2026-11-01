import type { Expression, FieldId } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";
import type { DraftField } from "../../draft/fields";
import { resolveDraftLocalizedText } from "../../draft/localized-text";
import { t } from "../../catalog.js";
import { numberRepeats } from "./optionText";
import type { TargetRef } from "./useTargetProcessCatalog";

type Mapping = Partial<Record<FieldId, DraftOf<Expression>>>;

/** One option of a row's select: the id the mapping stores and the text it prints. */
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

/** A repeated text takes a count, in list order. */
function numbered(targets: readonly MapTarget[]): MapTarget[] {
  const labels = numberRepeats(targets, (target) => target.label);
  return targets.map((target, i) => ({ id: target.id, label: labels[i] ?? target.label }));
}

/**
 * The calling process's fields as targets, in catalog order. `fields` is the
 * flat catalog (`draftFields`). A group has no value of its own, so it is
 * never a target; a field with no id yet is skipped. A field reads its label
 * at the content locale, else the base locale, else the unnamed-field
 * placeholder.
 */
export function fieldTargets(fields: readonly DraftField[], contentLocale: string, baseLocale: string): MapTarget[] {
  const out: MapTarget[] = [];
  for (const f of fields) {
    if (f.id === undefined || f.type === "group") continue;
    const label = resolveDraftLocalizedText(f.label, contentLocale, baseLocale)?.trim() || t("condition.unnamedField");
    out.push({ id: f.id, label });
  }
  return numbered(out);
}

/**
 * A called process's input fields as targets, in the contract's order. Each
 * ref's label was already resolved in the child's base locale. A contract may
 * name a group, which is never a target.
 */
export function refTargets(refs: readonly TargetRef[]): MapTarget[] {
  return numbered(
    refs.filter((r) => r.type !== "group").map((r) => ({ id: r.id, label: r.label.trim() || t("condition.unnamedField") })),
  );
}

/**
 * The options of one row's select. A target another row holds is disabled. A
 * stored key outside the targets is appended as an option, so the select can
 * show it. The option carries the unlisted mark only when the target list is
 * known; an unknown list says nothing about the key.
 */
export function rowOptions(
  targets: readonly MapTarget[],
  usedKeys: readonly string[],
  rowKey: string,
  targetsKnown = true,
): RowOption[] {
  const options: RowOption[] = targets.map((t) => ({
    value: t.id,
    label: t.label,
    disabled: t.id !== rowKey && usedKeys.includes(t.id),
    unlisted: false,
  }));
  if (!targets.some((t) => t.id === rowKey)) {
    options.push({ value: rowKey, label: rowKey, disabled: false, unlisted: targetsKnown });
  }
  return options;
}

/** The first target no row holds, or `undefined` when none is left. */
export function nextUnusedTarget(targets: readonly MapTarget[], usedKeys: readonly string[]): string | undefined {
  return targets.find((target) => !usedKeys.includes(target.id))?.id;
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
