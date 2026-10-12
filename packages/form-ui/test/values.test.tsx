import { describe, expect, it } from "bun:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldForm, FieldInput } from "../src/FieldForm.js";
import { filterToEditable } from "../src/submit.js";
import { datetimeInputValue, numberFromInput, textFromInput } from "../src/values.js";
import type { ResolvedViewEntry, ResolvedViewField } from "../src/types.js";

function noop() {
  // Static rendering never fires a change.
}

const entry = (field: Partial<ResolvedViewField["field"]>, extra: Partial<ResolvedViewField> = {}): ResolvedViewField => ({
  field: { id: "f1", key: "f1", label: { en: "F1" }, type: "string", ...field },
  value: undefined,
  required: false,
  readonly: false,
  ...extra,
});

/** The first element in a returned tree whose type is `tag` and that has an
 * `onChange` prop. `FieldInput` is a plain function with no hook, so calling
 * it returns the whole tree, event handlers included. */
function findChangeHandler(node: ReactNode, tag: string): ((e: unknown) => void) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findChangeHandler(child, tag);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  const element = node as ReactElement<{ onChange?: (e: unknown) => void; children?: ReactNode }>;
  if (element.type === tag && element.props.onChange) return element.props.onChange;
  return findChangeHandler(element.props.children, tag);
}

/** Drives the control `FieldInput` draws for `field`, as the browser would:
 * the handler receives the control's raw DOM value. Returns what `onChange`
 * reported. */
function fire(
  field: ResolvedViewField,
  tag: string,
  target: Record<string, unknown>,
  context: { allFields?: ResolvedViewEntry[]; values?: Record<string, unknown>; onChange: (id: string, v: unknown) => void },
): void {
  const tree = FieldInput({
    field,
    allFields: context.allFields ?? [field],
    values: context.values ?? {},
    onChange: context.onChange,
    locale: "en",
  });
  const handler = findChangeHandler(tree as ReactNode, tag);
  if (!handler) throw new Error(`no <${tag}> with an onChange`);
  handler({ target });
}

function reported(field: ResolvedViewField, tag: string, target: Record<string, unknown>): unknown[] {
  const calls: unknown[] = [];
  fire(field, tag, target, { onChange: (_id, v) => calls.push(v) });
  return calls;
}

describe("textFromInput and numberFromInput", () => {
  it("map an empty string to null", () => {
    expect(textFromInput("")).toBeNull();
    expect(numberFromInput("")).toBeNull();
  });

  it("keep a typed value", () => {
    expect(textFromInput("abc")).toBe("abc");
    expect(textFromInput(" ")).toBe(" ");
    expect(numberFromInput("120")).toBe(120);
    expect(numberFromInput("0")).toBe(0);
  });
});

describe("FieldInput: a cleared control reports null", () => {
  it("a number input emptied reports null, never undefined", () => {
    expect(reported(entry({ type: "number" }), "input", { value: "" })).toEqual([null]);
    expect(reported(entry({ type: "number" }), "input", { value: "120" })).toEqual([120]);
  });

  it("a date input cleared reports null, not an empty string", () => {
    expect(reported(entry({ type: "string", format: "date" }), "input", { value: "" })).toEqual([null]);
    expect(reported(entry({ type: "string", format: "date" }), "input", { value: "2026-10-10" })).toEqual(["2026-10-10"]);
  });

  it("datetime, email, plain text, file and plugin fallbacks report null when cleared", () => {
    for (const field of [
      entry({ type: "string", format: "datetime" }),
      entry({ type: "string", format: "email" }),
      entry({ type: "string" }),
      entry({ type: "file" }),
      entry({ type: { type: "plugin.thing", config: {} } }),
    ]) {
      expect(reported(field, "input", { value: "" })).toEqual([null]);
    }
  });

  it("a multiline input cleared reports null", () => {
    expect(reported(entry({ type: "string", control: "multiline" }), "textarea", { value: "" })).toEqual([null]);
  });

  it("a single select's empty option reports null", () => {
    const field = entry({ type: "string" }, { options: [{ value: "a", label: { en: "A" } }] });
    expect(reported(field, "select", { value: "" })).toEqual([null]);
    expect(reported(field, "select", { value: "a" })).toEqual(["a"]);
  });

  it("a boolean keeps its value", () => {
    expect(reported(entry({ type: "boolean" }), "input", { checked: false })).toEqual([false]);
  });

  it("a multi-select with nothing picked reports an empty list", () => {
    const field = entry({ type: "list" }, { options: [{ value: "a", label: { en: "A" } }] });
    expect(reported(field, "select", { selectedOptions: [] })).toEqual([[]]);
  });

  it("an unchecked checkbox group reports an empty list", () => {
    const field = entry({ type: "list", control: "checkboxes" }, { options: [{ value: "a", label: { en: "A" } }] });
    expect(reported(field, "input", { checked: false })).toEqual([[]]);
  });

  it("a radio choice reports its option", () => {
    const field = entry({ type: "string", control: "radio" }, { options: [{ value: "a", label: { en: "A" } }] });
    expect(reported(field, "input", {})).toEqual(["a"]);
  });
});

describe("FieldForm: a null value renders as an empty control", () => {
  const render = (field: ResolvedViewField) =>
    renderToStaticMarkup(<FieldForm fields={[field]} values={{ f1: null }} onChange={noop} locale="en" />);

  it("text", () => {
    expect(render(entry({ type: "string" }))).toContain('value=""');
  });

  it("number", () => {
    const html = render(entry({ type: "number" }));
    expect(html).toContain('value=""');
    expect(html).not.toContain("null");
  });

  it("select", () => {
    const html = render(entry({ type: "string" }, { options: [{ value: "a", label: { en: "A" } }] }));
    // The empty option is the one the control shows as chosen.
    expect(html).toContain('<option value="" selected=""></option>');
    expect(html).not.toContain('<option value="a" selected');
    expect(html).not.toContain("null");
  });

  it("multiline", () => {
    const html = render(entry({ type: "string", control: "multiline" }));
    expect(html).toMatch(/<textarea[^>]*><\/textarea>/);
  });

  it("date and datetime", () => {
    expect(render(entry({ type: "string", format: "date" }))).toContain('value=""');
    expect(render(entry({ type: "string", format: "datetime" }))).toContain('value=""');
  });
});

describe("FieldForm: the readonly prop disables every control", () => {
  const options = [{ value: "a", label: { en: "A" } }];
  const oneOfEach: ResolvedViewField[] = [
    entry({ id: "t", key: "t", type: "string" }),
    entry({ id: "n", key: "n", type: "number" }),
    entry({ id: "b", key: "b", type: "boolean" }),
    entry({ id: "br", key: "br", type: "boolean", control: "radio" }),
    entry({ id: "d", key: "d", type: "string", format: "date" }),
    entry({ id: "dt", key: "dt", type: "string", format: "datetime" }),
    entry({ id: "e", key: "e", type: "string", format: "email" }),
    entry({ id: "m", key: "m", type: "string", control: "multiline" }),
    entry({ id: "s", key: "s", type: "string" }, { options }),
    entry({ id: "r", key: "r", type: "string", control: "radio" }, { options }),
    entry({ id: "l", key: "l", type: "list" }, { options }),
    entry({ id: "c", key: "c", type: "list", control: "checkboxes" }, { options }),
    entry({ id: "fl", key: "fl", type: "file" }),
    entry({ id: "g", key: "g", type: "group" }),
    entry({ id: "gm", key: "gm", type: "string" }, { group: "g" }),
  ];

  const controls = (html: string) => html.match(/<(?:input|select|textarea)\b[^>]*>/g) ?? [];

  it("disables each control, group members included", () => {
    const html = renderToStaticMarkup(<FieldForm fields={oneOfEach as ResolvedViewEntry[]} values={{}} onChange={noop} locale="en" readonly />);
    const tags = controls(html);
    // 1 t + 1 n + 1 b + 2 br + d + dt + e + m + s + 1 r + l + 1 c + fl + gm
    expect(tags.length).toBe(15);
    for (const tag of tags) expect(tag).toContain('disabled=""');
  });

  it("leaves the same form editable without the prop", () => {
    const html = renderToStaticMarkup(<FieldForm fields={oneOfEach as ResolvedViewEntry[]} values={{}} onChange={noop} locale="en" />);
    for (const tag of controls(html)) expect(tag).not.toContain("disabled");
  });

  it("FieldInput takes the prop too", () => {
    const html = renderToStaticMarkup(
      <FieldInput field={oneOfEach[0]!} allFields={oneOfEach} values={{}} onChange={noop} locale="en" readonly />,
    );
    expect(controls(html)[0]).toContain('disabled=""');
  });
});

describe("datetimeInputValue", () => {
  // UTC+02:00 stands for the browser zone, so the result does not depend on the machine.
  const PLUS_TWO = 120;

  it("shows a UTC value as local time", () => {
    expect(datetimeInputValue("2026-10-10T12:30:00Z", PLUS_TWO)).toBe("2026-10-10T14:30");
  });

  it("shows an offset value as local time, across a date boundary", () => {
    expect(datetimeInputValue("2026-10-10T23:30:00-05:00", PLUS_TWO)).toBe("2026-10-11T06:30");
    expect(datetimeInputValue("2026-10-10T23:30:00-0500", PLUS_TWO)).toBe("2026-10-11T06:30");
    expect(datetimeInputValue("2026-10-10T14:30:00+02:00", PLUS_TWO)).toBe("2026-10-10T14:30");
  });

  it("appends seconds only when they are non-zero", () => {
    expect(datetimeInputValue("2026-10-10T12:30:15Z", PLUS_TWO)).toBe("2026-10-10T14:30:15");
    expect(datetimeInputValue("2026-10-10T12:30:00.000Z", PLUS_TWO)).toBe("2026-10-10T14:30");
  });

  it("passes a zoneless value unchanged", () => {
    expect(datetimeInputValue("2026-10-10T14:30", PLUS_TWO)).toBe("2026-10-10T14:30");
    expect(datetimeInputValue("2026-10-10T14:30:05", PLUS_TWO)).toBe("2026-10-10T14:30:05");
  });

  it("passes an unparsable value unchanged", () => {
    expect(datetimeInputValue("not a date", PLUS_TWO)).toBe("not a date");
    expect(datetimeInputValue("2026-13-45T99:99:00Z", PLUS_TWO)).toBe("2026-13-45T99:99:00Z");
    expect(datetimeInputValue("", PLUS_TWO)).toBe("");
  });

  it("uses the browser's own zone when none is given", () => {
    const d = new Date("2026-10-10T12:30:00Z");
    const p = (n: number) => String(n).padStart(2, "0");
    const expected = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    expect(datetimeInputValue("2026-10-10T12:30:00Z")).toBe(expected);
  });
});

describe("FieldForm: a datetime field converts for display only", () => {
  const html = (value: unknown) =>
    renderToStaticMarkup(
      <FieldForm fields={[entry({ type: "string", format: "datetime" })]} values={{ f1: value }} onChange={noop} locale="en" />,
    );

  it("shows a zoneless value as stored", () => {
    expect(html("2026-10-10T14:30")).toContain('value="2026-10-10T14:30"');
  });

  it("shows a zoned value in the local form", () => {
    const expected = datetimeInputValue("2026-10-10T12:30:00Z");
    expect(html("2026-10-10T12:30:00Z")).toContain(`value="${expected}"`);
    expect(expected).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("shows an unparsable value as stored", () => {
    expect(html("soon")).toContain('value="soon"');
  });

  it("reports the raw typed string, not a converted one", () => {
    const field = entry({ id: "f1", type: "string", format: "datetime" });
    expect(reported(field, "input", { value: "2026-10-10T14:30" })).toEqual(["2026-10-10T14:30"]);
  });

  it("submits an untouched zoned value unchanged after an edit elsewhere in the form", () => {
    const stored = "2026-10-10T12:30:00Z";
    const f1 = entry({ id: "f1", key: "f1", type: "string", format: "datetime" }, { value: stored });
    const f2 = entry({ id: "f2", key: "f2", type: "string" });
    const fields = [f1, f2];
    // Form state kept the way a consumer keeps it.
    let values: Record<string, unknown> = { f1: stored };
    const onChange = (id: string, v: unknown) => {
      values = { ...values, [id]: v };
    };
    // A render pass. A render that wrote the converted value into state
    // would replace f1 here.
    renderToStaticMarkup(<FieldForm fields={fields} values={values} onChange={onChange} locale="en" />);
    for (const f of fields) FieldInput({ field: f, allFields: fields, values, onChange, locale: "en" });
    // The participant types in the sibling field only.
    fire(f2, "input", { value: "hello" }, { allFields: fields, values, onChange });
    expect(values.f2).toBe("hello");
    const submitted = filterToEditable(values, fields);
    expect(submitted.f2).toBe("hello");
    expect(submitted.f1).toBe(stored);
    expect(JSON.stringify(submitted)).toBe('{"f1":"2026-10-10T12:30:00Z","f2":"hello"}');
  });

  it("does not convert a date field", () => {
    const out = renderToStaticMarkup(
      <FieldForm fields={[entry({ type: "string", format: "date" })]} values={{ f1: "2026-10-10T12:30:00Z" }} onChange={noop} locale="en" />,
    );
    expect(out).toContain('value="2026-10-10T12:30:00Z"');
  });
});
