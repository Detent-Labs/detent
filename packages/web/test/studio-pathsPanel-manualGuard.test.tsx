import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Path, Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { PathsPanel } from "../src/areas/studio/panels/PathsPanel.js";

/**
 * `studio-condition-builder`: "A way out's row shows a "How it is taken"
 * control" and "A way out's guard stands under "Only when" for either trigger".
 * A manual path shows its guard editor and no `priority` input; an automatic
 * path keeps both. `studio-step-page`: "A way out reads as a sentence and
 * keeps its key in its own Developer view". The context is hand-built, as in
 * `studio-actionListEditor-registryBadge.test.tsx`: a live `DraftProvider`
 * resolves its fetches async and never settles under `renderToStaticMarkup`.
 */

type DraftPath = DraftOf<Path>;
type DraftStep = DraftOf<Step>;

const validation: ValidationResult = {
  zodValid: true,
  issues: [],
  dimensions: {
    zod: "ran",
    duration: "ran",
    structural: "ran",
    actionType: "ran",
    assignmentType: "ran",
    dataSourceType: "ran",
    registryConfig: "not-run",
    cel: "ran",
  },
  subprocessStepStatus: {},
  chainingSiteStatus: {},
};

const FIELDS = [
  { id: "field_00000000-0000-4000-8000-0000000000a1", key: "amount", type: "number", label: { en: "Amount" } },
] as unknown as DraftField[];

const STEPS = [
  { id: "step_a", key: "intake", type: "task" },
  { id: "step_b", key: "approved", type: "task", label: { en: "Done" } },
] as unknown as DraftStep[];

const context: DraftContextValue = {
  draft: { fields: FIELDS } as never,
  mutate: () => {},
  replace: () => {},
  validation,
  loadedChildren: {},
  setChildForStep: () => {},
  registry: undefined,
  loadedChainingTargets: {},
  contentLocale: "en",
  setContentLocale: () => {},
  usedLocales: ["en"],
  loadGeneration: 0,
};

const GUARD = { lang: "cel", src: "data.amount > 1000.0" };

function render(path: Record<string, unknown>): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={context}>
      <PathsPanel
        paths={[{ id: "path_1", key: "approve", label: "Approve", to: "step_b", ...path } as unknown as DraftPath]}
        steps={STEPS}
        fields={FIELDS}
        stepId="step_a"
        onChange={() => {}}
        contentLocale="en"
        baseLocale="en"
      />
    </DraftContext.Provider>,
  );
}

// A caption prints its catalog words alone; no `<code>` JSON property follows (`ui-string-overrides`).
const PRIORITY_INPUT = /<label>Tried in this order, lowest first<input/;
const NOTE = "The person sees this way out&#x27;s button only while the condition holds.";

/** True where `text` stands inside an open `<label>` element. */
function insideLabel(html: string, text: string): boolean {
  const before = html.slice(0, html.indexOf(text));
  return before.lastIndexOf("<label") > before.lastIndexOf("</label>");
}

describe("a manual path with a guard", () => {
  const html = render({ trigger: "manual", guard: GUARD });

  it("shows the guard's builder rows under the Only when heading", () => {
    expect(html).toContain("Only when");
    // The builder row: an operand picker holding the guard's field, selected.
    expect(html).toMatch(/<option value="data\.amount" selected="">/);
  });

  it("says the participant sees the button only while the condition holds", () => {
    expect(html).toContain(NOTE);
    expect(html).toContain("Leave it empty to always offer this way out.");
  });

  it("prints the hint as a note, outside any label", () => {
    expect(html).toMatch(/<p[^>]*>Leave it empty to always offer this way out\.<\/p>/);
    expect(insideLabel(html, "Leave it empty to always offer this way out.")).toBe(false);
  });

  it("shows no priority input", () => {
    expect(html).not.toMatch(PRIORITY_INPUT);
  });
});

describe("a manual path with no guard", () => {
  it("still offers the guard editor", () => {
    const html = render({ trigger: "manual" });

    expect(html).toContain("Only when");
    expect(html).toContain("Leave it empty to always offer this way out.");
    expect(html).not.toMatch(PRIORITY_INPUT);
  });
});

describe("an automatic path", () => {
  const html = render({ trigger: "automatic", priority: 1, guard: GUARD });

  it("shows the priority input beside the guard", () => {
    expect(html).toContain("Only when");
    expect(html).toMatch(PRIORITY_INPUT);
    expect(html).toContain("Leave it empty on the one way out taken when nothing else matches.");
  });

  it("prints the hint as a note, outside any label", () => {
    const hint = "Leave it empty on the one way out taken when nothing else matches.";

    expect(html).toMatch(new RegExp(`<p[^>]*>${hint.replace(/\./g, "\\.")}</p>`));
    expect(insideLabel(html, hint)).toBe(false);
  });

  it("carries no manual-path note", () => {
    expect(html).not.toContain(NOTE);
    expect(html).not.toContain("Leave it empty to always offer this way out.");
  });

  it("prints no JSON property name in a code element", () => {
    expect(html).not.toMatch(/<code[^>]*>priority<\/code>/);
    expect(html).not.toMatch(/<code[^>]*>onPath<\/code>/);
  });
});

/** The `<h4>` heading each row opens with, or `undefined` where none stands. */
function rowHeading(html: string): string | undefined {
  return html.match(/<h4[^>]*>([^<]*)<\/h4>/)?.[1];
}

describe("a way out's heading sentence", () => {
  it("reads the way out's name, an arrow and the target step's name", () => {
    expect(rowHeading(render({}))).toBe("Approve → Done");
  });

  it("opens the row, ahead of the Name caption", () => {
    const html = render({});

    expect(html.indexOf("<h4")).toBeGreaterThan(-1);
    expect(html.indexOf("<h4")).toBeLessThan(html.indexOf(">Name<"));
  });

  it("says an unnamed way out is unnamed", () => {
    expect(rowHeading(render({ label: "" }))).toBe("(unnamed way out) → Done");
    expect(rowHeading(render({ label: "   " }))).toBe("(unnamed way out) → Done");
  });

  it("prints a name holding a placeholder or a replacement pattern verbatim", () => {
    expect(rowHeading(render({ label: "A {step} $&" }))).toBe("A {step} $&amp; → Done");
  });

  it("reads an unnamed target as unnamed, never by its key", () => {
    const heading = rowHeading(render({ to: "step_a" }));
    expect(heading).toBe("Approve → (unnamed step)");
    expect(heading).not.toContain("intake");
  });

  it("says no step is chosen yet where the way out leads nowhere", () => {
    expect(rowHeading(render({ to: undefined }))).toBe("Approve → (no step yet)");
    expect(rowHeading(render({ to: "step_gone" }))).toBe("Approve → (no step yet)");
  });
});

describe("a way out's key", () => {
  const html = render({});
  // The row's own disclosure closes the row. The guard's Developer view, over
  // its CEL, stands before it inside "Only when".
  const details = html.lastIndexOf("<details");

  it("stands inside the row's own Developer view, closed until opened", () => {
    expect(details).toBeGreaterThan(-1);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html.slice(details)).toMatch(/^<details[^>]*><summary[^>]*>Developer view<\/summary>/);
  });

  it("has no key input outside that disclosure", () => {
    const keyInput = html.indexOf('value="approve"');

    expect(keyInput).toBeGreaterThan(details);
    expect(keyInput).toBeLessThan(html.lastIndexOf("</details>"));
    expect(html.slice(0, details)).not.toContain('value="approve"');
  });

  it("writes the key from the input inside that disclosure", () => {
    const source = readFileSync(new URL("../src/areas/studio/panels/PathsPanel.tsx", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const start = source.indexOf("<details");
    const block = source.slice(start, source.indexOf("</details>", start));

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("updatePath(index, { key: e.target.value })");
    expect(source.slice(0, start)).not.toContain("updatePath(index, { key: e.target.value })");
  });
});

/** The options of the `<select>` that opens after `caption`, as [value, text] pairs. */
function selectAfter(html: string, caption: string, from = 0): [string, string][] {
  const at = html.indexOf(caption, from);
  const sel = /<select\b[^>]*>([\s\S]*?)<\/select>/.exec(html.slice(at));
  return [...(sel?.[1] ?? "").matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map((m) => [
    /value="([^"]*)"/.exec(m[1]!)?.[1] ?? "",
    m[2]!.replace(/<!-- -->/g, ""),
  ]);
}

function renderSteps(steps: DraftStep[], paths: Record<string, unknown>[]): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={context}>
      <PathsPanel
        paths={paths as unknown as DraftPath[]}
        steps={steps}
        fields={FIELDS}
        stepId={steps[0]?.id}
        onChange={() => {}}
        contentLocale="en"
        baseLocale="en"
      />
    </DraftContext.Provider>,
  );
}

describe("the step selects list labels", () => {
  const steps = [
    { id: "step_1", key: "antrag", type: "task", label: { en: "Antrag" } },
    { id: "step_2", key: "pr_fung", type: "task", label: { en: "Prüfung" } },
    { id: "step_3", key: "abschluss", type: "task", label: { en: "Abschluss" } },
    { id: "step_4", key: "review", type: "task", label: { en: "" } },
  ] as unknown as DraftStep[];
  const html = renderSteps(steps, [{ id: "path_1", key: "weiter", label: "Weiter", to: "step_2" }]);
  const expected = ["Antrag", "Prüfung", "Abschluss", "(unnamed step)"];

  it("offers each step by its label in \"Leads to\", never its key", () => {
    const options = selectAfter(html, ">Leads to<");
    expect(options.slice(1).map(([, text]) => text)).toEqual(expected);
    expect(options.slice(1).map(([value]) => value)).toEqual(["step_1", "step_2", "step_3", "step_4"]);
    expect(options.some(([, text]) => text === "pr_fung" || text === "review")).toBe(false);
  });

  it("offers each step by its label where the new way out leads", () => {
    const options = selectAfter(html, ">Where the new way out leads<");
    expect(options.slice(1).map(([, text]) => text)).toEqual(expected);
  });

  it("names an unnamed target as unnamed in the heading", () => {
    const named = renderSteps(steps, [{ id: "path_1", key: "send", label: "Send", to: "step_4" }]);
    expect(rowHeading(named)).toBe("Send → (unnamed step)");
    expect(rowHeading(named)).not.toContain("review");
  });
});

describe("two steps sharing a label", () => {
  const steps = [
    { id: "step_1", key: "antrag", type: "task", label: { en: "Antrag" } },
    { id: "step_2", key: "review", type: "task", label: { en: "Review" } },
    { id: "step_3", key: "done", type: "task", label: { en: "Done" } },
    { id: "step_4", key: "archive", type: "task", label: { en: "Archive" } },
    { id: "step_5", key: "close", type: "task", label: { en: "Close" } },
    { id: "step_6", key: "review_2", type: "task", label: { en: "Review" } },
  ] as unknown as DraftStep[];
  const html = renderSteps(steps, [{ id: "path_1", key: "again", label: "Again", to: "step_6" }]);
  const expected = ["Antrag", "Review (step 2)", "Done", "Archive", "Close", "Review (step 6)"];

  it("carry their steps-rail numbers in both selects", () => {
    expect(selectAfter(html, ">Leads to<").slice(1).map(([, text]) => text)).toEqual(expected);
    expect(selectAfter(html, ">Where the new way out leads<").slice(1).map(([, text]) => text)).toEqual(expected);
  });

  it("name the second by its rail number in a way out's heading", () => {
    expect(rowHeading(html)).toBe("Again → Review (step 6)");
  });
});

describe("two unnamed steps", () => {
  const steps = [
    { id: "step_1", key: "antrag", type: "task", label: { en: "Antrag" } },
    { id: "step_2", key: "x", type: "task", label: { en: "" } },
    { id: "step_3", key: "y", type: "task", label: { en: "  " } },
  ] as unknown as DraftStep[];
  const html = renderSteps(steps, [{ id: "path_1", key: "go", label: "Go", to: "step_3" }]);

  it("carry their steps-rail numbers in both selects", () => {
    const expected = ["Antrag", "(unnamed step 2)", "(unnamed step 3)"];
    expect(selectAfter(html, ">Leads to<").slice(1).map(([, text]) => text)).toEqual(expected);
    expect(selectAfter(html, ">Where the new way out leads<").slice(1).map(([, text]) => text)).toEqual(expected);
    expect(rowHeading(html)).toBe("Go → (unnamed step 3)");
  });
});

describe("a default way-out label", () => {
  const steps = [
    { id: "step_1", key: "pruefung", type: "task", label: { en: "Prüfung" } },
    { id: "step_2", key: "capture", type: "task", label: { en: "Capture" } },
  ] as unknown as DraftStep[];

  it("names its target once in the heading", () => {
    const html = renderSteps(steps, [{ id: "path_1", key: "p", label: "Prüfung → Capture", to: "step_2" }]);
    expect(rowHeading(html)).toBe("Prüfung → Capture");
  });
});
