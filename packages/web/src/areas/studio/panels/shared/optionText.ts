/**
 * The text a select option or operand prints for a step, a way out or any
 * list of repeated labels. Pure: the callers zip the results with their items.
 */

import type { Path } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";
import type { DraftStep } from "../../draft/createStep";
import { resolveDraftLocalizedText } from "../../draft/localized-text";
import { t } from "../../catalog.js";

type DraftPath = DraftOf<Path>;

/** Fill every `{slot}` in one pass. A function fills each slot, so a `$`
 * pattern or a `{slot}` inside a value prints as written. */
export function fill(template: string, slots: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => slots[k] ?? m);
}

/** A step's label at the content locale, else the base locale, else the
 * unnamed-step placeholder. */
export function stepText(step: DraftStep, contentLocale: string, baseLocale: string): string {
  return resolveDraftLocalizedText(step.label, contentLocale, baseLocale)?.trim() || t("steps.unnamedStep");
}

/**
 * The items' texts in list order. The second and later item sharing a text
 * reads "{label} ({n})", n counting that text's occurrences so far.
 */
export function numberRepeats<T>(items: readonly T[], textOf: (item: T) => string): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const label = textOf(item);
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return n === 1 ? label : fill(t("options.repeatedLabel"), { label, n: String(n) });
  });
}

/**
 * A way out's heading: its label, then the target's text from `stepTexts`
 * (step id to text). One replace pass fills both placeholders, so a label
 * holding `{step}` or `$&` prints as written.
 */
export function wayOutHeading(path: DraftPath, stepTexts: ReadonlyMap<string, string>): string {
  const pathLabel = path.label?.trim() ? path.label : t("paths.unnamedPath");
  const stepLabel = (path.to ? stepTexts.get(path.to) : undefined) ?? t("paths.noTargetYet");
  return t("paths.rowHeading").replace(/\{(path|step)\}/g, (_, k: string) => (k === "path" ? pathLabel : stepLabel));
}
