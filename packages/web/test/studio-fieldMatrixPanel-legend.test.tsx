import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import { FieldMatrixPanel } from "../src/areas/studio/panels/FieldMatrixPanel.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/** task 3.4a: the legend renders one entry per `LEGEND_KEYS` member — six
 * once `fieldMatrix.legendTechnical` is added (technical-field-marker). */
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
  it("renders one entry per LEGEND_KEYS member, six once legendTechnical is added", () => {
    const html = renderToStaticMarkup(
      <DraftProvider initial={DRAFT} token="token">
        <FieldMatrixPanel />
      </DraftProvider>,
    );
    const legendMatch = html.match(/<div class="studio-matrix-legend">([\s\S]*?)<\/div>/);
    expect(legendMatch).not.toBeNull();
    const spanCount = (legendMatch![1].match(/<span>/g) ?? []).length;
    expect(spanCount).toBe(6);
    expect(html).toContain("The technical marker means the engine, not a participant, writes this field.");
  });
});
