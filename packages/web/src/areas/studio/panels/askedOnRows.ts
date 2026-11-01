/**
 * The field card's "Asked on" rows: one per step whose form holds the field,
 * in draft order (design.md D3). Each row reads the step's own marks as
 * words and its `visible` expression as a sentence. Pure, so the marks and
 * the sentence are testable without a DOM.
 */

import type { Draft } from "../draft/types";
import { isDraftViewField } from "../draft/view-layout";
import { isExpression } from "./shared/overrideMode";
import { buildOperands, readerSentence } from "./shared/conditionLogic";
import { stepText } from "./shared/optionText";

export type AskedOnMark = "required" | "readonly" | "hidden";

export interface AskedOnRow {
  stepId: string;
  /** `stepText`: the step's label, "(unnamed step)" when it has none. */
  stepLabel: string;
  /** `required: true`, `readonly: true` and `visible: false`, in that order.
   * An expression for `required` or `readonly` yields none: the form editor's
   * strip owns those, and the matrix prints them as Condition. */
  marks: AskedOnMark[];
  /** The `visible` expression as a sentence. Absent without one. */
  sentence?: string;
}

export function askedOnRows(draft: Draft, fieldId: string, contentLocale: string): AskedOnRow[] {
  const baseLocale = draft.baseLocale ?? "en";
  const rows: AskedOnRow[] = [];
  let operands: ReturnType<typeof buildOperands> | undefined;
  for (const step of draft.workflow?.steps ?? []) {
    if (step.id === undefined) continue;
    for (const entry of (step.view?.fields ?? []).filter(isDraftViewField)) {
      if (entry.ref !== fieldId) continue;
      const marks: AskedOnMark[] = [];
      if (entry.required === true) marks.push("required");
      if (entry.readonly === true) marks.push("readonly");
      if (entry.visible === false) marks.push("hidden");
      const row: AskedOnRow = { stepId: step.id, stepLabel: stepText(step, contentLocale, baseLocale), marks };
      if (isExpression(entry.visible)) {
        operands ??= buildOperands({ fields: draft.fields, locale: contentLocale, baseLocale });
        row.sentence = readerSentence(entry.visible.src ?? "", operands);
      }
      rows.push(row);
    }
  }
  return rows;
}
