/**
 * host.ts's DATA_RETENTION_DAYS gate: unset skips the sweep silently (the
 * pre-existing default), a positive integer enables it, anything else fails
 * startup outright. No DB is touched here — parseRetentionDays does no I/O,
 * and startEngine's own DB-touching calls (createDefinitionStore,
 * registerSubprocessHandlers) build closures only, never querying until
 * invoked, so the invalid-value case throws before any of that runs.
 */
import { test, expect, afterEach } from "bun:test";
import { parseRetentionDays, startEngine } from "../src/engine/host.js";
import { createRegistry } from "../src/engine/registry.js";

const ORIGINAL = process.env.DATA_RETENTION_DAYS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DATA_RETENTION_DAYS;
  else process.env.DATA_RETENTION_DAYS = ORIGINAL;
});

test("parseRetentionDays returns undefined when unset", () => {
  delete process.env.DATA_RETENTION_DAYS;
  expect(parseRetentionDays()).toBeUndefined();
});

test("parseRetentionDays accepts a positive integer", () => {
  process.env.DATA_RETENTION_DAYS = "30";
  expect(parseRetentionDays()).toBe(30);
});

test.each(["0", "-5", "abc", "1.5"])("parseRetentionDays throws for '%s'", (value) => {
  process.env.DATA_RETENTION_DAYS = value;
  expect(() => parseRetentionDays()).toThrow();
});

test("startEngine throws at startup for an invalid DATA_RETENTION_DAYS, before any worker starts", () => {
  process.env.DATA_RETENTION_DAYS = "not-a-number";
  expect(() => startEngine(undefined, createRegistry())).toThrow();
});
