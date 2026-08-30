import { describe, expect, it } from "bun:test";
import {
  asExpression,
  defaultValueDisabledReason,
  literalControlKind,
  parseCelDefault,
  toggleMultiselectValue,
} from "../src/areas/studio/panels/shared/defaultValueLogic.js";

describe("asExpression", () => {
  it("recognizes an { lang: 'cel', src } shape", () => {
    expect(asExpression({ lang: "cel", src: "data.amount" })).toEqual({ lang: "cel", src: "data.amount" });
  });

  it("does not mistake a Literal record for an Expression", () => {
    expect(asExpression({ lang: "not-cel" } as never)).toBeUndefined();
    expect(asExpression("a string")).toBeUndefined();
    expect(asExpression(5)).toBeUndefined();
    expect(asExpression(["a", "b"])).toBeUndefined();
    expect(asExpression(undefined)).toBeUndefined();
  });
});

describe("defaultValueDisabledReason", () => {
  it("disables for group, stating the group-specific reason", () => {
    expect(defaultValueDisabledReason("group")).toBe("group");
  });

  it("disables for file, stating the type reason", () => {
    expect(defaultValueDisabledReason("file")).toBe("type");
  });

  it("stays enabled for every other type", () => {
    for (const type of ["string", "number", "boolean", "list"] as const) {
      expect(defaultValueDisabledReason(type)).toBeUndefined();
    }
  });
});

describe("literalControlKind", () => {
  it("maps a plain field's own type directly", () => {
    expect(literalControlKind({ type: "number" })).toBe("number");
    expect(literalControlKind({ type: "boolean" })).toBe("boolean");
  });

  it("takes the format's own native input over the type default", () => {
    expect(literalControlKind({ type: "string", format: "date" })).toBe("date");
    expect(literalControlKind({ type: "string", format: "datetime" })).toBe("datetime");
    expect(literalControlKind({ type: "string", format: "email" })).toBe("email");
  });

  it("offers a picker to a field carrying static options, by cardinality", () => {
    expect(literalControlKind({ type: "string", options: [{ value: "a" }] })).toBe("options");
    expect(literalControlKind({ type: "list", options: [{ value: "a" }] })).toBe("options-multi");
  });

  it("keeps the multi-value control for a list carrying no options yet", () => {
    expect(literalControlKind({ type: "list" })).toBe("options-multi");
  });

  it("falls back to a text control for string and a custom plugin type", () => {
    expect(literalControlKind({ type: "string" })).toBe("string");
    expect(literalControlKind({ type: { type: "custom.thing", config: {} } as never })).toBe("string");
  });

  it("offers no option for a dataSource-bound picker of either cardinality", () => {
    expect(literalControlKind({ type: "string", dataSource: "ds_1" as never })).toBe("none");
    expect(literalControlKind({ type: "list", dataSource: "ds_1" as never })).toBe("none");
  });

  it("offers no option for a bare person field of either cardinality", () => {
    expect(literalControlKind({ type: "string", format: "person" })).toBe("none");
    expect(literalControlKind({ type: "list", format: "person" })).toBe("none");
  });

  it("keeps a person field's own static options over the carve-out", () => {
    expect(literalControlKind({ type: "string", format: "person", options: [{ value: "user_a" }] })).toBe("options");
    expect(literalControlKind({ type: "list", format: "person", options: [{ value: "user_a" }] })).toBe("options-multi");
  });

  it("prefers the options over the format when a field carries both", () => {
    expect(literalControlKind({ type: "string", format: "date", options: [{ value: "2026-01-01" }] })).toBe("options");
  });
});

describe("parseCelDefault", () => {
  it("writes an Expression for CEL that parses", () => {
    expect(parseCelDefault("data.subtotal * 1.1")).toEqual({ ok: true, value: { lang: "cel", src: "data.subtotal * 1.1" } });
  });

  it("clears the default for empty text", () => {
    expect(parseCelDefault("")).toEqual({ ok: true, value: undefined });
    expect(parseCelDefault("   ")).toEqual({ ok: true, value: undefined });
  });

  it("reports ok:false for CEL that does not parse, without writing anything", () => {
    expect(parseCelDefault("data.amount +")).toEqual({ ok: false });
  });
});

describe("toggleMultiselectValue", () => {
  it("adds an option to an absent selection", () => {
    expect(toggleMultiselectValue(undefined, "x", true)).toEqual(["x"]);
  });

  it("adds an option to an existing selection", () => {
    expect(toggleMultiselectValue(["x"], "y", true)).toEqual(["x", "y"]);
  });

  it("removes an option from a selection", () => {
    expect(toggleMultiselectValue(["x", "y"], "x", false)).toEqual(["y"]);
  });

  it("clears the default key when the last option is removed", () => {
    expect(toggleMultiselectValue(["x"], "x", false)).toBeUndefined();
  });
});
