import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { FormsTab } from "../src/areas/studio/panels/FormsTab.js";

/**
 * The Forms tab as it renders (`studio-forms-overview`). The row set, the
 * counts and the miniature's own values are asserted in
 * `studio-formCardRows.test.ts`; this covers what only the markup can say —
 * the control naming its own act, the badge, and the miniature taking no
 * keyboard focus.
 *
 * `FormsTab` reads `draft`, `validation` and `contentLocale` off `useDraft()`,
 * so the test supplies `DraftContext.Provider` directly rather than a live
 * `DraftProvider`, the way `studio-stepsRail.test.tsx` already does.
 */

const AMOUNT = "field_00000000-0000-4000-8000-0000000000a1";

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

const DRAFT = {
  baseLocale: "en",
  fields: [{ id: AMOUNT, key: "amount", type: "number", label: { en: "Amount" } }],
  workflow: {
    initialStep: "step_a",
    steps: [
      {
        id: "step_a",
        key: "intake",
        label: { en: "Intake" },
        type: "task",
        view: { fields: [{ ref: AMOUNT, required: true }] },
        paths: [{ id: "path_1", to: "step_b" }],
      },
      { id: "step_b", key: "review", label: { en: "Review" }, type: "task", view: { fields: [] } },
      { id: "step_c", key: "done", label: { en: "Done" }, type: "task", terminal: true },
    ],
  },
} as unknown as Draft;

function render(over: { draft?: Draft; issues?: EditorIssue[] } = {}): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue(over.draft ?? DRAFT, over.issues ?? [])}>
      <FormsTab onOpenForm={() => {}} onOpenChecks={() => {}} />
    </DraftContext.Provider>,
  );
}

/** Everything between the miniature's own `<ul>` and its close. */
function miniatures(html: string): string[] {
  return [...html.matchAll(/<ul(?![^>]*aria-label)[^>]*>(.*?)<\/ul>/gs)].map((m) => m[1]!);
}

describe("The Forms tab's plates", () => {
  it("carries one plate per step declaring a view, and none for a step declaring none", () => {
    const html = render();

    expect(html).toContain("Intake");
    expect(html).toContain("Review");
    expect(html).not.toContain("Done");
  });

  it("names the step's kind above its label", () => {
    const html = render();

    expect(html.indexOf("Initial")).toBeLessThan(html.indexOf("Intake"));
  });

  it("counts the field entries a plate's view holds", () => {
    expect(render()).toContain("1 field");
  });

  it("counts a view holding several entries in its own sentence", () => {
    const four = {
      ...DRAFT,
      workflow: {
        ...DRAFT.workflow,
        steps: [
          {
            ...DRAFT.workflow!.steps![0],
            view: { fields: [{ ref: AMOUNT }, { ref: AMOUNT }, { ref: AMOUNT }, { ref: AMOUNT }] },
          },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;

    expect(render({ draft: four })).toContain("4 fields");
  });

  it("names a view holding no entry as an empty form", () => {
    expect(render()).toContain("Empty form");
  });

  it("offers to start the form on an empty one and to open an existing one", () => {
    const html = render();

    expect(html).toContain("Start the form");
    expect(html).toContain("Open the form");
  });

  it("says so in words when no step declares a form at all", () => {
    const bare = {
      baseLocale: "en",
      workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "only", label: { en: "Only" }, type: "task" }] },
    } as unknown as Draft;

    expect(render({ draft: bare })).toContain("No step in this process declares a form yet.");
  });
});

describe("A plate's miniature", () => {
  it("takes no keyboard focus, so a walk with the Tab key never lands inside one", () => {
    for (const inner of miniatures(render())) {
      expect(inner).not.toContain("<button");
      expect(inner).not.toContain("<a ");
      expect(inner).not.toContain("tabindex");
    }
  });

  it("marks a required entry beside its label", () => {
    const [first] = miniatures(render());

    expect(first).toContain("Amount");
    expect(first).toContain('aria-label="required"');
  });
});

describe("A plate's issue badge", () => {
  const ISSUE: EditorIssue = {
    entityType: "step",
    entityId: "step_a",
    message: "view ref does not resolve",
    source: "zod",
    loc: "workflow.steps[0].view.fields[0].ref",
  };

  it("reads the number of open issues naming that step's view", () => {
    expect(render({ issues: [ISSUE, { ...ISSUE, message: "a second one" }] })).toContain(
      'aria-label="2 open issues on this form"',
    );
  });

  it("names one issue in the singular", () => {
    expect(render({ issues: [ISSUE] })).toContain('aria-label="1 open issue on this form"');
  });

  it("draws no badge on a plate whose view draws no issue", () => {
    expect(render()).not.toContain("open issue on this form");
  });
});
