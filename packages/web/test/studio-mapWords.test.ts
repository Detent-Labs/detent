import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { DraftStep } from "../src/areas/studio/draft/createStep.js";
import { buildOperands } from "../src/areas/studio/panels/shared/conditionLogic.js";
import { stepTextMap } from "../src/areas/studio/panels/shared/optionText.js";
import {
  nodeName,
  pathName,
  stampLines,
  stampWords,
  wayOutSentence,
  STAMP_CHROME_HEIGHT,
  STAMP_LINE_HEIGHT,
  STAMP_PADDING_X,
  STAMP_RULE,
} from "../src/areas/studio/canvas/mapWords.js";

/**
 * `studio-canvas`: every word the canvas prints or announces, read off the
 * pure module that owns them (design D1, D3, D4, D9, D11).
 */

const FIELDS = [
  { id: "field_00000000-0000-4000-8000-0000000000a1", key: "amount", type: "number", label: { en: "Amount" } },
] as unknown as DraftField[];

const operands = buildOperands({ fields: FIELDS, locale: "en", baseLocale: "en" });

const OVER = { lang: "cel", src: "data.amount > 1000.0" };
const UNDER = { lang: "cel", src: "data.amount <= 1000.0" };

type RawPath = Record<string, unknown>;

function stepOf(paths: RawPath[], over: Record<string, unknown> = {}): DraftStep {
  return { id: "step_review", key: "k_review", type: "task", label: { en: "Review" }, paths, ...over } as unknown as DraftStep;
}

/** The step's own path objects, the ones `wayOutSentence` ranks among. */
function sentences(step: DraftStep): Array<string | undefined> {
  return (step.paths ?? []).map((p) => wayOutSentence(p, step, operands));
}

describe("wayOutSentence: one form per path (design D3)", () => {
  it("ranks two guarded automatic paths at 10 and 20, and the default reads Otherwise", () => {
    const step = stepOf([
      { id: "path_a", key: "k_a", label: "Big", to: "step_x", trigger: "automatic", priority: 10, guard: OVER },
      { id: "path_b", key: "k_b", label: "Small", to: "step_y", trigger: "automatic", priority: 20, guard: UNDER },
      { id: "path_c", key: "k_c", label: "Rest", to: "step_z", trigger: "automatic", priority: 30 },
    ]);

    expect(sentences(step)).toEqual([
      "First, only if Amount is greater than 1,000",
      "Second, only if Amount is at most 1,000",
      "Otherwise",
    ]);
  });

  it("ranks by priority, lowest first, whatever the array order, and ties in array order", () => {
    const step = stepOf([
      { id: "path_a", key: "k_a", label: "A", to: "step_x", trigger: "automatic", priority: 20, guard: OVER },
      { id: "path_b", key: "k_b", label: "B", to: "step_y", trigger: "automatic", priority: 10, guard: UNDER },
      { id: "path_c", key: "k_c", label: "C", to: "step_z", trigger: "automatic", priority: 10, guard: OVER },
    ]);

    expect(sentences(step)).toEqual([
      "Third, only if Amount is greater than 1,000",
      "First, only if Amount is at most 1,000",
      "Second, only if Amount is greater than 1,000",
    ]);
  });

  it("reads the fifth place as a word and the sixth as a number", () => {
    const step = stepOf(
      [10, 20, 30, 40, 50, 60].map((priority, i) => ({
        id: `path_${i}`,
        key: `k_${i}`,
        label: `Way ${i}`,
        to: "step_x",
        trigger: "automatic",
        priority,
        guard: OVER,
      })),
    );
    const read = sentences(step);

    expect(read[3]).toBe("Fourth, only if Amount is greater than 1,000");
    expect(read[4]).toBe("Fifth, only if Amount is greater than 1,000");
    expect(read[5]).toBe("Number 6, only if Amount is greater than 1,000");
  });

  it("reads a guarded manual path as Only if", () => {
    const step = stepOf([
      { id: "path_a", key: "k_a", label: "Approve", to: "step_x", trigger: "manual", guard: OVER },
      { id: "path_b", key: "k_b", label: "Reject", to: "step_y", trigger: "manual", guard: UNDER },
    ]);

    expect(sentences(step)).toEqual(["Only if Amount is greater than 1,000", "Only if Amount is at most 1,000"]);
  });

  it("reads the step's only automatic path, guarded, as Only if with no place", () => {
    const step = stepOf([{ id: "path_a", key: "k_a", label: "On", to: "step_x", trigger: "automatic", priority: 10, guard: OVER }]);

    expect(sentences(step)).toEqual(["Only if Amount is greater than 1,000"]);
  });

  it("reads a guarded automatic path with no priority as Only if, beside others", () => {
    const step = stepOf([
      { id: "path_a", key: "k_a", label: "A", to: "step_x", trigger: "automatic", guard: OVER },
      { id: "path_b", key: "k_b", label: "B", to: "step_y", trigger: "automatic", priority: 20 },
    ]);

    expect(sentences(step)).toEqual(["Only if Amount is greater than 1,000", "Otherwise"]);
  });

  it("gives a guardless manual path and a lone guardless automatic path no sentence", () => {
    expect(sentences(stepOf([{ id: "path_a", key: "k_a", label: "Send", to: "step_x", trigger: "manual" }]))).toEqual([
      undefined,
    ]);
    expect(
      sentences(stepOf([{ id: "path_a", key: "k_a", label: "On", to: "step_x", trigger: "automatic", priority: 10 }])),
    ).toEqual([undefined]);
  });

  it("reads an empty guard source as no guard", () => {
    const blank = { lang: "cel", src: "   " };
    expect(sentences(stepOf([{ id: "path_a", key: "k_a", label: "Send", to: "step_x", trigger: "manual", guard: blank }]))).toEqual([
      undefined,
    ]);
    const step = stepOf([
      { id: "path_a", key: "k_a", label: "A", to: "step_x", trigger: "automatic", priority: 10, guard: OVER },
      { id: "path_b", key: "k_b", label: "B", to: "step_y", trigger: "automatic", priority: 20, guard: blank },
    ]);
    expect(sentences(step)).toEqual(["First, only if Amount is greater than 1,000", "Otherwise"]);
  });

  it("reads an unreadable guard as a hand-written rule, with no CEL", () => {
    const step = stepOf([
      { id: "path_a", key: "k_a", label: "A", to: "step_x", trigger: "manual", guard: { lang: "cel", src: "size(data.amount) > 3" } },
    ]);

    expect(sentences(step)).toEqual(["Only if a hand-written rule holds"]);
  });

  it("keeps a context operand lowercase after Only if", () => {
    const step = stepOf([
      { id: "path_a", key: "k_a", label: "A", to: "step_x", trigger: "manual", guard: { lang: "cel", src: 'instance.status == "running"' } },
    ]);

    expect(sentences(step)).toEqual(["Only if the case's status is running"]);
  });
});

describe("stampWords", () => {
  it("stamps the initial step Start", () => {
    expect(stampWords(stepOf([]), "step_review")).toEqual({ start: "Start" });
  });

  it("stamps an end with its whole outcome, or End alone", () => {
    expect(stampWords(stepOf([], { terminal: true, outcome: "rejected" }), "step_other")).toEqual({ end: "End: rejected" });
    expect(stampWords(stepOf([], { terminal: true }), "step_other")).toEqual({ end: "End" });
  });

  it("stamps a step that is both initial and an end twice", () => {
    expect(stampWords(stepOf([], { terminal: true, outcome: "done" }), "step_review")).toEqual({ start: "Start", end: "End: done" });
  });

  it("stamps an ordinary step nothing", () => {
    expect(stampWords(stepOf([]), "step_other")).toEqual({});
  });
});

describe("stampLines", () => {
  // The node is 180 wide; a stamp alone takes 164, and two share it.
  const ALONE = 164;
  const SHARED = (164 - 4) / 2;

  it("takes one line for a short stamp", () => {
    expect(stampLines("Start", SHARED)).toBe(1);
    expect(stampLines("End", SHARED)).toBe(1);
  });

  it("wraps a long outcome over more lines, never fewer than its letters need", () => {
    const text = "End: escalated_to_management";
    expect(stampLines(text, ALONE)).toBe(3);
    expect(stampLines(text, SHARED)).toBeGreaterThan(stampLines(text, ALONE));
  });

  it("counts the uppercase form, where ß prints as SS", () => {
    expect(stampLines("End: ßßßßßßßßßß", ALONE)).toBe(stampLines("End: SSSSSSSSSSSSSSSSSSSS", ALONE));
  });

  // StyleX cannot read an imported constant at build time, so the canvas's
  // compiled `stamp` style repeats the four metrics as literals. A drift
  // between them would make the estimate frame a stamp it does not draw.
  it("measures the stamp the canvas's compiled style draws", () => {
    const source = readFileSync(new URL("../src/areas/studio/canvas/CanvasView.tsx", import.meta.url), "utf8");
    const stamp = /\n {2}stamp: \{([\s\S]*?)\n {2}\},/.exec(source)?.[1] ?? "";

    expect(stamp).toContain(`borderWidth: ${STAMP_RULE},`);
    expect(stamp).toContain(`paddingInline: ${STAMP_PADDING_X},`);
    expect(stamp).toContain(`lineHeight: "${STAMP_LINE_HEIGHT}px",`);
    expect(stamp).toContain(`paddingBlock: ${(STAMP_CHROME_HEIGHT - 2 * STAMP_RULE) / 2},`);
  });
});

describe("nodeName", () => {
  it("names an end in full, its outcome as the stamp's words", () => {
    const step = { id: "step_approved", key: "approved", type: "task", terminal: true, outcome: "approved", label: { en: "Approved" } } as unknown as DraftStep;

    expect(nodeName(step, "Approved", 0, stampWords(step, "step_other"))).toBe("Approved, An end, 0 ways out, End: approved");
  });

  it("announces one way out in the singular", () => {
    const step = stepOf([{ id: "path_a", key: "k_a", label: "Send", to: "step_x", trigger: "manual" }]);

    expect(nodeName(step, "Review", 1, {})).toBe("Review, A step someone works, 1 way out");
  });

  it("names a call to another process by the kind phrase, then the start stamp", () => {
    const step = stepOf([], { type: "subprocess" });

    expect(nodeName(step, "Review", 2, stampWords(step, "step_review"))).toBe(
      "Review, A call to another process, 2 ways out, Start",
    );
  });

  it("puts the start stamp before the end stamp", () => {
    const step = stepOf([], { terminal: true });

    expect(nodeName(step, "Review", 0, stampWords(step, "step_review"))).toBe("Review, An end, 0 ways out, Start, End");
  });

  it("tells two unnamed steps apart by their rail number, as the step page does", () => {
    const steps = [
      { id: "step_1", key: "k_one", label: { en: "One" } },
      { id: "step_2", key: "k_two", label: { en: "Two" } },
      { id: "step_3", key: "k_three" },
      { id: "step_4", key: "k_four", label: { en: "Four" } },
      { id: "step_5", key: "k_five", label: {} },
    ] as unknown as DraftStep[];
    const texts = stepTextMap(steps, "en", "en");

    expect(nodeName(steps[2]!, texts.get("step_3")!, 0, {})).toBe("(unnamed step 3), A step someone works, 0 ways out");
    expect(nodeName(steps[4]!, texts.get("step_5")!, 0, {})).toBe("(unnamed step 5), A step someone works, 0 ways out");
  });
});

describe("pathName", () => {
  it("names a guardless manual path in words", () => {
    const path = { id: "path_send", key: "k_send", label: "Send", to: "step_review", trigger: "manual" } as never;

    expect(pathName(path, "Capture", "Review", undefined)).toBe("Send, from Capture to Review, a person chooses, no condition");
  });

  it("names the first automatic path with its place and condition, and no number", () => {
    const step = stepOf([
      { id: "path_a", key: "k_a", label: "Approve", to: "step_x", trigger: "automatic", priority: 10, guard: OVER },
      { id: "path_b", key: "k_b", label: "Reject", to: "step_y", trigger: "automatic", priority: 20 },
    ]);
    const [first, rest] = step.paths!;

    expect(pathName(first!, "Review", "Approved", wayOutSentence(first!, step, operands))).toBe(
      "Approve, from Review to Approved, happens by itself, First, only if Amount is greater than 1,000",
    );
    expect(pathName(rest!, "Review", "Rejected", wayOutSentence(rest!, step, operands))).toBe(
      "Reject, from Review to Rejected, happens by itself, Otherwise",
    );
  });

  it("says a path with no trigger yet is not set", () => {
    const path = { id: "path_a", label: "Send", to: "step_x" } as never;

    expect(pathName(path, "Capture", "Review", undefined)).toBe("Send, from Capture to Review, not set yet, no condition");
  });

  it("names a path with an empty label as an unnamed way out", () => {
    const blank = { id: "path_a", label: "", to: "step_x", trigger: "manual" } as never;
    const spaces = { id: "path_b", label: "   ", to: "step_x", trigger: "manual" } as never;

    expect(pathName(blank, "Capture", "Review", undefined)).toBe("(unnamed way out), from Capture to Review, a person chooses, no condition");
    expect(pathName(spaces, "Capture", "Review", undefined)).toBe("(unnamed way out), from Capture to Review, a person chooses, no condition");
  });
});

describe("no machine value in any name or sentence (design D9)", () => {
  const steps = [
    stepOf(
      [
        { id: "path_a", key: "k_way_a", label: "Approve", to: "step_done", trigger: "automatic", priority: 10, guard: OVER },
        { id: "path_b", key: "k_way_b", label: "Check", to: "step_done", trigger: "automatic", priority: 20, guard: { lang: "cel", src: "size(data.amount) > 3" } },
        { id: "path_c", key: "k_way_c", label: "Reject", to: "step_done", trigger: "automatic", priority: 30 },
      ],
      { id: "step_review", key: "k_step_review" },
    ),
    stepOf(
      [
        { id: "path_d", key: "k_way_d", label: "Send", to: "step_review", trigger: "manual", guard: UNDER },
        { id: "path_e", key: "k_way_e", label: "Skip", to: "step_done", trigger: "manual" },
      ],
      { id: "step_capture", key: "k_step_capture", label: { en: "Capture" }, type: "subprocess" },
    ),
    stepOf([], { id: "step_done", key: "k_step_done", label: { en: "Done" }, terminal: true, outcome: "finished" }),
  ];
  const texts = stepTextMap(steps, "en", "en");
  const words: string[] = [];
  for (const step of steps) {
    const outgoing = step.paths?.length ?? 0;
    words.push(nodeName(step, texts.get(step.id!)!, outgoing, stampWords(step, "step_capture")));
    for (const path of step.paths ?? []) {
      const sentence = wayOutSentence(path, step, operands);
      if (sentence !== undefined) words.push(sentence);
      words.push(pathName(path, texts.get(step.id!)!, texts.get(path.to!)!, sentence));
    }
  }

  it("reads every name and sentence the fixture yields", () => {
    expect(words.length).toBe(12);
  });

  it("carries no step key and no path key", () => {
    for (const w of words) expect(w).not.toMatch(/k_(step|way)_/);
  });

  it("carries no trigger or step-type enum value", () => {
    for (const w of words) expect(w).not.toMatch(/\b(manual|automatic|task|subprocess|terminal)\b/);
  });

  it("carries no priority number", () => {
    for (const w of words) expect(w).not.toMatch(/\b(10|20|30)\b/);
  });

  it("carries no CEL source", () => {
    for (const w of words) {
      expect(w).not.toContain("data.");
      expect(w).not.toMatch(/[<>]=?|==|size\(/);
    }
  });
});
