/**
 * `panels/shared/FieldExpressionMapEditor.tsx` and its pure logic
 * (`field-expression-map-consolidation`, `fix-subprocess-step-editor` D3).
 *
 * The markup tests read the rendered `<select>` options. The pure functions
 * cover what the click handlers do, so no DOM event is needed.
 */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldExpressionMapEditor } from "../src/areas/studio/panels/shared/FieldExpressionMapEditor.js";
import {
  EMPTY_EXPRESSION,
  editRow,
  moveRow,
  nextUnusedTarget,
  removeRow,
  refTargets,
  rowOptions,
  fieldTargets,
  type MapTarget,
} from "../src/areas/studio/panels/shared/fieldExpressionMapLogic.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import { studioCatalog } from "../src/i18n/catalogs/studio.js";

/** Plain-string ids, typed as the catalog's branded draft fields. */
const df = (fields: Record<string, unknown>[]) => fields as unknown as DraftField[];
const FIELDS = df([
  { id: "field_g", key: "applicant", type: "group", label: { en: "Applicant" } },
  { id: "field_a", key: "alpha", type: "string", label: { en: "Alpha" } },
  { id: "field_b", key: "beta", type: "number", label: { en: "Beta" } },
]);
const TARGETS = fieldTargets(FIELDS, "en", "en");
const EXPR = (src: string) => ({ lang: "cel" as const, src });
/** A literal map keyed by plain strings, typed as the editor's branded-key map. */
const m = (o: Record<string, ReturnType<typeof EXPR>>) => o as unknown as NonNullable<Parameters<typeof editRow>[0]>;

interface ParsedOption {
  value: string;
  disabled: boolean;
  selected: boolean;
  text: string;
}

/** One entry per `<select>` in the markup, each with its parsed `<option>`s. */
function selects(html: string): ParsedOption[][] {
  const out: ParsedOption[][] = [];
  for (const sel of html.matchAll(/<select\b[^>]*>([\s\S]*?)<\/select>/g)) {
    const opts: ParsedOption[] = [];
    for (const m of sel[1]!.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)) {
      const attrs = m[1]!;
      opts.push({
        value: /value="([^"]*)"/.exec(attrs)?.[1] ?? "",
        disabled: /\bdisabled\b/.test(attrs),
        selected: /\bselected\b/.test(attrs),
        text: m[2]!.replace(/<!-- -->/g, ""),
      });
    }
    out.push(opts);
  }
  return out;
}

function render(
  mapping: Record<string, { lang: "cel"; src: string }> | undefined,
  extra: { targets?: readonly MapTarget[]; addDisabled?: boolean } = {},
): string {
  return renderToStaticMarkup(
    <FieldExpressionMapEditor
      legend="legend"
      addLabel="ADD"
      removeLabel="REMOVE"
      mapping={mapping}
      targets={extra.targets ?? TARGETS}
      addDisabled={extra.addDisabled}
      onChange={() => {}}
    />,
  );
}

describe("FieldExpressionMapEditor markup", () => {
  it("offers no group field as a target", () => {
    const [row] = selects(render({ field_a: EXPR("x") }));
    expect(row!.map((o) => o.value)).toEqual(["field_a", "field_b"]);
  });

  it("shows each target by its label, never its key", () => {
    const [row] = selects(render({ field_a: EXPR("x") }));
    expect(row!.map((o) => o.text)).toEqual(["Alpha", "Beta"]);
    expect(row!.some((o) => o.text.includes("alpha") || o.text.includes("beta"))).toBe(false);
  });

  it("offers the fields of a group and not the group itself", () => {
    const [row] = selects(render({ field_a: EXPR("x") }));
    expect(row!.map((o) => o.text)).not.toContain("Applicant");
  });

  it("counts a repeated label in catalog order", () => {
    const targets = fieldTargets(
      df([
        { id: "field_n1", key: "name", type: "string", label: { en: "Name" } },
        { id: "field_n2", key: "name_2", type: "string", label: { en: "Name" } },
      ]),
      "en",
      "en",
    );
    const [row] = selects(render({ field_n1: EXPR("x") }, { targets }));
    expect(row!.map((o) => o.text)).toEqual(["Name", "Name (2)"]);
  });

  it("prints a stored id the list no longer holds as the raw id with the unlisted mark", () => {
    const [row] = selects(render({ field_gone: EXPR("x") }));
    expect(row!.find((o) => o.value === "field_gone")?.text).toBe(`field_gone ${studioCatalog.en["mapping.unlistedKey"]}`);
  });

  it("disables in each row the target the other row holds", () => {
    const [rowA, rowB] = selects(render({ field_a: EXPR("x"), field_b: EXPR("y") }));
    expect(rowA!.map((o) => [o.value, o.disabled])).toEqual([
      ["field_a", false],
      ["field_b", true],
    ]);
    expect(rowB!.map((o) => [o.value, o.disabled])).toEqual([
      ["field_a", true],
      ["field_b", false],
    ]);
  });

  it("marks the row's own target as selected", () => {
    const [rowA, rowB] = selects(render({ field_a: EXPR("x"), field_b: EXPR("y") }));
    expect(rowA!.find((o) => o.selected)?.value).toBe("field_a");
    expect(rowB!.find((o) => o.selected)?.value).toBe("field_b");
  });

  it("shows a stored key outside the targets as a marked, selected option", () => {
    const [row] = selects(render({ field_gone: EXPR("x") }));
    const unlisted = row!.find((o) => o.value === "field_gone");
    expect(unlisted?.selected).toBe(true);
    expect(unlisted?.text).toContain("field_gone");
    expect(unlisted?.text).toContain(studioCatalog.en["mapping.unlistedKey"]);
    expect(row!.filter((o) => o.selected)).toHaveLength(1);
  });

  it("shows a stored group key as unlisted, not as a target", () => {
    const [row] = selects(render({ field_g: EXPR("x") }));
    const stored = row!.find((o) => o.value === "field_g");
    expect(stored?.selected).toBe(true);
    expect(stored?.text).toContain(studioCatalog.en["mapping.unlistedKey"]);
  });

  it("marks no option when every stored key is a listed target", () => {
    const [row] = selects(render({ field_a: EXPR("x") }));
    expect(row!.some((o) => o.text.includes(studioCatalog.en["mapping.unlistedKey"]))).toBe(false);
  });

  it("keeps the row of an entry with an empty src", () => {
    const html = render({ field_a: EXPR("") });
    expect(selects(html)).toHaveLength(1);
    expect(html).toContain("REMOVE");
  });

  it("disables add while addDisabled is set", () => {
    expect(render({}, { addDisabled: true })).toMatch(/<button[^>]*disabled=""[^>]*>ADD</);
  });

  it("enables add while a target is free", () => {
    expect(render({ field_a: EXPR("x") })).not.toMatch(/<button[^>]*disabled=""[^>]*>ADD</);
  });

  it("disables add when no target is free", () => {
    const html = render({ field_a: EXPR("x"), field_b: EXPR("y") });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>ADD</);
  });

  it("disables add when the target list is empty", () => {
    expect(render({}, { targets: [] })).toMatch(/<button[^>]*disabled=""[^>]*>ADD</);
  });
});

describe("field expression map logic", () => {
  it("fieldTargets drops groups and id-less entries and labels by label", () => {
    expect(fieldTargets([...FIELDS, ...df([{ key: "orphan", type: "string", label: { en: "Orphan" } }, { id: "field_c", key: "gamma" }])], "en", "en")).toEqual([
      { id: "field_a", label: "Alpha" },
      { id: "field_b", label: "Beta" },
      { id: "field_c", label: studioCatalog.en["condition.unnamedField"] },
    ]);
  });

  it("fieldTargets reads the content locale, else the base locale", () => {
    const fields = df([
      { id: "field_a", key: "alpha", type: "string", label: { en: "Amount", de: "Betrag" } },
      { id: "field_b", key: "beta", type: "string", label: { en: "Applicant" } },
    ]);
    expect(fieldTargets(fields, "de", "en").map((target) => target.label)).toEqual(["Betrag", "Applicant"]);
  });

  it("refTargets drops a group ref and counts a repeated label in the contract's order", () => {
    expect(
      refTargets([
        { id: "field_x", key: "amount", label: "Amount", type: "number" },
        { id: "field_g", key: "applicant", label: "Applicant", type: "group" },
        { id: "field_y", key: "amount_2", label: "Amount", type: "number" },
      ]),
    ).toEqual([
      { id: "field_x", label: "Amount" },
      { id: "field_y", label: "Amount (2)" },
    ]);
  });

  it("rowOptions disables the targets other rows hold, never the row's own", () => {
    const opts = rowOptions(TARGETS, ["field_a", "field_b"], "field_a");
    expect(opts).toEqual([
      { value: "field_a", label: "Alpha", disabled: false, unlisted: false },
      { value: "field_b", label: "Beta", disabled: true, unlisted: false },
    ]);
  });

  it("rowOptions appends an unlisted stored key, enabled", () => {
    const opts = rowOptions(TARGETS, ["field_gone"], "field_gone");
    expect(opts.at(-1)).toEqual({ value: "field_gone", label: "field_gone", disabled: false, unlisted: true });
    expect(opts).toHaveLength(3);
  });

  it("rowOptions marks no stored key as unlisted while the targets are unknown", () => {
    const opts = rowOptions(TARGETS, ["field_gone"], "field_gone", false);
    expect(opts.at(-1)).toEqual({ value: "field_gone", label: "field_gone", disabled: false, unlisted: false });
  });

  it("nextUnusedTarget picks the first target no row holds", () => {
    expect(nextUnusedTarget(TARGETS, [])).toBe("field_a");
    expect(nextUnusedTarget(TARGETS, ["field_a"])).toBe("field_b");
    expect(nextUnusedTarget(TARGETS, ["field_a", "field_b"])).toBeUndefined();
    expect(nextUnusedTarget(fieldTargets([FIELDS[0]!], "en", "en"), [])).toBeUndefined();
  });

  it("editRow keeps an emptied row as an entry with an empty src", () => {
    const next = editRow(m({ field_a: EXPR("x") }), "field_a", undefined);
    expect(next).toEqual(m({ field_a: { lang: "cel", src: "" } }));
    expect(EMPTY_EXPRESSION).toEqual({ lang: "cel", src: "" });
  });

  it("editRow writes the typed expression and leaves other rows alone", () => {
    expect(editRow(m({ field_a: EXPR("x"), field_b: EXPR("y") }), "field_a", EXPR("z"))).toEqual(
      m({ field_a: EXPR("z"), field_b: EXPR("y") }),
    );
  });

  it("editRow on an undefined map starts one", () => {
    expect(editRow(undefined, "field_a", EXPR("z"))).toEqual(m({ field_a: EXPR("z") }));
  });

  it("removeRow takes the row out and keeps the others", () => {
    const mapping = m({ field_a: EXPR("x"), field_b: EXPR("y") });
    expect(removeRow(mapping, "field_a")).toEqual(m({ field_b: EXPR("y") }));
    expect(mapping).toEqual(m({ field_a: EXPR("x"), field_b: EXPR("y") }));
  });

  it("moveRow re-keys a row without duplicating it", () => {
    expect(moveRow(m({ field_a: EXPR("x"), field_b: EXPR("y") }), "field_a", "field_c", EXPR("x"))).toEqual(
      m({ field_b: EXPR("y"), field_c: EXPR("x") }),
    );
  });
});
