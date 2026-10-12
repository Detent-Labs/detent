import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const resolveFromHere = createRequire(import.meta.url);

const manifest = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

describe("React major", () => {
  test("the tests load React 19", () => {
    for (const name of ["react", "react-dom"]) {
      const { version } = resolveFromHere(`${name}/package.json`) as { version: string };
      expect(version.split(".")[0]).toBe("19");
    }
  });

  test("the peer range matches the consumer", () => {
    const formUi = manifest("../package.json");
    const web = manifest("../../web/package.json");
    for (const name of ["react", "react-dom"]) {
      expect(formUi.peerDependencies?.[name]).toBe("^19");
      expect(web.dependencies?.[name]).toBe("^19");
    }
  });
});
