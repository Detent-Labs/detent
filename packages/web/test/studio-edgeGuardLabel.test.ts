import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import type { Path } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import { buildOperands, edgeGuardLabel } from "../src/areas/studio/panels/shared/conditionLogic.js";
import { pathName } from "../src/areas/studio/canvas/pathName.js";

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
      "Amount is greater than 1,000",
    );
  });

  it("labels a manual path's guard in the same words", () => {
    expect(edgeGuardLabel(path({ trigger: "manual", guard: GUARD }), operands)).toBe("Amount is greater than 1,000");
  });

  it("capitalizes a head clause that reads a context operand", () => {
    const status = { lang: "cel", src: 'instance.status == "running" && data.amount > 1000.0' };
    expect(edgeGuardLabel(path({ trigger: "automatic", priority: 1, guard: status }), operands)).toBe(
      "The case's status is running and Amount is greater than 1,000",
    );
  });

  it("keeps a raw row's CEL text at the head as written", () => {
    const raw = { lang: "cel", src: "data.amount * 2.0 > 1000.0 && data.amount > 5.0" };
    expect(edgeGuardLabel(path({ trigger: "manual", guard: raw }), operands)).toBe(
      "data.amount * 2.0 > 1000.0 and Amount is greater than 5",
    );
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

describe("a path's accessible name", () => {
  // `studio-canvas`, "A path is a focusable control": the name carries the
  // guard for either trigger, in the edge label's words.
  it("carries a manual path's readable guard, and no priority", () => {
    const manual = path({ trigger: "manual", guard: GUARD });
    const name = pathName(manual, "Intake", "Approved", edgeGuardLabel(manual, operands));

    expect(name).toBe("Approve, from Intake to Approved, manual, Amount is greater than 1,000");
  });

  it("carries an automatic path's readable guard and its priority", () => {
    const automatic = path({ trigger: "automatic", priority: 2, guard: GUARD });
    const name = pathName(automatic, "Intake", "Approved", edgeGuardLabel(automatic, operands));

    expect(name).toContain("Amount is greater than 1,000");
    expect(name).toContain("2");
  });
});

describe("the canvas edge", () => {
  const source = readFileSync(new URL("../src/areas/studio/canvas/CanvasView.tsx", import.meta.url), "utf-8");

  it("draws the label edgeGuardLabel gives, with no trigger condition of its own", () => {
    expect(source).toContain("edgeGuardLabel(path, operands)");
    expect(source).not.toMatch(/automaticGuarded \? guardText/);
  });

  it("names the edge with the same readable guard it draws", () => {
    expect(source).toMatch(/aria-label=\{pathName\(path, [^\n]*, guardText\)\}/);
  });

  it("keeps the priority badge and the else marker automatic-only", () => {
    expect(source).toMatch(/const automaticGuarded = path\.trigger === "automatic" && path\.guard !== undefined;/);
    expect(source).toMatch(/const automaticDefault = path\.trigger === "automatic" && path\.guard === undefined;/);
    expect(source).toMatch(/\{automaticGuarded && \(\s*<text[^>]*edgeBadge/);
    expect(source).toMatch(/\{automaticDefault && \(\s*<text[^>]*edgeBadge/);
  });
});
