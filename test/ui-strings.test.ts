/**
 * `src/engine/ui-strings.ts`: the storage half of the white-label overrides.
 * The nested map `listUiStringOverrides` returns, the upsert, the delete-on-null
 * clear, and the row count the write path's bound reads. DB-backed — skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import {
  listUiStringOverrides,
  countUiStringOverrides,
  setUiStringOverride,
  uiStringOverrideExists,
} from "../src/engine/ui-strings.js";

const DB = !!process.env.DATABASE_URL;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE ui_string_overrides`;
});

test.skipIf(!DB)("an empty table lists as an empty map, not as null or an array", async () => {
  expect(await listUiStringOverrides(sql)).toEqual({});
  expect(await countUiStringOverrides(sql)).toBe(0);
});

test.skipIf(!DB)("listUiStringOverrides nests area, then locale, then key", async () => {
  await setUiStringOverride("shell", "en", "login.title", "Sign in", "user_admin", sql);
  await setUiStringOverride("shell", "de", "login.title", "Anmeldung", "user_admin", sql);
  await setUiStringOverride("app", "en", "tasks.title", "My work", "user_admin", sql);

  expect(await listUiStringOverrides(sql)).toEqual({
    app: { en: { "tasks.title": "My work" } },
    shell: { de: { "login.title": "Anmeldung" }, en: { "login.title": "Sign in" } },
  });
});

test.skipIf(!DB)("a second write to the same key replaces the value and records the new author", async () => {
  await setUiStringOverride("shell", "en", "login.title", "Sign in", "user_first", sql);
  await setUiStringOverride("shell", "en", "login.title", "Enter", "user_second", sql);

  const rows = (await sql`SELECT value, updated_by FROM ui_string_overrides`) as { value: string; updated_by: string }[];
  expect(rows).toEqual([{ value: "Enter", updated_by: "user_second" }]);
  expect(await countUiStringOverrides(sql)).toBe(1);
});

test.skipIf(!DB)("a null value deletes the row rather than blanking it", async () => {
  await setUiStringOverride("shell", "en", "login.title", "Sign in", "user_admin", sql);
  expect(await setUiStringOverride("shell", "en", "login.title", null, "user_admin", sql)).toBe(true);

  expect(await listUiStringOverrides(sql)).toEqual({});
  expect(await countUiStringOverrides(sql)).toBe(0);
});

test.skipIf(!DB)("clearing a key that has no row reports that it removed nothing", async () => {
  expect(await setUiStringOverride("shell", "en", "never.stored", null, "user_admin", sql)).toBe(false);
  expect(await countUiStringOverrides(sql)).toBe(0);
});

test.skipIf(!DB)("uiStringOverrideExists distinguishes a stored key from an unstored one", async () => {
  await setUiStringOverride("shell", "en", "login.title", "Sign in", "user_admin", sql);

  expect(await uiStringOverrideExists("shell", "en", "login.title", sql)).toBe(true);
  // Same key, other locale: the primary key is the triple, so this is a different row.
  expect(await uiStringOverrideExists("shell", "de", "login.title", sql)).toBe(false);
  expect(await uiStringOverrideExists("app", "en", "login.title", sql)).toBe(false);
});
