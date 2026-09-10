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
      tabOptions={[]}
      tabValue={undefined}
      onChangeFlag={() => {}}
      onChangeSpan={() => {}}
      onChangeGroup={() => {}}
      onChangeTab={() => {}}
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
        tabOptions={[]}
        tabValue={undefined}
        onChangeFlag={() => {}}
        onChangeSpan={() => {}}
        onChangeGroup={() => {}}
        onChangeTab={() => {}}
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

/**
 * form-view-tabs task 5.8: both strips carry a tab picker beside the group
 * picker (`studio-form-editor`: "A selected entry's strip assigns it to a
 * tab"). `NoteEditorStrip` reads the content locale from the draft context,
 * so the field strip is the one a static render reaches; the two mount the
 * same `TabPicker`, with the same four props.
 */
const TABS = [
  { key: "tab_1", label: "Details" },
  { key: "tab_2", label: "Approval" },
];

const renderTabbed = (over: { tabOptions?: typeof TABS; tabValue?: string; group?: string } = {}) =>
  renderToStaticMarkup(
    <FormEditorStrip
      row={{ ref: "field_amount" as never, group: over.group }}
      label="Amount"
      stepId={"step_a" as never}
      ownStepIndex={0}
      written={() => 1}
      technicalFieldIds={new Set()}
      isGroup={false}
      groupKeys={["approval"]}
      tabOptions={over.tabOptions ?? TABS}
      tabValue={over.tabValue}
      onChangeFlag={() => {}}
      onChangeSpan={() => {}}
      onChangeGroup={() => {}}
      onChangeTab={() => {}}
    />,
  );

describe("the strip's tab picker", () => {
  it("lists the form's tabs, and selects the one the entry names", () => {
    const html = renderTabbed({ tabValue: "tab_2" });

    expect(html).toContain(">tab<");
    expect(html).toContain("Details");
    expect(html).toContain("Approval");
    expect(html).toContain('value="tab_2"');
  });

  it("offers no empty choice: a root entry on a tabbed form always names a tab", () => {
    // The group picker's own "(none)" is the only empty option in the strip.
    expect((renderTabbed({ tabValue: "tab_1" }).match(/<option value=""/g) ?? []).length).toBe(1);
  });

  it("draws no picker at all on an untabbed form", () => {
    const html = renderTabbed({ tabOptions: [] });

    expect(html).not.toContain(">tab<");
  });

  it("stays inert for an entry naming a group, and says why", () => {
    const html = renderTabbed({ group: "approval", tabValue: "tab_1" });

    expect(html).toContain("The group decides the tab.");
    // The reason reaches a screen reader as the control's own description,
    // not as loose text beside it.
    expect(html).toContain('aria-describedby="form-editor-tab-from-group"');
    expect(html).toContain('id="form-editor-tab-from-group"');
    expect(html).toContain("disabled");
  });

  it("stays operable for a root entry", () => {
    expect(renderTabbed({ tabValue: "tab_1" })).not.toContain("form-editor-tab-from-group");
  });
});
