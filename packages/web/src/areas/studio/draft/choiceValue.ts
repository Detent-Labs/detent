import { dedupeKey, deriveKey, shouldAutoDeriveKey } from "./deriveKey";
import type { DraftField } from "./fields";
import { resolveDraftLocalizedText, type DraftLocalizedText } from "./localized-text";

/**
 * A choice's stored value after a name edit, the twin of
 * `fieldCatalogLogic.ts::nextFieldKey` (design.md D2). The value derives from
 * the base-locale name through `deriveKey` and steps past `taken`, the
 * sibling choices' values. A value the prior name derived follows the new
 * name, plain or with the `_<n>` suffix a dedupe adds. So does an empty
 * value, and so does a value under a name that derives nothing. A name that
 * derives nothing (cleared, or only punctuation) never moves the value. A
 * hand-set value under a name that derives something stays.
 *
 * `locked` is the caller's verdict that a published version holds this
 * choice's value. It stops the follow for a non-empty value. An empty value
 * has no publication, so it derives regardless.
 *
 * Returns the derived value, or `undefined` when the value stays.
 */
export function nextChoiceValue(
  currentValue: string,
  priorName: DraftLocalizedText,
  newName: DraftLocalizedText,
  baseLocale: string,
  taken: ReadonlySet<string>,
  locked = false,
): string | undefined {
  if (locked && currentValue !== "") return undefined;
  const priorBase = deriveKey(resolveDraftLocalizedText(priorName, baseLocale, baseLocale) ?? "");
  const newDerived = deriveKey(resolveDraftLocalizedText(newName, baseLocale, baseLocale) ?? "");
  // A name that derives nothing never moves the value, so clearing a name
  // keeps the value and the default that names it.
  if (newDerived === "") return undefined;
  // A value under a name that derives nothing counts as derived: the next
  // name that derives something sets it.
  if (priorBase === "") return dedupeKey(newDerived, taken);
  const priorSuffixed = new RegExp(`^${priorBase}_[0-9]+$`).test(currentValue);
  if (!shouldAutoDeriveKey(currentValue, dedupeKey(priorBase, taken)) && !priorSuffixed) return undefined;
  return dedupeKey(newDerived, taken);
}

/**
 * Rewrites `field.default` from `from` to `to` where it names `from`: a
 * string default that equals it, or for a `list` field the matching member.
 * An expression default and every other default stay. No other reader moves
 * (design.md D2: a guard literal stays).
 */
export function rewriteDefaultValue(field: DraftField, from: string, to: string): void {
  const current: unknown = field.default;
  if (current === from) {
    field.default = to;
  } else if (field.type === "list" && Array.isArray(current) && current.includes(from)) {
    field.default = current.map((member) => (member === from ? to : member));
  }
}

/**
 * The choice-name writer, a `mutate` recipe body: writes `label` onto
 * `field.options[index]`, moves its `value` where `nextChoiceValue` says it
 * follows (stepping past the sibling values), and carries the field's own
 * `default` along with a moved value. `locked` is the card's verdict for this
 * choice (`usePublishedOptionValues()`: loading counts a non-empty value as
 * locked, else the base version's set for the field holds the value).
 * A field with no option at `index` is left alone.
 */
export function applyChoiceName(
  field: DraftField,
  index: number,
  label: DraftLocalizedText,
  baseLocale: string,
  locked: boolean,
): void {
  const option = field.options?.[index];
  if (option === undefined) return;
  const prior = option.value ?? "";
  const taken = new Set((field.options ?? []).flatMap((o, i) => (i === index || !o.value ? [] : [o.value])));
  const next = nextChoiceValue(prior, option.label, label, baseLocale, taken, locked);
  option.label = label as typeof option.label;
  if (next === undefined || next === prior) return;
  option.value = next;
  if (prior !== "") rewriteDefaultValue(field, prior, next);
}
