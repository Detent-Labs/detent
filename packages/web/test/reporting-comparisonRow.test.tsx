import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { ComparisonRow } from "../src/areas/reporting/screens/ComparisonRow.js";
import { rememberTypes, type RememberedTypes } from "../src/areas/reporting/screens/reportsLogic.js";
import type { ColumnChoice, DataComparison } from "../src/areas/reporting/api/types.js";
import type { UiLocale } from "../src/i18n/locale.js";

/**
 * `reporting-data-tables`: each state the report builder's comparison row
 * draws. A static render runs no event handler, so focus and a committed
 * keystroke stay with `docs/browser-checks.md`.
 */

const CHOICES: ColumnChoice[] = [
  { fieldId: "field_amount", versions: [1], type: "number" },
  { fieldId: "field_urgent", versions: [1], type: "boolean" },
  { fieldId: "field_status", versions: [1], type: "string" },
  { fieldId: "field_plugin", versions: [1] },
];
const TYPES = rememberTypes(new Map(), CHOICES);
const NOT_NUMBER = "This value is not a number.";
const INCOMPLETE = "This comparison has no value yet and filters nothing.";

function render(comparison: DataComparison, { choices = CHOICES, types = TYPES, locale = "en" as UiLocale } = {}): string {
  return renderToStaticMarkup(
    <ComparisonRow comparison={comparison} choices={choices} types={types} onChange={() => {}} onRemove={() => {}} locale={locale} />,
  );
}

/** The value control: the input or select named "Value". */
function valueControl(html: string, name = "Value"): string {
  const match = html.match(new RegExp(`<(input|select)[^>]*aria-label="${name}"[^>]*>(.*?</select>)?`));
  expect(match).not.toBeNull();
  return match![0];
}

function rowClass(html: string): string {
  return html.match(/^<div class="([^"]+)">/)![1]!;
}

describe("the value control per declared type", () => {
  it("shows a number as its text in a decimal input", () => {
    const control = valueControl(render({ fieldId: "field_amount", operator: "eq", value: 500 }));
    expect(control).toContain('type="text"');
    expect(control).toContain('value="500"');
    expect(control).toContain('inputMode="decimal"');
    expect(control).not.toContain("aria-invalid");
  });

  it("offers an empty choice, Yes and No for a boolean field", () => {
    const control = valueControl(render({ fieldId: "field_urgent", operator: "eq", value: true }));
    expect(control).toContain("<select");
    expect(control).toContain('<option value="">Choose a value…</option>');
    expect(control).toContain('<option value="true" selected="">Yes</option>');
    expect(control).toContain('<option value="false">No</option>');
  });

  it("takes text for a string field and for a field named without a type", () => {
    for (const fieldId of ["field_status", "field_plugin"]) {
      const control = valueControl(render({ fieldId, operator: "eq", value: "open" }));
      expect(control).toContain('type="text"');
      expect(control).toContain('value="open"');
      expect(control).not.toContain("inputMode");
    }
  });

  it("states that text on a number field is not a number, and ties the reason to the input", () => {
    // A saved report can hold such a value; the row draws it as text.
    const html = render({ fieldId: "field_amount", operator: "eq", value: "abc" });
    const control = valueControl(html);
    expect(control).toContain('value="abc"');
    expect(control).toContain('aria-invalid="true"');
    const describedBy = control.match(/aria-describedby="([^"]+)"/)![1]!;
    for (const id of describedBy.split(" ")) expect(html).toContain(`id="${id}"`);
    expect(html).toContain(NOT_NUMBER);
  });

  it("prints the German strings in German", () => {
    const html = render({ fieldId: "field_urgent", operator: "eq", value: undefined }, { locale: "de" });
    expect(valueControl(html, "Wert")).toContain('<option value="true">Ja</option>');
    expect(html).toContain("Dieser Vergleich hat noch keinen Wert und filtert nichts.");
  });
});

describe("an in comparison", () => {
  const html = render({ fieldId: "field_amount", operator: "in", value: [1, 2] });

  it("shows the list as comma-separated text with the comma hint tied to the input", () => {
    const control = valueControl(html);
    expect(control).toContain('value="1, 2"');
    expect(control).not.toContain("inputMode");
    expect(html).toContain("separate values with a comma.");
    const describedBy = control.match(/aria-describedby="([^"]+)"/)![1]!;
    expect(html).toContain(`id="${describedBy}"`);
  });

  it("uses a text list for a boolean field too, and names a bad member", () => {
    const listHtml = render({ fieldId: "field_urgent", operator: "in", value: ["yes"] });
    const control = valueControl(listHtml);
    expect(control).toContain('type="text"');
    expect(control).toContain('aria-invalid="true"');
    expect(listHtml).toContain("Each value must be true or false.");
  });
});

describe("the incomplete row", () => {
  it("defines the incomplete row as a dashed bottom border in the advisory role", () => {
    const source = readFileSync(join(import.meta.dir, "../src/areas/reporting/screens/ComparisonRow.tsx"), "utf8");
    const block = source.match(/comparisonRowIncomplete: \{([^}]*)\}/)![1]!;
    expect(block).toMatch(/borderBottomStyle: "dashed"/);
    expect(block).toMatch(/borderBottomColor: colors\.advisory/);
  });

  it("gives a complete row no incomplete style and no note", () => {
    const html = render({ fieldId: "field_amount", operator: "eq", value: 500 });
    // The test preload's StyleX stub renders each style's own key as its class.
    expect(rowClass(html)).toBe("comparisonRow");
    expect(html).not.toContain(INCOMPLETE);
  });

  it("marks a new row as incomplete without an error message", () => {
    const html = render({ fieldId: "field_amount", operator: "eq", value: undefined });
    expect(rowClass(html)).toBe("comparisonRow comparisonRowIncomplete");
    const control = valueControl(html);
    expect(control).toContain('value=""');
    expect(control).not.toContain("aria-invalid");
    expect(html).not.toContain(NOT_NUMBER);
    // The dashed border has a spoken equivalent, hidden from sight.
    const describedBy = control.match(/aria-describedby="([^"]+)"/)![1]!;
    expect(html).toContain(`<span id="${describedBy}" class="srOnly">${INCOMPLETE}</span>`);
  });

  it("marks an unchosen boolean as incomplete", () => {
    const html = render({ fieldId: "field_urgent", operator: "eq", value: undefined });
    expect(rowClass(html)).toBe("comparisonRow comparisonRowIncomplete");
    expect(valueControl(html)).toContain('<option value="" selected="">Choose a value…</option>');
  });
});

describe("remembered field types", () => {
  it("keeps a number input and the value when the response no longer names the row's field", () => {
    const emptied: RememberedTypes = rememberTypes(TYPES, []);
    const html = render({ fieldId: "field_amount", operator: "eq", value: 999999 }, { choices: [], types: emptied });
    const control = valueControl(html);
    expect(control).toContain('inputMode="decimal"');
    expect(control).toContain('value="999999"');
    // The field select still shows the row's own field.
    expect(html).toContain('<option value="field_amount" selected="">field_amount</option>');
  });

  it("follows the value's own type for a field no response named", () => {
    const control = valueControl(render({ fieldId: "field_new", operator: "eq", value: 7 }, { types: new Map() }));
    expect(control).toContain('inputMode="decimal"');
  });
});
