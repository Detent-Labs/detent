import type { UiLocale } from "./locale.js";
import { resolveOverride } from "./overrides.js";

/**
 * The `t()` body four areas wrote identically: look up `key` in `locale`'s
 * catalog, preferring a deployment's stored override. `K` stays a type
 * parameter rather than widening to `string`, so an unknown key stays a
 * compile error instead of resolving to `undefined` at runtime.
 */
export function makeCatalog<K extends string>(area: string, catalog: Record<UiLocale, Record<K, string>>): (locale: UiLocale, key: K) => string {
  return (locale, key) => resolveOverride(area, locale, key) ?? catalog[locale][key];
}
