import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { Expression } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { ConditionInput } from "../src/areas/studio/panels/shared/ConditionInput.js";

/**
 * The clear command is the one explicit way to drop a condition the builder
 * cannot drop by an edit. `ConditionInput` shows it above the Developer view
 * while the caller passes `clearLabel`, over rows and over source that does
 * not parse, and never without it. The context is hand-built, as in
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
  it("shows the label under the rows, above the Developer view, while clearLabel is passed", () => {
    const html = render(undefined, LABEL);
    expect(html).toContain(LABEL);
    expect(html.indexOf("condition-add")).toBeLessThan(html.indexOf(LABEL));
    expect(html.indexOf(LABEL)).toBeLessThan(html.indexOf("<details"));
  });

  it("shows no clear command without clearLabel", () => {
    expect(render(undefined)).not.toContain("Clear on");
  });

  it("shows the label over source that does not parse too, above the Developer view", () => {
    const html = render({ lang: "cel", src: "data.amount >" }, LABEL);
    expect(html).toContain("This condition cannot show as rows.");
    expect(html.indexOf(LABEL)).toBeGreaterThan(-1);
    expect(html.indexOf(LABEL)).toBeLessThan(html.indexOf("<details"));
  });

  it("shows no clear command over source that does not parse without clearLabel", () => {
    expect(render({ lang: "cel", src: "data.amount >" })).not.toContain("Clear on");
  });
});

describe("focus after the clear press", () => {
  // The press unmounts the command itself. No harness here can press it, so
  // this pins the wiring: the press raises a flag, and an effect moves focus
  // to the control the next render draws: the add-row button. A clear leaves
  // no row and no source, so the rows always draw.
  const source = readFileSync(new URL("../src/areas/studio/panels/shared/ConditionInput.tsx", import.meta.url), "utf-8");

  it("raises the flag in the clear handler", () => {
    expect(source).toMatch(/const clear = \(\) => \{\n(?: {4}.*\n)*? {4}setFocusAfterClear\(true\);\n/);
  });

  it("lands on the add-row button, which a clear always draws", () => {
    expect(source).toContain('querySelector<HTMLElement>("button.condition-add")?.focus()');
  });

  it("hangs the ref on the one root, which holds the target", () => {
    expect([...source.matchAll(/<div ref=\{rootRef\}/g)].length).toBe(1);
  });
});
