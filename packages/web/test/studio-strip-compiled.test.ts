import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { type ProcessBody } from "workflow-engine/schema";
import { compileProcessBody } from "workflow-engine/schema/compile";
import { stripCompiledContent } from "workflow-engine/schema/strip-compiled";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import { groupChecksBySource } from "../src/areas/studio/draft/checksRail.js";
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
    const compiledResult = runValidation(compiled as Draft, undefined, {}, {});
    expect(compiledResult.zodValid).toBe(false);
    expect(runValidation(stripCompiledContent(compiled) as Draft, undefined, {}, {}).zodValid).toBe(true);

    // task 6.18b/6.18c: compileProcessBody's own idempotent early return
    // succeeds outright here (the un-stripped body already carries the
    // compiled shape), so `dimensions.duration`/`dimensions.structural` both
    // narrow to "not-run" per validateStructure's fifth fall-through state —
    // despite `compiled` itself carrying a value. `heldBackFor` keys off
    // `dimensions.structural`, not off a compiled body's own presence, so
    // the CEL and registry groups must still read held back here, never
    // clear — closing the contradiction with studio-checks-rail's "A
    // Zod-invalid draft shows every group held back" scenario.
    expect(compiledResult.dimensions.duration).toBe("not-run");
    expect(compiledResult.dimensions.structural).toBe("not-run");
    const groups = groupChecksBySource(compiledResult);
    expect(groups.find((g) => g.source === "cel")!.heldBack).toBe(true);
    expect(groups.find((g) => g.source === "registry")!.heldBack).toBe(true);
  });
});
