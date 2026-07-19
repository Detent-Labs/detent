/** Handler registry: register/resolve. Pure (no DB). */
import { test, expect } from "bun:test";
import { createRegistry, register, resolve, type HandlerDef } from "../src/engine/registry.js";

const def: HandlerDef = { handler: async () => ({ ok: true }) };

test("resolve returns a registered HandlerDef", () => {
  const reg = createRegistry();
  register(reg, "noop", def);
  expect(resolve(reg, "noop")).toBe(def);
});

test("resolve of an unregistered type is undefined (the caller dead-letters it)", () => {
  expect(resolve(createRegistry(), "missing")).toBeUndefined();
});
