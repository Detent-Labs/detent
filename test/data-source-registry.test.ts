/** Data-source registry: a plain Map, and the built-in "static" handler. Pure (no DB). */
import { test, expect } from "bun:test";
import type { SQL } from "bun";
import { createDataSourceRegistry, type DataSourceHandlerDef, type DataSourceContext } from "../src/engine/registry.js";
import { createDefaultDataSourceRegistry } from "../src/engine/host.js";
import { INSTANCE_QUERY_DATA_SOURCE_TYPE } from "../src/engine/instance-query-source.js";
import type { InstanceId, ProcessId, LocaleCode } from "../src/schema/definition.js";

/** The "static" handler reads no database, so this suite stays pure and hands it a stand-in. */
const noDb = (() => Promise.resolve([])) as unknown as SQL;

// `instance` is required on DataSourceContext but "static" ignores it.
const instance: DataSourceContext["instance"] = { id: "inst_stub" as InstanceId, processId: "proc_stub" as ProcessId, data: {}, baseLocale: "en" as LocaleCode };

const def: DataSourceHandlerDef = { resolve: async () => [{ value: "a", label: { en: "A" } }] };

test("a registered DataSourceHandlerDef resolves back out", () => {
  const reg = createDataSourceRegistry();
  reg.set("custom", def);
  expect(reg.get("custom")).toBe(def);
});

test("an unregistered type resolves to undefined", () => {
  expect(createDataSourceRegistry().get("missing")).toBeUndefined();
});

test("the built-in static handler echoes its configured options", async () => {
  const reg = createDefaultDataSourceRegistry();
  const handler = reg.get("static")!;
  const options = [{ value: "us", label: { en: "United States" } }, { value: "ca", label: { en: "Canada" } }];
  const result = await handler.resolve({ config: { options }, db: noDb, instance });
  expect(result).toEqual(options);
});

test("the built-in static handler's configSchema rejects a config missing options", () => {
  const reg = createDefaultDataSourceRegistry();
  const handler = reg.get("static")!;
  const result = handler.configSchema!.safeParse({ notOptions: [] });
  expect(result.success).toBe(false);
});

test("the built-in instance.query handler is registered", () => {
  const reg = createDefaultDataSourceRegistry();
  expect(reg.get(INSTANCE_QUERY_DATA_SOURCE_TYPE)).toBeDefined();
});
