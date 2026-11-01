/**
 * `studio-field-validation-form`: "The rule builder reads as a sentence" and
 * "The rule editor uses a structured row builder, with a CEL escape hatch"
 * (design.md D10). The rule input takes the condition input's shape: the
 * rows, the sentence under them, and a closed Developer view at the foot.
 */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Expression } from "workflow-engine/schema";
import type { Draft, DraftOf } from "../src/areas/studio/draft/types.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { RuleInput } from "../src/areas/studio/panels/shared/RuleInput.js";

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

const amount = { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" } as unknown as DraftField;
const budget = { id: "field_budget", key: "budget", label: { en: "Budget" }, type: "number" } as unknown as DraftField;

const context: DraftContextValue = {
  draft: { baseLocale: "en", fields: [amount, budget] } as unknown as Draft,
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

const cel = (src: string): DraftOf<Expression> => ({ lang: "cel", src });
const render = (value: DraftOf<Expression> | undefined) =>
  renderToStaticMarkup(
    <DraftContext.Provider value={context}>
      <RuleInput field={amount} value={value} onChange={() => {}} />
    </DraftContext.Provider>,
  );

/** The sentence under the rows. */
const sentence = (html: string) => html.match(/<p class="ruleSentence">([^<]*)<\/p>/)?.[1];
/** The markup from the `<details` to its close. */
const developerView = (html: string) => html.slice(html.indexOf("<details"), html.indexOf("</details>") + "</details>".length);

describe("the rule input's sentence", () => {
  it("reads a literal comparison in words", () => {
    expect(sentence(render(cel("data.amount >= 1000.0")))).toBe("This answer is at least 1,000.");
  });

  it("names another field by its label", () => {
    expect(sentence(render(cel("data.amount <= data.budget")))).toBe("This answer is at most Budget.");
  });

  it("reads every answer passing with no rule", () => {
    expect(sentence(render(undefined))).toBe("No rule yet: every answer passes.");
  });

  it("prints no Writes readout and no CEL outside the Developer view", () => {
    const html = render(cel("data.amount >= 1000.0"));
    // The printed text alone: an option's `value` attribute carries the
    // operand's path, and no author reads it.
    const outside = html.slice(0, html.indexOf("<details")).replace(/<[^>]*>/g, " ");

    expect(html).not.toContain("Writes");
    expect(html).not.toContain("nothing yet");
    expect(outside).not.toContain("data.amount");
    expect(html.slice(0, html.indexOf("<details"))).not.toContain("<code");
  });

  it("stands under the rows and above the Developer view", () => {
    const html = render(cel("data.amount >= 1000.0"));

    expect(html.indexOf("rule-builder")).toBeLessThan(html.indexOf('class="ruleSentence"'));
    expect(html.indexOf('class="ruleSentence"')).toBeLessThan(html.indexOf("<details"));
  });
});

describe("the rule input's Developer view", () => {
  it("stands closed over a rule the rows read, holding the captioned CEL input", () => {
    const view = developerView(render(cel("data.amount >= 1000.0")));

    expect(view).toMatch(/^<details(?![^>]*\sopen)[^>]*><summary[^>]*>Developer view<\/summary>/);
    expect(view).toMatch(/<span[^>]*>CEL<\/span><input[^>]*class="cel-input celInput"/);
    expect(view).toContain('value="data.amount &gt;= 1000.0"');
  });

  it("stands closed over no rule", () => {
    expect(developerView(render(undefined))).toMatch(/^<details(?![^>]*\sopen)/);
  });

  it("opens over source that does not parse, with a notice in place of the rows and the sentence", () => {
    const html = render(cel("data.amount >="));

    expect(developerView(html)).toMatch(/^<details[^>]*\sopen/);
    expect(html).toMatch(/<p[^>]*role="status"[^>]*>This does not parse as CEL, so the builder cannot open it\.<\/p>/);
    expect(html).not.toContain("rule-builder");
    expect(sentence(html)).toBeUndefined();
  });

  it("offers no toggle that replaces the rows", () => {
    const html = render(cel("data.amount >= 1000.0"));

    expect(html).not.toContain("aria-expanded");
  });
});
