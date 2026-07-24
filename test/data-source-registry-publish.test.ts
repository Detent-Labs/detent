/**
 * checkDataSourceRegistry wired into publishBody: an unresolved data source
 * type or a schema-violating config is a publish error
 * (DataSourceRegistryValidationError), never a runtime one. DB-backed; skips
 * when DATABASE_URL is unset. Mirrors assignment-registry.test.ts's
 * DB-backed section style.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { z } from "zod";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody, DataSourceRegistryValidationError } from "../src/engine/definitions.js";
import { createRegistry } from "../src/engine/registry.js";
import { createDataSourceRegistry, registerDataSource } from "../src/engine/registry.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const PID = "proc_dsregpub" as ProcessId;
const actionReg = createRegistry();

const bodyWithDataSource = (type: string, config: Record<string, unknown> = {}): ProcessBody =>
  ({
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [],
    dataSources: [{ id: "ds_a", key: "a", type, config }],
    workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true }] },
  }) as unknown as ProcessBody;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, definitions`;
});

test.skipIf(!DB)("publish rejects an unregistered data source type and writes no row", async () => {
  const reg = createDataSourceRegistry();
  let caught: unknown;
  try {
    await publishBody(PID, bodyWithDataSource("unknown"), actionReg, reg);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(DataSourceRegistryValidationError);
  expect((caught as InstanceType<typeof DataSourceRegistryValidationError>).issues[0]!.type).toBe("unknown");
  const rows = (await sql`SELECT count(*)::int AS n FROM definitions WHERE process_id = ${PID}`) as { n: number }[];
  expect(rows[0].n).toBe(0);
});

test.skipIf(!DB)("publish rejects a data source config that violates its handler's declared schema", async () => {
  const reg = createDataSourceRegistry();
  registerDataSource(reg, "static", { resolve: async () => [], configSchema: z.object({ options: z.array(z.unknown()) }) });
  let caught: unknown;
  try {
    await publishBody(PID, bodyWithDataSource("static", { notOptions: [] }), actionReg, reg);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(DataSourceRegistryValidationError);
});

test.skipIf(!DB)("publish accepts a data source with a registered type and valid config", async () => {
  const reg = createDataSourceRegistry();
  registerDataSource(reg, "static", { resolve: async () => [], configSchema: z.object({ options: z.array(z.unknown()) }) });
  const v = await publishBody(PID, bodyWithDataSource("static", { options: [] }), actionReg, reg);
  expect(v.version).toBe(1);
});

test.skipIf(!DB)("an identical re-publish of an already-stored body stays a no-op without invoking the check", async () => {
  const reg = createDataSourceRegistry();
  registerDataSource(reg, "static", { resolve: async () => [], configSchema: z.object({ options: z.array(z.unknown()) }) });
  const body = bodyWithDataSource("static", { options: [] });
  const v1 = await publishBody(PID, body, actionReg, reg);
  const v2 = await publishBody(PID, body, actionReg, reg);
  expect(v2.version).toBe(v1.version);
  const rows = (await sql`SELECT count(*)::int AS n FROM definitions WHERE process_id = ${PID}`) as { n: number }[];
  expect(rows[0].n).toBe(1);
});

test.skipIf(!DB)("a rejected data-source-registry publish consumes no version number", async () => {
  const emptyReg = createDataSourceRegistry();
  try {
    await publishBody(PID, bodyWithDataSource("unknown"), actionReg, emptyReg);
  } catch {
    // expected
  }
  const withStatic = createDataSourceRegistry();
  registerDataSource(withStatic, "static", { resolve: async () => [] });
  const v = await publishBody(PID, bodyWithDataSource("static", { options: [] }), actionReg, withStatic);
  expect(v.version).toBe(1); // not 2 — the rejected publish reserved nothing
});
