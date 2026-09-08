import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Step } from "workflow-engine/schema";
import type { DraftOf, Draft } from "../src/areas/studio/draft/types.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { StepPage } from "../src/areas/studio/panels/StepPage.js";

/**
 * The Steps tab's wide page (`studio-step-page`: "The step page names its
 * step and renames it in place", "The step page stands its sections open in
 * two columns", "The step page walks to the previous and the next step", "The
 * step page carries a Developer view of the step").
 *
 * `development-toolchain`'s split rule sends these to assertions: the section
 * set, the headings, the walk controls' names and refusals, and the closed
 * disclosure are all properties of the rendered string.
 */

type DraftStep = DraftOf<Step>;

const SRC = new URL("../src/areas/studio/", import.meta.url).pathname;

function validation(issues: EditorIssue[]): ValidationResult {
  return {
    zodValid: true,
    issues,
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
}

function contextValue(draft: Draft, issues: EditorIssue[]): DraftContextValue {
  return {
    draft,
    mutate: () => {},
    replace: () => {},
    validation: validation(issues),
    loadedChildren: {},
    setChildForStep: () => {},
    registry: undefined,
    loadedChainingTargets: {},
    contentLocale: "en",
    setContentLocale: () => {},
    usedLocales: ["en"],
    loadGeneration: 0,
  };
}

const TASK_STEP = {
  id: "step_a",
  key: "intake",
  label: { en: "Intake" },
  type: "task",
  paths: [{ id: "path_1", to: "step_b" }],
} as unknown as DraftStep;

function draftWith(step: DraftStep, initialStep = "step_a"): Draft {
  return { baseLocale: "en", workflow: { initialStep, steps: [step] } } as unknown as Draft;
}

interface Over {
  step?: DraftStep;
  draft?: Draft;
  issues?: EditorIssue[];
  stepNumber?: number;
  previous?: { id: string; label: string };
  next?: { id: string; label: string };
}

function render(over: Over = {}): string {
  const step = over.step ?? TASK_STEP;
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue(over.draft ?? draftWith(step), over.issues ?? [])}>
      <StepPage
        fields={[]}
        token="t"
        step={step}
        stepNumber={over.stepNumber ?? 1}
        previous={over.previous}
        next={over.next}
        onSelectStep={() => {}}
        onRemoveStep={() => {}}
        navigate={() => {}}
        processes={[]}
      />
    </DraftContext.Provider>,
  );
}

/** Every `<button ...>` open tag in a rendered string, in DOM order. */
function buttonTags(html: string): string[] {
  return html.match(/<button[^>]*>/g) ?? [];
}

describe("The step page's masthead", () => {
  it("opens with a kicker naming the step's number and its kind", () => {
    const html = render({ stepNumber: 3 });

    expect(html).toContain("Step 3");
    expect(html).toContain("A step someone works");
  });

  it("carries the step's label as a writable line, and its key beside it", () => {
    const html = render();

    expect(html).toContain('value="Intake"');
    expect(html).toContain('value="intake"');
  });

  it("marks the draft's first step, and offers no set-first control there", () => {
    const html = render();

    expect(html).toContain("This is the process&#x27;s first step.");
    expect(html).not.toContain("Set as the process&#x27;s first step");
  });

  it("offers the set-first control on a step that is not the first", () => {
    const html = render({ draft: draftWith(TASK_STEP, "step_elsewhere") });

    expect(html).toContain("Set as the process&#x27;s first step");
  });

  it("carries one control that removes the step", () => {
    expect(render()).toContain("Remove this step");
  });
});

describe("The step page's section set", () => {
  it("gives a task step Path to, Assignment, On entry, On exit, Time limit and Step form fields", () => {
    const html = render();

    for (const heading of ["Path to", "Assignment", "On entry", "On exit", "Time limit", "Step form fields"]) {
      expect(html).toContain(`>${heading}<`);
    }
    expect(html).not.toContain(">Which process it calls<");
  });

  it("gives an end step How the case ends, and no outgoing path", () => {
    const ends = { ...TASK_STEP, terminal: true, paths: undefined } as unknown as DraftStep;
    const html = render({ step: ends });

    expect(html).toContain(">How the case ends<");
    expect(html).not.toContain(">Path to<");
    expect(html).not.toContain(">On exit<");
    expect(html).not.toContain(">Time limit<");
    expect(html).toContain("A step that ends the process has no outgoing path and no time limit.");
  });

  it("gives a subprocess step Which process it calls, and no Assignment or form section", () => {
    const calls = { ...TASK_STEP, type: "subprocess" } as unknown as DraftStep;
    const html = render({ step: calls });

    expect(html).toContain(">Which process it calls<");
    expect(html).not.toContain(">Assignment<");
    expect(html).not.toContain(">Step form fields<");
  });

  it("stands every section open, so none carries a disclosure of its own", () => {
    // A collapsible register would carry `aria-expanded` on each heading. The
    // page's one disclosure is the Developer view, and it is a `<details>`.
    const headings = render().match(/<h3[^>]*>/g) ?? [];

    expect(headings.length).toBeGreaterThan(0);
    for (const heading of headings) expect(heading).not.toContain("aria-expanded");
  });
});

describe("A step page section's own open issues", () => {
  it("prints an issue about the assignment beside the Assignment heading", () => {
    const issues: EditorIssue[] = [
      {
        entityType: "step",
        entityId: "step_a",
        message: "no such group",
        source: "structural",
        loc: "workflow.steps[0].assignment.strategy.config.groupId",
      },
    ];
    const html = render({ issues });

    expect(html).toContain("no such group");
    // One print, at one section — never a second copy at another heading.
    expect(html.match(/no such group/g)).toHaveLength(1);
  });

  it("prints an issue about the form beside the Step form fields heading", () => {
    const issues: EditorIssue[] = [
      {
        entityType: "step",
        entityId: "step_a",
        message: "required but hidden",
        source: "view",
        loc: "workflow.steps[0].view.fields[0].required",
      },
    ];

    expect(render({ issues }).match(/required but hidden/g)).toHaveLength(1);
  });

  it("keeps a step-level issue no section claims on the masthead", () => {
    const issues: EditorIssue[] = [
      { entityType: "step", entityId: "step_a", message: "key is not a slug", source: "zod", loc: "workflow.steps[0].key" },
    ];

    expect(render({ issues }).match(/key is not a slug/g)).toHaveLength(1);
  });

  it("leaves a path's own issue to the row that names it, inside Path to", () => {
    // `PathsPanel` mounts an `IssueList` per path row, so the heading would
    // otherwise say the same sentence twice, two inches apart.
    const issues: EditorIssue[] = [
      { entityType: "path", entityId: "path_1", message: "this path leads nowhere", source: "cel", loc: "" },
    ];

    expect(render({ issues }).match(/this path leads nowhere/g)).toHaveLength(1);
  });
});

describe("The step page's walk", () => {
  it("names the step each control opens", () => {
    const html = render({ previous: { id: "step_z", label: "Intake" }, next: { id: "step_b", label: "Credit check" } });

    expect(html).toContain("Previous: Intake");
    expect(html).toContain("Next: Credit check");
  });

  it("refuses the press at each end of the walk", () => {
    const html = render();
    const walk = buttonTags(html).filter((b) => b.includes("disabled"));

    expect(html).toContain("Previous step");
    expect(html).toContain("Next step");
    expect(walk.length).toBeGreaterThanOrEqual(2);
  });

  it("leaves the control live where a neighbour stands", () => {
    const html = render({ next: { id: "step_b", label: "Credit check" } });

    expect(html).toContain("Next: Credit check");
    expect(html).not.toContain("Next step");
  });
});

describe("The step page's Developer view", () => {
  it("stands closed until an author opens it", () => {
    const html = render();

    expect(html).toContain("Developer view");
    expect(html).toMatch(/<details[^>]*>/);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });

  it("carries the step's own JSON and its id", () => {
    const html = render();

    expect(html).toContain("&quot;step_a&quot;");
    expect(html).toContain("&quot;intake&quot;");
  });

  it("accepts no typing, so the draft cannot change from it", () => {
    // A `<pre>` is not a control. Were the JSON editable here, the disclosure
    // would carry a `<textarea>` the way the JSON surface does.
    const html = render();
    const disclosure = html.slice(html.indexOf("<details"));

    expect(disclosure).toContain("<pre");
    expect(disclosure).not.toContain("<textarea");
  });
});

describe("The step page's two columns", () => {
  it("falls to one column at the breakpoint the steps rail and the tab both use", () => {
    const breakpoint = '"@media (max-width: 64rem)"';

    for (const file of ["panels/StepPage.tsx", "panels/StepsRail.tsx", "screens/EditScreen.tsx", "panels/EntityTabs.tsx"]) {
      expect(readFileSync(SRC + file, "utf8")).toContain(breakpoint);
    }
  });
});
