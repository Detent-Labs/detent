import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DataSourceDef } from "workflow-engine/schema";
import type { Draft, DraftOf } from "../src/areas/studio/draft/types.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { DataSourceRow } from "../src/areas/studio/panels/DataSourcesPanel.js";
import { namesFieldSource } from "../src/areas/studio/panels/fieldCheckZone.js";
import {
  fieldCheckAnchorId,
  fieldFixAnchors,
  fixLandsNow,
  fixOpensMore,
  focusCheckAnchor,
  SOURCE_CHECK_ANCHOR_ID,
} from "../src/areas/studio/panels/fixLanding.js";

/**
 * A Fix control's landing on the Fields tab (`studio-process-tabs`, design.md
 * D7). `renderToStaticMarkup` runs no effect, so the two passes' decisions are
 * pure functions pinned here, and their order reads off the source. The real
 * focus is walked in the browser.
 */

const NOOP = () => {};

describe("fieldFixAnchors", () => {
  it("tries the zone's anchor, then asks, then the field's rail entry", () => {
    expect(fieldFixAnchors("values", "rail")).toEqual(["check-anchor-field-values", "check-anchor-field-asks", "rail"]);
  });

  it("tries asks once for the asks zone and for a check with no zone", () => {
    expect(fieldFixAnchors("asks", "rail")).toEqual(["check-anchor-field-asks", "rail"]);
    expect(fieldFixAnchors(undefined, "rail")).toEqual(["check-anchor-field-asks", "rail"]);
  });
});

describe("fixOpensMore", () => {
  it("opens More for the zones it prints inside", () => {
    for (const zone of ["default", "validation", "columnMapping"] as const) expect(fixOpensMore(zone)).toBe(true);
  });

  it("leaves More alone for the zones above it", () => {
    for (const zone of ["asks", "kind", "values", undefined] as const) expect(fixOpensMore(zone)).toBe(false);
  });
});

describe("fixLandsNow", () => {
  it("waits for the requested entity to be the selected one, past the rail's first-row fallback", () => {
    expect(fixLandsNow(true, "field_b", "field_a")).toBe(false);
    expect(fixLandsNow(true, "field_b", undefined)).toBe(false);
    expect(fixLandsNow(true, "field_b", "field_b")).toBe(true);
  });

  it("lands on a field whose card already shows", () => {
    expect(fixLandsNow(true, "field_a", "field_a")).toBe(true);
  });

  it("waits while the view hides", () => {
    expect(fixLandsNow(false, "field_a", "field_a")).toBe(false);
  });

  it("does nothing with no request", () => {
    expect(fixLandsNow(true, undefined, "field_a")).toBe(false);
    expect(fixLandsNow(true, undefined, undefined)).toBe(false);
  });
});

describe("focusCheckAnchor", () => {
  const element = (log: string[], name: string) => ({ closest: () => null, focus: () => log.push(name) });

  it("focuses the first id that stands in the page", () => {
    const log: string[] = [];
    const held = new Map([["b", element(log, "b")], ["c", element(log, "c")]]);

    focusCheckAnchor(["a", "b", "c"], (id) => held.get(id) ?? null);

    expect(log).toEqual(["b"]);
  });

  it("focuses nothing where no id stands", () => {
    const log: string[] = [];

    focusCheckAnchor(["a"], () => null);

    expect(log).toEqual([]);
  });

  it("opens a closed disclosure around the element before it takes focus", () => {
    const log: string[] = [];
    const fold = { open: false, parentElement: null };
    const anchor = {
      closest: () => fold,
      focus: () => log.push(fold.open ? "open" : "closed"),
    };

    focusCheckAnchor(["a"], () => anchor);

    expect(log).toEqual(["open"]);
  });
});

describe("namesFieldSource", () => {
  it("answers true for a data source segment right after the fields anchor", () => {
    expect(namesFieldSource("fields[0].dataSource")).toBe(true);
    expect(namesFieldSource("fields[1].fields[0].dataSource")).toBe(true);
  });

  it("answers false elsewhere", () => {
    expect(namesFieldSource("fields[0].options[0].dataSource")).toBe(false);
    expect(namesFieldSource("dataSources[0].key")).toBe(false);
    expect(namesFieldSource("fields[0].label")).toBe(false);
  });
});

describe("the anchors' ids", () => {
  it("reads each zone's id and the source's", () => {
    expect(fieldCheckAnchorId("validation")).toBe("check-anchor-field-validation");
    expect(SOURCE_CHECK_ANCHOR_ID).toBe("check-anchor-source");
  });
});

describe("the source editor's anchor", () => {
  const ds = { id: "ds_1", key: "countries", type: "static", config: {} } as unknown as DraftOf<DataSourceDef>;
  const validation = (issues: EditorIssue[]): ValidationResult =>
    ({ zodValid: true, issues, dimensions: {}, subprocessStepStatus: {}, chainingSiteStatus: {} }) as unknown as ValidationResult;
  const render = (issues: EditorIssue[]) =>
    renderToStaticMarkup(
      <DraftContext.Provider
        value={
          {
            draft: { baseLocale: "en", dataSources: [ds] } as unknown as Draft,
            mutate: NOOP,
            replace: NOOP,
            validation: validation(issues),
            loadedChildren: {},
            setChildForStep: NOOP,
            registry: undefined,
            loadedChainingTargets: {},
            contentLocale: "en",
            setContentLocale: NOOP,
            usedLocales: ["en"],
            loadGeneration: 0,
          } as DraftContextValue
        }
      >
        <DataSourceRow
          ds={ds}
          listKeys={undefined}
          registryTypes={undefined}
          registrySchemas={undefined}
          token="t"
          ownFields={[]}
          onChange={NOOP}
          onRemove={NOOP}
        />
      </DraftContext.Provider>,
    );

  it("anchors the source's sentence, and takes focus out of the tab order", () => {
    const html = render([{ entityType: "dataSource", entityId: "ds_1", message: "no type", source: "zod", loc: "dataSources[0].type" }]);
    const at = html.lastIndexOf("<ul", html.indexOf("no type"));
    const list = html.slice(at, html.indexOf(">", at));

    expect(list).toContain('id="check-anchor-source"');
    expect(list).toContain('tabindex="-1"');
  });

  it("prints no anchor with no check", () => {
    expect(render([])).not.toContain("check-anchor-source");
  });
});

describe("the two passes on the Fields tab", () => {
  const source = readFileSync(new URL("../src/areas/studio/panels/EntityTabs.tsx", import.meta.url).pathname, "utf8");
  const fieldsTab = source.slice(source.indexOf("export function FieldsTab("), source.indexOf("export function DataSourcesTab("));
  const sourcesTab = source.slice(source.indexOf("export function DataSourcesTab("));

  it("selects a field and opens More in the first pass, while the view shows", () => {
    const first = fieldsTab.slice(fieldsTab.indexOf("if (!visible || fixFieldId === undefined) return;"), fieldsTab.indexOf("[visible, fixFieldId, fixZone]);"));

    expect(first).toContain("setSelectedFieldId(fixFieldId);");
    expect(first).toContain("if (fixOpensMore(fixZone)) setOpenMoreFor(fixFieldId);");
  });

  it("focuses and clears in the second pass, and clears only there", () => {
    const second = fieldsTab.slice(fieldsTab.indexOf("if (!fixLandsNow(visible, fixFieldId, selectedFieldId)) return;"), fieldsTab.indexOf("[visible, fixFieldId, fixZone, selectedFieldId, onFixLanded]);"));

    expect(second).toContain("focusCheckAnchor(fieldFixAnchors(fixZone, railEntryId(fixFieldId!)));");
    expect(second).toContain("onFixLanded();");
    expect(fieldsTab.match(/onFixLanded\(\);/g)).toHaveLength(1);
  });

  it("runs the second pass after the scroll reset, so the reset cannot undo the focus's scroll", () => {
    expect(fieldsTab.indexOf('scrollTo({ top: 0, behavior: "instant" })')).toBeLessThan(fieldsTab.indexOf("if (!fixLandsNow("));
  });

  it("selects a source in one pass, and focuses and clears in the next", () => {
    expect(sourcesTab).toContain("if (visible && fixSourceId !== undefined) setSelectedDataSourceId(fixSourceId);");
    expect(sourcesTab).toContain("if (!fixLandsNow(visible, fixSourceId, selectedDataSourceId)) return;");
    expect(sourcesTab).toContain("focusCheckAnchor([SOURCE_CHECK_ANCHOR_ID, dataSourceRailId(fixSourceId!)]);");
    expect(sourcesTab.match(/onFixLanded\(\);/g)).toHaveLength(1);
  });

  it("passes the request to both tabs from the Fields views", () => {
    const views = readFileSync(new URL("../src/areas/studio/panels/FieldsTabViews.tsx", import.meta.url).pathname, "utf8");

    expect(views.match(/fixRequest=\{fixRequest\}/g)).toHaveLength(2);
    expect(views.match(/onFixLanded=\{onFixLanded\}/g)).toHaveLength(2);
  });
});
