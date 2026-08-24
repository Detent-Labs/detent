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
      ownStepIndex={0}
      written={() => 0}
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

/**
 * gate-required-readonly-reachability task 4.3: the strip's `required`/
 * `readonly` gate now reads the dominance-scoped `written` accessor at the
 * selected field's own step index, instead of a flat, step-blind count.
 */
describe("FormEditorStrip: dominance-scoped gating", () => {
  const renderGated = (written: (fieldId: string, ownStepIndex: number) => number, ownStepIndex = 0) =>
    renderToStaticMarkup(
      <FormEditorStrip
        row={{ ref: "field_amount" as never, required: true }}
        label="Amount"
        stepId={"step_c" as never}
        ownStepIndex={ownStepIndex}
        written={written}
        technicalFieldIds={new Set()}
        isGroup={false}
        groupKeys={[]}
        onChangeFlag={() => {}}
        onChangeSpan={() => {}}
        onChangeGroup={() => {}}
      />,
    );

  it("disables readonly when nothing writes the field at this step", () => {
    const html = renderGated(() => 0, 2);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(1);
  });

  it("leaves readonly enabled when a dominating step already writes the field", () => {
    const html = renderGated((_fieldId, ownStepIndex) => (ownStepIndex === 2 ? 1 : 0), 2);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(0);
  });

  it("keeps gating engaged when the only writer is on a non-dominating step (a step index this accessor never credits)", () => {
    const html = renderGated(() => 0, 2);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(1);
  });
});
