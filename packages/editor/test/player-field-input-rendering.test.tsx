import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldForm } from "../src/player/FieldInput";
import type { ResolvedViewField } from "../src/player/types";

/** Matches the `graph-view-rendering.test.tsx` / `content-locale-rendering.test.tsx`
 * convention: `react-dom/server`'s `renderToStaticMarkup`, no jsdom/testing-library. */

function noop() {
  // FieldForm/FieldInput require an onChange handler; static rendering
  // never fires one.
}

function renderFields(fields: ResolvedViewField[], values: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(<FieldForm fields={fields} values={values} onChange={noop} />);
}

const baseField = (overrides: Partial<ResolvedViewField["field"]>): ResolvedViewField["field"] => ({
  id: "field_x",
  key: "x",
  label: { en: "X" },
  type: "string",
  ...overrides,
});

describe("FieldInput: every BaseFieldType renders its expected input", () => {
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

describe("FieldInput: group nesting", () => {
  it("nests member fields inside the group's fieldset, not flattened alongside it", () => {
    const html = renderFields([
      { field: baseField({ id: "f_group", key: "grp", type: "group" }), value: undefined, required: false, readonly: false },
      { field: baseField({ id: "f_child", key: "child", type: "string", label: { en: "Child" } }), value: undefined, required: false, readonly: false, group: "grp" },
    ]);
    expect(html).toContain("<fieldset");
    expect(html).toContain("Child");
    // the child's label must appear between the fieldset's open/close tags
    const fieldsetOpen = html.indexOf("<fieldset");
    const fieldsetClose = html.indexOf("</fieldset>");
    const childLabelPos = html.indexOf("Child");
    expect(childLabelPos).toBeGreaterThan(fieldsetOpen);
    expect(childLabelPos).toBeLessThan(fieldsetClose);
  });
});

describe("FieldInput: readonly and required", () => {
  it("disables the input when readonly is set", () => {
    const html = renderFields([{ field: baseField({ id: "f1" }), value: "x", required: false, readonly: true }]);
    expect(html).toContain("disabled=");
  });

  it("shows a required marker when required is set", () => {
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: true, readonly: false }]);
    expect(html).toContain("player-required-marker");
  });

  it("shows no required marker when required is not set", () => {
    const html = renderFields([{ field: baseField({ id: "f1" }), value: undefined, required: false, readonly: false }]);
    expect(html).not.toContain("player-required-marker");
  });
});

describe("FieldInput: free-text fallback", () => {
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

describe("FieldInput: dataSource-bound field", () => {
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
    expect(html).not.toContain("data source resolution not yet supported");
  });
});
