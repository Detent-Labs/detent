import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildOperands,
  celLiteral,
  fromCel,
  operandSignature,
  operatorsFor,
  toCel,
  type Condition,
  type Operand,
} from "../src/areas/studio/panels/shared/conditionLogic.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { FieldDef, ProcessBody } from "workflow-engine/schema";
import { checkAgainstFields } from "workflow-engine/cel/check";

const example = (name: string): ProcessBody => {
  const raw = JSON.parse(readFileSync(new URL(`../../../examples/${name}`, import.meta.url), "utf-8"));
  return (raw.definition ?? raw) as ProcessBody;
};

const operandsOf = (body: ProcessBody, child?: ProcessBody): Operand[] =>
  buildOperands({
    fields: body.fields as DraftField[],
    locale: body.baseLocale,
    baseLocale: body.baseLocale,
    child,
  });

/** A stand-alone catalog, for cases no example covers. */
const field = (key: string, type: string, extra: object = {}): DraftField =>
  ({ id: `field_${key}`, key, label: { en: key }, type, ...extra }) as unknown as DraftField;

const catalog = (fields: DraftField[]): Operand[] =>
  buildOperands({ fields, locale: "en", baseLocale: "en" });

describe("fromCel / toCel round-trip over examples/", () => {
  // The two named normalisations: single quotes become double, and a bare
  // boolean operand becomes an explicit `== true`. Nothing else may move.
  const NORMALISED: Record<string, string> = {
    "data.booking_status == 'booked'": 'data.booking_status == "booked"',
    "data.booking_status == 'failed'": 'data.booking_status == "failed"',
  };

  const cases: [string, string, ProcessBody | undefined][] = [
    ["data.booking_status == 'booked'", "expense-approval.json", undefined],
    ["data.booking_status == 'failed'", "expense-approval.json", undefined],
    ["data.amount > 1000.0", "subprocess-credit-check-child.json", undefined],
    ['child.outcome == "approved"', "subprocess-loan-parent.json", example("subprocess-credit-check-child.json")],
    ['child.outcome == "rejected"', "subprocess-loan-parent.json", example("subprocess-credit-check-child.json")],
  ];

  for (const [src, file, child] of cases) {
    it(`round-trips ${src}`, () => {
      const operands = operandsOf(example(file), child);
      const condition = fromCel(src, operands);
      expect(condition).not.toBeNull();
      expect(toCel(condition!, operands)).toBe(NORMALISED[src] ?? src);
    });
  }

  it("reads every example guard as a comparison row, never a raw fallback", () => {
    for (const [src, file, child] of cases) {
      const operands = operandsOf(example(file), child);
      expect(fromCel(src, operands)!.rows[0].kind).toBe("cmp");
    }
  });
});

describe("fromCel", () => {
  const operands = catalog([field("a", "boolean"), field("b", "boolean"), field("c", "boolean")]);

  it("a && b || c yields the joiner || and a raw row holding a && b", () => {
    const condition = fromCel("data.a && data.b || data.c", operands)!;
    expect(condition.joiner).toBe("||");
    expect(condition.rows).toEqual([
      { kind: "raw", src: "data.a && data.b" },
      { kind: "cmp", operand: "data.c", op: "==", value: true },
    ]);
  });

  it("flattens a left-associative chain of one operator into one row each", () => {
    const condition = fromCel("data.a && data.b && data.c", operands)!;
    expect(condition.joiner).toBe("&&");
    expect(condition.rows.length).toBe(3);
    expect(condition.rows.every((r) => r.kind === "cmp")).toBe(true);
  });

  it("a macro yields a raw row holding exactly that substring", () => {
    const ops = catalog([field("tags", "multiselect"), field("amount", "number")]);
    const src = 'data.tags.exists(t, t == "vip") && data.amount > 1000.0';
    const condition = fromCel(src, ops)!;
    expect(condition.rows[0]).toEqual({ kind: "raw", src: 'data.tags.exists(t, t == "vip")' });
    expect(condition.rows[1]).toEqual({ kind: "cmp", operand: "data.amount", op: ">", value: 1000 });
  });

  it("an unknown operand yields a raw row with its src untouched", () => {
    const condition = fromCel("data.deleted_field == 5", catalog([field("amount", "number")]))!;
    expect(condition.rows).toEqual([{ kind: "raw", src: "data.deleted_field == 5" }]);
  });

  it("returns null when the source does not parse", () => {
    expect(fromCel("data.amount >", catalog([field("amount", "number")]))).toBeNull();
  });

  it("an empty source yields an empty row list, not null", () => {
    expect(fromCel(undefined, [])).toEqual({ joiner: "&&", rows: [] });
    expect(fromCel("   ", [])).toEqual({ joiner: "&&", rows: [] });
  });
});

describe("`in` is the one mirrored form", () => {
  const operands = catalog([field("tags", "multiselect")]);

  it('"manager" in actor.roles reads and re-emits mirrored', () => {
    const src = '"manager" in actor.roles';
    const ops = catalog([]);
    const condition = fromCel(src, ops)!;
    expect(condition.rows).toEqual([{ kind: "cmp", operand: "actor.roles", op: "in", value: "manager" }]);
    expect(toCel(condition, ops)).toBe(src);
  });

  it("a multiselect operand offers contains and nothing else", () => {
    expect(operatorsFor("list<string>")).toEqual(["in"]);
    const condition: Condition = { joiner: "&&", rows: [{ kind: "cmp", operand: "data.tags", op: "in", value: "vip" }] };
    expect(toCel(condition, operands)).toBe('"vip" in data.tags');
  });
});

describe("literals follow the operand's declared type", () => {
  const operands = catalog([field("amount", "number"), field("approved", "boolean"), field("note", "string")]);

  it("a number operand emits the double form, not an int", () => {
    const condition: Condition = { joiner: "&&", rows: [{ kind: "cmp", operand: "data.amount", op: ">", value: "1000" }] };
    expect(toCel(condition, operands)).toBe("data.amount > 1000.0");
    expect(celLiteral(1000, "double")).toBe("1000.0");
    expect(celLiteral(10.5, "double")).toBe("10.5");
  });

  it("a bare boolean operand round-trips as an explicit comparison against true", () => {
    const condition = fromCel("data.approved", operands)!;
    expect(condition.rows).toEqual([{ kind: "cmp", operand: "data.approved", op: "==", value: true }]);
    expect(toCel(condition, operands)).toBe("data.approved == true");
  });

  it("a value holding a double quote and a backslash re-parses after toCel writes it", () => {
    const value = 'he said "hi" \\ bye';
    const condition: Condition = { joiner: "&&", rows: [{ kind: "cmp", operand: "data.note", op: "==", value }] };
    const src = toCel(condition, operands)!;
    expect(src).toBe('data.note == "he said \\"hi\\" \\\\ bye"');
    // The written text must read back to the identical value.
    expect(fromCel(src, operands)!.rows).toEqual([{ kind: "cmp", operand: "data.note", op: "==", value }]);
  });
});

describe("toCel", () => {
  const operands = catalog([field("amount", "number"), field("note", "string")]);

  it("skips an incomplete row, and no usable row yields undefined", () => {
    const half: Condition = { joiner: "&&", rows: [{ kind: "cmp", operand: "data.amount", op: ">", value: undefined }] };
    expect(toCel(half, operands)).toBeUndefined();
    expect(toCel({ joiner: "&&", rows: [] }, operands)).toBeUndefined();

    const mixed: Condition = {
      joiner: "&&",
      rows: [
        { kind: "cmp", operand: "data.amount", op: ">", value: 1000 },
        { kind: "cmp", operand: "data.note", op: "==", value: "" },
      ],
    };
    expect(toCel(mixed, operands)).toBe("data.amount > 1000.0");
  });

  it("parenthesises a raw row as soon as a second row exists", () => {
    const one: Condition = { joiner: "&&", rows: [{ kind: "raw", src: "data.a || data.b" }] };
    expect(toCel(one, operands)).toBe("data.a || data.b");

    const two: Condition = {
      joiner: "&&",
      rows: [{ kind: "raw", src: "data.a || data.b" }, { kind: "cmp", operand: "data.amount", op: ">", value: 1000 }],
    };
    expect(toCel(two, operands)).toBe("(data.a || data.b) && data.amount > 1000.0");
  });

  it("a raw row keeps its exact text when the joiner flips", () => {
    const rows: Condition["rows"] = [
      { kind: "raw", src: "data.a && data.b" },
      { kind: "cmp", operand: "data.amount", op: ">", value: 1000 },
    ];
    expect(toCel({ joiner: "||", rows }, operands)).toBe("(data.a && data.b) || data.amount > 1000.0");
  });
});

describe("the operand picker", () => {
  it("hides the four denied context entries and keeps the two that carry guards", () => {
    const paths = catalog([]).map((o) => o.path);
    expect(paths).toContain("instance.status");
    expect(paths).toContain("actor.roles");
    for (const denied of ["instance.id", "instance.currentStepId", "instance.transitionSeq", "actor.id"]) {
      expect(paths).not.toContain(denied);
    }
  });

  it("is a suggestion list, not a permission gate", () => {
    // Curation restricts nothing: the CEL arm is a plain text input over the
    // same checker every hand-authored guard faces, and that checker still
    // registers every variable the picker declines to suggest.
    const fields = [{ id: "field_amount", key: "amount", label: { en: "amount" }, type: "number" }] as unknown as FieldDef[];
    expect(catalog([field("amount", "number")]).map((o) => o.path)).not.toContain("actor.id");
    expect(checkAgainstFields('actor.id == "usr_x"', fields)).toEqual({ ok: true });
    expect(checkAgainstFields("instance.transitionSeq > 3", fields)).toEqual({ ok: true });
  });

  it("instance.status offers the engine's four statuses", () => {
    const status = catalog([]).find((o) => o.path === "instance.status")!;
    expect(status.options?.map((o) => o.value)).toEqual(["running", "completed", "cancelled", "faulted"]);
  });

  // No `options` IS the free-text path: `ValueEditor` branches on
  // `celType === "bool"` and then on `options?.length`, so an operand with
  // neither takes a plain text input. A `freeText` flag said the same thing
  // and nothing read it (`simplify-web-logic-modules`).
  it("actor.roles and a data-source-bound field enumerate no options", () => {
    const bound = catalog([field("city", "select", { dataSource: "ds_cities" })]);
    expect(bound.find((o) => o.path === "actor.roles")!.options).toBeUndefined();
    expect(bound.find((o) => o.path === "data.city")!.options).toBeUndefined();
  });

  it("a select declaring options offers them by label, writing the value", () => {
    const ops = catalog([
      field("status", "select", { options: [{ value: "booked", label: { en: "Booked" } }] }),
    ]);
    expect(ops.find((o) => o.path === "data.status")!.options).toEqual([{ value: "booked", label: "Booked" }]);
  });

  it("a group contributes its leaves and not itself", () => {
    const group = field("addr", "group", { fields: [field("street", "string"), field("city", "string")] });
    const paths = catalog([group, field("amount", "number")]).map((o) => o.path);
    expect(paths).toContain("data.street");
    expect(paths).toContain("data.city");
    expect(paths).toContain("data.amount");
    expect(paths).not.toContain("data.addr");
  });

  it("an entry shows the field's label with its key beside it", () => {
    expect(catalog([field("amount", "number")]).find((o) => o.path === "data.amount")!.label).toBe("amount (amount)");
  });

  it("operators follow the operand's CEL type", () => {
    expect(operatorsFor("double")).toEqual(["==", "!=", "<", "<=", ">", ">="]);
    expect(operatorsFor("string")).toEqual(["==", "!="]);
    expect(operatorsFor("bool")).toEqual(["==", "!="]);
    expect(operatorsFor("list<string>")).toEqual(["in"]);
  });
});

describe("a subprocess step's child operands", () => {
  const parent = example("subprocess-loan-parent.json");
  const child = example("subprocess-credit-check-child.json");

  it("child.outcome offers exactly the contract's outcomes", () => {
    const outcome = operandsOf(parent, child).find((o) => o.path === "child.outcome")!;
    expect(outcome.options?.map((o) => o.value)).toEqual(child.contract!.outcomes);
    expect(outcome.celType).toBe("string");
  });

  it("child.data covers contract.outputFields alone", () => {
    const paths = operandsOf(parent, child)
      .filter((o) => o.path.startsWith("child.data."))
      .map((o) => o.path);
    // The child declares one field and lists it as its single output field.
    expect(paths).toEqual(["child.data.amount"]);
    expect(child.contract!.outputFields!.length).toBe(paths.length);
  });

  it("a field the contract omits from outputFields is not offered", () => {
    const narrowed = { ...child, contract: { ...child.contract!, outputFields: [] } } as ProcessBody;
    const paths = operandsOf(parent, narrowed).map((o) => o.path);
    expect(paths).toContain("child.outcome");
    expect(paths.some((p) => p.startsWith("child.data."))).toBe(false);
  });

  it("an unresolved child yields neither operand", () => {
    const paths = operandsOf(parent).map((o) => o.path);
    expect(paths.some((p) => p.startsWith("child."))).toBe(false);
  });

  it("a child.outcome guard reads back as a comparison row against the parent's operands", () => {
    const operands = operandsOf(parent, child);
    const condition = fromCel('child.outcome == "approved"', operands)!;
    expect(condition.rows).toEqual([{ kind: "cmp", operand: "child.outcome", op: "==", value: "approved" }]);
  });
});

describe("operandSignature", () => {
  const parent = example("subprocess-loan-parent.json");
  const child = example("subprocess-credit-check-child.json");

  // A builder holds its rows in local state and re-reads only when what it read
  // FROM changes. `src` alone is not that: a child resolving mid-session leaves
  // `src` untouched while turning `child.outcome == "..."` from an unreadable
  // fragment into a comparison row.
  it("changes when a child resolves, so the builder re-reads a raw row", () => {
    const before = operandsOf(parent);
    const after = operandsOf(parent, child);
    expect(operandSignature(before)).not.toBe(operandSignature(after));

    const src = 'child.outcome == "approved"';
    expect(fromCel(src, before)!.rows[0].kind).toBe("raw");
    expect(fromCel(src, after)!.rows[0].kind).toBe("cmp");
  });

  it("changes when a field key changes, so a guard on the old key falls back", () => {
    const before = catalog([field("amount", "number")]);
    const after = catalog([field("total", "number")]);
    expect(operandSignature(before)).not.toBe(operandSignature(after));
  });

  it("changes when a field type changes, since the type governs the row", () => {
    expect(operandSignature(catalog([field("flag", "boolean")]))).not.toBe(
      operandSignature(catalog([field("flag", "string")])),
    );
  });

  it("is stable when only a label changes, which no row reads", () => {
    const a = catalog([{ id: "field_x", key: "x", label: { en: "One" }, type: "string" } as never]);
    const b = catalog([{ id: "field_x", key: "x", label: { en: "Two" }, type: "string" } as never]);
    expect(operandSignature(a)).toBe(operandSignature(b));
  });
});
