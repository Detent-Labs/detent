import { describe, expect, it } from "bun:test";
import { wrapTarget } from "../src/areas/studio/panels/shared/dialogFocus.js";

/**
 * Where Tab goes inside a modal dialog (`spa-accessibility`). `wrapTarget` is
 * generic, so plain strings stand in for elements. `dialogFocusables` reads a
 * real DOM, and `e2e/dialog.e2e.ts` covers it.
 */
const stops = ["first", "middle", "last"];

describe("wrapTarget", () => {
  it("wraps a forward Tab from the last stop to the first", () => {
    expect(wrapTarget(stops, "last", false)).toBe("first");
  });

  it("wraps a backward Tab from the first stop to the last", () => {
    expect(wrapTarget(stops, "first", true)).toBe("last");
  });

  it("leaves a step inside the list to the browser", () => {
    expect(wrapTarget(stops, "first", false)).toBeUndefined();
    expect(wrapTarget(stops, "middle", false)).toBeUndefined();
    expect(wrapTarget(stops, "middle", true)).toBeUndefined();
    expect(wrapTarget(stops, "last", true)).toBeUndefined();
  });

  it("brings a focus outside the list back in, by direction", () => {
    expect(wrapTarget(stops, "body", false)).toBe("first");
    expect(wrapTarget(stops, "body", true)).toBe("last");
    expect(wrapTarget(stops, null, false)).toBe("first");
    expect(wrapTarget(stops, null, true)).toBe("last");
  });

  it("holds a lone stop in both directions", () => {
    expect(wrapTarget(["only"], "only", false)).toBe("only");
    expect(wrapTarget(["only"], "only", true)).toBe("only");
  });

  it("answers undefined for an empty list", () => {
    expect(wrapTarget([], null, false)).toBeUndefined();
    expect(wrapTarget([], null, true)).toBeUndefined();
    expect(wrapTarget<string>([], "body", false)).toBeUndefined();
  });
});
