import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelsRailFieldRow } from "../src/areas/studio/screens/PanelsScreen.js";

const NOOP = () => {};

const BASE = {
  label: "Amount",
  typeLabel: "Number",
  depth: 0 as const,
  issues: 0,
  selected: false,
  onClick: NOOP,
  moveTo: "group" as const,
  moveControlId: "studio-panels-rail-move-field_1",
  onMove: NOOP,
  onDragStart: NOOP,
  onDragEnd: NOOP,
  onDrop: NOOP,
  dragging: false,
};

/**
 * field-catalog-editor-rework task 4.1: the Fields rail row drops to one
 * line — the resolved label, the field's kind, the issue mark. It no
 * longer prints the field's key. This change adds the move control beside
 * it (studio-field-authoring-surface tasks 7.1 to 7.3).
 */
describe("PanelsRailFieldRow", () => {
  it("renders the resolved label and the kind word, and no key text", () => {
    const html = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} />);
    expect(html).toContain(">Amount<");
    expect(html).toContain(">Number<");
    expect(html).not.toContain("studio-panels-rail-key");
  });

  it("shows the issue mark only when the row carries one", () => {
    const withIssue = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} issues={2} />);
    expect(withIssue).toContain("studio-panels-rail-issues");
    expect(withIssue).toContain(">2<");

    expect(renderToStaticMarkup(<PanelsRailFieldRow {...BASE} />)).not.toContain("studio-panels-rail-issues");
  });

  // The keyboard half of the move gesture (spa-accessibility): a real button
  // in the tab order, beside the row rather than nested inside it, carrying
  // the id the screen re-focuses after the move.
  it("draws the move control as its own button, outside the row button", () => {
    const html = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} />);
    expect(html).toContain('id="studio-panels-rail-move-field_1"');
    // Two buttons, and the first one closes before the second opens: a button
    // nested inside a button is invalid markup a browser silently unnests.
    expect(html.split("<button").length - 1).toBe(2);
    expect(html.indexOf("</button>")).toBeLessThan(html.indexOf('id="studio-panels-rail-move-field_1"'));
  });

  // The eye reads an arrow along the indentation axis; the assistive
  // technology reads the sentence. The glyph is hidden from the name so the
  // announcement is the sentence alone.
  it("names the move by its sentence and marks it with a direction arrow", () => {
    const into = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} />);
    expect(into).toContain('aria-label="Move into the group above"');
    expect(into).toContain(">→<");
    expect(into).not.toContain(">Move into the group above<");

    const outOf = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} moveTo="top" />);
    expect(outOf).toContain('aria-label="Move out of the group"');
    expect(outOf).toContain(">←<");
  });

  it("disables the move control when the row has nowhere to move", () => {
    const html = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} moveTo={undefined} />);
    expect(html).toContain("studio-panels-rail-move");
    expect(html).toContain("disabled");
    // A disabled control still carries a name.
    expect(html).toContain('aria-label="Move into the group above"');
  });

  it("marks the row a pointer has picked up", () => {
    expect(renderToStaticMarkup(<PanelsRailFieldRow {...BASE} dragging />)).toContain('data-dragging="true"');
    expect(renderToStaticMarkup(<PanelsRailFieldRow {...BASE} />)).not.toContain("data-dragging");
  });
});
