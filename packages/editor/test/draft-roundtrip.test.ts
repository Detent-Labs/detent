import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { parseDraftJson, stringifyDraft } from "../src/draft/io";

const examplesDir = new URL("../../../examples/", import.meta.url);
const exampleFiles = readdirSync(examplesDir).filter((f) => f.endsWith(".json"));

describe("Draft load/export round-trip", () => {
  it("found the repo's example definitions", () => {
    expect(exampleFiles.length).toBeGreaterThan(0);
  });

  for (const file of exampleFiles) {
    it(`preserves every field of ${file}'s process body`, () => {
      const parsed = JSON.parse(readFileSync(new URL(file, examplesDir), "utf8"));
      // examples/ is inconsistent: expense-approval.json is a published
      // ProcessVersion wrapper (body under `definition`); the two subprocess
      // examples are raw, unwrapped process bodies. The Draft-shaped part an
      // author works with is always the body, never the version wrapper.
      const originalBody = "definition" in parsed ? parsed.definition : parsed;
      const draft = parseDraftJson(JSON.stringify(originalBody));
      const reExported = JSON.parse(stringifyDraft(draft));
      expect(reExported).toEqual(originalBody);
    });
  }
});
