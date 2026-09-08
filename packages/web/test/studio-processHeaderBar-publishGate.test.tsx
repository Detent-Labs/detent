import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { DraftToolbarActions } from "../src/areas/studio/panels/DraftToolbar.js";
import { ProcessHeaderBar } from "../src/areas/studio/panels/ProcessHeaderBar.js";

/**
 * studio-publish-gate-and-report: the header bar announces a failed mutation.
 *
 * One defect reached the running build before this: the refusal rendered as a
 * bare colored paragraph, as one more inline item in a wrapping row of ten
 * badges, with no alert role on it — it reached the DOM and reached nobody.
 *
 * Since `studio-guided-surface`, Save, Discard draft and Publish stand in the
 * studio's area nav, not in this bar's `⋮` menu, and the publish gate travels
 * with them. `studio-draftNavControls.test.tsx` covers that half.
 *
 * Renders `<DraftContext.Provider>` with a hand-built value, the idiom
 * `studio-processHeaderBar-findingFallback.test.tsx` established for this same
 * component — never a live `DraftProvider`, whose fetch effects never resolve
 * under static rendering.
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

const contextValue: DraftContextValue = {
  draft: { label: { en: "Expense approval" }, baseLocale: "en" },
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

const noActions: DraftToolbarActions = {
  saving: false,
  publishing: false,
  error: null,
  pendingDialog: null,
  resolveDialog: () => {},
  save: () => {},
  discard: () => {},
  publish: () => {},
  reload: () => {},
};

/** The `⋮` menu is closed until something opens it, and no static render fires
 * a click. `menuOpen` is component state, so the menu's own markup is out of
 * reach here; what this renders is the header and the failure region. */
function renderHeader(over: { actions?: Partial<DraftToolbarActions>; conflict?: boolean }): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue}>
      <ProcessHeaderBar
        revision={7}
        isDirty={false}
        lastSavedAt={undefined}
        publishResult={null}
        conflict={over.conflict ?? false}
        actions={{ ...noActions, ...over.actions }}
        structureActive={true}
        processId="proc_a"
        go={() => {}}
        onToggleJson={() => {}}
        onVersions={() => {}}
        onPlayer={() => {}}
      />
    </DraftContext.Provider>,
  );
}

describe("ProcessHeaderBar's failure region", () => {
  it("announces a failed mutation as an alert banner, not as a bare paragraph", () => {
    const html = renderHeader({ actions: { error: "You don't have permission to do that." } });

    expect(html).toContain('role="alert"');
    expect(html).toContain("errorBanner");
    expect(html).toContain("You don&#x27;t have permission to do that.");
    // The violating input: the shape this change replaced.
    expect(html).not.toContain('<p class="studio-error">');
  });

  it("puts the banner outside the header element, so it is not one more flex item", () => {
    const html = renderHeader({ actions: { error: "refused" } });

    expect(html.indexOf("errorBanner")).toBeGreaterThan(html.indexOf("</header>"));
  });

  it("gives the save conflict the same banner shape, keeping its Reload button", () => {
    const html = renderHeader({ conflict: true });

    expect(html).toContain("errorBanner");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Reload");
    expect(html).not.toContain("studio-conflict");
  });

  it("suppresses the banner while a dialog is open, so one failure announces once", () => {
    const html = renderHeader({ actions: { error: "refused", pendingDialog: "publish" } });

    expect(html).not.toContain("errorBanner");
  });

  it("renders no failure region at all when nothing failed", () => {
    const html = renderHeader({});

    expect(html).not.toContain("errorBanner");
    expect(html).not.toContain('role="alert"');
  });
});

/**
 * Task 2.9 and task 2.15 of `studio-guided-surface`. The header bar stands no
 * Structure/JSON pair, and its `⋮` menu carries none of the area nav's four
 * controls. `studio-header-menu-merge` later gave the JSON toggle a home in
 * this same `⋮` menu's own "Views" group, so this still holds: it names the
 * area nav's four controls, not the JSON toggle itself.
 */
describe("What the header bar no longer carries", () => {
  it("stands no Structure control and no JSON control", () => {
    const html = renderHeader({});

    expect(html).not.toContain("Structure");
    expect(html).not.toContain(">JSON<");
    expect(html).not.toContain('role="tablist"');
  });

  it("mounts neither confirmation dialog, whatever the pending state reads", () => {
    // Both dialogs travelled to the controls that open them, in the area nav,
    // so focus can return to the pressed control when either closes.
    expect(renderHeader({ actions: { pendingDialog: "publish" } })).not.toContain("<dialog");
    expect(renderHeader({ actions: { pendingDialog: "discard" } })).not.toContain("<dialog");
  });
});

/**
 * `studio-header-menu-merge`: the `⋮` menu now carries what the tab row's
 * own overflow menu used to (JSON surface, Versions, Player), so this
 * trigger's closed-state markup gets the same coverage that menu's trigger
 * had before it was deleted.
 */
describe("The header bar's ⋮ menu", () => {
  it("stays closed until something opens it", () => {
    const html = renderHeader({});

    expect(html).toContain('aria-haspopup="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });
});
