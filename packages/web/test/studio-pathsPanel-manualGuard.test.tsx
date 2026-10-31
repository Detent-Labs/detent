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
 * path keeps both. The context is hand-built, as in
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
  { id: "step_b", key: "approved", type: "task" },
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
    expect(html).toContain("Leave it empty on the way out taken when no other matches.");
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
