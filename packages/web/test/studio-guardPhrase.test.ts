import { describe, expect, it } from "bun:test";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import { buildOperands, guardPhrase } from "../src/areas/studio/panels/shared/conditionLogic.js";

/**
 * `studio-condition-builder`: "A path's guard reads as a sentence on its
 * canvas way out". `guardPhrase` is the condition that sentence and the form
 * preview's note read: the builder's clause words, never CEL source.
 */

const FIELDS = [
  { id: "field_00000000-0000-4000-8000-0000000000a1", key: "amount", type: "number", label: { en: "Amount" } },
  { id: "field_00000000-0000-4000-8000-0000000000a2", key: "tags", type: "list", label: { en: "Tags" } },
] as unknown as DraftField[];

const operands = buildOperands({ fields: FIELDS, locale: "en", baseLocale: "en" });

describe("guardPhrase", () => {
  it("reads the complete rows in the builder's clause words, keeping the label's own case", () => {
    expect(guardPhrase("data.amount > 1000.0", operands)).toBe("Amount is greater than 1,000");
  });

  it("adds no capital to a context operand", () => {
    expect(guardPhrase('instance.status == "running" && data.amount > 1000.0', operands)).toBe(
      "the case's status is running and Amount is greater than 1,000",
    );
  });

  it("reads a raw row beside a readable row as the builder's phrase", () => {
    const src = 'data.tags.exists(t, t == "vip") && data.amount > 1000.0';
    const phrase = guardPhrase(src, operands);

    expect(phrase).toBe("a hand-written rule and Amount is greater than 1,000");
    expect(phrase).not.toContain("data.");
  });

  it("reads a guard with no readable row as a hand-written rule holding", () => {
    expect(guardPhrase("size(data.amount) > 3", operands)).toBe("a hand-written rule holds");
    expect(guardPhrase("!(data.amount > 1000.0)", operands)).toBe("a hand-written rule holds");
  });

  it("reads source that does not parse as a hand-written rule holding", () => {
    expect(guardPhrase("data.amount >", operands)).toBe("a hand-written rule holds");
  });
});
