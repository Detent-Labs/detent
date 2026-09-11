import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FormTabStrip } from "../src/areas/studio/panels/FormTabStrip.js";
import type { DraftViewTab } from "../src/areas/studio/draft/view-layout.js";

/**
 * The form's own tab strip (`studio-form-editor`: "A tab strip above the
 * canvas authors the form's tabs"). Every write leaves through a callback, so
 * a static render reaches the whole surface: which tabs draw, which one
 * reports itself open, which controls stand, and the keyboard model the
 * markup carries.
 *
 * The rename input is what a static render cannot exercise — it appears on a
 * click. `studio-view-layout.test.ts` covers `renameViewTab`, the pure
 * function behind it, including that a rename never rewrites the key.
 */

const TABS: DraftViewTab[] = [
  { key: "t1", label: { en: "Details" } },
  { key: "t2", label: { en: "Approval" } },
  { key: "t3", label: { en: "Receipts" } },
];

const render = (tabs: DraftViewTab[], open?: string) =>
  renderToStaticMarkup(
    <FormTabStrip
      tabs={tabs}
      open={open}
      contentLocale="en"
      baseLocale="en"
      onOpen={() => {}}
      onAdd={() => {}}
      onRename={() => {}}
      onMove={() => {}}
      onRemove={() => {}}
    />,
  );

describe("the form's tab strip", () => {
  it("shows the add control alone on a form with no tab", () => {
    const html = render([]);

    expect(html).toContain("Add a tab");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("Remove tab");
  });

  it("draws one tab per member, with its authored label", () => {
    const html = render(TABS, "t1");

    expect(html).toContain('role="tablist"');
    expect(html).toContain("Details");
    expect(html).toContain("Approval");
    expect(html).toContain("Receipts");
  });

  it("reports the open tab, and only that one, as selected", () => {
    const html = render(TABS, "t2");

    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1);
    expect((html.match(/aria-selected="false"/g) ?? []).length).toBe(2);
  });

  it("names its panel from the open tab alone: no closed tab's panel is in the DOM", () => {
    const html = render(TABS, "t2");

    expect(html).toContain('aria-controls="studio-form-tabpanel-t2"');
    expect((html.match(/aria-controls=/g) ?? []).length).toBe(1);
  });

  it("keeps the plain-button keyboard model, not the process row's roving tabindex", () => {
    // `spa-accessibility` reserves roving tabindex for a many-tab row that
    // scrolls sideways — the studio's ten-tab process row, and nothing else.
    // Each tab here is its own stop in the tab order, so a button's own Enter
    // and Space handling is what opens it.
    expect(render(TABS, "t1")).not.toContain("tabindex");
  });

  it("draws no tab for a member carrying no key yet: nothing can name it", () => {
    const html = render([{ label: { en: "half-typed" } }, ...TABS], "t1");

    expect(html).not.toContain("half-typed");
    expect((html.match(/role="tab"/g) ?? []).length).toBe(3);
  });

  it("disables the move that would leave the strip", () => {
    const first = render(TABS, "t1");
    const last = render(TABS, "t3");
    const middle = render(TABS, "t2");

    expect(first).toMatch(/Move left/);
    expect((first.match(/disabled=""/g) ?? []).length).toBe(1);
    expect((last.match(/disabled=""/g) ?? []).length).toBe(1);
    expect((middle.match(/disabled=""/g) ?? []).length).toBe(0);
  });

  it("reads the end guard off the whole array, so a keyless tab ahead of the open one keeps Move left live", () => {
    // `FormEditorScreen.moveTab` splices the whole `tabs` array, so the guard
    // has to index that array too. Over the drawn tabs alone, the open tab
    // here reads as position 0 and Move left would be disabled while the
    // splice still had somewhere to move it.
    const html = render([{ label: { en: "half-typed" } }, ...TABS], "t1");

    expect(html).toMatch(/Move left/);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(0);
  });

  it("carries the authoring controls only while a tab is open", () => {
    // A strip drawing tabs always has one open, since the screen derives the
    // open tab. A member-less strip is the case with no tab to rename.
    expect(render(TABS, "t1")).toContain("Rename");
    expect(render([])).not.toContain("Rename");
  });
});

/**
 * form-view-tabs fix round 1: the strip answers the same four focus-moving
 * keys the participant's strip answers (`form-ui`'s own spec: "Arrow keys,
 * `Home` and `End` SHALL move focus between tabs without opening one. They
 * are a convenience over the plain-button pattern, not the roving-tabindex
 * variant: every tab stays tabbable"). Without them one area would hold two
 * tab strips answering one key differently.
 *
 * The decision itself is `form-ui`'s `nextTabIndex`, which this strip imports
 * and `packages/form-ui/test/tabs.test.tsx` covers key by key. What that
 * coverage cannot see is whether this `tablist` calls it at all — a helper
 * nothing calls would pass every other test in this file — so the two cases
 * below read the call site, the way `form-tab-switch-effect.test.ts` reads
 * its own.
 */
/**
 * The opening tag carrying `role="tablist"` in `source`, as raw text. Throws
 * when there is none: a strip that stops declaring a tablist should fail
 * loudly here, not read as a pass.
 */
function tablistTag(source: string): string {
  const at = source.indexOf('role="tablist"');
  if (at === -1) throw new Error("FormTabStrip: no tablist found");
  const open = source.lastIndexOf("<", at);
  const close = source.indexOf(">", at);
  if (open === -1 || close === -1) throw new Error("FormTabStrip: no element around the tablist");
  return source.slice(open, close + 1);
}

describe("the tablist's own key handler", () => {
  const source = readFileSync(new URL("../src/areas/studio/panels/FormTabStrip.tsx", import.meta.url).pathname, "utf8");

  it("sits on the tablist, so the four keys reach the tabs inside it", () => {
    // A pure `nextTabIndex` that nothing calls would pass every test above.
    expect(tablistTag(source)).toContain("onKeyDown={onKeyDown}");
  });

  it("reports a tablist that carries no handler, rather than reading one as a pass", () => {
    const bare = '<div {...stylex.props(styles.tabs)} role="tablist" aria-label={t("formEditor.tabRowLabel")}>';

    expect(tablistTag(bare)).not.toContain("onKeyDown");
    expect(() => tablistTag("export function X() { return null; }")).toThrow();
  });
});
