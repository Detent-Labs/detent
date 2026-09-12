import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { FieldCatalogPanel, MoveFieldControl } from "../src/areas/studio/panels/FieldCatalogPanel.js";

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

function contextValue(draft: Draft): DraftContextValue {
  return {
    draft,
    mutate: () => {},
    replace: () => {},
    validation: validation(),
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
 * Final-review Important 1: a field `changeKind` rewrote out of `group`
 * keeps its `fields` array (`fieldCatalogLogic.ts::moveFieldToGroup`'s own
 * comment on the point). `FieldEditor` and `SubFieldRow` used to draw
 * children `isGroup &&` alone, so such a field's children — and their own
 * move control — rendered nowhere. `FieldCatalogPanel` reads `useDraft()`
 * directly, so the test supplies `DraftContext.Provider`, the way
 * `studio-formsTab.test.tsx` already does.
 */
describe("FieldCatalogPanel", () => {
  it("draws a non-group field's children, move control included", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [
        { ...fld("field_r", "resolution"), fields: [fld("field_c", "discrepancy_note")] } as unknown as DraftField,
      ] as unknown as Draft["fields"],
    };
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={contextValue(draft)}>
        <FieldCatalogPanel
          token="test-token"
          selectedId="field_r"
          focusFieldId={undefined}
          onAdd={NOOP}
          onRemove={NOOP}
          onShowStep={NOOP}
          onMoveField={NOOP}
        />
      </DraftContext.Provider>,
    );
    expect(html).toContain('id="studio-field-move-field_c"');
  });
});
