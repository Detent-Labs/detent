import { describe, expect, it } from "bun:test";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { DraftStep } from "../src/areas/studio/draft/createStep.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { ProcessSummary } from "../src/areas/studio/api/types.js";
import type { SectionName } from "../src/areas/studio/panels/sectionsFor.js";
import {
  defaultOpenSection,
  nextOpenSection,
  openSectionFor,
  sectionSummary,
  type SectionState,
  type SummaryInput,
} from "../src/areas/studio/panels/stepSummaries.js";

/**
 * A step page section header's summary and state, and which section the page
 * opens on (`studio-step-page`: "A section header carries a summary and its
 * state", "One section stands open at a time", "The page opens on the section
 * that needs the author"). Pure functions — no DOM, no rendering.
 */

const ds = (entry: Record<string, unknown>) => entry as unknown as DraftStep;

const REVIEW = ds({ id: "step_b", key: "review", label: { en: "Review" } });
const REWORK = ds({ id: "step_c", key: "rework", label: { en: "Rework" } });

function input(step: DraftStep, over: Partial<SummaryInput> = {}): SummaryInput {
  const steps = over.steps ?? [step, REVIEW, REWORK];
  return {
    step,
    draft: over.draft ?? ({ baseLocale: "en", workflow: { initialStep: step.id, steps } } as unknown as Draft),
    fields: over.fields ?? [],
    steps,
    processes: over.processes ?? [],
    contentLocale: "en",
    baseLocale: "en",
  };
}

const task = (entry: Record<string, unknown> = {}) => ds({ id: "step_a", key: "intake", label: { en: "Intake" }, type: "task", ...entry });
const end = (entry: Record<string, unknown> = {}) => task({ terminal: true, ...entry });
const call = (entry: Record<string, unknown> = {}) => task({ type: "subprocess", ...entry });

describe("sectionSummary: Who acts", () => {
  it("names a curated strategy in words and reads done", () => {
    const step = task({ assignment: { strategy: { type: "org.group-members", config: { groupId: "g" } } } });

    expect(sectionSummary("assignment", input(step))).toEqual({ text: "Everyone in a group", mono: false, state: "done" });
  });

  it("prints an uncurated registry type in mono", () => {
    const step = task({ assignment: { strategy: { type: "acme.round-robin" } } });

    expect(sectionSummary("assignment", input(step))).toEqual({ text: "acme.round-robin", mono: true, state: "done" });
  });

  it("reads Nobody in particular, to do, on an unassigned task step", () => {
    expect(sectionSummary("assignment", input(task()))).toEqual({ text: "Nobody in particular", mono: false, state: "todo" });
  });

  it("reads optional on an unassigned end step", () => {
    expect(sectionSummary("assignment", input(end())).state).toBe("optional");
  });
});

describe("sectionSummary: Form", () => {
  const fields = [
    { id: "field_1", key: "a", type: "string", label: { en: "A" } },
    { id: "field_2", key: "b", type: "string", label: { en: "B" } },
  ] as unknown as DraftField[];

  it("states the form's size and reads done", () => {
    const step = task({ view: { fields: [{ ref: "field_1", required: true }, { ref: "field_2" }] } });

    expect(sectionSummary("form", input(step, { fields }))).toEqual({ text: "2 fields, 1 required", mono: false, state: "done" });
  });

  it("reads No fields yet, optional, on a step with no field entry", () => {
    const step = task({ view: { fields: [{ kind: "note", text: { en: "Read me" } }] } });

    expect(sectionSummary("form", input(step, { fields }))).toEqual({ text: "No fields yet", mono: false, state: "optional" });
  });
});

describe("sectionSummary: Which process it calls", () => {
  const credit = { processId: "proc_credit", version: 1, key: "credit", label: { en: "Credit check" }, baseLocale: "en" } as unknown as ProcessSummary;

  it("names the called process by its label", () => {
    const step = call({ subprocess: { processId: "proc_credit", versionBinding: "pinned", pinnedVersion: 1 } });

    expect(sectionSummary("subprocess", input(step, { processes: [credit] }))).toEqual({ text: "Credit check", mono: false, state: "done" });
  });

  it("falls back to the process id in mono while the list lacks it", () => {
    const step = call({ subprocess: { processId: "proc_credit", versionBinding: "pinned" } });

    expect(sectionSummary("subprocess", input(step))).toEqual({ text: "proc_credit", mono: true, state: "done" });
  });

  it("reads No process chosen yet, to do, without a process", () => {
    expect(sectionSummary("subprocess", input(call({ subprocess: { versionBinding: "pinned" } })))).toEqual({
      text: "No process chosen yet",
      mono: false,
      state: "todo",
    });
  });
});

describe("sectionSummary: Ways out", () => {
  it("reads every way out's heading, joined with a comma", () => {
    const step = task({
      paths: [
        { id: "path_1", label: "Approve", to: "step_b" },
        { id: "path_2", label: "Reject", to: "step_c" },
      ],
    });

    expect(sectionSummary("paths", input(step))).toEqual({ text: "Approve → Review, Reject → Rework", mono: false, state: "done" });
  });

  it("reads No way out yet, to do, on a step with none", () => {
    expect(sectionSummary("paths", input(task()))).toEqual({ text: "No way out yet", mono: false, state: "todo" });
  });
});

describe("sectionSummary: How the case ends", () => {
  it("prints the outcome in mono and reads done", () => {
    expect(sectionSummary("howItEnds", input(end({ outcome: "approved" })))).toEqual({ text: "approved", mono: true, state: "done" });
  });

  it("reads No outcome yet, to do, where the process declares outcomes", () => {
    const step = end();
    const draft = { baseLocale: "en", contract: { outcomes: ["approved"] }, workflow: { steps: [step] } } as unknown as Draft;

    expect(sectionSummary("howItEnds", input(step, { draft }))).toEqual({ text: "No outcome yet", mono: false, state: "todo" });
  });

  it("reads optional where the process declares none", () => {
    expect(sectionSummary("howItEnds", input(end())).state).toBe("optional");
  });
});

describe("sectionSummary: Time limit", () => {
  it("reads No time limit, optional, on a step with none", () => {
    expect(sectionSummary("timers", input(task()))).toEqual({ text: "No time limit", mono: false, state: "optional" });
  });

  it("counts one time limit, and several", () => {
    expect(sectionSummary("timers", input(task({ timers: [{ id: "timer_1" }] })))).toEqual({ text: "1 time limit", mono: false, state: "done" });
    expect(sectionSummary("timers", input(task({ timers: [{ id: "timer_1" }, { id: "timer_2" }, { id: "timer_3" }] }))).text).toBe(
      "3 time limits",
    );
  });
});

describe("sectionSummary: When entered or left", () => {
  it("counts the entry actions, and the exit and cancel actions together", () => {
    const step = task({ onEntry: [{ id: "a1" }, { id: "a2" }], onExit: [{ id: "a3" }], onCancel: [{ id: "a4" }] });

    expect(sectionSummary("lifecycle", input(step))).toEqual({ text: "2 when entered, 2 when left", mono: false, state: "done" });
  });

  it("prints a zero count as a numeral", () => {
    expect(sectionSummary("lifecycle", input(task({ onEntry: [{ id: "a1" }] }))).text).toBe("1 when entered, 0 when left");
  });

  it("counts the entry actions alone on an end step", () => {
    expect(sectionSummary("lifecycle", input(end({ onEntry: [{ id: "a1" }] })))).toEqual({ text: "1 when entered", mono: false, state: "done" });
  });

  it("reads No actions yet, optional, on a step with none", () => {
    expect(sectionSummary("lifecycle", input(task()))).toEqual({ text: "No actions yet", mono: false, state: "optional" });
    expect(sectionSummary("lifecycle", input(end())).text).toBe("No actions yet");
  });
});

describe("sectionSummary: More", () => {
  it("reads Follows the process settings, optional, where the step overrides nothing", () => {
    expect(sectionSummary("more", input(task()))).toEqual({ text: "Follows the process settings", mono: false, state: "optional" });
  });

  it("names each override in words, joined with a comma, and reads done", () => {
    const step = task({ cancellable: false, collaboration: { comments: true, attachments: false } });

    expect(sectionSummary("more", input(step))).toEqual({
      text: "Not cancellable here, Comments on, Attachments off",
      mono: false,
      state: "done",
    });
  });

  it("names the other half of each pair", () => {
    const step = task({ cancellable: true, collaboration: { comments: false, attachments: true } });

    expect(sectionSummary("more", input(step)).text).toBe("Cancellable here, Comments off, Attachments on");
  });

  it("counts no collaboration override on a subprocess step, which draws no collaboration control", () => {
    expect(sectionSummary("more", input(call({ collaboration: { comments: false } })))).toEqual({
      text: "Follows the process settings",
      mono: false,
      state: "optional",
    });
  });

  it("counts no cancelling override on an end step, which draws no cancelling control", () => {
    expect(sectionSummary("more", input(end({ cancellable: false })))).toEqual({
      text: "Follows the process settings",
      mono: false,
      state: "optional",
    });
  });

  it("names a single override alone", () => {
    expect(sectionSummary("more", input(task({ collaboration: { attachments: true } })))).toEqual({
      text: "Attachments on",
      mono: false,
      state: "done",
    });
  });
});

describe("sectionSummary fills a slot as written", () => {
  it("keeps a $ pattern in a way out's label", () => {
    const step = task({ paths: [{ id: "path_1", label: "Pay $& now", to: "step_b" }] });

    expect(sectionSummary("paths", input(step)).text).toBe("Pay $& now → Review");
  });
});

describe("defaultOpenSection", () => {
  const sections: SectionName[] = ["assignment", "form", "paths", "timers", "lifecycle", "more"];
  const states = (todo: SectionName[] = []) =>
    new Map<SectionName, SectionState>(sections.map((s) => [s, todo.includes(s) ? "todo" : "optional"]));

  it("opens Ways out where a way out is selected", () => {
    expect(defaultOpenSection(sections, new Map([["timers", 1]]), states(["assignment"]), "path_1")).toBe("paths");
  });

  it("opens the first section with a check", () => {
    expect(defaultOpenSection(sections, new Map([["timers", 1], ["more", 2]]), states(["assignment"]), undefined)).toBe("timers");
  });

  it("skips a section whose count is zero", () => {
    expect(defaultOpenSection(sections, new Map([["form", 0]]), states(["paths"]), undefined)).toBe("paths");
  });

  it("opens the first section still to do where no section carries a check", () => {
    expect(defaultOpenSection(sections, new Map(), states(["paths", "assignment"]), undefined)).toBe("assignment");
  });

  it("opens the first section where none is to do", () => {
    expect(defaultOpenSection(sections, new Map(), states(), undefined)).toBe("assignment");
  });

  it("ignores a selected way out where the sections hold no Ways out", () => {
    const ends: SectionName[] = ["assignment", "form", "howItEnds", "lifecycle", "more"];

    expect(defaultOpenSection(ends, new Map(), new Map([["howItEnds", "todo"]]), "path_1")).toBe("howItEnds");
  });

  it("opens nothing where no section stands", () => {
    expect(defaultOpenSection([], new Map(), new Map(), undefined)).toBeUndefined();
  });
});

describe("nextOpenSection", () => {
  it("closes the open section when its own header is pressed", () => {
    expect(nextOpenSection("form", "form")).toBeUndefined();
  });

  it("opens the pressed section otherwise", () => {
    expect(nextOpenSection("assignment", "form")).toBe("form");
    expect(nextOpenSection(undefined, "form")).toBe("form");
  });
});

describe("openSectionFor", () => {
  const ends: SectionName[] = ["assignment", "form", "howItEnds", "lifecycle", "more"];

  it("keeps an open section the list still holds", () => {
    expect(openSectionFor("form", ends, "assignment")).toBe("form");
  });

  it("opens the fallback where the list dropped the open section", () => {
    expect(openSectionFor("paths", ends, "howItEnds")).toBe("howItEnds");
  });

  it("keeps a deliberate close closed", () => {
    expect(openSectionFor(undefined, ends, "assignment")).toBeUndefined();
  });
});
