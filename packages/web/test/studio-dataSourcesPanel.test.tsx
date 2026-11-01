import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { dataSourceKindLabel } from "../src/areas/studio/draft/guided-labels.js";
import { DataSourcesPanel, DataSourceRow } from "../src/areas/studio/panels/DataSourcesPanel.js";

/**
 * `DataSourcesPanel.tsx` in the author's words (`studio-app`: "Where values
 * come from names a source in the author's words" and "The source's kind
 * picker prints names"). The panel fetches its registry in an effect, which a
 * static render never runs, so the kind picker is read off `DataSourceRow`
 * handed a registry's types directly.
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

function contextValue(draft: Draft): DraftContextValue {
  return {
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
}

const DRAFT = {
  baseLocale: "en",
  dataSources: [
    { id: "ds_1", key: "Cost centres", type: "db.list", config: {} },
    { id: "ds_2", key: "", type: "", config: {} },
  ],
} as unknown as Draft;

function renderPanel(selectedId: string | undefined): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue(DRAFT)}>
      <DataSourcesPanel token="t" selectedId={selectedId} onAdd={() => {}} onRemove={() => {}} />
    </DraftContext.Provider>,
  );
}

const headingOf = (html: string): string => /<h3[^>]*>(.*?)<\/h3>/.exec(html)?.[1] ?? "";

describe("DataSourcesPanel's heading", () => {
  it("heads the editor with the source's name", () => {
    expect(headingOf(renderPanel("ds_1"))).toBe("Cost centres");
  });

  it("heads an unnamed source with the fallback word", () => {
    expect(headingOf(renderPanel("ds_2"))).toBe("(unnamed source)");
  });

  it("prints no 'Data sources' heading", () => {
    expect(renderPanel("ds_1")).not.toContain(">Data sources<");
  });
});

describe("DataSourcesPanel's name input", () => {
  it("captions the input Name and sets it in the body face", () => {
    const html = renderPanel("ds_1");

    expect(html).toMatch(/<label[^>]*>Name<input type="text"[^>]*value="Cost centres"/);
    expect(html).not.toContain(">Key<");
    const input = /<input type="text"[^>]*value="Cost centres"[^>]*>/.exec(html)?.[0] ?? "";
    // A mono face would arrive as a compiled class on the input.
    expect(input).not.toMatch(/class="/);
  });

  it("legends the kind picker 'What kind of source'", () => {
    const html = renderPanel("ds_1");

    expect(html).toContain("<legend>What kind of source</legend>");
    expect(html).not.toContain("Data source plugin");
  });
});

describe("the kind picker's names", () => {
  const row = (types: string[], type: string) =>
    renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(DRAFT)}>
        <DataSourceRow
          ds={{ id: "ds_9", key: "x", type, config: {} } as never}
          listKeys={undefined}
          registryTypes={types}
          registrySchemas={undefined}
          token="t"
          ownFields={[]}
          onChange={() => {}}
          onRemove={() => {}}
        />
      </DraftContext.Provider>,
    );

  it("offers a name for each registered kind and no registry type", () => {
    const html = row(["db.list", "instance.query"], "db.list");

    expect(html).toContain(">A data list an operator keeps</option>");
    expect(html).toContain(">Cases of another process</option>");
    expect(html).not.toMatch(/<option[^>]*>db\.list<\/option>/);
    expect(html).not.toMatch(/<option[^>]*>instance\.query<\/option>/);
  });

  it("keeps each option's value the registry type", () => {
    const html = row(["db.list", "instance.query"], "db.list");

    expect(html).toContain('value="db.list"');
    expect(html).toContain('value="instance.query"');
  });

  it("names the static kind in the author's words", () => {
    expect(dataSourceKindLabel("static")).toBe("A list typed into this process");
  });

  it("prints a type the table does not name as its registry type", () => {
    expect(dataSourceKindLabel("acme.sheet")).toBe("acme.sheet");
    expect(row(["db.list", "acme.sheet"], "db.list")).toMatch(/<option[^>]*>acme\.sheet<\/option>/);
  });
});
