/**
 * Authoring-time registry validation: checkDataSourceRegistry resolves every
 * declared data source's type against a DataSourceRegistry and checks its
 * config against the handler's declared configSchema. Pure — no DB — mirrors
 * registry-check.test.ts's style.
 */
import { test, expect } from "bun:test";
import { z } from "zod";
import { checkDataSourceRegistry } from "../src/engine/registry-check.js";
import { createDataSourceRegistry, registerDataSource } from "../src/engine/registry.js";
import type { ProcessBody } from "../src/schema/definition.js";

const dataSource = (id: string, type: string, config: Record<string, unknown> = {}) => ({ id, key: id.replace("ds_", ""), type, config });

const bodyWithDataSources = (dataSources: unknown[]): ProcessBody =>
  ({
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [],
    dataSources,
    workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true }] },
  }) as unknown as ProcessBody;

test("a body with an all-registered data source and no config schema passes", () => {
  const reg = createDataSourceRegistry();
  registerDataSource(reg, "static", { resolve: async () => [] });
  const issues = checkDataSourceRegistry(bodyWithDataSources([dataSource("ds_a", "static")]), reg);
  expect(issues.length).toBe(0);
});

test("an unregistered data source type is rejected", () => {
  const reg = createDataSourceRegistry();
  const issues = checkDataSourceRegistry(bodyWithDataSources([dataSource("ds_a", "unknown")]), reg);
  expect(issues.length).toBe(1);
  expect(issues[0]!.loc).toContain("dataSources[0]");
  expect(issues[0]!.type).toBe("unknown");
  expect(issues[0]!.message.toLowerCase()).toContain("not registered");
});

test("a config violating its handler's declared schema is rejected", () => {
  const reg = createDataSourceRegistry();
  registerDataSource(reg, "static", { resolve: async () => [], configSchema: z.object({ options: z.array(z.unknown()) }) });
  const issues = checkDataSourceRegistry(bodyWithDataSources([dataSource("ds_a", "static", { notOptions: [] })]), reg);
  expect(issues.length).toBe(1);
  expect(issues[0]!.type).toBe("static");
});

test("a handler with no declared schema accepts any config", () => {
  const reg = createDataSourceRegistry();
  registerDataSource(reg, "static", { resolve: async () => [] });
  const issues = checkDataSourceRegistry(bodyWithDataSources([dataSource("ds_a", "static", { anything: "goes" })]), reg);
  expect(issues.length).toBe(0);
});

test("an unregistered type is not also checked for a config violation", () => {
  const reg = createDataSourceRegistry();
  const issues = checkDataSourceRegistry(bodyWithDataSources([dataSource("ds_a", "unknown", { bad: true })]), reg);
  expect(issues.length).toBe(1); // just "not registered", no separate config issue
});

test("multiple invalid data sources each produce their own issue, not just the first", () => {
  const reg = createDataSourceRegistry();
  registerDataSource(reg, "static", { resolve: async () => [], configSchema: z.object({ options: z.array(z.unknown()) }) });
  const body = bodyWithDataSources([
    dataSource("ds_a", "static", { notOptions: [] }), // schema violation
    dataSource("ds_b", "unknown"), // unregistered
  ]);
  const issues = checkDataSourceRegistry(body, reg);
  expect(issues.length).toBe(2);
});
