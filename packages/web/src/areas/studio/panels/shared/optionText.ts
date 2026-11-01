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

/** Step id to the step's plain text (`stepText`), the text a default
 * "Source → Target" way-out label carries. A step with no id takes no entry. */
export function plainStepTextMap(
  steps: readonly DraftStep[],
  contentLocale: string,
  baseLocale: string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of steps) if (s.id !== undefined) map.set(s.id, stepText(s, contentLocale, baseLocale));
  return map;
}

/**
 * Step id to text, the one map every step select and way-out heading reads.
 * A label one step alone carries reads plain. Steps sharing a label each add
 * their steps-rail number, the 1-based draft index: "Review (step 6)". Two
 * or more unnamed steps read "(unnamed step 8)"; a single one keeps
 * "(unnamed step)". A step with no id takes no entry.
 */
export function stepTextMap(
  steps: readonly DraftStep[],
  contentLocale: string,
  baseLocale: string,
): Map<string, string> {
  const unnamed = t("steps.unnamedStep");
  const texts = steps.map((s) => stepText(s, contentLocale, baseLocale));
  const counts = new Map<string, number>();
  for (const text of texts) counts.set(text, (counts.get(text) ?? 0) + 1);
  const map = new Map<string, string>();
  steps.forEach((s, i) => {
    if (s.id === undefined) return;
    const label = texts[i]!;
    const n = String(i + 1);
    if ((counts.get(label) ?? 0) < 2) map.set(s.id, label);
    else if (label === unnamed) map.set(s.id, fill(t("steps.unnamedStepNumbered"), { n }));
    else map.set(s.id, fill(t("options.repeatedStep"), { label, n }));
  });
  return map;
}

/** The heading template filled in one replace pass, so a `{step}` or `$&`
 * inside either value prints as written. */
function heading(pathLabel: string, stepLabel: string): string {
  return t("paths.rowHeading").replace(/\{(path|step)\}/g, (_, k: string) => (k === "path" ? pathLabel : stepLabel));
}

/**
 * A way out's heading: its label, then the target's text from `stepTexts`
 * (step id to text). A label that already ends with the arrow and that text
 * prints alone. A label ending with the target's plain text from
 * `plainTexts`, as a default "Source → Target" label does, takes the
 * numbered text in place of that tail.
 */
export function wayOutHeading(
  path: DraftPath,
  stepTexts: ReadonlyMap<string, string>,
  plainTexts: ReadonlyMap<string, string> = stepTexts,
): string {
  const target = path.to ? stepTexts.get(path.to) : undefined;
  const plain = path.to ? plainTexts.get(path.to) : undefined;
  const named = path.label?.trim() ? path.label : undefined;
  if (named !== undefined && target !== undefined) {
    const label = named.trim();
    const tail = heading("", target);
    if (label.endsWith(tail)) return named;
    const plainTail = plain !== undefined ? heading("", plain) : undefined;
    if (plainTail !== undefined && label.endsWith(plainTail)) return label.slice(0, -plainTail.length) + tail;
  }
  return heading(named ?? t("paths.unnamedPath"), target ?? t("paths.noTargetYet"));
}
