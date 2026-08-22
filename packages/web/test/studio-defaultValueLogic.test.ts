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

  it("disables for reference and file, stating the type reason", () => {
    expect(defaultValueDisabledReason("reference")).toBe("type");
    expect(defaultValueDisabledReason("file")).toBe("type");
  });

  it("stays enabled for every other type", () => {
    for (const type of ["string", "number", "boolean", "date", "datetime", "select", "multiselect"] as const) {
      expect(defaultValueDisabledReason(type)).toBeUndefined();
    }
  });
});

describe("literalControlKind", () => {
  it("maps a plain field's own type directly", () => {
    expect(literalControlKind("number", false)).toBe("number");
    expect(literalControlKind("boolean", false)).toBe("boolean");
    expect(literalControlKind("date", false)).toBe("date");
    expect(literalControlKind("datetime", false)).toBe("datetime");
    expect(literalControlKind("select", false)).toBe("select");
    expect(literalControlKind("multiselect", false)).toBe("multiselect");
  });

  it("falls back to a text control for string and a custom plugin type", () => {
    expect(literalControlKind("string", false)).toBe("string");
    expect(literalControlKind({ type: "custom.thing", config: {} } as never, false)).toBe("string");
  });

  it("offers no option for a dataSource-bound select or multiselect", () => {
    expect(literalControlKind("select", true)).toBe("none");
    expect(literalControlKind("multiselect", true)).toBe("none");
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
