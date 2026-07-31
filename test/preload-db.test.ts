/**
 * test/preload-db.ts's URL derivation. Pure string work, no DB, so nothing
 * skips. The preload itself already ran for this process; importing the module
 * again is a no-op beyond the export.
 */
import { test, expect } from "bun:test";
import { deriveTestDatabaseUrl } from "./preload-db.js";

test("appends _test to the database name", () => {
  expect(deriveTestDatabaseUrl("postgres://postgres:postgres@db:5432/workflow_engine")).toBe(
    "postgres://postgres:postgres@db:5432/workflow_engine_test",
  );
});

test("keeps query parameters", () => {
  expect(deriveTestDatabaseUrl("postgres://u:p@h:5432/app?sslmode=require")).toBe(
    "postgres://u:p@h:5432/app_test?sslmode=require",
  );
});

test("is idempotent on an already-suffixed name", () => {
  const url = "postgres://u:p@h:5432/app_test";
  expect(deriveTestDatabaseUrl(url)).toBe(url);
});

test("keeps a non-default port and credentials", () => {
  expect(deriveTestDatabaseUrl("postgres://alice:secret@127.0.0.1:6543/wf")).toBe(
    "postgres://alice:secret@127.0.0.1:6543/wf_test",
  );
});

test("refuses a URL that names no database", () => {
  // Deriving `/_test` from it would silently invent a database rather than
  // failing where the mistake is.
  expect(() => deriveTestDatabaseUrl("postgres://u:p@h:5432/")).toThrow(/no database name/);
});
