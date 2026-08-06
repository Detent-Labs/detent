/**
 * Per-deployment UI-chrome wording: the storage half of the white-label
 * overrides. Three statements, no query builder, the shape `admin-queries.ts`
 * uses.
 *
 * The engine stores and returns these strings and never reads one. A UI string
 * has no meaning here — `packages/web` owns every key, and the engine cannot
 * name one. That keeps this module inside the headless rule: it is a keyed
 * text store whose keys happen to come from a frontend.
 */

import type { SQL } from "bun";
import { sql } from "./store.js";

/** `area -> locale -> key -> value`. The whole table, in the shape the frontend resolver reads. */
export type UiStringOverrideMap = Record<string, Record<string, Record<string, string>>>;

/**
 * Every stored override as one nested map. No paging and no filter: the write
 * path bounds the table at `MAX_OVERRIDES` rows, so the whole table is the
 * page. The public `GET /ui-strings` route serves this to a caller holding no
 * token, which is why that bound is the read's only defence.
 */
export async function listUiStringOverrides(db: SQL = sql): Promise<UiStringOverrideMap> {
  const rows = await db<{ area: string; locale: string; key: string; value: string }[]>`
    SELECT area, locale, key, value FROM ui_string_overrides ORDER BY area, locale, key
  `;
  const map: UiStringOverrideMap = {};
  for (const row of rows) {
    ((map[row.area] ??= {})[row.locale] ??= {})[row.key] = row.value;
  }
  return map;
}

/** Row count, for the boundary's `MAX_OVERRIDES` check. Separate from the list so the check costs one aggregate, not a full read. */
export async function countUiStringOverrides(db: SQL = sql): Promise<number> {
  const [row] = await db<{ n: string }[]>`SELECT count(*)::text AS n FROM ui_string_overrides`;
  return Number(row?.n ?? 0);
}

/**
 * Upsert one override, or delete it when `value` is `null`.
 *
 * Delete is the clear path on purpose. A stored empty string would resolve
 * ahead of the builtin value — `resolveOverride(...) ?? builtin` does not fall
 * back on `""` — and render a blank label. The route refuses `""` before it
 * reaches here.
 *
 * Returns true when a row was written or removed, false when a delete matched
 * nothing. The caller needs the difference only to avoid counting a no-op
 * clear against the row bound.
 */
export async function setUiStringOverride(
  area: string,
  locale: string,
  key: string,
  value: string | null,
  updatedBy: string,
  db: SQL = sql,
): Promise<boolean> {
  if (value === null) {
    const deleted = await db<{ key: string }[]>`
      DELETE FROM ui_string_overrides
       WHERE area = ${area} AND locale = ${locale} AND key = ${key}
      RETURNING key
    `;
    return deleted.length > 0;
  }
  await db`
    INSERT INTO ui_string_overrides (area, locale, key, value, updated_by, updated_at)
    VALUES (${area}, ${locale}, ${key}, ${value}, ${updatedBy}, now())
    ON CONFLICT (area, locale, key)
    DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;
  return true;
}

/** True when `(area, locale, key)` already has a row, so an upsert adds no row to the count. */
export async function uiStringOverrideExists(area: string, locale: string, key: string, db: SQL = sql): Promise<boolean> {
  const rows = await db<{ key: string }[]>`
    SELECT key FROM ui_string_overrides WHERE area = ${area} AND locale = ${locale} AND key = ${key}
  `;
  return rows.length > 0;
}
