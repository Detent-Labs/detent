import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { ContractPanel } from "../src/areas/studio/panels/ContractPanel.js";

/**
 * `ContractPanel.tsx` in the author's words (`studio-process-tabs`: "The
 * contract view reads in the author's words"). It renders statically with a
 * synthetic draft context.
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

function render(draft: Draft): string {
  const value: DraftContextValue = {
    draft,
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
  return renderToStaticMarkup(
    <DraftContext.Provider value={value}>
      <ContractPanel />
    </DraftContext.Provider>,
  );
}

const FIELDS = [
  { id: "field_1", key: "amount", label: { en: "Amount" }, type: "number" },
  { id: "field_2", key: "note_text", type: "string" },
];

const CALLABLE = {
  baseLocale: "en",
  fields: FIELDS,
  contract: { inputFields: ["field_1"], outputFields: ["field_1"], outcomes: ["approved"] },
} as unknown as Draft;

describe("ContractPanel", () => {
  it("opens on the sentence checkbox, with no Contract heading", () => {
    const html = render({ baseLocale: "en", fields: FIELDS } as unknown as Draft);

    expect(html).toMatch(/<label[^>]*><input type="checkbox"[^>]*\/?>Other processes can call this one<\/label>/);
    expect(html).not.toMatch(/<h3/);
    expect(html).not.toContain(">Contract<");
    expect(html).not.toContain("subprocess-callable");
  });

  it("stands no list before the process is callable", () => {
    const html = render({ baseLocale: "en", fields: FIELDS } as unknown as Draft);

    expect(html).not.toContain("What it takes in");
  });

  it("reads the three legends in words", () => {
    const html = render(CALLABLE);

    expect(html).toContain("<legend>What it takes in</legend>");
    expect(html).toContain("<legend>What it gives back</legend>");
    expect(html).toContain("<legend>How it can end</legend>");
    expect(html).not.toMatch(/inputFields|outputFields|outcomes/);
  });

  it("prints each field's label in both lists and no key or id", () => {
    const html = render(CALLABLE);

    expect(html.match(/>Amount<\/label>/g)).toHaveLength(2);
    expect(html).not.toContain("amount");
    expect(html).not.toContain("note_text");
    expect(html).not.toContain("field_1");
  });

  it("names a field without a label '(unnamed field)'", () => {
    const html = render(CALLABLE);

    expect(html.match(/\(unnamed field\)<\/label>/g)).toHaveLength(2);
  });

  it("prints an ending in the mono face", () => {
    const html = render(CALLABLE);
    const span = /<span[^>]*>approved<\/span>/.exec(html)?.[0] ?? "";

    expect(span).not.toBe("");
    // The mono face is a compiled style, so the span carries a class.
    expect(span).toMatch(/class="/);
  });

  it("words the ending controls", () => {
    const html = render(CALLABLE);

    expect(html).toContain('placeholder="Name of an ending"');
    expect(html).toContain(">+ Add an ending<");
    expect(html).toContain(">Remove<");
  });
});
