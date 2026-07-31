import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import type { ProcessBody } from "workflow-engine/schema";
import { compileProcessBody } from "workflow-engine/schema/compile";
import { canonicalize } from "workflow-engine/schema/canonical-json";
import { stripCompiledContent } from "workflow-engine/schema/strip-compiled";
import { buildPromotionFile } from "../src/screens/promotionExportLogic.js";
import { parsePromotionFile } from "../src/screens/promotionImportLogic.js";
import type { VersionSummary } from "../src/api/types.js";

/**
 * The load-bearing claim of environment promotion: a version exported from one
 * environment and imported into another lands under the SAME definitionHash.
 *
 * `definitionHash` is sha256 of the canonical JSON of the compiled body, so
 * equal canonical JSON is equal hash. Comparing the canonical form asserts the
 * same thing without reaching for a database or a second engine export.
 *
 * The export and import modules alone cannot prove this: the target's own
 * `publishBody` re-runs `compileProcessBody`, and that step is where a stripped
 * or otherwise altered body would diverge. This test walks the whole seam.
 */
function readExample(name: string): ProcessBody {
  const raw = JSON.parse(readFileSync(new URL(`../../../examples/${name}`, import.meta.url), "utf-8"));
  return (raw.definition ?? raw) as ProcessBody;
}

const version: VersionSummary = { version: 7, definitionHash: "source-hash", status: "published", publishedAt: "2026-07-31T00:00:00.000Z" };

/** What the target does with an imported body: `publishBody` compiles, then hashes. */
function republish(body: unknown): string {
  return canonicalize(compileProcessBody(body as ProcessBody));
}

describe.each([["expense-approval.json"], ["subprocess-credit-check-child.json"], ["subprocess-loan-parent.json"]])(
  "promoting %s",
  (example) => {
    const sourceCompiled = compileProcessBody(readExample(example));

    it("lands under the source's own definitionHash", () => {
      const file = JSON.stringify(buildPromotionFile("proc_x", version, sourceCompiled));
      const parsed = parsePromotionFile(file);
      if (!parsed.ok) throw new Error(parsed.message);

      expect(republish(parsed.preview.body)).toBe(canonicalize(sourceCompiled));
    });

    it("would still land there if the body were stripped, which is why no test guards the shortcut", () => {
      // Recorded, not endorsed. Strip and compile are inverses, so stripping on
      // export reaches the same hash — the reason the export module's
      // `ponytail:` comment, not a failing test, is what keeps the extra step
      // out. A future reader who adds the strip back must be told that green
      // tests are not evidence it was harmless.
      expect(republish(stripCompiledContent(sourceCompiled))).toBe(canonicalize(sourceCompiled));
    });
  },
);

describe("a contracted child keeps its contract across the boundary", () => {
  it("carries the reserved cancel outcome the compile pass injected", () => {
    const compiled = compileProcessBody(readExample("subprocess-credit-check-child.json"));
    const parsed = parsePromotionFile(JSON.stringify(buildPromotionFile("proc_credit_check", version, compiled)));
    if (!parsed.ok) throw new Error(parsed.message);

    // contractRef is a hash of the child's compiled contract, so a parent's
    // pin survives promotion only if the contract crosses unchanged.
    const contract = (parsed.preview.body as ProcessBody).contract;
    expect(contract).toBeDefined();
    expect(canonicalize(contract)).toBe(canonicalize(compiled.contract));
  });
});
