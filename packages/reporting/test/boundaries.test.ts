/**
 * The package's two structural boundaries, asserted rather than left to
 * review: it does not consume the shared step-form renderer, and it reaches
 * the engine only over the reporting routes and login.
 *
 * These are canaries. Both hold today by construction; the test is what fails
 * when a later change wires in `form-ui` or calls a route outside the prefix.
 */
import { test, expect } from "bun:test";

const manifest = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

const clientSource = await Bun.file(new URL("../src/api/client.ts", import.meta.url)).text();

test("the shared step-form renderer is absent from the dependencies", () => {
  const all = { ...manifest.dependencies, ...manifest.devDependencies };
  expect(Object.keys(all)).not.toContain("form-ui");
});

test("the engine package is a declared dependency, since the types are imported from it", () => {
  expect(manifest.dependencies["workflow-engine"]).toBeDefined();
});

test("every requested path is a reporting route or the login endpoint", () => {
  const paths = [...clientSource.matchAll(/["'`]\/(?:reporting|auth)\/[^"'`$]*/g)].map((m) => m[0].slice(1));
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    expect(path.startsWith("/reporting/") || path === "/auth/login").toBe(true);
  }
});

test("no mutating HTTP method is issued", () => {
  // `POST` appears once, for login. Nothing else may introduce a write.
  const methods = [...clientSource.matchAll(/method:\s*"([A-Z]+)"/g)].map((m) => m[1]);
  expect(methods).toEqual(["POST"]);
});
