import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import { FieldMatrixGrid } from "../src/areas/studio/panels/FieldMatrixGrid.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * Guards the delta spec's "A column header with only one eligible badge
 * still aligns with its column's checkboxes" scenario
 * (`field-matrix-badge-alignment`, `specs/studio-app/spec.md`): a column
 * where only `visible` is eligible still renders three grid slots, not
 * one, so the eligible badge never shifts out of its fixed column.
 *
 * `result` is the column's only live cell and is `technical: true`, so
 * `gatedKeys` (`draft/view-flags.ts`) unconditionally gates `required` and
 * `readonly`, leaving `visible` as the sole eligible key.
 */
const DRAFT: Draft = {
  fields: [{ id: "field_result" as never, key: "result", type: "string", technical: true }],
  workflow: {
    steps: [
      {
        id: "step_submit" as never,
        key: "submit",
        type: "task",
        view: { fields: [{ ref: "field_result" as never }] },
      },
    ],
  },
};

describe("FieldMatrixGrid's BulkBadges", () => {
  it("renders three grid slots for a column with only one eligible flag", () => {
    const html = renderToStaticMarkup(
      <DraftProvider initial={DRAFT} token="token">
        <FieldMatrixGrid showBulkBadges={true} />
      </DraftProvider>,
    );

    // The fixture's single live cell drives both the submit column's
    // header and the result row's header, so each renders its own
    // BulkBadges — one eligible badge and two empty slots apiece.
    const badgeCount = (html.match(/studio-matrix-flag-badge/g) ?? []).length;
    const emptyCount = (html.match(/studio-matrix-flag-empty/g) ?? []).length;
    expect(badgeCount).toBe(2);
    expect(emptyCount).toBe(4);
  });
});
