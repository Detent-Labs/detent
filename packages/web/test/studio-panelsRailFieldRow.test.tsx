import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Hash } from "lucide-react";
import { PanelsRailFieldRow } from "../src/areas/studio/panels/EntityTabs.js";

const NOOP = () => {};

const BASE = {
  label: "Amount",
  typeLabel: "Number",
  kindIcon: Hash,
  depth: 0 as const,
  issues: 0,
  selected: false,
  onClick: NOOP,
  onDragStart: NOOP,
  onDragEnd: NOOP,
  onDrop: NOOP,
  dragging: false,
};

/**
 * fields-rail-kind-icons tasks 2.1-2.5: the Fields rail row drops its move
 * `select` and its visible kind word. It leads the label with the field's
 * kind icon instead — `aria-hidden` on the icon's own wrapper, the kind
 * name as that wrapper's `title`, and the kind name stays in the button as
 * hidden text (design.md, decision: "The kind name stays inside the button,
 * visually hidden"). The keyboard route for the move is now the field's own
 * editor, not this row.
 */
describe("PanelsRailFieldRow", () => {
  it("renders the resolved label, and no key text", () => {
    const html = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} />);
    expect(html).toContain(">Amount<");
    expect(html).not.toContain("railKey");
  });

  it("shows the issue mark only when the row carries one", () => {
    const withIssue = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} issues={2} />);
    expect(withIssue).toContain("railIssues");
    expect(withIssue).toContain(">2<");

    expect(renderToStaticMarkup(<PanelsRailFieldRow {...BASE} />)).not.toContain("railIssues");
  });

  // The move's keyboard route left the rail for the field's own editor
  // (spa-accessibility, design.md decision: "The move control leaves the
  // rail for the editor"). The row keeps one button and no second control.
  it("renders no move control", () => {
    const html = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} />);
    expect(html).not.toContain("<select");
    expect(html.split("<button").length - 1).toBe(1);
  });

  // The icon's own wrapper carries `aria-hidden` and the kind name as its
  // `title`: a `title` on an element holding no text still counts toward
  // the button's accessible name, so the attribute has to sit on the
  // wrapper rather than the icon alone, or a screen reader hears the kind
  // twice.
  it("wraps the kind icon in an aria-hidden span carrying the kind name as its title", () => {
    const html = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} />);
    // One wrapper, not the SVG's own `aria-hidden` (lucide-react adds that to
    // every icon regardless): the whole span carries both attributes.
    expect(html).toContain('<span aria-hidden="true" title="Number"');
  });

  it("keeps the kind name inside the button, as hidden text", () => {
    const html = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} />);
    expect(html.indexOf(">Number<")).toBeGreaterThan(html.indexOf("<button"));
    expect(html.indexOf(">Number<")).toBeLessThan(html.indexOf("</button>"));
    // The same `visuallyHidden` style `railIssues` is checked against above.
    expect(html.slice(0, html.indexOf(">Number<"))).toContain("visuallyHidden");
  });

  it("renders no icon for a row naming no field", () => {
    const html = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} kindIcon={undefined} typeLabel={undefined} />);
    expect(html).not.toContain("aria-hidden");
  });

  it("marks the row a pointer has picked up", () => {
    expect(renderToStaticMarkup(<PanelsRailFieldRow {...BASE} dragging />)).toContain('data-dragging="true"');
    expect(renderToStaticMarkup(<PanelsRailFieldRow {...BASE} />)).not.toContain("data-dragging");
  });
});
