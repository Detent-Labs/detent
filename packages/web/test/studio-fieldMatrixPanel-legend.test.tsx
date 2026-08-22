import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import { FieldMatrixPanel } from "../src/areas/studio/panels/FieldMatrixPanel.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/** The legend renders one entry per `LEGEND_KEYS` member — seven once
 * `fieldMatrix.legendColors` is added (field-matrix-checkbox-colors). */
const DRAFT: Draft = {
  fields: [{ id: "field_vendor" as never, key: "vendor", type: "string" }],
  workflow: {
    steps: [
      {
        id: "step_a" as never,
        key: "draft",
        type: "task",
        view: { fields: [{ ref: "field_vendor" as never, required: true }] },
      },
    ],
  },
};

describe("FieldMatrixPanel's legend", () => {
  it("renders one entry per LEGEND_KEYS member, seven once legendColors is added", () => {
    const html = renderToStaticMarkup(
      <DraftProvider initial={DRAFT} token="token">
        <FieldMatrixPanel />
      </DraftProvider>,
    );
    const legendMatch = html.match(/<div class="studio-matrix-legend">([\s\S]*?)<\/div>/);
    expect(legendMatch).not.toBeNull();
    // Scoped to top-level legend entries via data-legend-entry, not a blanket
    // <span> count — the seventh entry's swatches are spans of their own.
    const entryCount = (legendMatch![1].match(/<span data-legend-entry/g) ?? []).length;
    expect(entryCount).toBe(7);
    expect(html).toContain("The technical marker means the engine, not a participant, writes this field.");
  });

  it("renders the seventh entry's three swatches, each reading its own --color-flag-* token", () => {
    const html = renderToStaticMarkup(
      <DraftProvider initial={DRAFT} token="token">
        <FieldMatrixPanel />
      </DraftProvider>,
    );
    expect(html).toContain("color names its own flag:");
    expect(html).toContain('class="studio-matrix-legend-swatch-color studio-matrix-legend-swatch-visible"');
    expect(html).toContain('class="studio-matrix-legend-swatch-color studio-matrix-legend-swatch-required"');
    expect(html).toContain('class="studio-matrix-legend-swatch-color studio-matrix-legend-swatch-readonly"');
  });
});
