/**
 * The reporting area's structural boundaries, asserted rather than left to
 * review: it does not consume the shared step-form renderer, it does not reach
 * the authoring entry points, and it reaches the engine only over the reporting
 * routes.
 *
 * The first check used to read `packages/reporting/package.json`. One manifest
 * now serves every area and the app area genuinely needs `form-ui`, so absence
 * is asserted over this area's own imports instead.
 *
 * These are canaries. All hold today by construction; the test is what fails
 * when a later change wires in `form-ui` or calls a route outside the prefix.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "bun:test";

const AREA = new URL("../src/areas/reporting/", import.meta.url).pathname;

const manifest = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as {
  dependencies: Record<string, string>;
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sources = walk(AREA).filter((f) => /\.tsx?$/.test(f));
const importsOf = (file: string) => [...readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);
const clientSource = readFileSync(join(AREA, "api/client.ts"), "utf8");

test("the shared step-form renderer is absent from this area's imports", () => {
  for (const file of sources) {
    expect(importsOf(file).filter((s) => s === "form-ui" || s.startsWith("form-ui/")), file).toEqual([]);
  }
});

test("the engine package is a declared dependency, since the types are imported from it", () => {
  expect(manifest.dependencies["workflow-engine"]).toBeDefined();
});

test("the authoring entry points stay out of this area", () => {
  const forbidden = ["workflow-engine/schema/compile", "workflow-engine/cel/check", "workflow-engine/engine/registry-check"];
  for (const file of sources) {
    expect(importsOf(file).filter((s) => forbidden.includes(s)), file).toEqual([]);
  }
});

test("every requested path is a reporting route", () => {
  const paths = [...clientSource.matchAll(/["'`]\/(?:reporting|auth)\/[^"'`$]*/g)].map((m) => m[0].slice(1));
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) expect(path.startsWith("/reporting/")).toBe(true);
});

test("no mutating HTTP method is issued", () => {
  // Login moved to the shell, so this area now issues no write at all.
  const methods = [...clientSource.matchAll(/method:\s*"([A-Z]+)"/g)].map((m) => m[1]);
  expect(methods).toEqual([]);
});
