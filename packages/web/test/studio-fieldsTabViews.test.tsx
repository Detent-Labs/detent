import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { FieldsTabViews } from "../src/areas/studio/panels/FieldsTabViews.js";
import { FIELDS_VIEWS, type FieldsView } from "../src/areas/studio/routing.js";
import { subTabDomId, subTabPanelDomId } from "../src/areas/studio/panels/SubRow.js";

/**
 * The Fields tab's three views (`studio-process-tabs`: "The Fields tab carries
 * the catalog and the matrix as views"). The static render mounts every view
 * body, as the tab does, and reads the ids and the data sources' rail off the
 * markup.
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

function render(view: FieldsView = "catalog"): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue(DRAFT)}>
      <FieldsTabViews view={view} onOpenView={() => {}} token="t" visible onShowStep={() => {}} onOpenForm={() => {}} />
    </DraftContext.Provider>,
  );
}

describe("the Fields tab's views", () => {
  it("lists Catalog, Where fields appear and Where values come from, in that order", () => {
    expect(FIELDS_VIEWS).toEqual(["catalog", "matrix", "sources"]);
    const html = render();
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g)].map((m) => m[1]);

    expect(tabs).toEqual(["Catalog", "Where fields appear", "Where values come from"]);
  });

  it("gives each of the three views a tab and a tabpanel id", () => {
    const html = render();

    for (const view of FIELDS_VIEWS) {
      expect(html).toContain(`id="${subTabDomId("fields", view)}"`);
      expect(html).toContain(`id="${subTabPanelDomId("fields", view)}"`);
    }
  });

  it("mounts the data sources' rail and editor under the sources view body", () => {
    const html = render("sources");
    const body = html.slice(html.indexOf(`id="${subTabPanelDomId("fields", "sources")}"`));

    expect(body).toContain("Cost centres");
    expect(body).toContain("(unnamed source)");
    expect(body).toContain("+ Add data source");
    expect(body).toContain("What kind of source");
  });

  it("hides the sources body unless the sources view is open", () => {
    const sourcesOpen = render("sources");
    const catalogOpen = render("catalog");
    const panel = (html: string) => /<div[^>]*id="studio-subtabpanel-fields-sources"[^>]*>/.exec(html)?.[0] ?? "";

    expect(panel(catalogOpen)).toContain("hidden");
    expect(panel(sourcesOpen)).not.toContain("hidden");
  });
});
