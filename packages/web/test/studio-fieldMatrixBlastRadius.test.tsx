import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import { FieldMatrixGrid } from "../src/areas/studio/panels/FieldMatrixGrid.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * A bulk press cannot be undone, so the badge states what it will touch
 * before an author presses it (`studio-app`: "A bulk flag badge names the
 * cells its press will touch").
 *
 * The same name also carries the step or the field it acts on. Thirty badges
 * shared three accessible names before this: a screen reader user crossing a
 * header row heard "required" ten times and learned nothing about which
 * column each one belonged to.
 *
 * Two steps, one field, and `capture` already carries `required`. That makes
 * the field's row mixed: one of two cells set.
 */
const DRAFT: Draft = {
  fields: [{ id: "field_vendor" as never, key: "vendor", type: "string" }],
  workflow: {
    steps: [
      {
        id: "step_capture" as never,
        key: "capture",
        type: "task",
        label: { en: "Capture" },
        view: { fields: [{ ref: "field_vendor" as never, required: true }] },
      },
      {
        id: "step_review" as never,
        key: "review",
        type: "task",
        label: { en: "Review" },
        view: { fields: [{ ref: "field_vendor" as never }] },
      },
    ],
  },
};

const html = renderToStaticMarkup(
  <DraftProvider initial={DRAFT} token="token">
    <FieldMatrixGrid showBulkBadges={true} />
  </DraftProvider>,
);

/** Every `aria-label` the markup carries, in document order. */
const labels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]!);

describe("a bulk badge's blast radius", () => {
  it("names the step a column badge acts on", () => {
    expect(labels.some((l) => l.includes("step Capture"))).toBe(true);
    expect(labels.some((l) => l.includes("step Review"))).toBe(true);
  });

  it("names the field a row badge acts on", () => {
    expect(labels.some((l) => l.includes("field vendor"))).toBe(true);
  });

  it("gives two badges for one flag different names", () => {
    // The defect this fixes: both of these were "required" before.
    const required = labels.filter((l) => l.startsWith("required."));
    expect(required.length).toBeGreaterThan(1);
    expect(new Set(required).size).toBe(required.length);
  });

  it("states both counts on a mixed target", () => {
    // The field's row spans two cells and one already carries `required`.
    const row = labels.find((l) => l.startsWith("required.") && l.includes("field vendor"));
    expect(row).toBeDefined();
    expect(row).toContain("Cells it writes: 2");
    expect(row).toContain("Already set: 1");
  });

  it("states the clearing count on a full target", () => {
    // `capture`'s column holds one live cell and it carries `required`, so a
    // press there clears rather than sets.
    const col = labels.find((l) => l.startsWith("required.") && l.includes("step Capture"));
    // One eligible cell, and the wording still reads: no "1 cells".
    expect(col).toContain("Cells it writes: 1");
    expect(col).not.toContain("1 cells");
  });

  it("puts the same sentence in the title a pointer user reads", () => {
    const titles = [...html.matchAll(/title="([^"]*)"/g)].map((m) => m[1]!);
    const row = labels.find((l) => l.startsWith("required.") && l.includes("field vendor"))!;
    expect(titles).toContain(row);
  });

  it("keeps the flag's own word as a whole label of its own", () => {
    // The catalog rule forbids building one sentence out of fragments. The
    // flag word stays a complete label, and the count sentence carries no
    // flag inside it.
    for (const l of labels.filter((x) => x.startsWith("required."))) {
      expect(l.split(". ")[0]).toBe("required");
      expect(l.slice("required. ".length)).not.toContain("required");
    }
  });
});
