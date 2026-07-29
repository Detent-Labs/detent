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
  it("attaches a matching issue beside its field, as a localized message rather than the raw kind", () => {
    const issuesByField = new Map<string, SubmissionIssue[]>([["f1", [{ kind: "required-missing", fieldId: "f1" }]]]);
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: false, readonly: false }], {}, issuesByField);
    expect(html).toContain("form-ui-field-issues");
    expect(html).toContain("This field is required.");
    expect(html).not.toContain(">required-missing<");
  });

  it("falls back to the raw kind when it has no catalog entry", () => {
    const issuesByField = new Map<string, SubmissionIssue[]>([["f1", [{ kind: "some-future-kind", fieldId: "f1" }]]]);
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: false, readonly: false }], {}, issuesByField);
    expect(html).toContain("some-future-kind");
  });

  it("renders no issue list when there are no issues for a field", () => {
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: false, readonly: false }]);
    expect(html).not.toContain("form-ui-field-issues");
  });

  it("puts the issue list as a sibling of the label, not nested inside it", () => {
    const issuesByField = new Map<string, SubmissionIssue[]>([["f1", [{ kind: "required-missing", fieldId: "f1" }]]]);
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: false, readonly: false }], {}, issuesByField);
    const labelClose = html.indexOf("</label>");
    const ulOpen = html.indexOf("<ul");
    expect(labelClose).toBeGreaterThan(-1);
    expect(ulOpen).toBeGreaterThan(labelClose);
  });

  it("gives the issue list an id matching the control's aria-describedby", () => {
    const issuesByField = new Map<string, SubmissionIssue[]>([["f1", [{ kind: "required-missing", fieldId: "f1" }]]]);
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: false, readonly: false }], {}, issuesByField);
    expect(html).toContain('id="f1-issues"');
    expect(html).toContain('aria-describedby="f1-issues"');
  });
});

describe("FieldForm: required and invalid state conveyed programmatically", () => {
  it("carries aria-required when the field is required", () => {
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: true, readonly: false }]);
    expect(html).toContain('aria-required="true"');
  });

  it("carries no aria-required when the field is not required", () => {
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: false, readonly: false }]);
    expect(html).not.toContain("aria-required");
  });

  it("never sets the native required attribute (the engine, not the browser, is the validator)", () => {
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: true, readonly: false }]);
    expect(html).not.toMatch(/\brequired=""/);
    expect(html).not.toMatch(/\brequired\s/);
  });

  it("carries aria-invalid when issues are attached", () => {
    const issuesByField = new Map<string, SubmissionIssue[]>([["f1", [{ kind: "required-missing", fieldId: "f1" }]]]);
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: false, readonly: false }], {}, issuesByField);
    expect(html).toContain('aria-invalid="true"');
  });

  it("carries no aria-invalid when there are no issues", () => {
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: false, readonly: false }]);
    expect(html).not.toContain("aria-invalid");
  });

  it("covers the group branch: a required, invalid group member gets the same attributes", () => {
    const issuesByField = new Map<string, SubmissionIssue[]>([["f_child", [{ kind: "required-missing", fieldId: "f_child" }]]]);
    const html = renderFields(
      [
        { field: baseField({ id: "f_group", key: "grp", type: "group" }), value: undefined, required: false, readonly: false },
        {
          field: baseField({ id: "f_child", key: "child", type: "string", label: { en: "Child" } }),
          value: undefined,
          required: true,
          readonly: false,
          group: "grp",
        },
      ],
      {},
      issuesByField,
    );
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('id="f_child-issues"');
  });

  it("covers the free-text fallback branch", () => {
    const issuesByField = new Map<string, SubmissionIssue[]>([["f1", [{ kind: "required-missing", fieldId: "f1" }]]]);
    const html = renderFields(
      [{ field: baseField({ id: "f1", type: "reference" }), value: undefined, required: true, readonly: false }],
      {},
      issuesByField,
    );
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('aria-invalid="true"');
  });
});
