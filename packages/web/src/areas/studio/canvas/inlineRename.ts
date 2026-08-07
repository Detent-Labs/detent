import { mergeLocalizedTextEntry, type DraftLocalizedText } from "../draft/localized-text";

/**
 * A step node's inline rename (task 3.8), committed on blur/Enter. Writes
 * through the same `mergeLocalizedTextEntry` the identity section's
 * `LocalizedTextInput` already calls, so the two routes to `step.label`
 * cannot drift.
 *
 * Returns `undefined` — no mutation — when the trimmed text equals what the
 * content locale already holds. That covers both a no-op commit (blur with
 * nothing typed) and the escape-to-cancel gesture, which restores the
 * original text before triggering the same commit path.
 */
export function inlineRenamePatch(
  currentLabel: DraftLocalizedText,
  contentLocale: string,
  typed: string,
): DraftLocalizedText | undefined {
  const trimmed = typed.trim();
  if (trimmed === (currentLabel?.[contentLocale] ?? "")) return undefined;
  return mergeLocalizedTextEntry(currentLabel, contentLocale, trimmed);
}
