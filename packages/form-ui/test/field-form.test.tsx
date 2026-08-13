import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldForm, effectiveSpan, optionText } from "../src/FieldForm.js";
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

/** `columns` and `span` are layout only, so these assert the grid attributes
 * the stylesheet keys on rather than computed geometry. `renderToStaticMarkup`
 * applies no CSS. The rule that must not regress is that a view declaring
 * neither key produces exactly the markup it produced before both existed. */
function renderGrid(fields: ResolvedViewField[], columns?: 1 | 2): string {
  return renderToStaticMarkup(<FieldForm fields={fields} values={{}} onChange={noop} locale="en" columns={columns} />);
}

/** The label carries the id so the rendered markup distinguishes one field
 * from the next. The order assertion below needs an anchor that is always
 * present; an issue list is not one, since a field with no issues renders
 * none. */
const plain = (id: string, span?: 1 | 2, group?: string): ResolvedViewField => ({
  field: baseField({ id, key: id, type: "string", label: { en: id } }),
  value: undefined,
  required: false,
  readonly: false,
  ...(span === undefined ? {} : { span }),
  ...(group === undefined ? {} : { group }),
});

describe("FieldForm: fields render across the view's column count, honoring span", () => {
  it("defaults to a one-column grid when no columns prop is passed", () => {
    const html = renderGrid([plain("f1"), plain("f2")]);
    expect(html).toContain('data-columns="1"');
    expect(html).not.toContain('data-columns="2"');
  });

  it("a field with no span renders at width 1", () => {
    const html = renderGrid([plain("f1")], 1);
    expect(html).toContain('data-span="1"');
    expect(html).not.toContain('data-span="2"');
  });

  it("a two-column grid marks itself and keeps declaration order", () => {
    const html = renderGrid([plain("f1"), plain("f2"), plain("f3"), plain("f4")], 2);
    expect(html).toContain('data-columns="2"');
    // Every anchor must actually be in the markup. Two absent anchors both
    // report -1, and an order assertion over them proves nothing.
    const at = (id: string) => {
      const i = html.indexOf(`>${id}<`);
      expect(i).toBeGreaterThan(-1);
      return i;
    };
    // Declaration order is the render order; the array's own sequence decides.
    expect(at("f1")).toBeLessThan(at("f2"));
    expect(at("f2")).toBeLessThan(at("f3"));
    expect(at("f3")).toBeLessThan(at("f4"));
  });

  it("a span-2 field on a two-column grid renders at width 2", () => {
    const html = renderGrid([plain("f1", 2), plain("f2")], 2);
    expect(html).toContain('data-span="2"');
  });

  it("an over-wide span clamps to a one-column grid", () => {
    // min(span, columns): the stored span stays 2, the drawn span is 1.
    const html = renderGrid([plain("f1", 2)], 1);
    expect(html).toContain('data-span="1"');
    expect(html).not.toContain('data-span="2"');
  });

  it("a group in a one-column form renders as it did before this change", () => {
    const html = renderGrid([
      { field: baseField({ id: "g1", key: "g1", type: "group" }), value: undefined, required: false, readonly: false },
      plain("m1", undefined, "g1"),
      plain("m2", undefined, "g1"),
    ], 1);
    expect(html).toContain('data-columns="1"');
    expect(html).not.toContain('data-columns="2"');
    expect(html).toContain("<fieldset");
  });

  it("a group inherits a two-column form's width", () => {
    const html = renderGrid([
      { field: baseField({ id: "g1", key: "g1", type: "group" }), value: undefined, required: false, readonly: false },
      plain("m1", undefined, "g1"),
    ], 2);
    // The group's own container carries the form's count; it declares none.
    expect(html).toContain('<fieldset class="form-ui-field form-ui-field-group" data-span="2" data-columns="2"');
  });

  it("ignores a span declared on a group", () => {
    // A group is a container, not a leaf. Its members lay out at the form's
    // count inside it, and two tracks need the room two tracks take, so the
    // frame is the form's full width whatever the span says.
    const html = renderGrid([
      { field: baseField({ id: "g1", key: "g1", type: "group" }), value: undefined, required: false, readonly: false, span: 1 },
      plain("m1", undefined, "g1"),
    ], 2);
    expect(html).toContain('<fieldset class="form-ui-field form-ui-field-group" data-span="2" data-columns="2"');
  });

  it("wraps the grid in the element the collapse rule measures", () => {
    // The threshold is a container query, and a container query matches
    // descendants of the container rather than the container itself. Without
    // this wrapper the collapse rule would silently never fire on the grid.
    const html = renderGrid([plain("f1")], 2);
    expect(html).toContain('<div class="form-ui-form">');
    // The wrapper is outside the grid, not beside it.
    expect(html.indexOf('class="form-ui-form"')).toBeLessThan(html.indexOf('class="form-ui-field-form"'));
  });

  it("a group member's own span clamps inside the group's grid", () => {
    const html = renderGrid([
      { field: baseField({ id: "g1", key: "g1", type: "group" }), value: undefined, required: false, readonly: false },
      plain("m1", 2, "g1"),
    ], 1);
    expect(html).not.toContain('data-span="2"');
  });
});

describe("effectiveSpan clamps a span to the grid it sits in", () => {
  it("treats an absent span as 1", () => {
    expect(effectiveSpan(undefined, 1)).toBe(1);
    expect(effectiveSpan(undefined, 2)).toBe(1);
  });

  it("passes a span that fits", () => {
    expect(effectiveSpan(2, 2)).toBe(2);
    expect(effectiveSpan(1, 2)).toBe(1);
  });

  it("clamps a span wider than the grid", () => {
    expect(effectiveSpan(2, 1)).toBe(1);
  });
});

// table-shaped-data-sources: an option's row attributes fold into its text,
// because a native <option> carries one text run and that text is its
// accessible name.
describe("optionText", () => {
  it("appends attribute values in map order, which is the operator's declared order", () => {
    expect(optionText("Widget", { sku: "A-1140", price: 12.5 }, "en")).toBe("Widget · A-1140 · 12.5");
  });

  it("leaves an option with no attributes exactly as it reads today", () => {
    expect(optionText("Widget", undefined, "en")).toBe("Widget");
  });

  it("leaves no empty segment for a column the row does not fill", () => {
    // The engine omits an unfilled column rather than sending an empty string,
    // so the renderer never has to trim one.
    expect(optionText("Widget", { sku: "A-1140" }, "en")).toBe("Widget · A-1140");
    expect(optionText("Widget", {}, "en")).toBe("Widget");
  });

  it("prints a number through the locale's own formatter", () => {
    expect(optionText("Widget", { price: 1234.5 }, "de")).toBe("Widget · 1.234,5");
    expect(optionText("Widget", { price: 1234.5 }, "en")).toBe("Widget · 1,234.5");
  });

  it("prints a boolean as its literal value, in every locale", () => {
    expect(optionText("Widget", { bulk: true }, "de")).toBe("Widget · true");
  });
});
