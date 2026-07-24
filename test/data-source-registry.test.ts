/** Data-source registry: register/resolve, and the built-in "static" handler. Pure (no DB). */
import { test, expect } from "bun:test";
import { createDataSourceRegistry, registerDataSource, resolveDataSource, type DataSourceHandlerDef } from "../src/engine/registry.js";
import { createDefaultDataSourceRegistry } from "../src/engine/host.js";

const def: DataSourceHandlerDef = { resolve: async () => [{ value: "a", label: { en: "A" } }] };

test("resolveDataSource returns a registered DataSourceHandlerDef", () => {
  const reg = createDataSourceRegistry();
  registerDataSource(reg, "custom", def);
  expect(resolveDataSource(reg, "custom")).toBe(def);
});

test("resolveDataSource of an unregistered type is undefined", () => {
  expect(resolveDataSource(createDataSourceRegistry(), "missing")).toBeUndefined();
});

test("the built-in static handler echoes its configured options", async () => {
  const reg = createDefaultDataSourceRegistry();
  const handler = resolveDataSource(reg, "static")!;
  const options = [{ value: "us", label: { en: "United States" } }, { value: "ca", label: { en: "Canada" } }];
  const result = await handler.resolve({ config: { options } });
  expect(result).toEqual(options);
});

test("the built-in static handler's configSchema rejects a config missing options", () => {
  const reg = createDefaultDataSourceRegistry();
  const handler = resolveDataSource(reg, "static")!;
  const result = handler.configSchema!.safeParse({ notOptions: [] });
  expect(result.success).toBe(false);
});
