/**
 * `src/engine/ui-strings.ts`: the storage half of the white-label overrides.
 * The nested map `listUiStringOverrides` returns, the upsert, the delete-on-null
 * clear, and the row count the write path's bound reads. DB-backed — skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { listUiStringOverrides, countUiStringOverrides, setUiStringOverride } from "../src/engine/ui-strings.js";

const DB = !!process.env.DATABASE_URL;
const MAX = 100;

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
  await setUiStringOverride("shell", "en", "login.title", "Sign in", "user_admin", MAX, sql);
  await setUiStringOverride("shell", "de", "login.title", "Anmeldung", "user_admin", MAX, sql);
  await setUiStringOverride("app", "en", "tasks.title", "My work", "user_admin", MAX, sql);

  expect(await listUiStringOverrides(sql)).toEqual({
    app: { en: { "tasks.title": "My work" } },
    shell: { de: { "login.title": "Anmeldung" }, en: { "login.title": "Sign in" } },
  });
});

test.skipIf(!DB)("a second write to the same key replaces the value and records the new author", async () => {
  await setUiStringOverride("shell", "en", "login.title", "Sign in", "user_first", MAX, sql);
  await setUiStringOverride("shell", "en", "login.title", "Enter", "user_second", MAX, sql);

  const rows = (await sql`SELECT value, updated_by FROM ui_string_overrides`) as { value: string; updated_by: string }[];
  expect(rows).toEqual([{ value: "Enter", updated_by: "user_second" }]);
  expect(await countUiStringOverrides(sql)).toBe(1);
});

test.skipIf(!DB)("a null value deletes the row rather than blanking it", async () => {
  await setUiStringOverride("shell", "en", "login.title", "Sign in", "user_admin", MAX, sql);
  expect(await setUiStringOverride("shell", "en", "login.title", null, "user_admin", MAX, sql)).toBe("written");

  expect(await listUiStringOverrides(sql)).toEqual({});
  expect(await countUiStringOverrides(sql)).toBe(0);
});

test.skipIf(!DB)("clearing a key that has no row reports that it removed nothing", async () => {
  expect(await setUiStringOverride("shell", "en", "never.stored", null, "user_admin", MAX, sql)).toBe("missing");
  expect(await countUiStringOverrides(sql)).toBe(0);
});

test.skipIf(!DB)("the bound refuses a new key once the table is full, but allows an overwrite and a clear", async () => {
  await setUiStringOverride("shell", "en", "login.title", "Sign in", "user_admin", 1, sql);

  expect(await setUiStringOverride("app", "en", "tasks.title", "My work", "user_admin", 1, sql)).toBe("at-bound");
  expect(await countUiStringOverrides(sql)).toBe(1);

  expect(await setUiStringOverride("shell", "en", "login.title", "Anmeldung", "user_admin", 1, sql)).toBe("written");
  expect(await countUiStringOverrides(sql)).toBe(1);

  expect(await setUiStringOverride("shell", "en", "login.title", null, "user_admin", 1, sql)).toBe("written");
  expect(await countUiStringOverrides(sql)).toBe(0);
});
