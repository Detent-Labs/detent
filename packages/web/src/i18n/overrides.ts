import { API_BASE } from "../api/client.js";

/**
 * Per-deployment UI-chrome wording, fetched once and consulted by every `t()`.
 *
 * A module-level map rather than React state, on purpose. Threading a fetched
 * map through every `t(locale, key)` call site would touch hundreds of them.
 * The cost of that choice is that React does not observe this map, so
 * `setUiStringOverrides` schedules no re-render. Whatever it holds must be in
 * place before the first render — see `main.tsx`, which awaits
 * `loadUiStringOverrides` before `createRoot(...).render()`.
 */
export type UiStringOverrideMap = Record<string, Record<string, Record<string, string>>>;

let overrides: UiStringOverrideMap = {};

export function setUiStringOverrides(map: UiStringOverrideMap): void {
  overrides = map;
}

/**
 * The override for one key, or `undefined` when none is stored. Total: an
 * absent area and an absent locale both answer `undefined` rather than throw,
 * so a `t()` reading a key no deployment has ever overridden costs two optional
 * lookups.
 *
 * It never answers `""`. The write route refuses an empty value, because
 * `resolveOverride(...) ?? builtin` does not fall back on one and would render
 * a blank label.
 */
export function resolveOverride(area: string, locale: string, key: string): string | undefined {
  return overrides[area]?.[locale]?.[key];
}

/**
 * Fetch every override and install it. Unauthenticated: the login screen
 * renders before a token exists, and its own wording must be overridable.
 *
 * Swallows every failure. A deployment whose engine is briefly unreachable must
 * still reach its login screen, and wording counts for little against that. The
 * map then stays empty and every screen renders its builtin value.
 */
export async function loadUiStringOverrides(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/ui-strings`);
    if (!res.ok) return;
    const body = (await res.json()) as { overrides?: unknown };
    if (body.overrides && typeof body.overrides === "object") {
      setUiStringOverrides(body.overrides as UiStringOverrideMap);
    }
  } catch {
    // network failure or malformed body — builtin wording stands
  }
}
