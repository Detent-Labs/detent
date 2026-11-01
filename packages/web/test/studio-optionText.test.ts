import { describe, expect, it } from "bun:test";
import { numberRepeats, stepText, stepTextMap, wayOutHeading } from "../src/areas/studio/panels/shared/optionText.js";
import type { DraftStep } from "../src/areas/studio/draft/createStep.js";

type WayOut = Parameters<typeof wayOutHeading>[0];
/** A way out; ids are branded in the schema and unread by the module. */
const way = (label: string | undefined, to?: string): WayOut => ({ id: "path_p", label, to }) as unknown as WayOut;

const step = (label: DraftStep["label"], id = "step_a"): DraftStep => ({ id, key: "k", label, type: "task" }) as unknown as DraftStep;

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

describe("stepTextMap", () => {
  const map = (labels: (string | undefined)[]) =>
    [...stepTextMap(labels.map((l, i) => step(l === undefined ? undefined : { en: l }, `step_${i + 1}`)), "en", "en").entries()];

  it("keeps a label one step alone carries plain", () => {
    expect(map(["Antrag", "Prüfung"])).toEqual([
      ["step_1", "Antrag"],
      ["step_2", "Prüfung"],
    ]);
  });

  it("gives every step sharing a label its steps-rail number", () => {
    expect(map(["Antrag", "Review", "Done", "Archive", "Close", "Review"])).toEqual([
      ["step_1", "Antrag"],
      ["step_2", "Review (step 2)"],
      ["step_3", "Done"],
      ["step_4", "Archive"],
      ["step_5", "Close"],
      ["step_6", "Review (step 6)"],
    ]);
  });

  it("keeps a single unnamed step unnumbered", () => {
    expect(map(["Antrag", ""])).toEqual([
      ["step_1", "Antrag"],
      ["step_2", "(unnamed step)"],
    ]);
  });

  it("numbers two or more unnamed steps by their rail rows", () => {
    expect(map(["Antrag", "", undefined])).toEqual([
      ["step_1", "Antrag"],
      ["step_2", "(unnamed step 2)"],
      ["step_3", "(unnamed step 3)"],
    ]);
  });

  it("compares the label at the content locale", () => {
    const steps = [step({ en: "Review", de: "Prüfung" }, "step_1"), step({ en: "Check", de: "Prüfung" }, "step_2")];
    expect([...stepTextMap(steps, "en", "en").values()]).toEqual(["Review", "Check"]);
    expect([...stepTextMap(steps, "de", "en").values()]).toEqual(["Prüfung (step 1)", "Prüfung (step 2)"]);
  });

  it("counts a step with no id toward the rail number but gives it no entry", () => {
    const steps = [{ key: "k", type: "task", label: { en: "Review" } } as unknown as DraftStep, step({ en: "Review" }, "step_2")];
    expect([...stepTextMap(steps, "en", "en").entries()]).toEqual([["step_2", "Review (step 2)"]]);
  });

  it("prints a label holding a placeholder or a replacement pattern as written", () => {
    expect(map(["{n} $&", "{n} $&"]).map(([, text]) => text)).toEqual(["{n} $& (step 1)", "{n} $& (step 2)"]);
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

  it("prints a label that already ends with the arrow and the target alone", () => {
    expect(wayOutHeading(way("Prüfung → Done", "step_b"), texts)).toBe("Prüfung → Done");
    expect(wayOutHeading(way("Prüfung → Done ", "step_b"), texts)).toBe("Prüfung → Done ");
  });

  it("compares against the target's text from the map", () => {
    const numbered = new Map([["step_6", "Review (step 6)"]]);
    expect(wayOutHeading(way("A → Review (step 6)", "step_6"), numbered)).toBe("A → Review (step 6)");
    expect(wayOutHeading(way("A → Review", "step_6"), numbered)).toBe("A → Review → Review (step 6)");
  });

  it("still names the target when the label ends with another step or no arrow", () => {
    expect(wayOutHeading(way("Prüfung → Capture", "step_b"), texts)).toBe("Prüfung → Capture → Done");
    expect(wayOutHeading(way("Done", "step_b"), texts)).toBe("Done → Done");
    expect(wayOutHeading(way("Go → Done", "step_gone"), texts)).toBe("Go → Done → (no step yet)");
  });
});
