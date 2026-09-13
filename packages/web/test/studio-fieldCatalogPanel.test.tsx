import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { FieldCatalogPanel, MoveFieldControl } from "../src/areas/studio/panels/FieldCatalogPanel.js";
import { fieldLabelInputId, moveControlId } from "../src/areas/studio/panels/fieldCatalogLogic.js";

const NOOP = () => {};

const fld = (id: string, key: string, extra: object = {}): DraftField =>
  ({ id, key, label: { en: key }, type: "string", ...extra }) as unknown as DraftField;

const grp = (id: string, key: string, children: DraftField[]): DraftField =>
  ({ id, key, label: { en: key }, type: "group", fields: children }) as unknown as DraftField;

/**
 * `MoveFieldControl`'s own value/disabled wiring (final-review Minor 2): the
 * deleted per-row rail picker pinned these three states, and
 * `studio-fieldCatalogLogic.test.ts::moveTargetsFor` covers only the data
 * behind the control, not the rendered `<select>` itself.
 */
describe("MoveFieldControl", () => {
  it("selects a nested field's current group", () => {
    const fields = [grp("field_g", "g", [fld("field_a", "a")])];
    const html = renderToStaticMarkup(
      <MoveFieldControl fieldId="field_a" fields={fields} contentLocale="en" baseLocale="en" onMoveField={NOOP} />,
    );
    expect(html).toContain('value="field_g" selected=""');
  });

  it("selects the top level for a top-level field", () => {
    const fields = [fld("field_a", "a"), grp("field_g", "g", [])];
    const html = renderToStaticMarkup(
      <MoveFieldControl fieldId="field_a" fields={fields} contentLocale="en" baseLocale="en" onMoveField={NOOP} />,
    );
    expect(html).toContain('value="" selected=""');
  });

  it("disables the control in a catalog with no group", () => {
    const fields = [fld("field_a", "a")];
    const html = renderToStaticMarkup(
      <MoveFieldControl fieldId="field_a" fields={fields} contentLocale="en" baseLocale="en" onMoveField={NOOP} />,
    );
    expect(html).toContain('disabled=""');
  });
});

function validation(issues: EditorIssue[] = []): ValidationResult {
  return {
    zodValid: true,
    issues,
    dimensions: {
      zod: "ran",
      duration: "ran",
      structural: "ran",
      actionType: "ran",
      assignmentType: "ran",
      dataSourceType: "ran",
      registryConfig: "not-run",
      cel: "ran",
    },
    subprocessStepStatus: {},
    chainingSiteStatus: {},
  };
}

function contextValue(draft: Draft, issues: EditorIssue[] = []): DraftContextValue {
  return {
    draft,
    mutate: () => {},
    replace: () => {},
    validation: validation(issues),
    loadedChildren: {},
    setChildForStep: () => {},
    registry: undefined,
    loadedChainingTargets: {},
    contentLocale: "en",
    setContentLocale: () => {},
    usedLocales: ["en"],
    loadGeneration: 0,
  };
}

/**
 * `FieldEditor` draws the selected field's own two halves at any nesting
 * depth, a nested field the same way as a top-level one (`studio-app`: "A
 * nested field takes the same two halves"). Only a selected `group` field's
 * own editor adds the "Fields inside this group" zone (`studio-app`: "Only a
 * group field holds the sixth zone"); a group's child renders in its own
 * instance of this same component, with its own move control, never inside
 * its parent's. `FieldCatalogPanel` reads `useDraft()` directly, so each test
 * below supplies `DraftContext.Provider`, the way `studio-formsTab.test.tsx`
 * already does.
 */
describe("FieldCatalogPanel", () => {
  it("renders a nested field's own move control, Technical checkbox and effect-half zones", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [grp("field_g", "g", [fld("field_c", "c")])] as unknown as Draft["fields"],
    };
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId="field_c"
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );

    expect(html).toContain(`id="${moveControlId("field_c")}"`);
    expect(html).toContain(`id="${fieldLabelInputId("field_c")}"`);

    // Narrowed to the Technical checkbox's own <label>...</label>, since the
    // "Ask for this" checkbox elsewhere in the same markup is legitimately
    // disabled for a field no step view references.
    const technicalAt = html.indexOf("Technical");
    expect(technicalAt).toBeGreaterThan(-1);
    const technicalLabel = html.slice(html.lastIndexOf("<label", technicalAt), html.indexOf("</label>", technicalAt));
    expect(technicalLabel).toContain('type="checkbox"');
    expect(technicalLabel).not.toContain('disabled=""');

    expect(html).toContain("Default value");
    expect(html).toContain("How it will look");
    expect(html).toContain("Used in");
  });

  it("renders a selected group's own zone, with no move control for its child", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [grp("field_g", "g", [fld("field_c", "c")])] as unknown as Draft["fields"],
    };
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId="field_g"
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );

    expect(html).toContain("Fields inside this group");
    expect(html).toContain("+ Add field to this group");
    expect(html).not.toContain(`id="${moveControlId("field_c")}"`);
  });

  it("renders no group zone for a selected top-level field", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [fld("field_a", "a")] as unknown as Draft["fields"],
    };
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId="field_a"
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );

    expect(html).not.toContain("Fields inside this group");
    expect(html).toContain(`id="${fieldLabelInputId("field_a")}"`);
  });

  // A kind switch rewrote `resolution` out of `group` and left its `fields` in
  // place. Only a group's editor holds the zone, so the child's rail entry is
  // its one route in. The panel finds that child through `flattenDraftFields`,
  // whatever its parent's `type`.
  it("renders the own editor of a field whose parent is no group", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [{ ...fld("field_r", "resolution"), fields: [fld("field_c", "discrepancy_note")] }] as unknown as Draft["fields"],
    };
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId="field_c"
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );

    expect(html).toContain(`id="${moveControlId("field_c")}"`);
    expect(html).toContain(`id="${fieldLabelInputId("field_c")}"`);
  });

  // `FieldsTab` passes `undefined` while no field carries an id, since the rail
  // lists no entry for an id-less field. Without the lookup's guard, the
  // id-less field would match that `undefined` and open an editor whose every
  // write `updateField` drops.
  it("renders the start state for a catalog whose only field carries no id", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [{ key: "unsaved", type: "string" }] as unknown as Draft["fields"],
    };
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId={undefined}
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );

    expect(html).toContain("This process collects nothing yet");
    expect(html).not.toContain("studio-field-label-");
  });

  // `studio-app`: "A group's child row keeps its own list". The key check on a
  // nested field stands in that field's own "What this field asks" zone, whose
  // heading carries `data-checked`, and the group's editor carries none.
  it("stands a nested field's check in its own zone, and none in its group's editor", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [grp("field_g", "g", [fld("field_c", "c")])] as unknown as Draft["fields"],
    };
    const issues: EditorIssue[] = [
      { entityType: "field", entityId: "field_c", loc: "fields[0].fields[0].key", source: "structural", message: "x" },
    ];
    const render = (selectedId: string) =>
      renderToStaticMarkup(
        <DraftContext.Provider value={contextValue(draft, issues)}>
          <FieldCatalogPanel
            token="test-token"
            selectedId={selectedId}
            onAdd={NOOP}
            onRemove={NOOP}
            onShowStep={NOOP}
            onMoveField={NOOP}
          />
        </DraftContext.Provider>,
      );

    const child = render("field_c");
    expect(child.split('data-checked="failed"').length - 1).toBe(1);
    expect(child).toMatch(/data-checked="failed"[^>]*>What this field asks</);

    expect(render("field_g")).not.toContain("data-checked");
  });
});
