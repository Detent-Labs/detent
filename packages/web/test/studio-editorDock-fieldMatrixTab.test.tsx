import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import { EditorDock } from "../src/areas/studio/dock/EditorDock.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * Guards design.md decision 6 (`field-matrix-toolbar-and-inline-editing`):
 * the dock's Field matrix tab mounts the bare `FieldMatrixGrid`, never the
 * panels-screen `FieldMatrixPanel` wrapper. An accidental future import of
 * the wrapper into the dock would add a toolbar here and fail this test,
 * rather than waiting on `docs/browser-checks.md`'s manual check alone.
 *
 * `renderToStaticMarkup` needs no DOM: the dock's tab bodies all mount while
 * open (`hidden` reveals one), and none of their effects need to fire for
 * this assertion, so a single synchronous server render is enough.
 */
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

describe("EditorDock's Field matrix tab", () => {
  it("mounts the bare grid, with no toolbar", () => {
    const html = renderToStaticMarkup(
      <DraftProvider initial={DRAFT} token="token">
        <EditorDock
          processId="proc_a"
          token="token"
          draft={DRAFT}
          contentLocale="en"
          baseVersion={null}
          open={true}
          onOpenChange={() => {}}
          tab="matrix"
          onTabChange={() => {}}
        />
      </DraftProvider>,
    );

    expect(html).toContain("matrixTable");
    expect(html).not.toContain("matrixToolbar");
    expect(html).not.toContain("matrixFlagBadge");
    expect(html).not.toContain("matrixCount");
  });

  it("keys each live cell's checkbox class on its own flag, and gates readonly with aria-disabled", () => {
    const html = renderToStaticMarkup(
      <DraftProvider initial={DRAFT} token="token">
        <EditorDock
          processId="proc_a"
          token="token"
          draft={DRAFT}
          contentLocale="en"
          baseVersion={null}
          open={true}
          onOpenChange={() => {}}
          tab="matrix"
          onTabChange={() => {}}
        />
      </DraftProvider>,
    );

    // field_vendor's only view entry carries required: true and no other
    // writer, so gatedKeys disables readonly (draft/view-flags.ts).
    expect(html).toContain('class="matrixFlagVisible"');
    expect(html).toContain('class="matrixFlagRequired"');
    const readonlyInput = html.match(/<input[^>]*class="matrixFlagReadonly[^"]*"[^>]*>/)?.[0];
    expect(readonlyInput).toBeDefined();
    expect(readonlyInput).toContain('aria-disabled="true"');
    expect(readonlyInput).not.toContain(" disabled");
  });
});
