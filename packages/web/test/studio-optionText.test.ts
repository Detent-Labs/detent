import { describe, expect, it } from "bun:test";
import { numberRepeats, stepText, wayOutHeading } from "../src/areas/studio/panels/shared/optionText.js";
import type { DraftStep } from "../src/areas/studio/draft/createStep.js";

type WayOut = Parameters<typeof wayOutHeading>[0];
/** A way out; ids are branded in the schema and unread by the module. */
const way = (label: string | undefined, to?: string): WayOut => ({ id: "path_p", label, to }) as unknown as WayOut;

const step = (label: DraftStep["label"]): DraftStep => ({ id: "step_a", key: "k", label, type: "task" }) as unknown as DraftStep;

describe("stepText", () => {
  it("reads the label at the content locale", () => {
    expect(stepText(step({ en: "Review", de: "Prüfung" }), "de", "en")).toBe("Prüfung");
  });

  it("falls back to the base locale", () => {
    expect(stepText(step({ en: "Review" }), "de", "en")).toBe("Review");
  });

  it("trims the label", () => {
    expect(stepText(step({ en: "  Review  " }), "en", "en")).toBe("Review");
  });

  it("reads an empty, blank or missing label as unnamed, never the key", () => {
    expect(stepText(step({ en: "" }), "en", "en")).toBe("(unnamed step)");
    expect(stepText(step({ en: "   " }), "en", "en")).toBe("(unnamed step)");
    expect(stepText(step(undefined), "en", "en")).toBe("(unnamed step)");
  });
});

describe("numberRepeats", () => {
  it("leaves distinct texts alone", () => {
    expect(numberRepeats(["A", "B", "C"], (x) => x)).toEqual(["A", "B", "C"]);
  });

  it("counts the second and later repeat in list order", () => {
    expect(numberRepeats(["Review", "Done", "Review", "Review"], (x) => x)).toEqual([
      "Review",
      "Done",
      "Review (2)",
      "Review (3)",
    ]);
  });

  it("keeps one entry per item and reads textOf per item", () => {
    const items = [{ n: "x" }, { n: "x" }];
    expect(numberRepeats(items, (i) => i.n)).toEqual(["x", "x (2)"]);
    expect(numberRepeats([], (x: string) => x)).toEqual([]);
  });

  it("prints a label holding a placeholder or a replacement pattern as written", () => {
    expect(numberRepeats(["{n}", "{n}"], (x) => x)).toEqual(["{n}", "{n} (2)"]);
    expect(numberRepeats(["$&", "$&"], (x) => x)).toEqual(["$&", "$& (2)"]);
  });
});

describe("wayOutHeading", () => {
  const texts = new Map([
    ["step_b", "Done"],
    ["step_c", "{path} $& {step}"],
  ]);

  it("joins the way out and its target with the arrow", () => {
    expect(wayOutHeading(way("Approve", "step_b"), texts)).toBe("Approve → Done");
  });

  it("reads an unnamed way out as unnamed", () => {
    expect(wayOutHeading(way("  ", "step_b"), texts)).toBe("(unnamed way out) → Done");
    expect(wayOutHeading(way(undefined, "step_b"), texts)).toBe("(unnamed way out) → Done");
  });

  it("reads no target, or one the map lacks, as no step yet", () => {
    expect(wayOutHeading(way("Send"), texts)).toBe("Send → (no step yet)");
    expect(wayOutHeading(way("Send", ""), texts)).toBe("Send → (no step yet)");
    expect(wayOutHeading(way("Send", "step_gone"), texts)).toBe("Send → (no step yet)");
  });

  it("prints a target text holding placeholders literally", () => {
    expect(wayOutHeading(way("Go", "step_c"), texts)).toBe("Go → {path} $& {step}");
  });

  it("prints a way out label holding placeholders literally", () => {
    expect(wayOutHeading(way("{step} $&", "step_b"), texts)).toBe("{step} $& → Done");
  });
});
