import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { PROCESS_TABS } from "../src/areas/studio/routing.js";

/**
 * The shape of the one process surface, guarded at the source.
 *
 * No harness in this package can mount the surface: `DraftProvider` fetches on
 * mount and `renderToStaticMarkup` never resolves those effects, which is why
 * every other test over this component renders a hand-built `DraftContext`
 * instead. So the facts a mount would show — that all ten bodies render, that
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

  it("renders one body per tab, all ten of them", () => {
    const code = stripComments(read(SURFACE));
    // Every `tabPanel("<name>"` call the surface makes, whatever line the
    // argument sits on.
    const mounted = [...code.matchAll(/tabPanel\(\s*"([a-zA-Z]+)"/g)].map((m) => m[1]);

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
    // The Fields and Data sources tabs keep their own entity rails: a field
    // still moves into a group and out of it from a row. The rail of view
    // names is what the tab row replaced.
    const code = stripComments(read(SURFACE));

    expect(code).not.toContain("panelsRail");
    expect(code).not.toContain("PanelsScreen");
  });

  it("keeps the header bar clear of the Structure and JSON pair", () => {
    const code = stripComments(read("src/areas/studio/panels/ProcessHeaderBar.tsx"));

    expect(code).not.toContain("surfaceToggle");
    expect(code).not.toContain('role="tablist"');
  });

  it("keeps the header bar menu clear of Save, Discard draft and Publish", () => {
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
    // The menu keeps its one group: the process key, the base locale, the
    // add-locale control and the admin groups link.
    expect(menu).toContain("headerBar.menuGroupDraft");
    expect(menu).toContain("AddLocaleControl");
    expect(menu).toContain("headerBar.manageGroups");
    // They render somewhere in the file — the header row's own top-level code.
    expect(code).toContain("actions.save");
    expect(code).toContain("actions.discard");
    expect(code).toContain("actions.publish");
  });
});

describe("the canvas opens the Steps tab, and keeps its own selection behavior", () => {
  const CANVAS = "src/areas/studio/canvas/CanvasView.tsx";

  it("opens the Steps tab from the Enter binding alone", () => {
    const code = stripComments(read(CANVAS));
    const enterAt = code.indexOf('if (e.key === "Enter")');
    const binding = code.slice(enterAt, code.indexOf("const arrow", enterAt));

    expect(enterAt).toBeGreaterThan(-1);
    expect(binding).toContain("onOpenStepPage");
    // Exactly the two calls that binding makes: a step focus and a path
    // focus. A third would mean a pointer handler reached it too.
    expect(code.match(/onOpenStepPage\?\.\(/g)).toHaveLength(2);
  });

  it("leaves a pointer press on the canvas, so a set can still be built", () => {
    const code = stripComments(read(CANVAS));
    const up = code.indexOf("const onNodePointerUp");
    const handler = code.slice(up, code.indexOf("const ", up + 10));

    expect(up).toBeGreaterThan(-1);
    expect(handler).not.toContain("onOpenStepPage");
  });

  it("keeps the inline rename on a node's double-click", () => {
    const code = stripComments(read(CANVAS));
    const at = code.indexOf("onDoubleClick={(e) => {");
    const handler = code.slice(at, code.indexOf("}}", at));

    expect(handler).toContain("startRename(");
    expect(handler).not.toContain("onOpenStepPage");
  });

  it("wires the surface's own opener to the Steps tab", () => {
    expect(stripComments(read(SURFACE))).toContain('onOpenStepPage={() => goToTab("steps")}');
  });
});

describe("every new component's styles compile", () => {
  // `DraftNavControls.tsx` left this list when `studio-draft-actions-to-
  // header-bar` narrowed it to a pass-through around `ChecksRail`: it
  // declares no markup of its own left to style, so it carries no
  // `stylex.create(` any more, by design rather than by omission.
  const NEW_FILES = [
    "src/areas/studio/panels/ProcessTabRow.tsx",
    "src/areas/studio/panels/EntityTabs.tsx",
    "src/areas/studio/panels/StepsRail.tsx",
    "src/areas/studio/panels/StepPage.tsx",
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
