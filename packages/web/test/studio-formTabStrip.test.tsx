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

  it("carries the authoring controls only while a tab is open", () => {
    // A strip drawing tabs always has one open, since the screen derives the
    // open tab. A member-less strip is the case with no tab to rename.
    expect(render(TABS, "t1")).toContain("Rename");
    expect(render([])).not.toContain("Rename");
  });
});
