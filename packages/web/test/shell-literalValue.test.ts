import { describe, expect, it } from "bun:test";
import {
  literalText,
  literalType,
  parseLiteral,
  parseLiteralList,
  sameLiteral,
  valueTypeOf,
} from "../src/shell/literalValue.js";

describe("literalType", () => {
  it("names number and boolean for those declared base types", () => {
    expect(literalType("number")).toBe("number");
    expect(literalType("boolean")).toBe("boolean");
  });

  it("names string for string, an absent type and every other declared type", () => {
    expect(literalType("string")).toBe("string");
    expect(literalType(undefined)).toBe("string");
    expect(literalType("list")).toBe("string");
    expect(literalType("group")).toBe("string");
    expect(literalType("")).toBe("string");
  });
});

describe("parseLiteral: number", () => {
  it("parses an integer, a decimal and a negative", () => {
    expect(parseLiteral("500", "number")).toEqual({ ok: true, value: 500 });
    expect(parseLiteral("3.25", "number")).toEqual({ ok: true, value: 3.25 });
    expect(parseLiteral("-2.5", "number")).toEqual({ ok: true, value: -2.5 });
    expect(parseLiteral("-7", "number")).toEqual({ ok: true, value: -7 });
    expect(parseLiteral("0", "number")).toEqual({ ok: true, value: 0 });
  });

  it("trims the text before it parses", () => {
    expect(parseLiteral("  42  ", "number")).toEqual({ ok: true, value: 42 });
  });

  it("reports empty for zero-length and whitespace-only text", () => {
    expect(parseLiteral("", "number")).toEqual({ ok: false, reason: "empty" });
    expect(parseLiteral("   ", "number")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects an exponent, hex, a separator and stray characters", () => {
    const bad = ["1e3", "0x10", "1,000", "1_000", "abc", "1 2", "--1", "+1", "1.", ".5", "-", "NaN", "Infinity"];
    for (const text of bad) {
      expect(parseLiteral(text, "number")).toEqual({ ok: false, reason: "not-number" });
    }
  });

  it("rejects digits that overflow to a non-finite number", () => {
    expect(parseLiteral("9".repeat(400), "number")).toEqual({ ok: false, reason: "not-number" });
  });
});

describe("parseLiteral: boolean", () => {
  it("parses true and false in any case", () => {
    expect(parseLiteral("true", "boolean")).toEqual({ ok: true, value: true });
    expect(parseLiteral("false", "boolean")).toEqual({ ok: true, value: false });
    expect(parseLiteral("True", "boolean")).toEqual({ ok: true, value: true });
    expect(parseLiteral("FALSE", "boolean")).toEqual({ ok: true, value: false });
    expect(parseLiteral("  true ", "boolean")).toEqual({ ok: true, value: true });
  });

  it("reports empty for zero-length and whitespace-only text", () => {
    expect(parseLiteral("", "boolean")).toEqual({ ok: false, reason: "empty" });
    expect(parseLiteral(" ", "boolean")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects anything else", () => {
    for (const text of ["yes", "no", "1", "0", "t", "truee"]) {
      expect(parseLiteral(text, "boolean")).toEqual({ ok: false, reason: "not-boolean" });
    }
  });
});

describe("parseLiteral: string", () => {
  it("returns the text unchanged, spaces included", () => {
    expect(parseLiteral(" a ", "string")).toEqual({ ok: true, value: " a " });
    expect(parseLiteral("open", "string")).toEqual({ ok: true, value: "open" });
    expect(parseLiteral("1e3", "string")).toEqual({ ok: true, value: "1e3" });
  });

  it("takes whitespace-only text as a value", () => {
    expect(parseLiteral(" ", "string")).toEqual({ ok: true, value: " " });
  });

  it("reports empty only for zero-length text", () => {
    expect(parseLiteral("", "string")).toEqual({ ok: false, reason: "empty" });
  });
});

describe("parseLiteralList", () => {
  it("trims each member and skips empty members", () => {
    expect(parseLiteralList("a, b,", "string")).toEqual({ ok: true, value: ["a", "b"] });
    expect(parseLiteralList(" a ,, b ", "string")).toEqual({ ok: true, value: ["a", "b"] });
    expect(parseLiteralList("a,b", "string")).toEqual({ ok: true, value: ["a", "b"] });
  });

  it("parses each member by the field type", () => {
    expect(parseLiteralList("1, 2", "number")).toEqual({ ok: true, value: [1, 2] });
    expect(parseLiteralList("-1.5,2", "number")).toEqual({ ok: true, value: [-1.5, 2] });
    expect(parseLiteralList("true, False", "boolean")).toEqual({ ok: true, value: [true, false] });
  });

  it("accepts a single member", () => {
    expect(parseLiteralList("solo", "string")).toEqual({ ok: true, value: ["solo"] });
    expect(parseLiteralList("7", "number")).toEqual({ ok: true, value: [7] });
  });

  it("keeps a duplicate member", () => {
    expect(parseLiteralList("a, a", "string")).toEqual({ ok: true, value: ["a", "a"] });
  });

  it("reports empty when no member remains", () => {
    for (const type of ["string", "number", "boolean"] as const) {
      expect(parseLiteralList("", type)).toEqual({ ok: false, reason: "empty" });
      expect(parseLiteralList("   ", type)).toEqual({ ok: false, reason: "empty" });
      expect(parseLiteralList(",", type)).toEqual({ ok: false, reason: "empty" });
      expect(parseLiteralList(" , ,, ", type)).toEqual({ ok: false, reason: "empty" });
    }
  });

  it("reports the reason of the first bad member", () => {
    expect(parseLiteralList("1, x", "number")).toEqual({ ok: false, reason: "not-number" });
    expect(parseLiteralList("x, 1", "number")).toEqual({ ok: false, reason: "not-number" });
    expect(parseLiteralList("true, maybe", "boolean")).toEqual({ ok: false, reason: "not-boolean" });
  });

  it("rejects the whole list when one member is bad", () => {
    expect(parseLiteralList("1, 2, 1e3", "number").ok).toBe(false);
  });
});

describe("literalText", () => {
  it("returns a string as it is", () => {
    expect(literalText("open")).toBe("open");
    expect(literalText(" a ")).toBe(" a ");
    expect(literalText("")).toBe("");
  });

  it("prints a number and a boolean through String", () => {
    expect(literalText(1)).toBe("1");
    expect(literalText(-2.5)).toBe("-2.5");
    expect(literalText(0)).toBe("0");
    expect(literalText(true)).toBe("true");
    expect(literalText(false)).toBe("false");
  });

  it("joins an array with a comma and a space", () => {
    expect(literalText([1, 2])).toBe("1, 2");
    expect(literalText(["a", "b"])).toBe("a, b");
    expect(literalText([true, false])).toBe("true, false");
    expect(literalText([])).toBe("");
  });

  it("returns empty text for anything else", () => {
    expect(literalText(undefined)).toBe("");
    expect(literalText(null)).toBe("");
    expect(literalText({ a: 1 })).toBe("");
  });

  it("round-trips a parsed list back to text that parses to the same list", () => {
    const parsed = parseLiteralList("1,2 ,3", "number");
    if (!parsed.ok) throw new Error("expected a parsed list");
    const again = parseLiteralList(literalText(parsed.value), "number");
    expect(again).toEqual(parsed);
  });
});

describe("valueTypeOf", () => {
  it("names the type of a scalar", () => {
    expect(valueTypeOf(1)).toBe("number");
    expect(valueTypeOf(0)).toBe("number");
    expect(valueTypeOf(true)).toBe("boolean");
    expect(valueTypeOf(false)).toBe("boolean");
    expect(valueTypeOf("a")).toBe("string");
    expect(valueTypeOf("")).toBe("string");
  });

  it("names the type of an array's first member", () => {
    expect(valueTypeOf([1, 2])).toBe("number");
    expect(valueTypeOf([true])).toBe("boolean");
    expect(valueTypeOf(["a", "b"])).toBe("string");
  });

  it("gives undefined for an empty array and for anything else", () => {
    expect(valueTypeOf([])).toBeUndefined();
    expect(valueTypeOf(undefined)).toBeUndefined();
    expect(valueTypeOf(null)).toBeUndefined();
    expect(valueTypeOf({ a: 1 })).toBeUndefined();
    expect(valueTypeOf([null])).toBeUndefined();
    expect(valueTypeOf([[1]])).toBeUndefined();
  });
});

describe("sameLiteral", () => {
  it("is true for equal scalars", () => {
    expect(sameLiteral(1, 1)).toBe(true);
    expect(sameLiteral("a", "a")).toBe(true);
    expect(sameLiteral(true, true)).toBe(true);
    expect(sameLiteral(undefined, undefined)).toBe(true);
  });

  it("is false for scalars of another value or type", () => {
    expect(sameLiteral(1, 2)).toBe(false);
    expect(sameLiteral(1, "1")).toBe(false);
    expect(sameLiteral(true, "true")).toBe(false);
    expect(sameLiteral(false, 0)).toBe(false);
    expect(sameLiteral("a", undefined)).toBe(false);
  });

  it("treats -0 and 0 as the same number", () => {
    // JSON.stringify(-0) is "0", so a stored -0 comes back as 0.
    expect(sameLiteral(-0, 0)).toBe(true);
  });

  it("compares arrays member by member", () => {
    expect(sameLiteral([1, 2], [1, 2])).toBe(true);
    expect(sameLiteral([], [])).toBe(true);
    expect(sameLiteral([1, 2], [2, 1])).toBe(false);
    expect(sameLiteral([1, 2], [1])).toBe(false);
    expect(sameLiteral([1], ["1"])).toBe(false);
  });

  it("is false for an array against a scalar or undefined", () => {
    expect(sameLiteral([1], 1)).toBe(false);
    expect(sameLiteral("a", ["a"])).toBe(false);
    expect(sameLiteral([], undefined)).toBe(false);
  });
});
