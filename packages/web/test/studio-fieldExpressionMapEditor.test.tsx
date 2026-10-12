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
  rowOptions,
  targetsOf,
} from "../src/areas/studio/panels/shared/fieldExpressionMapLogic.js";
import { studioCatalog } from "../src/i18n/catalogs/studio.js";

const FIELDS = [
  { id: "field_g", key: "section", type: "group" },
  { id: "field_a", key: "alpha", type: "string" },
  { id: "field_b", key: "beta", type: "number" },
];
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
  extra: { fields?: typeof FIELDS; addDisabled?: boolean } = {},
): string {
  return renderToStaticMarkup(
    <FieldExpressionMapEditor
      legend="legend"
      addLabel="ADD"
      removeLabel="REMOVE"
      mapping={mapping}
      fields={extra.fields ?? FIELDS}
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

  it("shows each target by key", () => {
    const [row] = selects(render({ field_a: EXPR("x") }));
    expect(row!.map((o) => o.text)).toEqual(["alpha", "beta"]);
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
    expect(render({}, { fields: [] })).toMatch(/<button[^>]*disabled=""[^>]*>ADD</);
  });
});

describe("field expression map logic", () => {
  it("targetsOf drops groups and ids-less entries and labels by key", () => {
    expect(targetsOf([...FIELDS, { key: "orphan", type: "string" }, { id: "field_c" }])).toEqual([
      { id: "field_a", label: "alpha" },
      { id: "field_b", label: "beta" },
      { id: "field_c", label: "field_c" },
    ]);
  });

  it("rowOptions disables the targets other rows hold, never the row's own", () => {
    const opts = rowOptions(targetsOf(FIELDS), ["field_a", "field_b"], "field_a");
    expect(opts).toEqual([
      { value: "field_a", label: "alpha", disabled: false, unlisted: false },
      { value: "field_b", label: "beta", disabled: true, unlisted: false },
    ]);
  });

  it("rowOptions appends an unlisted stored key, enabled", () => {
    const opts = rowOptions(targetsOf(FIELDS), ["field_gone"], "field_gone");
    expect(opts.at(-1)).toEqual({ value: "field_gone", label: "field_gone", disabled: false, unlisted: true });
    expect(opts).toHaveLength(3);
  });

  it("rowOptions marks no stored key as unlisted while the targets are unknown", () => {
    const opts = rowOptions(targetsOf(FIELDS), ["field_gone"], "field_gone", false);
    expect(opts.at(-1)).toEqual({ value: "field_gone", label: "field_gone", disabled: false, unlisted: false });
  });

  it("nextUnusedTarget picks the first non-group target no row holds", () => {
    expect(nextUnusedTarget(FIELDS, [])).toBe("field_a");
    expect(nextUnusedTarget(FIELDS, ["field_a"])).toBe("field_b");
    expect(nextUnusedTarget(FIELDS, ["field_a", "field_b"])).toBeUndefined();
    expect(nextUnusedTarget([FIELDS[0]!], [])).toBeUndefined();
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
