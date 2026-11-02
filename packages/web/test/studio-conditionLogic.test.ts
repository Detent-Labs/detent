import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildOperands,
  celLiteral,
  conditionSentence,
  fieldValueCandidates,
  fromCel,
  guardPhrase,
  isComplete,
  newGroup,
  newLeaf,
  operandSignature,
  operatorWord,
  readerSentence,
  operatorsFor,
  rowCount,
  summarizeCondition,
  toCel,
  type CmpOp,
  type Condition,
  type Leaf,
  type Operand,
  type RowValue,
} from "../src/areas/studio/panels/shared/conditionLogic.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import { t } from "../src/areas/studio/catalog.js";
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

/** A literal row value. */
const lit = (value: string | number | boolean | undefined) => ({ kind: "literal" as const, value });

describe("fromCel / toCel round-trip over examples/", () => {
  // The reader's four normalisations: single quotes become double, a bare
  // boolean becomes `== true`, a negated boolean becomes `== false`, and a
  // nested chain of the parent's own operator flattens. Nothing else may move.
  const NORMALISED: Record<string, string> = {
    "data.booking_status == 'booked'": 'data.booking_status == "booked"',
    "data.booking_status == 'failed'": 'data.booking_status == "failed"',
    "data.po_status == 'issued'": 'data.po_status == "issued"',
    "data.po_status == 'failed'": 'data.po_status == "failed"',
  };

  const cases: [string, string, ProcessBody | undefined][] = [
    ["data.booking_status == 'booked'", "expense-approval.json", undefined],
    ["data.booking_status == 'failed'", "expense-approval.json", undefined],
    ["data.amount > 1000.0", "subprocess-credit-check-child.json", undefined],
    ['child.outcome == "approved"', "subprocess-loan-parent.json", example("subprocess-credit-check-child.json")],
    ['child.outcome == "rejected"', "subprocess-loan-parent.json", example("subprocess-credit-check-child.json")],
    ["data.po_status == 'issued'", "purchase-requisition.json", undefined],
    ["data.po_status == 'failed'", "purchase-requisition.json", undefined],
    ["data.received_quantity >= data.quantity", "purchase-requisition.json", undefined],
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
      expect(fromCel(src, operands)!.rows[0]!.kind).toBe("cmp");
    }
  });

  it("reads the examples' field comparison with the other field as its value", () => {
    const operands = operandsOf(example("purchase-requisition.json"));
    expect(fromCel("data.received_quantity >= data.quantity", operands)!.rows).toEqual([
      { kind: "cmp", operand: "data.received_quantity", op: ">=", value: { kind: "field", path: "data.quantity" } },
    ]);
  });

  it("keeps the examples' arithmetic guard as a raw row, written back unchanged", () => {
    const operands = operandsOf(example("purchase-requisition.json"));
    const src = "data.quantity * data.unit_price >= 10000.0";
    const condition = fromCel(src, operands)!;
    expect(condition.rows).toEqual([{ kind: "raw", src }]);
    expect(toCel(condition, operands)).toBe(src);
  });

  it("writes text the CEL check accepts for every example guard", () => {
    for (const [src, file, child] of cases) {
      const body = example(file);
      const written = toCel(fromCel(src, operandsOf(body, child))!, operandsOf(body, child))!;
      if (child) continue; // `child` is no namespace `checkAgainstFields` declares.
      expect(checkAgainstFields(written, body.fields)).toEqual({ ok: true });
    }
  });
});

describe("fromCel", () => {
  const operands = catalog([field("a", "boolean"), field("b", "boolean"), field("c", "boolean")]);

  it("a && b || c yields the joiner || and a group holding a and b, then c", () => {
    const condition = fromCel("data.a && data.b || data.c", operands)!;
    expect(condition.joiner).toBe("||");
    expect(condition.rows).toEqual([
      {
        kind: "group",
        joiner: "&&",
        rows: [
          { kind: "cmp", operand: "data.a", op: "==", value: lit(true) },
          { kind: "cmp", operand: "data.b", op: "==", value: lit(true) },
        ],
      },
      { kind: "cmp", operand: "data.c", op: "==", value: lit(true) },
    ]);
  });

  it("flattens a left-associative chain of one operator into one row each", () => {
    const condition = fromCel("data.a && data.b && data.c", operands)!;
    expect(condition.joiner).toBe("&&");
    expect(condition.rows.length).toBe(3);
    expect(condition.rows.every((r) => r.kind === "cmp")).toBe(true);
  });

  it("a macro yields a raw row holding exactly that substring", () => {
    const ops = catalog([field("tags", "list"), field("amount", "number")]);
    const src = 'data.tags.exists(t, t == "vip") && data.amount > 1000.0';
    const condition = fromCel(src, ops)!;
    expect(condition.rows[0]).toEqual({ kind: "raw", src: 'data.tags.exists(t, t == "vip")' });
    expect(condition.rows[1]).toEqual({ kind: "cmp", operand: "data.amount", op: ">", value: lit(1000) });
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
  const operands = catalog([field("tags", "list")]);

  it('"manager" in actor.roles reads and re-emits mirrored', () => {
    const src = '"manager" in actor.roles';
    const ops = catalog([]);
    const condition = fromCel(src, ops)!;
    expect(condition.rows).toEqual([{ kind: "cmp", operand: "actor.roles", op: "in", value: lit("manager") }]);
    expect(toCel(condition, ops)).toBe(src);
  });

  it("a list operand offers the membership pair and nothing else", () => {
    expect(operatorsFor("list<string>")).toEqual(["in", "!in"]);
    const condition: Condition = { joiner: "&&", rows: [{ kind: "cmp", operand: "data.tags", op: "in", value: lit("vip") }] };
    expect(toCel(condition, operands)).toBe('"vip" in data.tags');
  });
});

describe("literals follow the operand's declared type", () => {
  const operands = catalog([field("amount", "number"), field("approved", "boolean"), field("note", "string")]);

  it("a number operand emits the double form, not an int", () => {
    const condition: Condition = { joiner: "&&", rows: [{ kind: "cmp", operand: "data.amount", op: ">", value: lit("1000") }] };
    expect(toCel(condition, operands)).toBe("data.amount > 1000.0");
    expect(celLiteral(1000, "double")).toBe("1000.0");
    expect(celLiteral(10.5, "double")).toBe("10.5");
  });

  it("an integer operand emits a bare integer, since int and double do not mix", () => {
    const ints = catalog([field("prioritaet", "number", { format: "integer" })]);
    const operand = ints.find((o) => o.path === "data.prioritaet")!;
    expect(operand.celType).toBe("int");
    const condition: Condition = { joiner: "&&", rows: [{ kind: "cmp", operand: "data.prioritaet", op: ">", value: lit("3") }] };
    expect(toCel(condition, ints)).toBe("data.prioritaet > 3");
    // A decimal is no `int` literal at all, so the row stays incomplete
    // rather than emitting text the publish-time check refuses.
    expect(celLiteral(3.5, "int")).toBeUndefined();
  });

  it("an integer operand keeps the full comparator set", () => {
    expect(operatorsFor("int")).toEqual(["==", "!=", "<", "<=", ">", ">="]);
  });

  it("a bare boolean operand round-trips as an explicit comparison against true", () => {
    const condition = fromCel("data.approved", operands)!;
    expect(condition.rows).toEqual([{ kind: "cmp", operand: "data.approved", op: "==", value: lit(true) }]);
    expect(toCel(condition, operands)).toBe("data.approved == true");
  });

  it("a value holding a double quote and a backslash re-parses after toCel writes it", () => {
    const value = 'he said "hi" \\ bye';
    const condition: Condition = { joiner: "&&", rows: [{ kind: "cmp", operand: "data.note", op: "==", value: lit(value) }] };
    const src = toCel(condition, operands)!;
    expect(src).toBe('data.note == "he said \\"hi\\" \\\\ bye"');
    // The written text must read back to the identical value.
    expect(fromCel(src, operands)!.rows).toEqual([{ kind: "cmp", operand: "data.note", op: "==", value: lit(value) }]);
  });
});

describe("the builder reads back every literal it writes", () => {
  const operands = catalog([
    field("amount", "number"),
    field("prioritaet", "number", { format: "integer" }),
    field("approved", "boolean"),
    field("note", "string"),
  ]);

  const cmp = (src: string) => fromCel(src, operands)!.rows;

  it("an integer literal reads as a comparison row", () => {
    expect(cmp("data.prioritaet > 3")).toEqual([{ kind: "cmp", operand: "data.prioritaet", op: ">", value: lit(3) }]);
  });

  it("a negative double reads as a comparison row", () => {
    expect(cmp("data.amount > -5.0")).toEqual([{ kind: "cmp", operand: "data.amount", op: ">", value: lit(-5) }]);
  });

  it("a double with an exponent is written as valid CEL and reads back", () => {
    expect(celLiteral(1e21, "double")).toBe("1e+21");
    const condition: Condition = { joiner: "&&", rows: [{ kind: "cmp", operand: "data.amount", op: ">", value: lit(1e21) }] };
    const src = toCel(condition, operands)!;
    expect(src).toBe("data.amount > 1e+21");
    expect(cmp(src)).toEqual(condition.rows);
    const fields = [{ id: "field_amount", key: "amount", label: { en: "amount" }, type: "number" }] as unknown as FieldDef[];
    expect(checkAgainstFields(src, fields)).toEqual({ ok: true });
  });

  it("a nested minus folds twice", () => {
    expect(cmp("data.prioritaet > --5")).toEqual([{ kind: "cmp", operand: "data.prioritaet", op: ">", value: lit(5) }]);
  });

  it("an integer beyond the safe range stays a raw row", () => {
    expect(cmp("data.prioritaet == 9007199254740993")).toEqual([{ kind: "raw", src: "data.prioritaet == 9007199254740993" }]);
    expect(cmp("data.prioritaet == -9007199254740993")).toEqual([{ kind: "raw", src: "data.prioritaet == -9007199254740993" }]);
  });

  it("a minus over a non-numeric node stays a raw row", () => {
    expect(cmp("data.amount > -data.amount")).toEqual([{ kind: "raw", src: "data.amount > -data.amount" }]);
  });

  it("an integer operand takes a safe integer only", () => {
    expect(celLiteral(9007199254740991, "int")).toBe("9007199254740991");
    // Built from text: a numeric literal past the safe range is a lint error,
    // and it rounds to the same number this produces.
    expect(celLiteral(Number("9007199254740993"), "int")).toBeUndefined();
    expect(celLiteral(1e21, "int")).toBeUndefined();
  });

  it("a fractional double keeps its text", () => {
    expect(celLiteral(1.5e-7, "double")).toBe("1.5e-7");
    expect(celLiteral(-0.25, "double")).toBe("-0.25");
  });

  // One row per type, written with `toCel` and read with `fromCel`.
  const roundTrip: [string, Condition["rows"][number]][] = [
    ["string", { kind: "cmp", operand: "data.note", op: "==", value: lit("he said \"hi\"") }],
    ["bool true", { kind: "cmp", operand: "data.approved", op: "==", value: lit(true) }],
    ["bool false", { kind: "cmp", operand: "data.approved", op: "!=", value: lit(false) }],
    ["int", { kind: "cmp", operand: "data.prioritaet", op: ">=", value: lit(3) }],
    ["negative int", { kind: "cmp", operand: "data.prioritaet", op: "<", value: lit(-3) }],
    ["double", { kind: "cmp", operand: "data.amount", op: "<=", value: lit(1000) }],
    ["negative double", { kind: "cmp", operand: "data.amount", op: ">", value: lit(-5) }],
    ["fractional double", { kind: "cmp", operand: "data.amount", op: "==", value: lit(10.5) }],
    ["double with an exponent", { kind: "cmp", operand: "data.amount", op: "<", value: lit(1e21) }],
    ["small double with an exponent", { kind: "cmp", operand: "data.amount", op: ">", value: lit(1.5e-7) }],
    ["list contains", { kind: "cmp", operand: "actor.roles", op: "in", value: lit("manager") }],
  ];

  for (const [name, row] of roundTrip) {
    it(`round-trips a ${name} row`, () => {
      const condition: Condition = { joiner: "&&", rows: [row] };
      const src = toCel(condition, operands)!;
      expect(fromCel(src, operands)!.rows).toEqual([row]);
    });
  }
});

describe("toCel", () => {
  const operands = catalog([field("amount", "number"), field("note", "string")]);

  it("skips an incomplete row, and no usable row yields undefined", () => {
    const half: Condition = { joiner: "&&", rows: [{ kind: "cmp", operand: "data.amount", op: ">", value: lit(undefined) }] };
    expect(toCel(half, operands)).toBeUndefined();
    expect(toCel({ joiner: "&&", rows: [] }, operands)).toBeUndefined();

    const mixed: Condition = {
      joiner: "&&",
      rows: [
        { kind: "cmp", operand: "data.amount", op: ">", value: lit(1000) },
        { kind: "cmp", operand: "data.note", op: "==", value: lit("") },
      ],
    };
    expect(toCel(mixed, operands)).toBe("data.amount > 1000.0");
  });

  it("parenthesises a raw row as soon as a second row exists", () => {
    const one: Condition = { joiner: "&&", rows: [{ kind: "raw", src: "data.a || data.b" }] };
    expect(toCel(one, operands)).toBe("data.a || data.b");

    const two: Condition = {
      joiner: "&&",
      rows: [{ kind: "raw", src: "data.a || data.b" }, { kind: "cmp", operand: "data.amount", op: ">", value: lit(1000) }],
    };
    expect(toCel(two, operands)).toBe("(data.a || data.b) && data.amount > 1000.0");
  });

  it("a raw row keeps its exact text when the joiner flips", () => {
    const rows: Condition["rows"] = [
      { kind: "raw", src: "data.a && data.b" },
      { kind: "cmp", operand: "data.amount", op: ">", value: lit(1000) },
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

  it("instance.status offers the engine's four statuses, labeled from the catalog", () => {
    const status = catalog([]).find((o) => o.path === "instance.status")!;
    expect(status.options).toEqual([
      { value: "running", label: t("condition.status.running") },
      { value: "completed", label: t("condition.status.completed") },
      { value: "cancelled", label: t("condition.status.cancelled") },
      { value: "faulted", label: t("condition.status.faulted") },
    ]);
  });

  it("labels the case's status and the person's roles in words", () => {
    const ops = catalog([]);
    expect(ops.find((o) => o.path === "instance.status")!.label).toBe("The case's status");
    expect(ops.find((o) => o.path === "actor.roles")!.label).toBe("The person's roles");
  });

  it("gives the case's status and the person's roles a lower-case form for a clause", () => {
    const ops = catalog([field("amount", "number")]);
    expect(ops.find((o) => o.path === "instance.status")!.clauseLabel).toBe("the case's status");
    expect(ops.find((o) => o.path === "actor.roles")!.clauseLabel).toBe("the person's roles");
    expect(ops.find((o) => o.path === "data.amount")!.clauseLabel).toBeUndefined();
  });

  // No `options` IS the free-text path: `ValueEditor` branches on
  // `celType === "bool"` and then on `options?.length`, so an operand with
  // neither takes a plain text input. A `freeText` flag said the same thing
  // and nothing read it (`simplify-web-logic-modules`).
  it("actor.roles and a data-source-bound field enumerate no options", () => {
    const bound = catalog([field("city", "string", { dataSource: "ds_cities" })]);
    expect(bound.find((o) => o.path === "actor.roles")!.options).toBeUndefined();
    expect(bound.find((o) => o.path === "data.city")!.options).toBeUndefined();
  });

  it("a string field declaring options offers them by label, writing the value", () => {
    const ops = catalog([
      field("status", "string", { options: [{ value: "booked", label: { en: "Booked" } }] }),
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

  it("an entry shows the field's label alone, with no key beside it", () => {
    const ops = catalog([{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" } as never]);
    expect(ops.find((o) => o.path === "data.amount")!.label).toBe("Amount");
  });

  it("a field with no label reads as an unnamed field, not as its key", () => {
    const ops = catalog([
      { id: "field_a", key: "a", type: "string" } as never,
      { id: "field_b", key: "b", label: { en: "" }, type: "string" } as never,
    ]);
    expect(ops.find((o) => o.path === "data.a")!.label).toBe("(unnamed field)");
    // A second unnamed field shares that label, so it takes a count too.
    expect(ops.find((o) => o.path === "data.b")!.label).toBe("(unnamed field) (2)");
  });

  it("two fields sharing a label stay apart, counted in catalog order", () => {
    const ops = catalog([
      { id: "field_n1", key: "first_name", label: { en: "Name" }, type: "string" } as never,
      { id: "field_n2", key: "last_name", label: { en: "Name" }, type: "string" } as never,
      { id: "field_n3", key: "nick_name", label: { en: "Name" }, type: "string" } as never,
      { id: "field_c", key: "city", label: { en: "City" }, type: "string" } as never,
    ]);
    expect(ops.filter((o) => o.group === "fields").map((o) => o.label)).toEqual(["Name", "Name (2)", "Name (3)", "City"]);
  });

  it("lists the fields first, then the case, then the person, each under its group", () => {
    const ops = catalog([field("amount", "number"), field("note", "string")]);
    expect(ops.map((o) => [o.path, o.group])).toEqual([
      ["data.amount", "fields"],
      ["data.note", "fields"],
      ["instance.status", "case"],
      ["actor.roles", "person"],
    ]);
  });

  it("operators follow the operand's CEL type", () => {
    expect(operatorsFor("double")).toEqual(["==", "!=", "<", "<=", ">", ">="]);
    expect(operatorsFor("string")).toEqual(["==", "!="]);
    expect(operatorsFor("bool")).toEqual(["==", "!="]);
    expect(operatorsFor("list<string>")).toEqual(["in", "!in"]);
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

  it("the child's operands stand between the fields and the case, under their own group", () => {
    const ops = operandsOf(parent, child);
    const groups = ops.map((o) => o.group);
    const firstChild = groups.indexOf("child");
    expect(groups.lastIndexOf("fields")).toBeLessThan(firstChild);
    expect(groups.lastIndexOf("child")).toBeLessThan(groups.indexOf("case"));
    expect(groups.indexOf("case")).toBeLessThan(groups.indexOf("person"));
  });

  it("labels the child's outcome and its fields in words", () => {
    const ops = operandsOf(parent, child);
    expect(ops.find((o) => o.path === "child.outcome")!.label).toBe("How the called process ended");
    expect(ops.find((o) => o.path === "child.outcome")!.clauseLabel).toBe("how the called process ended");
    expect(ops.find((o) => o.path === "child.data.amount")!.label).toBe("Amount, from the called process");
  });

  it("an unresolved child yields neither operand", () => {
    const paths = operandsOf(parent).map((o) => o.path);
    expect(paths.some((p) => p.startsWith("child."))).toBe(false);
  });

  it("a child.outcome guard reads back as a comparison row against the parent's operands", () => {
    const operands = operandsOf(parent, child);
    const condition = fromCel('child.outcome == "approved"', operands)!;
    expect(condition.rows).toEqual([{ kind: "cmp", operand: "child.outcome", op: "==", value: lit("approved") }]);
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

describe("summarizeCondition", () => {
  it("summarizes a single comparison row in the clause's words", () => {
    const operands = catalog([field("amount", "number")]);
    const condition = fromCel("data.amount > 1000.0", operands)!;
    expect(summarizeCondition(condition, operands)).toBe("amount is greater than 1,000");
  });

  it("uses an option's own label for a coded value", () => {
    const operands = catalog([
      field("status", "string", {
        options: [
          { value: "approved", label: { en: "Approved" } },
          { value: "rejected", label: { en: "Rejected" } },
        ],
      }),
    ]);
    const condition = fromCel('data.status == "approved"', operands)!;
    expect(summarizeCondition(condition, operands)).toBe("status is Approved");
  });

  it("reads a boolean row with the is or is not clause and the value yes or no", () => {
    const operands = catalog([field("flagged", "boolean")]);
    expect(summarizeCondition(fromCel("data.flagged", operands)!, operands)).toBe("flagged is yes");
    expect(summarizeCondition(fromCel("data.flagged == false", operands)!, operands)).toBe("flagged is no");
    expect(summarizeCondition(fromCel("data.flagged != true", operands)!, operands)).toBe("flagged is not yes");
  });

  it("reads every operator through its own clause", () => {
    const operands = catalog([field("amount", "number")]);
    const read = (src: string) => summarizeCondition(fromCel(src, operands)!, operands);
    expect(read("data.amount == 5.0")).toBe("amount is 5");
    expect(read("data.amount != 5.0")).toBe("amount is not 5");
    expect(read("data.amount < 5.0")).toBe("amount is less than 5");
    expect(read("data.amount <= 5.0")).toBe("amount is at most 5");
    expect(read("data.amount > 5.0")).toBe("amount is greater than 5");
    expect(read("data.amount >= 5.0")).toBe("amount is at least 5");
    expect(read('"manager" in actor.roles')).toBe("“manager” is one of the person's roles");
    expect(read('!("manager" in actor.roles)')).toBe("“manager” is not one of the person's roles");
  });

  it("formats a number with no digit lost, and a date as a date", () => {
    const operands = catalog([field("amount", "number"), field("due", "string", { format: "date" })]);
    const read = (src: string) => summarizeCondition(fromCel(src, operands)!, operands);
    expect(read("data.amount > 1234567.125")).toBe("amount is greater than 1,234,567.125");
    expect(read("data.amount > 1.5e-7")).toBe("amount is greater than 0.00000015");
    expect(read('data.due == "2026-10-31"')).toBe("due is Oct 31, 2026");
  });

  it("puts free text in curly quotes", () => {
    const operands = catalog([field("city", "string")]);
    expect(summarizeCondition(fromCel('data.city == "Bern"', operands)!, operands)).toBe("city is “Bern”");
  });

  it("reads a case status value as its catalog word", () => {
    const operands = catalog([]);
    expect(summarizeCondition(fromCel('instance.status == "running"', operands)!, operands)).toBe("the case's status is running");
  });

  it("joins two rows with the condition's own joiner, in words", () => {
    const operands = catalog([field("amount", "number"), field("flagged", "boolean")]);
    const condition = fromCel("data.amount > 1000.0 || data.flagged", operands)!;
    expect(summarizeCondition(condition, operands)).toBe("amount is greater than 1,000 or flagged is yes");
  });

  it("reads a raw row as the catalog's phrase, never its CEL text", () => {
    const operands = catalog([field("amount", "number")]);
    const src = "data.amount * 2.0 > 1000.0";
    const condition = fromCel(src, operands)!;
    expect(condition.rows[0].kind).toBe("raw");
    expect(summarizeCondition(condition, operands)).toBe("a hand-written rule");
    expect(summarizeCondition(condition, operands)).not.toContain("data.amount");
  });

  it("fills a value holding a placeholder or a $ pattern as written", () => {
    const operands = catalog([field("note", "string")]);
    const condition: Condition = { joiner: "&&", rows: [{ kind: "cmp", operand: "data.note", op: "==", value: lit("{right} $& {field}") }] };
    expect(summarizeCondition(condition, operands)).toBe("note is “{right} $& {field}”");
  });

  it("returns an empty string for a condition with no complete row", () => {
    expect(summarizeCondition({ joiner: "&&", rows: [] }, [])).toBe("");
  });
});

describe("guardPhrase", () => {
  it("reads the clause words when the guard parses, with no capital added", () => {
    const operands = catalog([field("amount", "number")]);
    expect(guardPhrase("data.amount > 1000.0", operands)).toBe("amount is greater than 1,000");
  });

  it("reads a raw row beside a readable row as the builder's phrase, not its CEL text", () => {
    const operands = catalog([field("tags", "list"), field("amount", "number")]);
    const src = 'data.tags.exists(t, t == "vip") && data.amount > 1000.0';
    expect(guardPhrase(src, operands)).toBe("a hand-written rule and amount is greater than 1,000");
  });

  it("reads a fragment the builder cannot represent at all as a hand-written rule holding", () => {
    const operands = catalog([field("amount", "number")]);
    const src = "!(data.amount > 1000.0)";
    const condition = fromCel(src, operands)!;
    expect(condition.rows).toEqual([{ kind: "raw", src }]);
    expect(guardPhrase(src, operands)).toBe(t("condition.handWrittenHolds"));
  });

  it("reads source that does not parse as a hand-written rule holding", () => {
    expect(guardPhrase("data.amount >", catalog([field("amount", "number")]))).toBe(t("condition.handWrittenHolds"));
  });
});

describe("conditionSentence", () => {
  const operands = catalog([
    { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" } as never,
    {
      id: "field_status",
      key: "status",
      label: { en: "Status" },
      type: "string",
      options: [{ value: "approved", label: { en: "Approved" } }],
    } as never,
    { id: "field_approved", key: "approved", label: { en: "Approved" }, type: "boolean" } as never,
    { id: "field_city", key: "city", label: { en: "City" }, type: "string" } as never,
    { id: "field_tags", key: "tags", label: { en: "Tags" }, type: "list" } as never,
  ]);
  const read = (src: string) => conditionSentence(fromCel(src, operands)!, operands, src);

  it("reads a complete two-row guard as one sentence, ending in a period", () => {
    expect(read('data.amount > 1000.0 && data.status == "approved"')).toBe("Amount is greater than 1,000 and Status is Approved.");
  });

  it("reads a boolean row as yes or no", () => {
    expect(read("data.approved == false")).toBe("Approved is no.");
  });

  it("puts free text in curly quotes", () => {
    expect(read('data.city == "Bern"')).toBe("City is “Bern”.");
  });

  it("reads a raw row as a hand-written rule, capitalized at the head", () => {
    expect(read('data.tags.exists(t, t == "vip") && data.amount > 1000.0')).toBe(
      "A hand-written rule and Amount is greater than 1,000.",
    );
  });

  it("capitalizes a context operand's clause at the head of the sentence", () => {
    expect(read('instance.status == "running" && data.amount > 1000.0')).toBe(
      "The case's status is running and Amount is greater than 1,000.",
    );
  });

  it("keeps a context operand's clause lower case mid-sentence", () => {
    expect(read('data.amount > 1000.0 && instance.status == "running"')).toBe(
      "Amount is greater than 1,000 and the case's status is running.",
    );
    expect(read('data.amount > 1000.0 || "manager" in actor.roles')).toBe(
      "Amount is greater than 1,000 or “manager” is one of the person's roles.",
    );
  });

  it("says an empty site always matches", () => {
    expect(conditionSentence({ joiner: "&&", rows: [] }, operands, undefined)).toBe("No condition yet: this always matches.");
    expect(conditionSentence({ joiner: "&&", rows: [] }, operands, "  ")).toBe("No condition yet: this always matches.");
  });

  it("holds the stored condition while no row is finished", () => {
    const unfinished: Condition = { joiner: "&&", rows: [{ kind: "cmp", operand: "data.city", op: "==", value: lit(undefined) }] };
    expect(conditionSentence(unfinished, operands, "data.amount > 1000.0")).toBe(
      "Until you finish the row, the condition stays: Amount is greater than 1,000.",
    );
  });

  it("asks for a finished row when nothing is stored", () => {
    const unfinished: Condition = { joiner: "&&", rows: [{ kind: "cmp", operand: "data.amount", op: ">", value: lit(undefined) }] };
    expect(conditionSentence(unfinished, operands, undefined)).toBe("Finish a row to set the condition.");
  });

  it("asks for a finished row when the stored source does not parse", () => {
    const unfinished: Condition = { joiner: "&&", rows: [{ kind: "cmp", operand: "data.amount", op: ">", value: lit(undefined) }] };
    expect(conditionSentence(unfinished, operands, "data.amount >")).toBe("Finish a row to set the condition.");
  });
});

// `studio-condition-builder`: "A condition reads as a sentence outside the builder".
describe("readerSentence", () => {
  const operands = catalog([
    { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" } as never,
    { id: "field_status", key: "status", label: { en: "Status" }, type: "string" } as never,
  ]);

  it("reads a guard in words", () => {
    expect(readerSentence("data.amount > 1000.0", operands)).toBe("Amount is greater than 1,000.");
  });

  it("reads source that does not parse as a hand-written rule, with no CEL", () => {
    const sentence = readerSentence("data.amount >", operands);
    expect(sentence).toBe("A hand-written rule.");
    expect(sentence).not.toContain("data.");
  });

  it("joins a two-row condition the way the builder's sentence does", () => {
    expect(readerSentence('data.amount > 1000.0 && data.status == "open"', operands)).toBe(
      "Amount is greater than 1,000 and Status is “open”.",
    );
  });

  it("reads a row the builder cannot read as the catalog's phrase, never as CEL", () => {
    const sentence = readerSentence("data.amount > 1000.0 || !(data.status == \"open\")", operands);
    expect(sentence).toBe("Amount is greater than 1,000 or a hand-written rule.");
    expect(sentence).not.toContain("data.");
  });

  it("reads source with no row, or with a raw row alone, as a hand-written rule", () => {
    expect(readerSentence("", operands)).toBe("A hand-written rule.");
    expect(readerSentence('data.unknown == "x"', operands)).toBe("A hand-written rule.");
  });
});

// --- studio-condition-builder: groups, field values, negation, dates -------

const cmpRow = (operand: string, op: CmpOp, value: RowValue): Leaf => ({ kind: "cmp", operand, op, value });

/** The engine-side catalog for `checkAgainstFields`, from the same stand-alone fields. */
const fieldDefs = (fields: DraftField[]): FieldDef[] => fields as unknown as FieldDef[];

const labeled = (key: string, label: string, type: string, extra: object = {}): DraftField =>
  ({ id: `field_${key}`, key, label: { en: label }, type, ...extra }) as unknown as DraftField;

const DEPARTMENT = labeled("department", "Department", "string", {
  options: [
    { value: "sales", label: { en: "Sales" } },
    { value: "marketing", label: { en: "Marketing" } },
  ],
});
const GROUP_FIELDS = [
  labeled("amount", "Amount", "number"),
  DEPARTMENT,
  labeled("region", "Region", "string"),
  labeled("tier", "Tier", "string"),
];
const GROUPED = 'data.amount > 1000.0 && (data.department == "sales" || data.department == "marketing")';

describe("a group holds rows of its own, one level deep", () => {
  const operands = catalog(GROUP_FIELDS);
  const sales = cmpRow("data.department", "==", lit("sales"));
  const marketing = cmpRow("data.department", "==", lit("marketing"));
  const amount = cmpRow("data.amount", ">", lit(1000));

  it("writes an or-group under and in parentheses", () => {
    const condition: Condition = { joiner: "&&", rows: [amount, { kind: "group", joiner: "||", rows: [sales, marketing] }] };
    const src = toCel(condition, operands)!;
    expect(src).toBe(GROUPED);
    expect(checkAgainstFields(src, fieldDefs(GROUP_FIELDS))).toEqual({ ok: true });
  });

  it("reads a parenthesised or-chain back as a group of two comparison rows", () => {
    const condition = fromCel(GROUPED, operands)!;
    expect(condition.joiner).toBe("&&");
    expect(condition.rows).toEqual([amount, { kind: "group", joiner: "||", rows: [sales, marketing] }]);
  });

  it("reads an or over an and-chain as a row and an and-group", () => {
    const ops = catalog([field("a", "string"), field("b", "string"), field("c", "number")]);
    const condition = fromCel('data.a == "x" || data.b == "y" && data.c > 1.0', ops)!;
    expect(condition.joiner).toBe("||");
    expect(condition.rows[0]).toEqual(cmpRow("data.a", "==", lit("x")));
    expect(condition.rows[1]).toEqual({
      kind: "group",
      joiner: "&&",
      rows: [cmpRow("data.b", "==", lit("y")), cmpRow("data.c", ">", lit(1))],
    });
  });

  it("flattens a nested chain of the condition's own operator on either side", () => {
    const ops = catalog([field("a", "string"), field("b", "string"), field("c", "number")]);
    for (const src of ['data.a == "x" && (data.b == "y" && data.c > 1.0)', '(data.a == "x" && data.b == "y") && data.c > 1.0']) {
      const condition = fromCel(src, ops)!;
      expect(condition.rows.map((r) => r.kind)).toEqual(["cmp", "cmp", "cmp"]);
    }
  });

  it("reads a group inside a group as a raw row inside the group, and writes it back unchanged", () => {
    const src = '(data.department == "sales" || (data.region == "eu" && data.tier == "gold")) && data.amount > 1000.0';
    const condition = fromCel(src, operands)!;
    expect(condition.rows).toEqual([
      { kind: "group", joiner: "||", rows: [sales, { kind: "raw", src: 'data.region == "eu" && data.tier == "gold"' }] },
      amount,
    ]);
    expect(toCel(condition, operands)).toBe(src);
    expect(conditionSentence(condition, operands, src)).toBe(
      "Either Department is Sales or a hand-written rule, and Amount is greater than 1,000.",
    );
  });

  it("writes a group of one complete row as that row, bare", () => {
    const half = cmpRow("data.department", "==", lit(undefined));
    const beside: Condition = { joiner: "&&", rows: [amount, { kind: "group", joiner: "||", rows: [sales, half] }] };
    expect(toCel(beside, operands)).toBe('data.amount > 1000.0 && data.department == "sales"');
    const alone: Condition = { joiner: "&&", rows: [{ kind: "group", joiner: "||", rows: [sales, half] }] };
    const bare = toCel(alone, operands)!;
    expect(bare).toBe('data.department == "sales"');
    expect(checkAgainstFields(bare, fieldDefs(GROUP_FIELDS))).toEqual({ ok: true });
  });

  it("writes a raw row in a one-row group as a raw row at the group's level", () => {
    const raw: Leaf = { kind: "raw", src: "data.a || data.b" };
    const condition: Condition = { joiner: "&&", rows: [amount, { kind: "group", joiner: "||", rows: [raw] }] };
    expect(toCel(condition, operands)).toBe("data.amount > 1000.0 && (data.a || data.b)");
  });

  it("writes a group with no complete row as nothing", () => {
    const empty: Condition = { joiner: "&&", rows: [{ kind: "group", joiner: "||", rows: [cmpRow("data.amount", ">", lit(undefined))] }] };
    expect(toCel(empty, operands)).toBeUndefined();
  });

  it("parenthesises a raw row inside a group of two written rows", () => {
    const condition: Condition = {
      joiner: "&&",
      rows: [amount, { kind: "group", joiner: "||", rows: [sales, { kind: "raw", src: "data.a && data.b" }] }],
    };
    expect(toCel(condition, operands)).toBe('data.amount > 1000.0 && (data.department == "sales" || (data.a && data.b))');
  });

  it("writes a group of two with no parentheses when it is the only part", () => {
    const condition: Condition = { joiner: "&&", rows: [{ kind: "group", joiner: "||", rows: [sales, marketing] }] };
    expect(toCel(condition, operands)).toBe('data.department == "sales" || data.department == "marketing"');
  });

  it("writes a group on the condition's own joiner in parentheses, which reads back flat", () => {
    const condition: Condition = { joiner: "&&", rows: [amount, { kind: "group", joiner: "&&", rows: [sales, marketing] }] };
    const src = toCel(condition, operands)!;
    expect(src).toBe('data.amount > 1000.0 && (data.department == "sales" && data.department == "marketing")');
    expect(checkAgainstFields(src, fieldDefs(GROUP_FIELDS))).toEqual({ ok: true });
    expect(fromCel(src, operands)!.rows).toEqual([amount, sales, marketing]);
  });

  it("marks a group with no complete row incomplete, and one with a complete row complete", () => {
    const byPath = new Map(operands.map((o) => [o.path, o]));
    expect(isComplete({ kind: "group", joiner: "||", rows: [cmpRow("data.amount", ">", lit(undefined))] }, byPath)).toBe(false);
    expect(isComplete({ kind: "group", joiner: "||", rows: [] }, byPath)).toBe(false);
    expect(isComplete({ kind: "group", joiner: "||", rows: [sales, cmpRow("data.amount", ">", lit(undefined))] }, byPath)).toBe(true);
  });

  it("holds the stored condition while a new group has no finished row", () => {
    const stored = "data.amount > 1000.0";
    const condition = fromCel(stored, operands)!;
    const next: Condition = { ...condition, rows: [...condition.rows, newGroup(condition.joiner, operands)] };
    expect(toCel(next, operands)).toBe(stored);
    expect(t("condition.groupRow.incomplete")).toBe("Needs a finished row before it is written.");
  });

  it("counts the leaves and the groups", () => {
    expect(rowCount({ joiner: "&&", rows: [] })).toBe(0);
    expect(rowCount(fromCel(GROUPED, operands)!)).toBe(4);
    expect(rowCount({ joiner: "&&", rows: [{ kind: "group", joiner: "||", rows: [] }] })).toBe(1);
  });

  it("starts a new group with one fresh row, on the joiner opposite to the one it joins", () => {
    expect(newGroup("&&", operands)).toEqual({ kind: "group", joiner: "||", rows: [newLeaf(operands)] });
    expect(newGroup("||", operands).joiner).toBe("&&");
    expect(newLeaf(operands)).toEqual(cmpRow("data.amount", "==", lit(undefined)));
    expect(newLeaf([])).toEqual(cmpRow("", "==", lit(undefined)));
  });

  it("round-trips the examples' grouped shapes through the CEL check", () => {
    const shapes = [
      GROUPED,
      'data.department == "sales" || (data.amount > 5.0 && data.region == "eu")',
      '(data.department == "sales" || data.region == "eu") && (data.amount > 5.0 || data.tier == "gold")',
    ];
    for (const src of shapes) {
      const written = toCel(fromCel(src, operands)!, operands)!;
      expect(written).toBe(src);
      expect(checkAgainstFields(written, fieldDefs(GROUP_FIELDS))).toEqual({ ok: true });
    }
  });
});

describe("a row compares against another field", () => {
  const DATES = [
    labeled("start_date", "Start date", "string", { format: "date" }),
    labeled("end_date", "End date", "string", { format: "date" }),
  ];
  const PEOPLE = [
    labeled("approver", "Approver", "string", { format: "person" }),
    labeled("requester", "Requester", "string", { format: "person" }),
  ];

  it("writes a date against another date field, and reads it as a sentence", () => {
    const operands = catalog(DATES);
    const condition: Condition = { joiner: "&&", rows: [cmpRow("data.end_date", ">", { kind: "field", path: "data.start_date" })] };
    const src = toCel(condition, operands)!;
    expect(src).toBe("data.end_date > data.start_date");
    expect(checkAgainstFields(src, fieldDefs(DATES))).toEqual({ ok: true });
    expect(conditionSentence(condition, operands, undefined)).toBe("End date is after Start date.");
    expect(fromCel(src, operands)!.rows).toEqual(condition.rows);
  });

  it("reads a field comparison back as a row whose value is the other field", () => {
    const operands = catalog(PEOPLE);
    expect(fromCel("data.approver == data.requester", operands)!.rows).toEqual([
      cmpRow("data.approver", "==", { kind: "field", path: "data.requester" }),
    ]);
  });

  it("leaves a context operand on the right a raw row", () => {
    const operands = catalog([labeled("status", "Status", "string")]);
    expect(fromCel("data.status == instance.status", operands)!.rows).toEqual([{ kind: "raw", src: "data.status == instance.status" }]);
  });

  it("leaves a right side of another CEL type, an unknown field and the operand itself a raw row", () => {
    const operands = catalog([labeled("amount", "Amount", "number"), labeled("note", "Note", "string")]);
    for (const src of ["data.amount == data.note", "data.amount == data.gone", "data.amount == data.amount"]) {
      expect(fromCel(src, operands)!.rows).toEqual([{ kind: "raw", src }]);
    }
  });

  it("offers a date row date fields alone, and a person row person fields alone", () => {
    const operands = catalog([
      labeled("start", "Start", "string", { format: "date" }),
      labeled("end", "End", "string", { format: "date" }),
      labeled("at", "At", "string", { format: "datetime" }),
      labeled("note", "Note", "string"),
      labeled("approver", "Approver", "string", { format: "person" }),
      labeled("requester", "Requester", "string", { format: "person" }),
      labeled("count", "Count", "number", { format: "integer" }),
      labeled("amount", "Amount", "number"),
    ]);
    const paths = (path: string) => fieldValueCandidates(path, operands).map((o) => o.path);
    expect(paths("data.end")).toEqual(["data.start"]);
    expect(paths("data.approver")).toEqual(["data.requester"]);
    expect(paths("data.note")).toEqual([]);
    expect(paths("data.count")).toEqual([]);
  });

  it("leaves a right-side field of another format a raw row", () => {
    const operands = catalog([labeled("end", "End", "string", { format: "date" }), labeled("note", "Note", "string")]);
    expect(fromCel("data.end == data.note", operands)!.rows).toEqual([{ kind: "raw", src: "data.end == data.note" }]);
  });

  it("offers the fields and called-process operands of the operand's CEL type, the operand excluded", () => {
    const parent = example("subprocess-loan-parent.json");
    const child = example("subprocess-credit-check-child.json");
    const fields = [
      labeled("amount", "Amount", "number"),
      labeled("budget", "Budget", "number"),
      labeled("note", "Note", "string"),
      labeled("due", "Due", "string", { format: "date" }),
      labeled("tags", "Tags", "list"),
    ];
    const operands = [...catalog(fields), ...operandsOf(parent, child).filter((o) => o.group === "child")];
    expect(fieldValueCandidates("data.amount", operands).map((o) => o.path)).toEqual(["data.budget", "child.data.amount"]);
  });

  it("offers no candidate for a list operand, an unknown operand or one with no same-type field", () => {
    const operands = catalog([labeled("tags", "Tags", "list"), labeled("other", "Other", "list"), labeled("amount", "Amount", "number")]);
    expect(fieldValueCandidates("data.tags", operands)).toEqual([]);
    expect(fieldValueCandidates("actor.roles", operands)).toEqual([]);
    expect(fieldValueCandidates("data.gone", operands)).toEqual([]);
    expect(fieldValueCandidates("data.amount", operands)).toEqual([]);
  });

  it("holds a field value naming no operand incomplete", () => {
    const operands = catalog(DATES);
    const byPath = new Map(operands.map((o) => [o.path, o]));
    expect(isComplete(cmpRow("data.end_date", ">", { kind: "field", path: "data.gone" }), byPath)).toBe(false);
    expect(isComplete(cmpRow("data.end_date", ">", { kind: "field", path: "data.start_date" }), byPath)).toBe(true);
  });
});

describe("a negated list membership reads and writes as one row", () => {
  const operands = catalog([labeled("approved", "Approved", "boolean"), labeled("amount", "Amount", "number")]);

  it("writes does not include as a negated membership", () => {
    const condition: Condition = { joiner: "&&", rows: [cmpRow("actor.roles", "!in", lit("manager"))] };
    const src = toCel(condition, operands)!;
    expect(src).toBe('!("manager" in actor.roles)');
    expect(checkAgainstFields(src, [])).toEqual({ ok: true });
  });

  it("reads a negated membership back as one does-not-include row", () => {
    const condition = fromCel('!("manager" in actor.roles)', operands)!;
    expect(condition.rows).toEqual([cmpRow("actor.roles", "!in", lit("manager"))]);
    expect(operatorWord("!in", operands.find((o) => o.path === "actor.roles"))).toBe("does not include");
  });

  it("reads a negated boolean as a comparison against false", () => {
    const condition = fromCel("!data.approved", operands)!;
    expect(condition.rows).toEqual([cmpRow("data.approved", "==", lit(false))]);
    expect(conditionSentence(condition, operands, "!data.approved")).toBe("Approved is no.");
    const written = toCel(condition, operands)!;
    expect(written).toBe("data.approved == false");
    expect(checkAgainstFields(written, fieldDefs([labeled("approved", "Approved", "boolean")]))).toEqual({ ok: true });
  });

  it("leaves a negated comparison and a negated non-boolean a raw row", () => {
    expect(fromCel("!(data.amount > 1000.0)", operands)!.rows).toEqual([{ kind: "raw", src: "!(data.amount > 1000.0)" }]);
    expect(fromCel("!data.amount", operands)!.rows).toEqual([{ kind: "raw", src: "!data.amount" }]);
  });
});

describe("operators follow the operand's type and format", () => {
  const operands = catalog([
    labeled("due", "Due", "string", { format: "date" }),
    labeled("at", "At", "string", { format: "datetime" }),
    labeled("who", "Who", "string", { format: "person" }),
    labeled("count", "Count", "number", { format: "integer" }),
  ]);
  const operand = (path: string) => operands.find((o) => o.path === path)!;
  const words = (path: string) => operatorsFor(operand(path).celType, operand(path).format).map((op) => operatorWord(op, operand(path)));

  it("offers a date six operators in date words, with is on or before writing <=", () => {
    expect(words("data.due")).toEqual(["is", "is not", "is before", "is on or before", "is after", "is on or after"]);
    expect(operatorsFor("string", "date")[3]).toBe("<=");
  });

  it("offers a date-time is and is not alone, since its text does not order as its calendar", () => {
    expect(operatorsFor("string", "datetime")).toEqual(["==", "!="]);
    expect(words("data.at")).toEqual(["is", "is not"]);
  });

  it("offers a person field is and is not alone", () => {
    expect(operatorsFor("string", "person")).toEqual(["==", "!="]);
    expect(words("data.who")).toEqual(["is", "is not"]);
  });

  it("offers an integer the number's six operators in the number's words", () => {
    expect(words("data.count")).toEqual(["is", "is not", "is less than", "is at most", "is greater than", "is at least"]);
  });

  it("offers a list includes and does not include, and includes emits the mirrored form", () => {
    expect(operatorsFor("list<string>")).toEqual(["in", "!in"]);
    const roles = catalog([]).find((o) => o.path === "actor.roles")!;
    expect(operatorsFor(roles.celType).map((op) => operatorWord(op, roles))).toEqual(["includes", "does not include"]);
    expect(toCel({ joiner: "&&", rows: [cmpRow("actor.roles", "in", lit("manager"))] }, catalog([]))).toBe('"manager" in actor.roles');
  });

  it("keeps the rule builder's call with the type alone as it was", () => {
    expect(operatorsFor("string")).toEqual(["==", "!="]);
    expect(operatorsFor("double")).toEqual(["==", "!=", "<", "<=", ">", ">="]);
  });
});

describe("the clauses", () => {
  const operands = catalog([
    labeled("amount", "Amount", "number"),
    DEPARTMENT,
    labeled("a", "A", "string"),
    labeled("b", "B", "string"),
    labeled("c", "C", "number"),
    labeled("due_date", "Due date", "string", { format: "date" }),
    labeled("starts_at", "Starts at", "string", { format: "datetime" }),
  ]);
  const read = (src: string) => conditionSentence(fromCel(src, operands)!, operands, src);

  it("names the value first in a list clause", () => {
    expect(read('"manager" in actor.roles')).toBe("“manager” is one of the person's roles.");
  });

  it("names the value first in a negated list clause", () => {
    expect(read('!("manager" in actor.roles)')).toBe("“manager” is not one of the person's roles.");
  });

  it("reads an or-group of two as either or", () => {
    expect(read(GROUPED)).toBe("Amount is greater than 1,000 and either Department is Sales or Department is Marketing.");
  });

  it("reads an or-group of three as any of", () => {
    expect(read('data.amount > 1000.0 && (data.department == "sales" || data.department == "marketing" || "manager" in actor.roles)')).toBe(
      "Amount is greater than 1,000 and any of Department is Sales, Department is Marketing or “manager” is one of the person's roles.",
    );
  });

  it("reads an and-group of two as both, and of three as all of", () => {
    expect(read('data.a == "x" || data.b == "y" && data.c > 1.0')).toBe("A is “x” or both B is “y” and C is greater than 1.");
    expect(read('data.c > 1.0 || data.a == "x" && data.b == "y" && data.c < 9.0')).toBe(
      "C is greater than 1 or all of A is “x”, B is “y” and C is less than 9.",
    );
  });

  it("ends a group clause in a comma when a clause follows it, under and and under or", () => {
    expect(read('(data.a == "x" || data.b == "y") && data.c > 1.0')).toBe("Either A is “x” or B is “y”, and C is greater than 1.");
    expect(read('(data.a == "x" && data.b == "y") || data.c > 1.0')).toBe("Both A is “x” and B is “y”, or C is greater than 1.");
    expect(read('data.c > 1.0 && (data.a == "x" || data.b == "y") && data.c < 9.0')).toBe(
      "C is greater than 1 and either A is “x” or B is “y”, and C is less than 9.",
    );
  });

  it("keeps the value's case when the sentence opens on a list clause", () => {
    const tags = catalog([labeled("tags", "Tags", "list", { options: [{ value: "vip", label: { en: "vip" } }] })]);
    const src = '"vip" in data.tags';
    expect(conditionSentence(fromCel(src, tags)!, tags, src)).toBe("vip is one of Tags.");
    expect(readerSentence(src, tags)).toBe("vip is one of Tags.");
    expect(readerSentence('"vip" in data.tags || ("x" in actor.roles && "y" in actor.roles)', tags)).toBe(
      "vip is one of Tags or both “x” is one of the person's roles and “y” is one of the person's roles.",
    );
    expect(readerSentence('("vip" in data.tags || "x" in actor.roles) && "y" in actor.roles', tags)).toBe(
      "Either vip is one of Tags or “x” is one of the person's roles, and “y” is one of the person's roles.",
    );
  });

  it("reads a group of one complete row as that row's clause", () => {
    const condition: Condition = {
      joiner: "&&",
      rows: [{ kind: "group", joiner: "||", rows: [cmpRow("data.a", "==", lit("x")), cmpRow("data.b", "==", lit(undefined))] }],
    };
    expect(conditionSentence(condition, operands, undefined)).toBe("A is “x”.");
  });

  it("prints a date value as a formatted date in date words", () => {
    expect(read('data.due_date <= "2026-12-31"')).toBe("Due date is on or before Dec 31, 2026.");
    expect(read('data.due_date < "2026-12-31"')).toBe("Due date is before Dec 31, 2026.");
    expect(read('data.due_date >= "2026-01-05"')).toBe("Due date is on or after Jan 5, 2026.");
  });

  it("prints a zoneless date-time value with its time as written", () => {
    expect(read('data.starts_at == "2026-12-31T17:30"')).toBe("Starts at is Dec 31, 2026, 5:30 PM.");
    expect(read('data.starts_at != "2026-12-31T23:59:30"')).toBe("Starts at is not Dec 31, 2026, 11:59 PM.");
  });

  it("prints a date-time value carrying a zone as its stored text, never converted", () => {
    expect(read('data.starts_at == "2026-12-31T17:30:00Z"')).toBe("Starts at is 2026-12-31T17:30:00Z.");
    expect(read('data.starts_at == "2026-12-31T17:30+02:00"')).toBe("Starts at is 2026-12-31T17:30+02:00.");
  });

  it("prints a date literal the formatter cannot read as its stored text", () => {
    expect(read('data.due_date == "2026-02-30"')).toBe("Due date is 2026-02-30.");
    expect(read('data.due_date == "next week"')).toBe("Due date is next week.");
  });

  it("prints a date-time literal whose offset no date can hold as its stored text", () => {
    expect(read('data.starts_at == "2026-01-01T00:00+24:00"')).toBe("Starts at is 2026-01-01T00:00+24:00.");
    expect(read('data.starts_at == "2026-01-01T00:00+99:99"')).toBe("Starts at is 2026-01-01T00:00+99:99.");
  });
});
