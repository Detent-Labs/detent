import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import type { Path } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import { buildOperands, edgeGuardLabel } from "../src/areas/studio/panels/shared/conditionLogic.js";

/**
 * `studio-condition-builder`: "A path's guard shows a plain-English summary on
 * its canvas edge". The label follows the guard for either trigger; the
 * priority badge and the "else" marker stay with automatic paths.
 */

type DraftPath = DraftOf<Path>;

const FIELDS = [
  { id: "field_00000000-0000-4000-8000-0000000000a1", key: "amount", type: "number", label: { en: "Amount" } },
] as unknown as DraftField[];

const operands = buildOperands({ fields: FIELDS, locale: "en", baseLocale: "en" });

function path(over: Record<string, unknown>): DraftPath {
  return { id: "path_1", key: "approve", label: "Approve", to: "step_b", ...over } as unknown as DraftPath;
}

const GUARD = { lang: "cel", src: "data.amount > 1000.0" };

describe("edgeGuardLabel", () => {
  it("labels an automatic path's guard in words", () => {
    expect(edgeGuardLabel(path({ trigger: "automatic", priority: 1, guard: GUARD }), operands)).toBe(
      "Amount (amount) is greater than 1000",
    );
  });

  it("labels a manual path's guard in the same words", () => {
    expect(edgeGuardLabel(path({ trigger: "manual", guard: GUARD }), operands)).toBe("Amount (amount) is greater than 1000");
  });

  it("gives no label to a path with no guard, for either trigger", () => {
    expect(edgeGuardLabel(path({ trigger: "manual" }), operands)).toBeUndefined();
    expect(edgeGuardLabel(path({ trigger: "automatic" }), operands)).toBeUndefined();
  });

  it("gives no label to a guard with an empty source", () => {
    expect(edgeGuardLabel(path({ trigger: "manual", guard: { lang: "cel", src: "" } }), operands)).toBeUndefined();
  });

  it("prints the CEL text of a guard the builder cannot read", () => {
    expect(edgeGuardLabel(path({ trigger: "manual", guard: { lang: "cel", src: "data.amount >" } }), operands)).toBe(
      "data.amount >",
    );
  });
});

describe("the canvas edge", () => {
  const source = readFileSync(new URL("../src/areas/studio/canvas/CanvasView.tsx", import.meta.url), "utf-8");

  it("draws the label edgeGuardLabel gives, with no trigger condition of its own", () => {
    expect(source).toContain("edgeGuardLabel(path, operands)");
    expect(source).not.toMatch(/automaticGuarded \? guardText/);
  });

  it("keeps the priority badge and the else marker automatic-only", () => {
    expect(source).toMatch(/const automaticGuarded = path\.trigger === "automatic" && path\.guard !== undefined;/);
    expect(source).toMatch(/const automaticDefault = path\.trigger === "automatic" && path\.guard === undefined;/);
    expect(source).toMatch(/\{automaticGuarded && \(\s*<text[^>]*edgeBadge/);
    expect(source).toMatch(/\{automaticDefault && \(\s*<text[^>]*edgeBadge/);
  });
});
