import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProcessTabRow, tabDomId, tabPanelDomId } from "../src/areas/studio/panels/ProcessTabRow.js";
import { PROCESS_TABS, type ProcessTab } from "../src/areas/studio/routing.js";
import { tabStops } from "./studio-fieldMatrixTabStops.test.js";

/**
 * The tab row follows `spa-accessibility`'s roving-tabindex pattern, its
 * named exception for a tab set carrying many tabs in one line that scrolls
 * sideways: a `tablist` of buttons with `aria-selected` on the open one, one
 * `tabindex="0"` among ten, and arrow keys that move focus without opening.
 *
 * `development-toolchain`'s split rule decides what lands here. The roles,
 * the states, the counts and the per-tab `tabindex` are all properties of the
 * rendered string, so they assert here.
 *
 * These tests render through `renderToStaticMarkup` and mount no DOM, so none
 * of them can move focus, fire a key or run an effect. Arrow movement, the
 * wrap at the row's ends, Enter activation, the count's bold weight and the
 * live region's announcement all need a real browser or a real assistive
 * technology. Those go to `docs/browser-checks.md`, the same split
 * `studio-fieldMatrixTabStops.test.tsx` states in its own header.
 */
const NO_COUNTS = Object.fromEntries(PROCESS_TABS.map((tab) => [tab, undefined])) as Record<
  ProcessTab,
  number | undefined
>;

function render(
  over: {
    open?: ProcessTab;
    counts?: Partial<Record<ProcessTab, number>>;
    checksBlocked?: boolean;
    jsonOpen?: boolean;
  } = {},
): string {
  return renderToStaticMarkup(
    <ProcessTabRow
      open={over.open ?? "canvas"}
      counts={{ ...NO_COUNTS, ...over.counts }}
      checksBlocked={over.checksBlocked ?? false}
      onOpen={() => {}}
      jsonOpen={over.jsonOpen ?? false}
    />,
  );
}

/** The Checks tab's own `<button>`, whole, for asserting its class or its
 * content against the other tabs' buttons. */
function checksTabButton(html: string): string {
  const buttons = html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
  const found = buttons.find((b) => b.includes(`id="${tabDomId("checks")}"`));
  if (found === undefined) throw new Error("no Checks tab button in rendered output");
  return found;
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
  it("gives the open tab the roving stop and takes the other nine out", () => {
    const html = render({ open: "paths" });

    expect(html.match(/tabindex="0"/g) ?? []).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g) ?? []).toHaveLength(9);
    expect(buttonTags(html).find((b) => b.includes(`id="${tabDomId("paths")}"`))).toContain('tabindex="0"');
  });

  it("stands one tab stop for the whole row", () => {
    // The row's trailing edge is the last tab, so nothing beside the ten
    // takes a stop of its own. Ten plain stops is what this replaces.
    expect(tabStops(render())).toBe(1);
  });

  it("would count ten stops for the plain-button markup this replaces", () => {
    // The violating input, kept as markup rather than as a reverted branch:
    // the retired model gave every tab its own stop, so the assertion above
    // passes on the roving model alone.
    const plain = PROCESS_TABS.map((tab) => `<button role="tab" id="${tabDomId(tab)}">${tab}</button>`).join("");

    expect(tabStops(plain)).toBe(10);
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

/**
 * The color itself is a visual judgment (`docs/browser-checks.md`'s "The
 * Checks tab's colored count" entry) — `development-toolchain`'s split rule
 * keeps it there, since no defect record exists for this new behavior. What
 * a static-markup test CAN see: the blocker style class joins the Checks
 * count's own class list and no other tab's, and the visually-hidden text
 * equivalent (`tabs.checksBlocking`) appears exactly when blocked.
 */
describe("The Checks tab's count under a blocker", () => {
  it("carries a different class on its button than the same render with no blocker", () => {
    const counts = { checks: 2 };
    const clear = checksTabButton(render({ counts, checksBlocked: false }));
    const blocked = checksTabButton(render({ counts, checksBlocked: true }));

    expect(blocked).not.toBe(clear);
  });

  it("leaves every other tab's button untouched between a blocked and a clear render", () => {
    const counts = { steps: 4, fields: 12 };
    const clear = buttonTags(render({ counts, checksBlocked: false })).find((b) => b.includes(tabDomId("steps")));
    const blocked = buttonTags(render({ counts, checksBlocked: true })).find((b) => b.includes(tabDomId("steps")));

    expect(blocked).toBe(clear);
  });

  it("states the blocking fact in visually-hidden text only when blocked", () => {
    const clear = checksTabButton(render({ counts: { checks: 2 }, checksBlocked: false }));
    const blocked = checksTabButton(render({ counts: { checks: 2 }, checksBlocked: true }));

    expect(clear).not.toContain("blocking a publish");
    expect(blocked).toContain("blocking a publish");
  });
});

/**
 * The announcement itself needs a real assistive technology, so it stands in
 * `docs/browser-checks.md`. What a static render sees is the region's shape:
 * it is mounted, and it is empty. `renderToStaticMarkup` runs no effect, and
 * the effect is what fills it, so both renders below read empty.
 *
 * Mounted-and-empty is the load-bearing half. A region added to the DOM with
 * its text already inside it is announced by no engine, which is exactly the
 * bug an always-mounted region avoids.
 */
describe("The tab row's live region", () => {
  it("stands mounted and polite, outside the tablist", () => {
    const html = render();

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    // Outside the `tablist`, whose ARIA content model owns `tab` children
    // alone: the region opens after the row's own closing tag.
    expect(html.indexOf('role="status"')).toBeGreaterThan(html.lastIndexOf('role="tab"'));
  });

  it("holds no text on a static render, blocked or clear", () => {
    for (const checksBlocked of [true, false]) {
      const html = render({ counts: { checks: 2 }, checksBlocked });
      const region = /<p[^>]*role="status"[^>]*>([\s\S]*?)<\/p>/.exec(html);

      expect(region).not.toBeNull();
      expect(region![1]).toBe("");
    }
  });
});

describe("Tab selection while the JSON surface is open", () => {
  it("marks no tab selected while the JSON surface stands open", () => {
    const html = render({ open: "paths", jsonOpen: true });

    expect(html).not.toContain('aria-selected="true"');
  });
});
