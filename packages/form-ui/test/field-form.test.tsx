import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldForm } from "../src/FieldForm.js";
import type { ResolvedViewField, SubmissionIssue } from "../src/types.js";

/** `react-dom/server`'s `renderToStaticMarkup`, no jsdom/testing-library —
 * matches the editor's own rendering-test convention. */

function noop() {
  // FieldForm/FieldInput require an onChange handler; static rendering never fires one.
}

function renderFields(fields: ResolvedViewField[], values: Record<string, unknown> = {}, issuesByField?: Map<string, SubmissionIssue[]>): string {
  return renderToStaticMarkup(<FieldForm fields={fields} values={values} onChange={noop} locale="en" issuesByField={issuesByField} />);
}

const baseField = (overrides: Partial<ResolvedViewField["field"]>): ResolvedViewField["field"] => ({
  id: "field_x",
  key: "x",
  label: { en: "X" },
  type: "string",
  ...overrides,
});

describe("FieldForm: every BaseFieldType renders its expected input", () => {
  it("string -> text input", () => {
    const html = renderFields([{ field: baseField({ id: "f1", type: "string" }), value: undefined, required: false, readonly: false }]);
    expect(html).toContain('type="text"');
  });

  it("number -> number input", () => {
    const html = renderFields([{ field: baseField({ id: "f1", type: "number" }), value: 5, required: false, readonly: false }], { f1: 5 });
    expect(html).toContain('type="number"');
    expect(html).toContain('value="5"');
  });

  it("boolean -> checkbox", () => {
    const html = renderFields([{ field: baseField({ id: "f1", type: "boolean" }), value: true, required: false, readonly: false }], { f1: true });
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked=");
  });

  it("date -> date input", () => {
    const html = renderFields([{ field: baseField({ id: "f1", type: "date" }), value: "2026-01-01", required: false, readonly: false }]);
    expect(html).toContain('type="date"');
  });

  it("datetime -> datetime-local input", () => {
    const html = renderFields([{ field: baseField({ id: "f1", type: "datetime" }), value: undefined, required: false, readonly: false }]);
    expect(html).toContain('type="datetime-local"');
  });

  it("select -> a <select> built from the resolved options", () => {
    const html = renderFields([
      {
        field: baseField({ id: "f1", type: "select" }),
        value: undefined,
        required: false,
        readonly: false,
        options: [{ value: "a", label: { en: "Option A" } }],
      },
    ]);
    expect(html).toContain("<select");
    expect(html).toContain("Option A");
  });

  it("multiselect -> a multiple <select> built from the resolved options", () => {
    const html = renderFields([
      {
        field: baseField({ id: "f1", type: "multiselect" }),
        value: ["a"],
        required: false,
        readonly: false,
        options: [{ value: "a", label: { en: "Option A" } }],
      },
    ]);
    expect(html).toContain('multiple=""');
  });
});

describe("FieldForm: locale resolution with fallback", () => {
  it("resolves the label in the given locale", () => {
    const html = renderToStaticMarkup(
      <FieldForm
        fields={[{ field: baseField({ id: "f1", label: { en: "English", de: "Deutsch" } }), value: undefined, required: false, readonly: false }]}
        values={{}}
        onChange={noop}
        locale="de"
      />,
    );
    expect(html).toContain("Deutsch");
  });

  it("falls back to baseLocale when the active locale has no entry", () => {
    const html = renderToStaticMarkup(
      <FieldForm
        fields={[{ field: baseField({ id: "f1", label: { en: "English" } }), value: undefined, required: false, readonly: false }]}
        values={{}}
        onChange={noop}
        locale="de"
        baseLocale="en"
      />,
    );
    expect(html).toContain("English");
  });
});

describe("FieldForm: group nesting", () => {
  it("nests member fields inside the group's fieldset, not flattened alongside it", () => {
    const html = renderFields([
      { field: baseField({ id: "f_group", key: "grp", type: "group" }), value: undefined, required: false, readonly: false },
      { field: baseField({ id: "f_child", key: "child", type: "string", label: { en: "Child" } }), value: undefined, required: false, readonly: false, group: "grp" },
    ]);
    expect(html).toContain("<fieldset");
    expect(html).toContain("Child");
    const fieldsetOpen = html.indexOf("<fieldset");
    const fieldsetClose = html.indexOf("</fieldset>");
    const childLabelPos = html.indexOf("Child");
    expect(childLabelPos).toBeGreaterThan(fieldsetOpen);
    expect(childLabelPos).toBeLessThan(fieldsetClose);
  });
});

describe("FieldForm: readonly and required", () => {
  it("disables the input when readonly is set", () => {
    const html = renderFields([{ field: baseField({ id: "f1" }), value: "x", required: false, readonly: true }]);
    expect(html).toContain("disabled=");
  });

  it("shows a required marker when required is set", () => {
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: true, readonly: false }]);
    expect(html).toContain("form-ui-required-marker");
  });

  it("shows no required marker when required is not set", () => {
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: false, readonly: false }]);
    expect(html).not.toContain("form-ui-required-marker");
  });
});

describe("FieldForm: free-text fallback", () => {
  it("renders reference as free text", () => {
    const html = renderFields([{ field: baseField({ id: "f1", type: "reference" }), value: undefined, required: false, readonly: false }]);
    expect(html).toContain('type="text"');
  });

  it("renders file as free text", () => {
    const html = renderFields([{ field: baseField({ id: "f1", type: "file" }), value: undefined, required: false, readonly: false }]);
    expect(html).toContain('type="text"');
  });

  it("renders a Plugin envelope type as free text", () => {
    const html = renderFields([
      { field: baseField({ id: "f1", type: { type: "custom.rating", config: {}, description: "stars" } }), value: undefined, required: false, readonly: false },
    ]);
    expect(html).toContain('type="text"');
  });
});

describe("FieldForm: dataSource-bound field", () => {
  it("renders as a populated <select> from its resolved options, not free text", () => {
    const html = renderFields([
      {
        field: baseField({ id: "f1", type: "select", dataSource: "ds_countries" }),
        value: undefined,
        required: false,
        readonly: false,
        options: [{ value: "us", label: { en: "United States" } }],
      },
    ]);
    expect(html).toContain("<select");
    expect(html).toContain("United States");
  });
});

describe("FieldForm: per-field validation errors", () => {
  it("attaches a matching issue beside its field", () => {
    const issuesByField = new Map<string, SubmissionIssue[]>([["f1", [{ kind: "required-missing", fieldId: "f1" }]]]);
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: false, readonly: false }], {}, issuesByField);
    expect(html).toContain("required-missing");
  });

  it("renders no issue list when there are no issues for a field", () => {
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: false, readonly: false }]);
    expect(html).not.toContain("form-ui-field-issues");
  });
});
