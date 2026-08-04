import { describe, expect, it } from "bun:test";
import { overrideMode } from "../src/areas/studio/panels/shared/overrideMode.js";

const expr = { lang: "cel" as const, src: 'child.outcome == "approved"' };

describe("overrideMode", () => {
  it("shows CEL while the builder writes nothing, so a first row survives", () => {
    // The builder emits `undefined` for as long as its only row is incomplete.
    // Reading that as "not an expression" would collapse the override to the
    // checkbox on the author's first click and discard the row.
    expect(overrideMode(undefined, "cel")).toBe("cel");
  });

  it("defaults to the checkbox with no value and no choice", () => {
    expect(overrideMode(undefined, undefined)).toBe("boolean");
  });

  it("follows the value when the value is present", () => {
    expect(overrideMode(expr, undefined)).toBe("cel");
    expect(overrideMode(expr, "boolean")).toBe("cel");
    expect(overrideMode(true, "cel")).toBe("boolean");
    expect(overrideMode(false, "cel")).toBe("boolean");
  });

  it("returns to the checkbox once the author picks it", () => {
    // Choosing `boolean` writes `false`, which is a present value.
    expect(overrideMode(false, "boolean")).toBe("boolean");
  });
});
