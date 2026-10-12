import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { InstanceQueryFormView } from "../src/areas/studio/panels/shared/InstanceQueryForm.js";
import type { TargetProcessCatalog, TargetRef } from "../src/areas/studio/panels/shared/useTargetProcessCatalog.js";

/**
 * `studio-plugin-config-form`: each state the `instance.query` form draws.
 * The view takes the catalog as a prop, so a static render covers loading,
 * failure and each field type without a fetch. Focus across keystrokes needs
 * a real browser (`docs/browser-checks.md`).
 */

const CATALOG: TargetProcessCatalog = {
  steps: [{ id: "step_review", key: "review", label: "Review" }],
  fields: [
    { id: "field_priority", key: "priority", label: "Priority", type: "number" },
    { id: "field_urgent", key: "urgent", label: "Urgent", type: "boolean" },
    { id: "field_status", key: "status", label: "Status", type: "string" },
    { id: "field_money", key: "money", label: "Money" },
  ],
};
const OWN: TargetRef[] = [{ id: "field_own", key: "own", label: "Own" }];
const STALE = "not in any published version";
const CATALOG_ERROR = "could not be read";

function render(config: Record<string, unknown>, catalog: TargetProcessCatalog | undefined, catalogError = false): string {
  return renderToStaticMarkup(
    <InstanceQueryFormView
      processes={[]}
      catalog={catalog}
      catalogError={catalogError}
      config={{ processId: "proc_target", ...config }}
      onChange={() => {}}
      ownFields={OWN}
    />,
  );
}

/** The literal control: the input or select carrying the comparison value's accessible name. */
function literalControl(html: string): string {
  const match = html.match(/<(input|select)[^>]*aria-label="comparison value"[^>]*>(.*?<\/select>)?/);
  expect(match).not.toBeNull();
  return match![0];
}

const REFERENCES = {
  stepIds: ["step_gone"],
  labelFieldId: "field_gone",
  where: [{ fieldId: "field_gone", operator: "eq", value: 1 }],
  attributes: { cost_center: "field_gone" },
};

describe("the catalog states", () => {
  it("marks nothing stale and refuses literal input while the catalog loads", () => {
    const html = render(REFERENCES, undefined);
    expect(html).not.toContain(STALE);
    expect(html).not.toContain(CATALOG_ERROR);
    expect(literalControl(html)).toContain("disabled");
  });

  it("shows one error row, keeps the stored rows in sight, refuses literal input and marks nothing stale when the fetch failed", () => {
    const html = render(REFERENCES, undefined, true);
    expect(html.split(CATALOG_ERROR).length - 1).toBe(1);
    expect(html).not.toContain(STALE);
    expect(literalControl(html)).toContain("disabled");
    expect(html).toContain('value="cost_center"');
    // The error row takes the place of the steps fieldset and the label picker.
    expect(html).not.toContain("<legend class=\"instanceQueryFormLegend\">steps</legend>");
    expect(html).not.toContain("label field");
  });

  it("marks each reference the loaded catalog lacks, and refuses literal input for the missing field", () => {
    const html = render(REFERENCES, CATALOG);
    expect(html).not.toContain(CATALOG_ERROR);
    // The step, the label field, the compared field and the attribute.
    expect(html.split(STALE).length - 1).toBe(4);
    expect(literalControl(html)).toContain("disabled");
  });

  it("refuses literal input before a field is picked", () => {
    expect(literalControl(render({ where: [{ operator: "eq" }] }, CATALOG))).toContain("disabled");
  });
});

describe("the literal control per declared type", () => {
  it("reopens a saved number as its text in a decimal input", () => {
    const control = literalControl(render({ where: [{ fieldId: "field_priority", operator: "eq", value: 1 }] }, CATALOG));
    expect(control).toContain('value="1"');
    expect(control).toContain('inputMode="decimal"');
    expect(control).not.toContain("disabled");
  });

  it("offers Yes and No for a boolean field", () => {
    const control = literalControl(render({ where: [{ fieldId: "field_urgent", operator: "eq", value: true }] }, CATALOG));
    expect(control).toContain("<select");
    expect(control).toContain('<option value="true" selected="">yes</option>');
    expect(control).toContain('<option value="false">no</option>');
    expect(control).toContain("(select a value)");
  });

  it("takes text for a string field and for a plugin-typed field", () => {
    for (const fieldId of ["field_status", "field_money"]) {
      const control = literalControl(render({ where: [{ fieldId, operator: "eq", value: "open" }] }, CATALOG));
      expect(control).toContain('type="text"');
      expect(control).toContain('value="open"');
      expect(control).not.toContain("inputMode");
      expect(control).not.toContain("disabled");
    }
  });

  it("states that text on a number field is not a number, and ties the reason to the input", () => {
    const html = render({ where: [{ fieldId: "field_priority", operator: "eq", value: "abc" }] }, CATALOG);
    const control = literalControl(html);
    expect(control).toContain('value="abc"');
    expect(control).toContain('aria-invalid="true"');
    const describedBy = control.match(/aria-describedby="([^"]+)"/)![1];
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).toContain("This value is not a number.");
  });
});

describe("an in comparison", () => {
  const html = render({ where: [{ fieldId: "field_priority", operator: "in", value: [1, 2] }] }, CATALOG);

  it("shows the list as comma-separated text with the comma hint", () => {
    const control = literalControl(html);
    expect(control).toContain('value="1, 2"');
    expect(control).not.toContain("inputMode");
    expect(html).toContain("Separate values with a comma.");
    const describedBy = control.match(/aria-describedby="([^"]+)"/)![1];
    expect(html).toContain(`id="${describedBy}"`);
  });

  it("offers the literal list alone as the right side", () => {
    expect(html).toContain(">literal</option>");
    expect(html).not.toContain("field of this process");
  });
});

describe("the incomplete row", () => {
  it("defines the incomplete row as a dashed bottom border in the advisory role", () => {
    const source = readFileSync(join(import.meta.dir, "../src/areas/studio/panels/shared/InstanceQueryForm.tsx"), "utf8");
    const block = source.match(/instanceQueryFormRowIncomplete: \{([^}]*)\}/)![1];
    expect(block).toMatch(/borderBottomStyle: "dashed"/);
    expect(block).toMatch(/borderBottomColor: colors\.advisory/);
  });

  it("gives a row without a value the incomplete style, and a complete row none", () => {
    const html = render(
      {
        where: [
          { fieldId: "field_priority", operator: "eq", value: 1 },
          { fieldId: "field_priority", operator: "eq" },
        ],
      },
      CATALOG,
    );
    const rowClasses = [...html.matchAll(/<div class="([^"]+)"><select aria-label="compared field"/g)].map((m) => m[1]);
    // The test preload's StyleX stub renders each style's own key as its class.
    expect(rowClasses).toEqual(["instanceQueryFormRow", "instanceQueryFormRow instanceQueryFormRowIncomplete"]);
  });
});

describe("the attribute rows", () => {
  it("draws one row per saved attribute with its key in the input", () => {
    const html = render({ attributes: { cost_center: "field_status", region: "field_priority" } }, CATALOG);
    expect(html).toContain('value="cost_center"');
    expect(html).toContain('value="region"');
    expect(html).not.toContain("An earlier row already uses this column key");
  });
});

describe("a stored field id the options lack", () => {
  const stored = '<option value="field_gone" class="studioMono" selected="">field_gone</option>';

  it("stays the selected option of the comparison and attribute selects while the catalog loads", () => {
    const html = render({ where: REFERENCES.where, attributes: REFERENCES.attributes }, undefined);
    expect(html.split(stored).length - 1).toBe(2);
  });

  it("stays the selected option after a failed fetch", () => {
    const html = render({ where: REFERENCES.where, attributes: REFERENCES.attributes }, undefined, true);
    expect(html.split(stored).length - 1).toBe(2);
  });

  it("adds no extra option for a field the catalog holds", () => {
    const html = render({ where: [{ fieldId: "field_priority", operator: "eq", value: 1 }] }, CATALOG);
    expect(html).toContain('<option value="field_priority" selected="">Priority (priority)</option>');
    expect(html).not.toContain('class="studioMono" selected=""');
  });
});

describe("the data sources tab", () => {
  it("keys the instance.query form by its data source, so row text never carries over to another one", () => {
    const source = readFileSync(join(import.meta.dir, "../src/areas/studio/panels/DataSourcesPanel.tsx"), "utf8");
    expect(source).toMatch(/<InstanceQueryForm key=\{ds\.id\}/);
  });
});
