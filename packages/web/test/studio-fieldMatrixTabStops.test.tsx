import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import { FieldMatrixGrid } from "../src/areas/studio/panels/FieldMatrixGrid.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * `spa-accessibility` states that a grid is one stop in the page's tab order
 * and that a cell takes none of its own. The field matrix broke that with
 * thirty bulk badges: each is a plain button, so the browser gave each one a
 * stop. On a 4 by 7 matrix an audit counted 32, and the count grows as
 * 3 x (steps + fields).
 *
 * The badges now carry `tabindex="-1"` and join the grid's own roving model,
 * reachable by arrow keys through their header cell. That is the gap the
 * companion `spa-accessibility` requirement closes.
 *
 * This counts stops in the rendered markup. A browser check covers the part a
 * harness cannot see: that arrowing actually lands where it should.
 */
const DRAFT: Draft = {
  fields: [
    { id: "field_vendor" as never, key: "vendor", type: "string" },
    { id: "field_amount" as never, key: "amount", type: "number" },
  ],
  workflow: {
    steps: [
      {
        id: "step_capture" as never,
        key: "capture",
        type: "task",
        label: { en: "Capture" },
        view: { fields: [{ ref: "field_vendor" as never }, { ref: "field_amount" as never }] },
      },
      {
        id: "step_review" as never,
        key: "review",
        type: "task",
        label: { en: "Review" },
        view: { fields: [{ ref: "field_vendor" as never }, { ref: "field_amount" as never }] },
      },
    ],
  },
};

const render = (showBulkBadges: boolean) =>
  renderToStaticMarkup(
    <DraftProvider initial={DRAFT} token="token">
      <FieldMatrixGrid showBulkBadges={showBulkBadges} />
    </DraftProvider>,
  );

/** Elements the browser would put in the tab order: an explicit `tabindex="0"`,
 * or an interactive element carrying no `tabindex` at all. */
function tabStops(html: string): number {
  const explicit = (html.match(/tabindex="0"/g) ?? []).length;
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
  const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
  const implicit = [...buttons, ...inputs].filter((tag) => !tag.includes("tabindex=")).length;
  return explicit + implicit;
}

describe("the field matrix's tab stops", () => {
  it("stands one tab stop with the bulk badges present", () => {
    // Twelve badges here (2 columns + 2 rows, three flags each) plus the
    // scroll region and the roving cell. Before this change every badge
    // counted.
    const html = render(true);
    expect((html.match(/matrixFlagBadge\b/g) ?? []).length).toBeGreaterThan(6);
    expect(tabStops(html)).toBe(2);
  });

  it("stands the same stops with the badges absent", () => {
    // The scroll region and the roving cell, and nothing else either way.
    expect(tabStops(render(false))).toBe(2);
  });

  it("gives every bulk badge an explicit tabindex of -1", () => {
    const html = render(true);
    const badges = [...html.matchAll(/<button\b[^>]*matrixFlagBadge[^>]*>/g)].map((m) => m[0]);
    expect(badges.length).toBeGreaterThan(6);
    for (const b of badges) expect(b).toContain('tabindex="-1"');
  });

  it("makes each header cell a roving target", () => {
    // A badge is reached through its header, so the header has to be a
    // position the arrow keys can occupy.
    const html = render(true);
    const headers = [...html.matchAll(/<th\b[^>]*>/g)].map((m) => m[0]);
    expect(headers.length).toBeGreaterThan(2);
    for (const h of headers) expect(h).toMatch(/tabindex="(0|-1)"/);
  });
});
