import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Expression } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { ConditionInput } from "../src/areas/studio/panels/shared/ConditionInput.js";
import { RuleInput } from "../src/areas/studio/panels/shared/RuleInput.js";

/**
 * The clear command is the one explicit way to drop a condition the builder
 * cannot drop by an edit. `ConditionInput` shows it in both footers while the
 * caller passes `clearLabel`, and in neither without it. `RuleInput` has no
 * such command. The context is hand-built, as in
 * `studio-actionListEditor-registryBadge.test.tsx`: a live `DraftProvider`
 * resolves its fetches async and never settles under `renderToStaticMarkup`.
 */

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

const context: DraftContextValue = {
  draft: {},
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

const LABEL = "Clear on Intake, Review";

function render(value: DraftOf<Expression> | undefined, clearLabel?: string): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={context}>
      <ConditionInput value={value} onChange={() => {}} clearLabel={clearLabel} />
    </DraftContext.Provider>,
  );
}

describe("ConditionInput's clear command", () => {
  it("shows the label in the builder footer while clearLabel is passed", () => {
    const html = render(undefined, LABEL);
    expect(html).toContain("Edit as CEL");
    expect(html).toContain(LABEL);
  });

  it("shows no clear command without clearLabel", () => {
    expect(render(undefined)).not.toContain("Clear on");
  });

  it("shows the label in the CEL footer too, for a source the builder cannot read", () => {
    const html = render({ lang: "cel", src: "data.amount >" }, LABEL);
    expect(html).toContain("does not parse as CEL");
    expect(html).toContain(LABEL);
  });

  it("shows no clear command in the CEL footer without clearLabel", () => {
    expect(render({ lang: "cel", src: "data.amount >" })).not.toContain("Clear on");
  });
});

describe("RuleInput", () => {
  it("takes no clear command", () => {
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={context}>
        <RuleInput field={{ id: "field_a", key: "a", label: { en: "A" }, type: "string" } as never} value={undefined} onChange={() => {}} />
      </DraftContext.Provider>,
    );
    expect(html).not.toContain("Clear on");
  });
});
