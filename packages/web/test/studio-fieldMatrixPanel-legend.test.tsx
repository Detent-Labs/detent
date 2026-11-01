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
    const legendMatch = html.match(/<div class="matrixLegend">([\s\S]*?)<\/div>/);
    expect(legendMatch).not.toBeNull();
    // Scoped to top-level legend entries via data-legend-entry, not a blanket
    // <span> count — the seventh entry's swatches are spans of their own.
    const entryCount = (legendMatch![1].match(/<span data-legend-entry/g) ?? []).length;
    expect(entryCount).toBe(7);
    expect(html).toContain("Technical means the process fills the field in by itself.");
  });

  it("prints the seven entries in order with the reworded sentences", () => {
    const html = renderToStaticMarkup(
      <DraftProvider initial={DRAFT} token="token">
        <FieldMatrixPanel />
      </DraftProvider>,
    );
    const legend = html.match(/<div class="matrixLegend">([\s\S]*?)<\/div>/)![1]!;
    const entries = legend.split("<span data-legend-entry").slice(1);
    const first = (e: string) => e.replace(/^[^>]*>/, "").replace(/<[^>]*>/g, "").replace(/&#x27;/g, "'");
    expect(entries.map(first)).toEqual([
      "A badge sets the whole column or row it sits on.",
      "An unchecked box writes nothing.",
      "Condition means a rule decides in place of a fixed yes or no.",
      "A dash marks a field this step's form does not hold.",
      "A marked cell stands in Checks.",
      "Technical means the process fills the field in by itself.",
      "Each box's color names its mark:AskedRequiredRead-only",
    ]);
    expect(html).not.toContain("CEL");
  });

  it("renders the seventh entry's three swatches, each reading its own --color-flag-* token", () => {
    const html = renderToStaticMarkup(
      <DraftProvider initial={DRAFT} token="token">
        <FieldMatrixPanel />
      </DraftProvider>,
    );
    expect(html).toContain("color names its mark:");
    expect(html).toContain('class="matrixLegendSwatchColor matrixLegendSwatchVisible"');
    expect(html).toContain('class="matrixLegendSwatchColor matrixLegendSwatchRequired"');
    expect(html).toContain('class="matrixLegendSwatchColor matrixLegendSwatchReadonly"');
  });
});
