import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FormEditorStrip } from "../src/areas/studio/screens/FormEditorScreen.js";
import type { DraftViewField } from "../src/areas/studio/draft/view-layout.js";

/**
 * technical-field-marker task 4.2: the per-step strip omits `required` and
 * `readonly` for a field declaring `technical: true`, while `visible`,
 * `group` and `span` stay offered. `FormEditorStrip` is the strip's
 * presentational component, pulled out of `FormEditorScreen` so it can be
 * exercised with an arbitrary row directly — selecting a row in the full
 * screen runs through client-side `useState`, invisible to a server render.
 * `renderToStaticMarkup` needs no DOM: mirrors
 * `studio-editorDock-fieldMatrixTab.test.tsx`'s own synchronous server
 * render, no DOM, no listening socket.
 */
const row = (): DraftViewField => ({ ref: "field_amount" as never });

const render = (technicalFieldIds: Set<string>) =>
  renderToStaticMarkup(
    <FormEditorStrip
      row={row()}
      label="Amount"
      stepId={"step_a" as never}
      written={new Map()}
      technicalFieldIds={technicalFieldIds}
      isGroup={false}
      groupKeys={[]}
      onChangeFlag={() => {}}
      onChangeSpan={() => {}}
      onChangeGroup={() => {}}
    />,
  );

describe("FormEditorStrip", () => {
  it("emits no required or readonly control for a technical field, and keeps visible/group/span", () => {
    const html = render(new Set(["field_amount"]));
    expect(html).toContain(">visible<");
    expect(html).not.toContain(">required<");
    expect(html).not.toContain(">readonly<");
    expect(html).toContain(">span<");
    expect(html).toContain(">group<");
  });

  it("emits every control for a non-technical field", () => {
    const html = render(new Set());
    expect(html).toContain(">visible<");
    expect(html).toContain(">required<");
    expect(html).toContain(">readonly<");
    expect(html).toContain(">span<");
    expect(html).toContain(">group<");
  });
});
