import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { SettingsTab } from "../src/areas/studio/panels/SettingsTab.js";
import { SETTINGS_VIEWS } from "../src/areas/studio/routing.js";
import { subTabDomId, subTabPanelDomId } from "../src/areas/studio/panels/SubRow.js";

/**
 * The Settings tab holds three views (`studio-process-tabs`: "The Settings tab
 * gathers the process-wide settings"). The data sources moved to the Fields
 * tab, so no data source editor mounts here.
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
  draft: {
    baseLocale: "en",
    dataSources: [{ id: "ds_1", key: "Cost centres", type: "db.list", config: {} }],
  } as unknown as Draft,
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

const savePointActions = {
  createSavePoint: async () => ({ kind: "ended" as const }),
  restoreSavePoint: async () => ({ kind: "ended" as const }),
  removeSavePoint: async () => ({ kind: "ended" as const }),
};

function render(view: "process" | "points" = "process"): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={context}>
      <SettingsTab
        view={view}
        onOpenView={() => {}}
        token="t"
        roles={[]}
        processId="proc_1"
        revision={1}
        go={() => {}}
        onUnauthorized={() => {}}
        visible={false}
        savePointActions={savePointActions}
        savePointsFocus={0}
      />
    </DraftContext.Provider>,
  );
}

describe("the Settings tab's views", () => {
  it("lists Process, What it takes in and gives back, Access and Save points", () => {
    expect(SETTINGS_VIEWS).toEqual(["process", "contract", "access", "points"]);
    const tabs = [...render().matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g)].map((m) => m[1]);

    expect(tabs).toEqual(["Process", "What it takes in and gives back", "Access", "Save points"]);
  });

  it("opens the Save points view on its address, and hides it behind the others", () => {
    const open = render("points");
    const panel = (html: string) => new RegExp(`<div[^>]*id="${subTabPanelDomId("settings", "points")}"[^>]*>`).exec(html)![0];

    expect(panel(open)).not.toContain("hidden");
    expect(open).toContain("Name this save point");
    expect(panel(render("process"))).toContain("hidden");
  });

  it("gives each of the four views a tab and a tabpanel id", () => {
    const html = render();

    for (const view of SETTINGS_VIEWS) {
      expect(html).toContain(`id="${subTabDomId("settings", view)}"`);
      expect(html).toContain(`id="${subTabPanelDomId("settings", view)}"`);
    }
    expect(html).not.toContain("studio-subtab-settings-sources");
    expect(html).not.toContain("studio-subtabpanel-settings-sources");
  });

  it("mounts no data sources rail or editor", () => {
    const html = render();

    expect(html).not.toContain("Cost centres");
    expect(html).not.toContain("+ Add data source");
    expect(html).not.toContain("What kind of source");
  });
});
