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
  {
    id: "field_00000000-0000-4000-8000-0000000000a3",
    key: "department",
    type: "string",
    label: { en: "Department" },
    options: [
      { value: "sales", label: { en: "Sales" } },
      { value: "marketing", label: { en: "Marketing" } },
    ],
  },
  { id: "field_00000000-0000-4000-8000-0000000000a4", key: "starts_at", type: "string", format: "datetime", label: { en: "Starts at" } },
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

  it("reads a grouped guard's group in the builder's clause words", () => {
    expect(guardPhrase('data.amount > 1000.0 && (data.department == "sales" || data.department == "marketing")', operands)).toBe(
      "Amount is greater than 1,000 and either Department is Sales or Department is Marketing",
    );
  });

  it("counts a comparison inside a group as a readable row", () => {
    expect(guardPhrase('size(data.tags) > 3 && (data.amount > 1.0 || size(data.tags) > 9)', operands)).toBe(
      "a hand-written rule and either Amount is greater than 1 or a hand-written rule",
    );
    expect(guardPhrase("size(data.tags) > 3 && (size(data.tags) > 1 || size(data.tags) > 9)", operands)).toBe("a hand-written rule holds");
  });

  it("reads a date-time literal no date can hold as its stored text, never a throw", () => {
    expect(guardPhrase('data.starts_at >= "2026-01-01T00:00+24:00"', operands)).toBe("Starts at is at or after 2026-01-01T00:00+24:00");
  });
});
