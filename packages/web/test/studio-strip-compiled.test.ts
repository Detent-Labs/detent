import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { type ProcessBody } from "workflow-engine/schema";
import { compileProcessBody } from "workflow-engine/schema/compile";
import { stripCompiledContent } from "workflow-engine/schema/strip-compiled";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * The engine owns the inverse and its round-trip guard (test/strip-compiled.test.ts).
 * What belongs here is the studio-side consequence: a seeded draft must report
 * nothing the published version did not already carry, measured through the
 * studio's own validator rather than through the schema directly.
 */
function readExample(name: string): ProcessBody {
  const raw = JSON.parse(readFileSync(new URL(`../../../examples/${name}`, import.meta.url), "utf-8"));
  return (raw.definition ?? raw) as ProcessBody;
}

describe("a seeded draft under the studio's own validation", () => {
  it("passes stripped and fails compiled", () => {
    // Registry and children are absent, so this is the Zod dimension only —
    // the one the compiled body's reserved cancel sink fails.
    const compiled = compileProcessBody(readExample("subprocess-credit-check-child.json"));
    expect(runValidation(compiled as Draft, undefined, {}).zodValid).toBe(false);
    expect(runValidation(stripCompiledContent(compiled) as Draft, undefined, {}).zodValid).toBe(true);
  });
});
