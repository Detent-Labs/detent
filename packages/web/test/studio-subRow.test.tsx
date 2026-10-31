import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SubRow, subTabDomId, subTabPanelDomId } from "../src/areas/studio/panels/SubRow.js";

/**
 * The sub-row follows `spa-accessibility`'s plain-button pattern: a `tablist`
 * of buttons, `aria-selected` on the open one, and every entry its own stop in
 * the tab order. These tests render through `renderToStaticMarkup` and mount
 * no DOM, so they read the roles, the states and the ids off the string.
 * Moving focus and the Tab order itself need a real browser.
 */
function render(open: "catalog" | "matrix" = "matrix"): string {
  return renderToStaticMarkup(
    <SubRow
      tab="fields"
      views={[
        { id: "catalog", label: "Catalog" },
        { id: "matrix", label: "Where fields appear" },
      ]}
      open={open}
      onOpen={() => {}}
      label="Views of the fields"
    />,
  );
}

/** Every `<button ...>` open tag in a rendered string, in DOM order. */
function buttonTags(html: string): string[] {
  return html.match(/<button[^>]*>/g) ?? [];
}

describe("The sub-row", () => {
  it("groups its entries in a tablist carrying the label", () => {
    const html = render();

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Views of the fields"');
  });

  it("renders one button carrying the tab role per view", () => {
    const tabs = buttonTags(render()).filter((b) => b.includes('role="tab"') && b.includes('type="button"'));

    expect(tabs).toHaveLength(2);
  });

  it("marks the open view selected, and only that one", () => {
    const selected = buttonTags(render("matrix")).filter((b) => b.includes('aria-selected="true"'));

    expect(selected).toHaveLength(1);
    expect(selected[0]).toContain(`id="${subTabDomId("fields", "matrix")}"`);
  });

  it("moves the selection with the open view", () => {
    const selected = buttonTags(render("catalog")).filter((b) => b.includes('aria-selected="true"'));

    expect(selected).toHaveLength(1);
    expect(selected[0]).toContain(`id="${subTabDomId("fields", "catalog")}"`);
  });

  it("names each entry by its id and points it at its view body", () => {
    const tabs = buttonTags(render());

    expect(tabs[0]).toContain(`id="studio-subtab-fields-catalog"`);
    expect(tabs[0]).toContain(`aria-controls="${subTabPanelDomId("fields", "catalog")}"`);
    expect(tabs[1]).toContain(`id="studio-subtab-fields-matrix"`);
    expect(tabs[1]).toContain(`aria-controls="${subTabPanelDomId("fields", "matrix")}"`);
  });

  it("formats the view body's id one level under the tab body's", () => {
    expect(subTabPanelDomId("settings", "sources")).toBe("studio-subtabpanel-settings-sources");
  });

  it("prints each label as the whole text of its entry, with no count inside", () => {
    const html = render();

    // The whole button, from its opening tag to its close: a count element
    // beside the label would break the match on either side.
    expect(html).toMatch(/<button[^>]*>Catalog<\/button>/);
    expect(html).toMatch(/<button[^>]*>Where fields appear<\/button>/);
  });

  it("takes no entry out of the tab order, since each entry is a plain stop", () => {
    // The roving-tabindex row writes `tabindex="-1"` on every tab but one;
    // the plain-button pattern writes none at all.
    const html = render();

    expect(html).not.toContain('tabindex="-1"');
    expect(html).not.toContain("tabindex");
  });
});

describe("The sub-row's open entry", () => {
  // The scroll runs in a layout effect, which a static render never runs, so
  // this reads the source; the browser check covers the scroll itself.
  const source = readFileSync(new URL("../src/areas/studio/panels/SubRow.tsx", import.meta.url), "utf8");

  it("scrolls the open entry's button into view in a layout effect keyed on the open view", () => {
    expect(source).toMatch(
      /useLayoutEffect\(\(\) => \{\s*tabRefs\.current\.get\(open\)\?\.scrollIntoView\(\{ block: "nearest", inline: "nearest", behavior: "instant" \}\);\s*\}, \[open\]\);/,
    );
  });
});
