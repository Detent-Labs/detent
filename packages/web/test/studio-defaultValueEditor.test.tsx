/**
 * `studio-condition-builder`: "A default value's expression stands in a
 * Developer view" (design.md D9). The context is hand-built: a live
 * `DraftProvider` resolves its fetches async and never settles under
 * `renderToStaticMarkup`. A static render fires no event, so the clear and the
 * emptied CEL input are pinned at the source.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { DefaultValueEditor } from "../src/areas/studio/panels/shared/DefaultValueEditor.js";

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
  draft: { baseLocale: "en" } as unknown as Draft,
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

const field = (extra: object): DraftField => ({ id: "field_a", key: "a", label: { en: "A" }, type: "string", ...extra }) as unknown as DraftField;

const render = (f: DraftField) =>
  renderToStaticMarkup(
    <DraftContext.Provider value={context}>
      <DefaultValueEditor field={f} onChange={() => {}} />
    </DraftContext.Provider>,
  );

/** The `<details>` element's opening tag. */
const detailsTag = (html: string) => html.slice(html.indexOf("<details"), html.indexOf(">", html.indexOf("<details")) + 1);

const source = readFileSync(new URL("../src/areas/studio/panels/shared/DefaultValueEditor.tsx", import.meta.url).pathname, "utf8");

describe("the default value's Developer view", () => {
  it("keeps a literal default in the value input, with a closed Developer view under it", () => {
    const html = render(field({ type: "number", default: 100 }));

    expect(html).toMatch(/<input type="number" value="100"/);
    expect(detailsTag(html)).not.toMatch(/\sopen/);
    expect(html.indexOf('value="100"')).toBeLessThan(html.indexOf("<details"));
    expect(html).toContain(">Developer view</summary>");
    expect(html).toContain(">CEL expression<");
  });

  it("stands closed over a field with no default", () => {
    expect(detailsTag(render(field({})))).not.toMatch(/\sopen/);
  });

  it("reads an expression default as computed, and opens the Developer view on its source", () => {
    const html = render(field({ type: "number", default: { lang: "cel", src: "data.a * 2.0" } }));

    expect(html).toContain("A rule computes this default.");
    expect(html).not.toContain('<input type="number"');
    expect(detailsTag(html)).toContain('open=""');
    expect(html).toContain(">data.a * 2.0</textarea>");
  });

  it("offers no Edit as CEL and no Use a value toggle", () => {
    const html = render(field({ default: "x" }));

    expect(html).not.toContain("Edit as CEL");
    expect(html).not.toContain("Use a value");
  });

  it("keeps Clear default beside the value input", () => {
    const html = render(field({ default: "x" }));

    expect(html).toContain(">Clear default</button>");
    expect(html.indexOf(">Clear default</button>")).toBeLessThan(html.indexOf("<details"));
    expect(render(field({}))).not.toContain("Clear default");
  });

  it("drops the default when the CEL text empties over an expression, and leaves a literal alone", () => {
    const commit = source.slice(source.indexOf("const commitCel = "), source.indexOf("const clear = "));

    expect(commit).toContain("if (result.value === undefined && currentExpr === undefined) return;");
    expect(commit).toContain("onChange(result.value as DraftDefault);");
  });
});

describe("the default value's choice picker", () => {
  const choices = [
    { value: "open", label: { en: "Open" } },
    { value: "closed", label: { en: "Closed" } },
    { value: "pending", label: { en: "" } },
  ];

  it("prints each choice's name in the select, and keeps the stored value as the option's value", () => {
    const html = render(field({ options: choices }));
    const texts = [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]]);

    expect(texts).toEqual([
      ["", "(none)"],
      ["open", "Open"],
      ["closed", "Closed"],
      ["pending", "(unnamed choice)"],
    ]);
  });

  it("prints each choice's name beside its checkbox for a list field, and no value as text", () => {
    const html = render(field({ type: "list", options: choices }));

    expect(html).toContain('type="checkbox"/>Open</label>');
    expect(html).toContain('type="checkbox"/>Closed</label>');
    expect(html).toContain('type="checkbox"/>(unnamed choice)</label>');
    expect(html).not.toMatch(/>open</);
    expect(html).not.toMatch(/>closed</);
  });
});
