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
  moveTargets: [
    { id: undefined, label: "Top level" },
    { id: "field_group_1", label: "Billing" },
    { id: "field_group_2", label: "Delivery" },
  ],
  currentTargetId: undefined,
  moveControlId: "studio-panels-rail-move-field_1",
  onMoveTo: NOOP,
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

  // The keyboard half of the move gesture (spa-accessibility): a real control
  // in the tab order, beside the row rather than nested inside it, carrying
  // the id the screen re-focuses after the move.
  it("draws the move control outside the row button", () => {
    const html = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} />);
    expect(html).toContain('id="studio-panels-rail-move-field_1"');
    // One button, and it closes before the picker opens: a control nested
    // inside a button is invalid markup a browser silently unnests.
    expect(html.split("<button").length - 1).toBe(1);
    expect(html.indexOf("</button>")).toBeLessThan(html.indexOf('id="studio-panels-rail-move-field_1"'));
  });

  // The defect this replaced: one arrow reached the nearest group above and
  // nothing else, so a keyboard user could not name a second group at all.
  // A drop reaches every group, so the picker offers every group.
  it("offers every destination a drop reaches", () => {
    const html = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} />);
    expect(html).toContain('aria-label="Move this field to"');
    expect(html).toContain(">Top level<");
    expect(html).toContain(">Billing<");
    expect(html).toContain(">Delivery<");
  });

  // The picker states the membership it writes, so a row inside a group opens
  // on that group rather than on the top level.
  it("selects the group the field sits in today", () => {
    const html = renderToStaticMarkup(<PanelsRailFieldRow {...BASE} currentTargetId="field_group_2" />);
    expect(html).toContain('value="field_group_2"');
  });

  it("disables the move control when the row has nowhere to move", () => {
    const html = renderToStaticMarkup(
      <PanelsRailFieldRow {...BASE} moveTargets={[{ id: undefined, label: "Top level" }]} />,
    );
    expect(html).toContain("studio-panels-rail-move");
    expect(html).toContain("disabled");
    // A disabled control still carries a name.
    expect(html).toContain('aria-label="Move this field to"');
  });

  it("marks the row a pointer has picked up", () => {
    expect(renderToStaticMarkup(<PanelsRailFieldRow {...BASE} dragging />)).toContain('data-dragging="true"');
    expect(renderToStaticMarkup(<PanelsRailFieldRow {...BASE} />)).not.toContain("data-dragging");
  });
});
