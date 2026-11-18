import { describe, expect, it } from "bun:test";
import { menuKeyTarget, typeAheadIndex, wayOutMenuItems, type WayOutMenuItem } from "../src/areas/studio/canvas/wayOutMenuLogic.js";
import { t } from "../src/areas/studio/catalog.js";

const STEPS = [{ id: "step_review" }, { id: "step_booking" }, { id: "step_done" }];
const TEXTS = new Map([
  ["step_review", "Review"],
  ["step_booking", "Booking Error"],
  ["step_done", "Done"],
]);

const textsOf = (items: WayOutMenuItem[]) => items.map((item) => (item.kind === "separator" ? "---" : item.text));

describe("wayOutMenuItems", () => {
  it("lists the steps in draft order, the source included, then a separator and a new step", () => {
    const items = wayOutMenuItems(STEPS, new Set(), TEXTS);
    expect(textsOf(items)).toEqual(["Review", "Booking Error", "Done", "---", "A new step"]);
    expect(items[0]).toEqual({ kind: "step", stepId: "step_review", text: "Review" });
    expect(items[3]).toEqual({ kind: "separator" });
    expect(items[4]).toEqual({ kind: "newStep", text: t("canvas.wayOutMenuNewStep") });
  });

  it("leaves out a step hidden in a collapsed group", () => {
    expect(textsOf(wayOutMenuItems(STEPS, new Set(["step_done"]), TEXTS))).toEqual(["Review", "Booking Error", "---", "A new step"]);
  });

  it("leaves out a step with no id", () => {
    expect(textsOf(wayOutMenuItems([{ id: undefined }, ...STEPS], new Set(), TEXTS))).toEqual(["Review", "Booking Error", "Done", "---", "A new step"]);
  });

  it("reads a step the text map misses as the unnamed step", () => {
    expect(wayOutMenuItems([{ id: "step_x" }], new Set(), TEXTS)[0]).toEqual({ kind: "step", stepId: "step_x", text: t("steps.unnamedStep") });
  });

  it("holds the separator and the new step even for a draft with no steps", () => {
    expect(textsOf(wayOutMenuItems([], new Set(), TEXTS))).toEqual(["---", "A new step"]);
  });
});

describe("typeAheadIndex", () => {
  const items = wayOutMenuItems(STEPS, new Set(), TEXTS);

  it("moves to the next item whose text starts with the letter", () => {
    expect(typeAheadIndex(items, 0, "b")).toBe(1);
    expect(typeAheadIndex(items, 0, "a")).toBe(4);
  });

  it("compares case-insensitively", () => {
    expect(typeAheadIndex(items, 0, "B")).toBe(1);
    expect(typeAheadIndex(items, 0, "d")).toBe(2);
  });

  it("wraps past the end", () => {
    expect(typeAheadIndex(items, 4, "r")).toBe(0);
  });

  it("moves on from an item that already matches", () => {
    const twoR = wayOutMenuItems([{ id: "a" }, { id: "b" }], new Set(), new Map([["a", "Review"], ["b", "Reject"]]));
    expect(typeAheadIndex(twoR, 0, "r")).toBe(1);
    expect(typeAheadIndex(twoR, 1, "r")).toBe(0);
  });

  it("skips the separator", () => {
    const dashed = wayOutMenuItems([{ id: "a" }], new Set(), new Map([["a", "Review"]]));
    expect(typeAheadIndex(dashed, 0, "-")).toBeUndefined();
  });

  it("returns undefined when nothing matches", () => {
    expect(typeAheadIndex(items, 0, "z")).toBeUndefined();
  });
});

describe("menuKeyTarget", () => {
  const items = wayOutMenuItems(STEPS, new Set(), TEXTS);
  const last = items.length - 1;

  it("moves Down to the next item and wraps at the end", () => {
    expect(menuKeyTarget("ArrowDown", 0, items)).toBe(1);
    expect(menuKeyTarget("ArrowDown", last, items)).toBe(0);
  });

  it("moves Up to the previous item and wraps at the start", () => {
    expect(menuKeyTarget("ArrowUp", 1, items)).toBe(0);
    expect(menuKeyTarget("ArrowUp", 0, items)).toBe(last);
  });

  it("skips the separator both ways", () => {
    expect(menuKeyTarget("ArrowDown", 2, items)).toBe(4);
    expect(menuKeyTarget("ArrowUp", 4, items)).toBe(2);
  });

  it("reaches the first item on Home and the last on End", () => {
    expect(menuKeyTarget("Home", 3, items)).toBe(0);
    expect(menuKeyTarget("End", 0, items)).toBe(last);
  });

  it("skips a separator at either end for Home and End", () => {
    const bare = wayOutMenuItems([], new Set(), TEXTS);
    expect(menuKeyTarget("Home", 1, bare)).toBe(1);
    expect(menuKeyTarget("End", 1, bare)).toBe(1);
    expect(menuKeyTarget("ArrowDown", 1, bare)).toBe(1);
  });

  it("returns undefined for any other key", () => {
    expect(menuKeyTarget("ArrowLeft", 0, items)).toBeUndefined();
    expect(menuKeyTarget("Enter", 0, items)).toBeUndefined();
    expect(menuKeyTarget("a", 0, items)).toBeUndefined();
  });
});
