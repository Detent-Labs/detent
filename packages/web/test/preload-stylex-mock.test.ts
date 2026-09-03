import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The real `@stylexjs/stylex` types describe the compiler's shape, not the
 * `test/preload-stylex.ts` stub's. `mock.module` swaps the runtime module,
 * never the static type, so these tests read the import through the stub's
 * own shape instead of the package's declared one.
 */
interface StylexStub {
  create<T extends Record<string, unknown>>(styles: T): { [K in keyof T]: K };
  defineVars<T extends Record<string, unknown>>(vars: T): { [K in keyof T]: K };
  props(...classNames: string[]): { className: string };
  defaultMarker(value?: unknown): unknown;
}

async function loadStub(): Promise<StylexStub> {
  return (await import("@stylexjs/stylex")) as unknown as StylexStub;
}

test("the stub compiles a style block to its own key", async () => {
  const stylex = await loadStub();
  const styles = stylex.create({ header: { display: "flex" }, tab: { fontSize: 11 } });
  expect(styles).toEqual({ header: "header", tab: "tab" });
});

test("the stub compiles tokens to their own key", async () => {
  const stylex = await loadStub();
  const colors = stylex.defineVars({ accent: "var(--color-accent)", border: "var(--color-border)" });
  expect(colors).toEqual({ accent: "accent", border: "border" });
});

test("the stub joins the class names its arguments carry", async () => {
  const stylex = await loadStub();
  expect(stylex.props("header")).toEqual({ className: "header" });
  expect(stylex.props("header", "tab")).toEqual({ className: "header tab" });
});

test("the stub's defaultMarker is an identity no-op", async () => {
  const stylex = await loadStub();
  expect(stylex.defaultMarker("nowrap")).toBe("nowrap");
  expect(stylex.defaultMarker()).toBeUndefined();
});

test("the preload imports only bun:test", () => {
  const preloadPath = fileURLToPath(new URL("../../../test/preload-stylex.ts", import.meta.url));
  const source = readFileSync(preloadPath, "utf8");
  const imports = [...source.matchAll(/^import .*$/gm)];
  expect(imports).toHaveLength(1);
  expect(imports[0][0]).toContain('"bun:test"');
});
