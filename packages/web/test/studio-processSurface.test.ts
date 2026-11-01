import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { PROCESS_TABS } from "../src/areas/studio/routing.js";

/**
 * The shape of the one process surface, guarded at the source.
 *
 * No harness in this package can mount the surface: `DraftProvider` fetches on
 * mount and `renderToStaticMarkup` never resolves those effects, which is why
 * every other test over this component renders a hand-built `DraftContext`
 * instead. So the facts a mount would show — that all six bodies render, that
 * none unmounts on a tab switch, that the two screens collapsed into one — are
 * asserted the way `studio-no-confirm.test.ts` asserts its own: read the file,
 * match a pattern.
 *
 * A browser check covers what this cannot see, per `development-toolchain`'s
 * split rule: that a half-typed value survives a real tab switch.
 */
const ROOT = new URL("../", import.meta.url).pathname;
const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");

const SURFACE = "src/areas/studio/screens/EditScreen.tsx";

/** Block comments first, then line comments — the order matters for a `//`
 * inside a block comment. A name in a comment is not a call. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("the two screens collapsed into one surface", () => {
  it("leaves no panels screen behind", () => {
    expect(existsSync(`${ROOT}src/areas/studio/screens/PanelsScreen.tsx`)).toBe(false);
  });

  it("renders one body per tab, all six of them", () => {
    const code = stripComments(read(SURFACE));
    // Every `tabPanel("<name>"` call the surface makes, whatever line the
    // argument sits on.
    const mounted = [...code.matchAll(/tabPanel\(\s*"([a-zA-Z]+)"/g)].map((m) => m[1]);

    expect(mounted).toHaveLength(PROCESS_TABS.length);
    expect(mounted.sort()).toEqual([...PROCESS_TABS].sort());
  });

  it("hides a body rather than unmounting it, so it keeps its half-typed values", () => {
    const code = stripComments(read(SURFACE));

    // `hidden` takes the subtree out of the tab order and the accessibility
    // tree while the subtree itself stays mounted. The named hidden style
    // rides along because a compiled `display` would otherwise beat the UA
    // sheet's own `[hidden]` rule.
    expect(code).toContain("hidden={hide}");
    expect(code).toContain("styles.tabBodyHidden");
  });
});

describe("what the surface no longer carries", () => {
  it("stands no canvas ribbon and no bar over the canvas", () => {
    const code = stripComments(read(SURFACE));

    expect(code).not.toContain("ribbon");
    expect(code).not.toContain("Ribbon");
  });

  it("stands no index rail of view names", () => {
    // The Catalog and Where values come from views keep their own entity
    // rails: a field still moves into a group and out of it from a row. The
    // tab row stands where a rail of view names would.
    const code = stripComments(read(SURFACE));

    expect(code).not.toContain("panelsRail");
    expect(code).not.toContain("PanelsScreen");
  });

  it("keeps the header bar clear of the Structure and JSON pair", () => {
    const code = stripComments(read("src/areas/studio/panels/ProcessHeaderBar.tsx"));

    expect(code).not.toContain("surfaceToggle");
    expect(code).not.toContain('role="tablist"');
  });

  it("keeps the header bar menu to the Views group, clear of Save, Discard draft and Publish", () => {
    const code = stripComments(read("src/areas/studio/panels/ProcessHeaderBar.tsx"));
    // The three stand in the header row itself now, ahead of the menu
    // trigger — scope the "clear of" assertion to the menu's own slice, or a
    // whole-file search would find them there and fail.
    // The slice ends where the confirmation dialogs begin, not at </header>:
    // PublishConfirmDialog's own `busy={actions.saving || actions.publishing}`
    // prop sits between the menu and </header>, and "actions.publishing"
    // contains "actions.publish" as a substring.
    const menuAt = code.indexOf("styles.headerBarMenu)} ref={menuRef}");
    const dialogsAt = code.indexOf('actions.pendingDialog === "publish"', menuAt);
    const menu = code.slice(menuAt, dialogsAt);

    expect(menuAt).toBeGreaterThan(-1);
    expect(dialogsAt).toBeGreaterThan(-1);
    expect(menu).not.toContain("actions.save");
    expect(menu).not.toContain("actions.discard");
    expect(menu).not.toContain("actions.publish");
    // The menu keeps one group, Views. The process settings and the admin
    // groups link stand on the Settings tab.
    expect(menu).toContain("headerBar.menuGroupViews");
    expect(menu).not.toContain("headerBar.menuGroupDraft");
    expect(menu).not.toContain("AddLocaleControl");
    expect(menu).not.toContain("headerBar.manageGroups");
    // They render somewhere in the file — the header row's own top-level code.
    expect(code).toContain("actions.save");
    expect(code).toContain("actions.discard");
    expect(code).toContain("actions.publish");
  });
});

describe("the canvas opens the Steps tab, and keeps its own selection behavior", () => {
  const CANVAS = "src/areas/studio/canvas/CanvasView.tsx";

  /** The `onDoubleClick` handler's body after `anchor`, up to its closing `}}`. */
  const doubleClickAfter = (code: string, anchor: string): string => {
    const from = code.indexOf(anchor);
    expect(from).toBeGreaterThan(-1);
    const at = code.indexOf("onDoubleClick={(e) => {", from);
    expect(at).toBeGreaterThan(-1);
    return code.slice(at, code.indexOf("}}", at));
  };

  it("opens the Steps tab from Enter, and Enter on a path passes its id", () => {
    const code = stripComments(read(CANVAS));
    const enterAt = code.indexOf('if (e.key === "Enter")');
    const binding = code.slice(enterAt, code.indexOf("const arrow", enterAt));

    expect(enterAt).toBeGreaterThan(-1);
    expect(binding).toContain("onOpenStepPage?.(focus.stepId)");
    expect(binding).toContain("onOpenStepPage?.(owner.id, focus.pathId)");
    // Two from Enter, and one from each of the five double-click routes: the
    // node, its connect handle, the edge group, the sentence and the midpoint
    // handle. An eighth would mean a single press reached it too.
    expect(code.match(/onOpenStepPage\?\.\(/g)).toHaveLength(7);
  });

  it("opens the step from a double-click on its node", () => {
    const handler = doubleClickAfter(stripComments(read(CANVAS)), "const renderNode");

    expect(handler).toContain("onSelectStep(step.id as string)");
    expect(handler).toContain("onOpenStepPage?.(step.id as string)");
  });

  it("opens the source step's Ways out from a double-click on the edge group", () => {
    const handler = doubleClickAfter(stripComments(read(CANVAS)), 'tabIndex={focus.kind === "path"');

    expect(handler).toContain("onSelectStep(step.id, path.id)");
    expect(handler).toContain("onOpenStepPage?.(step.id as string, path.id)");
  });

  it("opens the source step's Ways out from a double-click on the sentence", () => {
    const code = stripComments(read(CANVAS));
    const handler = doubleClickAfter(code, "function EdgeLabel");
    const at = code.indexOf("<EdgeLabel");
    const opener = code.slice(code.indexOf("onOpen={", at), code.indexOf("/>", at));

    expect(handler).toContain("onOpen()");
    expect(opener).toContain("onSelectStep(label.stepId, label.pathId)");
    expect(opener).toContain("onOpenStepPage?.(label.stepId, label.pathId)");
  });

  it("opens the way out from a double-click on its midpoint handle, and adds no waypoint", () => {
    const code = stripComments(read(CANVAS));
    const at = code.indexOf("const onMidpointDoubleClick");
    const handler = code.slice(at, code.indexOf("};", at));
    const handles = code.slice(code.indexOf("{waypointHandles.map("));
    const wiring = handles.slice(handles.indexOf("onDoubleClick="), handles.indexOf("/>"));

    expect(at).toBeGreaterThan(-1);
    expect(handler).toContain("e.stopPropagation()");
    expect(handler).toContain("onSelectStep(stepId, pathId)");
    expect(handler).toContain("onOpenStepPage?.(stepId, pathId)");
    expect(handler).not.toContain("onWaypointsChange");
    // The midpoint handle opens; an existing waypoint's handle still deletes.
    expect(wiring).toContain("h.index === undefined ? onMidpointDoubleClick(e, h.stepId, h.pathId)");
    expect(wiring).toContain("onWaypointDoubleClick(e, h.pathId, h.index)");
  });

  it("moves the roving stop from a press on the sentence, as from a press on the line", () => {
    const code = stripComments(read(CANVAS));
    const label = code.slice(code.indexOf("function EdgeLabel"), code.indexOf("export function CanvasView"));
    const at = code.indexOf("<EdgeLabel");
    const press = code.slice(code.indexOf("onPress={", at), code.indexOf("onSelect=", at));

    expect(label).toContain("onPointerDown={onPress}");
    // The mouse press's default would move focus to the canvas svg after it.
    expect(label).toContain("onMouseDown={(e) => e.preventDefault()}");
    expect(press).toContain('if (label.pathId !== undefined) moveFocus({ kind: "path", pathId: label.pathId, from: "source" })');
  });

  it("opens the step from a double-click on its connect handle, which draws outside the node", () => {
    const code = stripComments(read(CANVAS));
    const handles = code.slice(code.indexOf("{connectHandles.map("));
    const handler = handles.slice(handles.indexOf("onDoubleClick={(e) => {"), handles.indexOf("}}"));

    expect(handler).toContain("onSelectStep(h.stepId)");
    expect(handler).toContain("onOpenStepPage?.(h.stepId)");
    // The sentences need no room for a handle: it draws above them.
    expect(code).not.toContain("handleObstacle");
    expect(code.indexOf("{connectHandles.map(")).toBeGreaterThan(code.indexOf("{edgeLabels.map("));
    expect(code.indexOf("{connectHandles.map(")).toBeGreaterThan(code.indexOf("{waypointHandles.map("));
    expect(code.indexOf("{disclosures.map(")).toBeGreaterThan(code.indexOf("{connectHandles.map("));
  });

  it("places no sentence while the Map tab is hidden, and places them when it shows", () => {
    const code = stripComments(read(CANVAS));
    const at = code.indexOf("const sentenceBoxes = useMemo(");
    const memo = code.slice(at, code.indexOf("const [nodeDrag", at));

    expect(at).toBeGreaterThan(-1);
    expect(memo).toContain("if (!visible) return new Map<string, SentenceBox>();");
    expect(memo).toMatch(/\}, \[visible, /);
  });

  it("leaves a pointer press on the canvas, so a set can still be built", () => {
    const code = stripComments(read(CANVAS));
    const up = code.indexOf("const onNodePointerUp");
    const handler = code.slice(up, code.indexOf("const ", up + 10));

    expect(up).toBeGreaterThan(-1);
    expect(handler).not.toContain("onOpenStepPage");
  });

  it("has no inline rename left on a node's double-click", () => {
    const code = stripComments(read(CANVAS));

    expect(doubleClickAfter(code, "const renderNode")).not.toContain("startRename");
    expect(code).not.toContain("renaming");
    expect(code).not.toContain("inlineRename");
  });

  it("wires the surface's own opener to the Steps tab, bumping waysOutRequest for a way out", () => {
    const code = stripComments(read(SURFACE));
    const at = code.indexOf("onOpenStepPage={");
    const opener = code.slice(at, code.indexOf("}}", at));

    expect(opener).toContain("setWaysOutRequest(");
    expect(opener).toContain('goToTab("steps")');
    expect(code).toContain("waysOutRequest={waysOutRequest}");
  });
});

describe("every new component's styles compile", () => {
  // `DraftNavControls.tsx` left this list when `studio-draft-actions-to-
  // header-bar` narrowed it to a pass-through around `ChecksRail`.
  // `checks-status-consolidation` then deleted the file outright: removing
  // the area nav's Checks control emptied its whole body.
  const NEW_FILES = [
    "src/areas/studio/panels/ProcessTabRow.tsx",
    "src/areas/studio/panels/EntityTabs.tsx",
    "src/areas/studio/panels/StepsRail.tsx",
    "src/areas/studio/panels/StepPage.tsx",
    "src/areas/studio/panels/SubRow.tsx",
    "src/areas/studio/panels/FieldsTabViews.tsx",
    "src/areas/studio/panels/SettingsTab.tsx",
    "src/areas/studio/panels/ProcessSettingsPanel.tsx",
  ];

  for (const file of NEW_FILES) {
    it(`${file} declares a typed style object and no inline one`, () => {
      const code = stripComments(read(file));

      expect(code).toContain("stylex.create(");
      // An inline object literal in a `style` prop is the runtime injection
      // `web-styling` refuses. `style={someProps.style}` is StyleX's own
      // variable map and stays.
      expect(code).not.toContain("style={{");
    });
  }
});
