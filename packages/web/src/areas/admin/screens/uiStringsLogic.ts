import { BUILTIN_CATALOGS, OVERRIDABLE_AREAS } from "../../../i18n/catalogs/index.js";
import type { UiStringOverrideMap } from "../api/types.js";

export { OVERRIDABLE_AREAS };

export interface OverrideRow {
  key: string;
  /** What the shipped catalog says. Always present: the row list comes from the catalog. */
  builtin: string;
  /** What the deployment stored, or `""` when it stored nothing. `""` is never a stored value. */
  stored: string;
}

/**
 * The locales an area actually ships. Studio carries `en` alone, so offering it
 * `de` would list a locale whose catalog does not exist and show an empty
 * table. Derived from the catalog rather than from `UiLocale`, which names
 * every locale the shell supports rather than every locale each area ships.
 */
export function localesOf(area: string): string[] {
  return Object.keys(BUILTIN_CATALOGS[area] ?? {}).sort();
}

/** Every key that area's catalog declares for that locale, with its builtin value and any stored override. */
export function rowsFor(area: string, locale: string, overrides: UiStringOverrideMap): OverrideRow[] {
  const builtins = BUILTIN_CATALOGS[area]?.[locale] ?? {};
  const stored = overrides[area]?.[locale] ?? {};
  return Object.keys(builtins)
    .sort()
    .map((key) => ({ key, builtin: builtins[key]!, stored: stored[key] ?? "" }));
}

/**
 * What a save must send for one row, or `undefined` when the row is unchanged.
 *
 * An emptied input sends `null`, which deletes the row, never `""`. The route
 * refuses an empty string, and a stored one would resolve ahead of the builtin
 * value and render a blank label.
 *
 * Clearing an input that never had an override sends nothing: there is no row
 * to delete, and the request would cost a round trip to learn that.
 */
export function pendingWrite(row: OverrideRow, draft: string): { value: string | null } | undefined {
  const next = draft.trim();
  if (next === row.stored) return undefined;
  if (next === "") return row.stored === "" ? undefined : { value: null };
  return { value: next };
}

/** Every row a save must write, in catalog order. Empty when nothing changed, which is what disables the save action. */
export function pendingWrites(rows: OverrideRow[], drafts: Record<string, string>): { key: string; value: string | null }[] {
  const writes: { key: string; value: string | null }[] = [];
  for (const row of rows) {
    const pending = pendingWrite(row, drafts[row.key] ?? row.stored);
    if (pending) writes.push({ key: row.key, value: pending.value });
  }
  return writes;
}
