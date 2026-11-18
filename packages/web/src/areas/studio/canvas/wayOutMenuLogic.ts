import { t } from "../catalog.js";

/** One entry of the way-out menu: a step to lead to, the rule between the
 * steps and the new step, or the new step itself. */
export type WayOutMenuItem = { kind: "step"; stepId: string; text: string } | { kind: "separator" } | { kind: "newStep"; text: string };

/**
 * The way-out menu's entries: every step a connect drop can reach, in draft
 * order and by the text its node prints, then a separator, then "A new step".
 * The source stands in the list, as a drop on itself adds a way out back to
 * it. A step with no id and a step in `hidden` stay out, as a drop hit-tests
 * the visible nodes alone.
 */
export function wayOutMenuItems(
  steps: ReadonlyArray<{ id?: string | undefined }>,
  hidden: ReadonlySet<string>,
  texts: ReadonlyMap<string, string>,
): WayOutMenuItem[] {
  const items: WayOutMenuItem[] = [];
  for (const step of steps) {
    if (!step.id || hidden.has(step.id)) continue;
    items.push({ kind: "step", stepId: step.id, text: texts.get(step.id) ?? t("steps.unnamedStep") });
  }
  items.push({ kind: "separator" }, { kind: "newStep", text: t("canvas.wayOutMenuNewStep") });
  return items;
}

/** The next item after `from` whose text starts with `letter`, compared
 * case-insensitively. Wraps past the end and skips the separator. */
export function typeAheadIndex(items: readonly WayOutMenuItem[], from: number, letter: string): number | undefined {
  const wanted = letter.toLowerCase();
  for (let step = 1; step <= items.length; step++) {
    const index = (from + step) % items.length;
    const item = items[index]!;
    if (item.kind !== "separator" && item.text.toLowerCase().startsWith(wanted)) return index;
  }
  return undefined;
}

/** The index the menu's focus moves to on `key`: Down and Up step and wrap,
 * Home and End reach either end. Each skips the separator. `undefined` for any
 * other key. */
export function menuKeyTarget(key: string, index: number, items: readonly WayOutMenuItem[]): number | undefined {
  const n = items.length;
  const walk = (start: number, delta: 1 | -1): number => {
    for (let i = 0, at = start; i < n; i++, at = (at + delta + n) % n) if (items[at]!.kind !== "separator") return at;
    return index;
  };
  if (n === 0) return undefined;
  switch (key) {
    case "ArrowDown":
      return walk((index + 1) % n, 1);
    case "ArrowUp":
      return walk((index - 1 + n) % n, -1);
    case "Home":
      return walk(0, 1);
    case "End":
      return walk(n - 1, -1);
    default:
      return undefined;
  }
}
