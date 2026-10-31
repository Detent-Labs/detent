/**
 * `studio-condition-builder`: "The builder reads the condition as a sentence",
 * "Source that does not parse opens the Developer view" and "Every condition
 * site keeps its CEL in a Developer view".
 *
 * The context is hand-built, as in `studio-conditionInput-clear.test.tsx`: a
 * live `DraftProvider` resolves its fetches async and never settles under
 * `renderToStaticMarkup`. A static render fires no event, so the held and
 * unfinished sentences, which need a row the author added, are pinned in
 * `studio-conditionLogic.test.ts` through `conditionSentence`; this file pins
 * that the component reads the sentence from its local rows and the stored
 * source.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { Expression } from "workflow-engine/schema";
import type { Draft, DraftOf } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { ConditionInput } from "../src/areas/studio/panels/shared/ConditionInput.js";
import { BooleanOrExpressionInput } from "../src/areas/studio/panels/shared/BooleanOrExpressionInput.js";

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

const draft = {
  baseLocale: "en",
  fields: [
    { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" },
    {
      id: "field_status",
      key: "status",
      label: { en: "Status" },
      type: "string",
      options: [{ value: "approved", label: { en: "Approved" } }],
    },
    { id: "field_approved", key: "approved", label: { en: "Approved" }, type: "boolean" },
    { id: "field_city", key: "city", label: { en: "City" }, type: "string" },
    { id: "field_tags", key: "tags", label: { en: "Tags" }, type: "list" },
  ],
} as unknown as Draft;

const context: DraftContextValue = {
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

const inContext = (node: React.ReactNode) =>
  renderToStaticMarkup(<DraftContext.Provider value={context}>{node}</DraftContext.Provider>);

const cel = (src: string): DraftOf<Expression> => ({ lang: "cel", src });
const render = (value: DraftOf<Expression> | undefined) => inContext(<ConditionInput value={value} onChange={() => {}} />);

/** The markup from the first `<details` to its close. */
const developerView = (html: string) => {
  const start = html.indexOf("<details");
  return start < 0 ? "" : html.slice(start, html.indexOf("</details>", start) + "</details>".length);
};

/** The text outside the Developer view, tags and attributes gone: an option's
 * `value` holds the operand path, which the page never prints. */
const outsideDeveloperView = (html: string) => html.replace(developerView(html), "").replace(/<[^>]*>/g, "");

/** The sentence note: the element the rows' list names in `aria-describedby`. */
function sentence(html: string): string {
  const id = html.match(/<ol[^>]*aria-describedby="([^"]+)"/)?.[1] ?? html.match(/<p id="([^"]+)"/)?.[1];
  if (!id) throw new Error(`no sentence in: ${html}`);
  const note = html.match(new RegExp(`<p id="${id.replace(/[^\w]/g, "\\$&")}"[^>]*>([^<]*)</p>`));
  if (!note) throw new Error(`no element with id ${id} in: ${html}`);
  return note[1]!.replaceAll("&#x27;", "'").replaceAll("&quot;", '"');
}

describe("the sentence under the rows", () => {
  it("reads a two-row guard as one sentence, and prints no CEL outside the Developer view", () => {
    const src = 'data.amount > 1000.0 && data.status == "approved"';
    const html = render(cel(src));

    expect(sentence(html)).toBe("Amount is greater than 1,000 and Status is Approved.");
    expect(outsideDeveloperView(html)).not.toContain("data.amount");
    expect(outsideDeveloperView(html)).not.toContain("&amp;&amp;");
    expect(developerView(html)).toContain('value="data.amount &gt; 1000.0 &amp;&amp; data.status == &quot;approved&quot;"');
  });

  it("names the sentence from the rows' list through aria-describedby", () => {
    const html = render(cel("data.amount > 1000.0"));
    const id = html.match(/<ol[^>]*aria-describedby="([^"]+)"/)?.[1];

    expect(id).toBeTruthy();
    expect(html).toContain(`<p id="${id}"`);
  });

  it("reads a boolean row as yes or no", () => {
    expect(sentence(render(cel("data.approved == false")))).toBe("Approved is no.");
  });

  it("puts free text in curly quotes", () => {
    expect(sentence(render(cel('data.city == "Bern"')))).toBe("City is “Bern”.");
  });

  it("reads a raw row as a hand-written rule, and keeps its text in the Developer view alone", () => {
    const html = render(cel('data.tags.exists(t, t == "vip") && data.amount > 1000.0'));

    expect(sentence(html)).toBe("A hand-written rule and Amount is greater than 1,000.");
    expect(outsideDeveloperView(html)).not.toContain("exists(");
    expect(developerView(html)).toContain("exists(");
  });

  it("says an empty site always matches, once, with the add-row command and no list", () => {
    const html = render(undefined);

    expect(sentence(html)).toBe("No condition yet: this always matches.");
    expect(html.match(/No condition yet/g)).toHaveLength(1);
    expect(html).toContain("condition-add");
    expect(html).not.toContain("<ol");
  });

  it("prints a site's own empty sentence in place of the default, with no row and no source", () => {
    const empty = "The steps hold different conditions.";
    const withEmpty = (value: DraftOf<Expression> | undefined) =>
      inContext(<ConditionInput value={value} onChange={() => {}} emptySentence={empty} />);

    expect(sentence(withEmpty(undefined))).toBe(empty);
    expect(withEmpty(undefined)).not.toContain("this always matches");
    // A stored source reads as itself: the override stands only for the empty state.
    expect(sentence(withEmpty(cel("data.amount > 1000.0")))).toBe("Amount is greater than 1,000.");
  });

  it("reads the sentence from the local rows and the stored source", () => {
    // The held and unfinished states: the rows the author edits, over the
    // source the draft still holds.
    const source = readFileSync(new URL("../src/areas/studio/panels/shared/ConditionInput.tsx", import.meta.url), "utf-8");
    expect(source).toContain("conditionSentence(condition, operands, src)");
  });

  it("stands as a note after the add-row command and before the Developer view", () => {
    const html = render(cel("data.amount > 1000.0"));
    const note = html.indexOf("Amount is greater than 1,000.");

    expect(html.indexOf("condition-add")).toBeLessThan(note);
    expect(note).toBeLessThan(html.indexOf("<details"));
  });
});

describe("the Developer view", () => {
  it("stands closed over a parseable guard, holding the captioned CEL input", () => {
    const html = render(cel("data.amount > 1000.0"));
    const details = developerView(html);

    expect(details).toMatch(/^<details(?![^>]*\sopen)[^>]*><summary[^>]*>Developer view<\/summary>/);
    expect(details).toMatch(/<label[^>]*><span[^>]*>CEL<\/span><input[^>]*class="cel-input celInput"/);
    expect(details).toMatch(/<input[^>]*translate="no"[^>]*value="data.amount &gt; 1000.0"/);
  });

  // Design-language rule 4: CEL prints in mono. The stylex stub renders a
  // style's key as its class, so the markup names the compiled style and the
  // source pins what it declares.
  it("prints the CEL in mono, keeping the literal class beside the compiled one", () => {
    const source = readFileSync(new URL("../src/areas/studio/panels/shared/ExpressionInput.tsx", import.meta.url), "utf-8");
    const start = source.indexOf("  celInput: {");

    expect(start).toBeGreaterThan(-1);
    expect(source.slice(start, source.indexOf("\n  },", start))).toContain("fontFamily: fonts.mono");
    expect(developerView(render(cel("data.amount > 1000.0")))).toMatch(/<input[^>]*class="cel-input celInput"/);
  });

  it("stands closed over an empty site", () => {
    expect(developerView(render(undefined))).toMatch(/^<details(?![^>]*\sopen)/);
  });

  it("offers no Edit as CEL control", () => {
    expect(render(cel("data.amount > 1000.0"))).not.toContain("Edit as CEL");
  });
});

describe("source that does not parse", () => {
  const html = render(cel("data.amount >"));

  it("opens the Developer view on the CEL input holding the source", () => {
    const details = developerView(html);

    expect(details).toMatch(/^<details[^>]*\sopen/);
    expect(details).toContain('value="data.amount &gt;"');
  });

  it("says the condition cannot show as rows, as a status, in place of the rows and the sentence", () => {
    expect(html).toMatch(/<p[^>]*role="status"[^>]*>This condition cannot show as rows\. Fix it in the Developer view below\.<\/p>/);
    expect(html).not.toContain("condition-builder");
    expect(html).not.toContain("No condition yet");
  });

  it("keeps the Developer view open once the text parses: only the re-seed opens it, and only the author closes it", () => {
    // `onToggle` is the one path that closes it; the re-seed sets it open on a
    // null read and never sets it closed.
    const source = readFileSync(new URL("../src/areas/studio/panels/shared/ConditionInput.tsx", import.meta.url), "utf-8");
    expect(source).toContain("if (read === null) setDeveloperOpen(true);");
    expect(source).toContain("onToggle={(e) => setDeveloperOpen(e.currentTarget.open)}");
    expect([...source.matchAll(/setDeveloperOpen\(/g)].length).toBe(2);
  });
});

describe("the inline variant, inside the form editor's own Developer view", () => {
  const html = inContext(
    <BooleanOrExpressionInput label="Asked" value={cel("data.amount > 1000.0")} flagKey="visible" onChange={() => {}} />,
  );

  it("draws one CEL input, captioned, with no disclosure of its own", () => {
    expect(html.match(/class="cel-input celInput"/g)).toHaveLength(1);
    expect(html).toMatch(/<span[^>]*>CEL<\/span><input[^>]*class="cel-input celInput"/);
    expect(html).not.toContain("<details");
    expect(html).not.toContain("Developer view");
  });

  it("still draws the rows and the sentence", () => {
    expect(html).toContain("condition-builder");
    expect(sentence(html)).toBe("Amount is greater than 1,000.");
  });
});
