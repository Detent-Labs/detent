import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProcessTabRow, tabDomId, tabPanelDomId } from "../src/areas/studio/panels/ProcessTabRow.js";
import { PROCESS_TABS, type ProcessTab } from "../src/areas/studio/routing.js";

/**
 * The tab row follows the area's own tab pattern (`spa-accessibility`): a
 * `tablist` of buttons, each its own stop in the tab order, with
 * `aria-selected` on the open one. It builds no roving tab stop and binds no
 * arrow key.
 *
 * `development-toolchain`'s split rule sends these to assertions: the roles,
 * the states, the counts and the tab-stop question are all properties of the
 * rendered string. `tabindex="-1"` is what a roving model would need, so its
 * absence is the assertion that no such model crept in.
 */
const NO_COUNTS = Object.fromEntries(PROCESS_TABS.map((tab) => [tab, undefined])) as Record<
  ProcessTab,
  number | undefined
>;

function render(over: { open?: ProcessTab; counts?: Partial<Record<ProcessTab, number>>; jsonOpen?: boolean } = {}): string {
  return renderToStaticMarkup(
    <ProcessTabRow
      open={over.open ?? "canvas"}
      counts={{ ...NO_COUNTS, ...over.counts }}
      onOpen={() => {}}
      jsonOpen={over.jsonOpen ?? false}
    />,
  );
}

/** Every `<button ...>` open tag in a rendered string, in DOM order. */
function buttonTags(html: string): string[] {
  return html.match(/<button[^>]*>/g) ?? [];
}

describe("The tab row's ten tabs", () => {
  it("groups them in a tablist", () => {
    expect(render()).toContain('role="tablist"');
  });

  it("renders one button carrying the tab role per tab, and no eleventh", () => {
    const tabs = buttonTags(render()).filter((b) => b.includes('role="tab"'));

    expect(tabs).toHaveLength(10);
  });

  it("names each tab in authoring order", () => {
    const html = render();
    const order = ["Canvas", "Steps", "Fields", "Data sources", "Paths", "Forms", "Field matrix", "Contract", "Changes", "Checks"];
    let cursor = -1;

    for (const name of order) {
      const at = html.indexOf(`>${name}<`);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });
});

describe("The tab row's keyboard model", () => {
  it("leaves every tab its own stop in the tab order, the way a button is", () => {
    // A roving model would carry `tabindex="-1"` on nine of the ten. This row
    // builds none, so a Tab press walks the row one tab at a time and Enter or
    // Space opens the focused one, from the button's own semantics.
    expect(render()).not.toContain("tabindex");
  });

  it("marks the open tab selected, and only that one", () => {
    const html = render({ open: "paths" });
    const selected = buttonTags(html).filter((b) => b.includes('aria-selected="true"'));

    expect(selected).toHaveLength(1);
    expect(html).toContain(`id="${tabDomId("paths")}"`);
    expect(selected[0]).toContain(tabDomId("paths"));
  });

  it("points each tab at the body it controls", () => {
    const html = render({ open: "fields" });

    for (const tab of PROCESS_TABS) expect(html).toContain(`aria-controls="${tabPanelDomId(tab)}"`);
  });
});

describe("Each tab's count", () => {
  it("prints the number beside the name where one has a meaning", () => {
    const html = render({ counts: { steps: 4, fields: 12 } });

    expect(html).toContain(">4<");
    expect(html).toContain(">12<");
  });

  it("prints a name alone where the tab has no count", () => {
    const canvas = buttonTags(render({ counts: { steps: 4 } })).find((b) => b.includes(tabDomId("canvas")));

    expect(canvas).toBeDefined();
    // The Canvas tab draws a graph, and Contract holds one editor: neither has
    // a total to report.
    expect(render({ counts: { steps: 4 } })).toContain(">Canvas</span>");
  });

  it("prints a zero rather than hiding it, so an emptied tab still reads its state", () => {
    expect(render({ counts: { steps: 0 } })).toContain(">0<");
  });
});

describe("Tab selection while the JSON surface is open", () => {
  it("marks no tab selected while the JSON surface stands open", () => {
    const html = render({ open: "paths", jsonOpen: true });

    expect(html).not.toContain('aria-selected="true"');
  });
});
