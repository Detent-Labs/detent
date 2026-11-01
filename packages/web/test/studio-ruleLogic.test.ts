import { describe, expect, it } from "bun:test";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { CmpOp } from "../src/areas/studio/panels/shared/conditionLogic.js";
import {
  buildRuleOperands,
  fieldValueOperandsFor,
  fromRuleCel,
  isRuleRowComplete,
  newRuleRow,
  ruleOperandSignature,
  ruleSentence,
  ruleValueOf,
  toRuleCel,
  type RuleCondition,
  type RuleRow,
  type RuleValue,
  type RuleOperand,
} from "../src/areas/studio/panels/shared/ruleLogic.js";

const field = (key: string, type: string, extra: object = {}): DraftField =>
  ({ id: `field_${key}`, key, label: { en: key }, type, ...extra }) as unknown as DraftField;

/** The field under edit plus its sibling catalog fields, mirroring
 * `FieldValidationEditor`'s own call: `field` is also present in `fields`,
 * since it is one entry of the same catalog. */
const operandsFor = (own: DraftField, siblings: DraftField[] = []): RuleOperand[] =>
  buildRuleOperands({ field: own, fields: [own, ...siblings], locale: "en", baseLocale: "en", thisAnswerLabel: "this answer" });

describe("buildRuleOperands", () => {
  it("lists 'this answer' first, labeled with the caller's own text", () => {
    const own = field("amount", "number");
    const ops = operandsFor(own);
    expect(ops[0]).toEqual({ path: "data.amount", label: "this answer", celType: "double", declaredType: "number" });
  });

  it("lists every other leaf field, not itself twice", () => {
    const own = field("amount", "number");
    const ops = operandsFor(own, [field("checked_amount", "number")]);
    expect(ops.map((o) => o.path)).toEqual(["data.amount", "data.checked_amount"]);
  });

  it("excludes group fields and a group's own container path", () => {
    const own = field("amount", "number");
    const group = field("addr", "group", { fields: [field("city", "string")] });
    const ops = operandsFor(own, [group]);
    expect(ops.map((o) => o.path)).toEqual(["data.amount", "data.city"]);
  });

  it("excludes a multiselect field, whose celType offers no comparator this builder writes", () => {
    const own = field("amount", "number");
    const ops = operandsFor(own, [field("tags", "list")]);
    expect(ops.map((o) => o.path)).toEqual(["data.amount"]);
  });

  it("an unnamed field under edit yields no 'this answer' entry", () => {
    const own = { id: "field_x", key: "", label: { en: "" }, type: "number" } as unknown as DraftField;
    const ops = operandsFor(own, [field("checked_amount", "number")]);
    expect(ops.map((o) => o.path)).toEqual(["data.checked_amount"]);
  });
});

describe("fieldValueOperandsFor (task 4.7's celType filter)", () => {
  it("excludes a mismatched-type field from the 'another field' operand picker", () => {
    const ops = operandsFor(field("amount", "number"), [field("checked_amount", "number"), field("note", "string")]);
    const picked = fieldValueOperandsFor("data.amount", ops);
    expect(picked.map((o) => o.path)).toEqual(["data.checked_amount"]);
  });

  it("excludes the row's own left operand from its own picker", () => {
    const ops = operandsFor(field("amount", "number"), [field("checked_amount", "number")]);
    const picked = fieldValueOperandsFor("data.checked_amount", ops);
    expect(picked.map((o) => o.path)).toEqual(["data.amount"]);
  });

  it("an unknown left path yields no candidates", () => {
    const ops = operandsFor(field("amount", "number"));
    expect(fieldValueOperandsFor("data.deleted_field", ops)).toEqual([]);
  });
});

describe("fromRuleCel", () => {
  it("reads a literal comparison as a comparison row", () => {
    const ops = operandsFor(field("amount", "number"));
    const condition = fromRuleCel("data.amount >= 1000.0", ops)!;
    expect(condition.rows).toEqual([
      { kind: "cmp", operand: "data.amount", op: ">=", value: { kind: "literal", value: 1000 } },
    ]);
  });

  it("reads an integer and a negative literal as comparison rows", () => {
    const ops = operandsFor(field("prioritaet", "number", { format: "integer" }), [field("amount", "number")]);
    expect(fromRuleCel("data.prioritaet > -3", ops)!.rows).toEqual([
      { kind: "cmp", operand: "data.prioritaet", op: ">", value: { kind: "literal", value: -3 } },
    ]);
    expect(fromRuleCel("data.prioritaet > 3", ops)!.rows).toEqual([
      { kind: "cmp", operand: "data.prioritaet", op: ">", value: { kind: "literal", value: 3 } },
    ]);
    expect(fromRuleCel("data.amount > -5.0", ops)!.rows).toEqual([
      { kind: "cmp", operand: "data.amount", op: ">", value: { kind: "literal", value: -5 } },
    ]);
  });

  it("reads a field-against-field comparison as a field-value row", () => {
    const ops = operandsFor(field("amount", "number"), [field("checked_amount", "number")]);
    const condition = fromRuleCel("data.amount >= data.checked_amount", ops)!;
    expect(condition.rows).toEqual([
      { kind: "cmp", operand: "data.amount", op: ">=", value: { kind: "field", path: "data.checked_amount" } },
    ]);
  });

  it("flattens an && chain into one row each, joined by 'and' implicitly", () => {
    const ops = operandsFor(field("amount", "number"), [field("note", "string")]);
    const condition = fromRuleCel('data.amount > 0.0 && data.note == "x"', ops)!;
    expect(condition.rows.length).toBe(2);
    expect(condition.rows.every((r) => r.kind === "cmp")).toBe(true);
  });

  it("a bare boolean operand reads as an explicit comparison against true", () => {
    const ops = operandsFor(field("approved", "boolean"));
    const condition = fromRuleCel("data.approved", ops)!;
    expect(condition.rows).toEqual([{ kind: "cmp", operand: "data.approved", op: "==", value: { kind: "literal", value: true } }]);
  });

  it("an unknown operand yields a raw row with its src untouched", () => {
    const condition = fromRuleCel("data.deleted_field == 5", operandsFor(field("amount", "number")))!;
    expect(condition.rows).toEqual([{ kind: "raw", src: "data.deleted_field == 5" }]);
  });

  it("a top-level || (unsupported: rows join only by 'and') reads as one whole raw row, not split", () => {
    const ops = operandsFor(field("amount", "number"), [field("flag", "boolean")]);
    const src = "data.amount > 0.0 || data.flag";
    const condition = fromRuleCel(src, ops)!;
    expect(condition.rows).toEqual([{ kind: "raw", src }]);
  });

  it("returns null when the source does not parse — the builder's one closed state", () => {
    expect(fromRuleCel("data.amount >", operandsFor(field("amount", "number")))).toBeNull();
  });

  it("an empty source yields an empty row list, not null", () => {
    expect(fromRuleCel(undefined, [])).toEqual({ rows: [] });
    expect(fromRuleCel("   ", [])).toEqual({ rows: [] });
  });
});

describe("ruleValueOf / toRuleCel", () => {
  const ops = operandsFor(field("amount", "number"), [field("checked_amount", "number"), field("note", "string")]);

  it("a number operand's literal emits the double form", () => {
    expect(ruleValueOf({ kind: "literal", value: "1000" }, "double")).toBe("1000.0");
  });

  it("a field value writes the field's own path literally", () => {
    expect(ruleValueOf({ kind: "field", path: "data.checked_amount" }, "double")).toBe("data.checked_amount");
  });

  it("an empty field choice is incomplete", () => {
    expect(ruleValueOf({ kind: "field", path: "" }, "double")).toBeUndefined();
  });

  it("writes a literal comparison row", () => {
    const condition: RuleCondition = {
      rows: [{ kind: "cmp", operand: "data.amount", op: ">=", value: { kind: "literal", value: 1000 } }],
    };
    expect(toRuleCel(condition, ops)).toBe("data.amount >= 1000.0");
  });

  it("writes a field-against-field comparison row", () => {
    const condition: RuleCondition = {
      rows: [{ kind: "cmp", operand: "data.amount", op: ">=", value: { kind: "field", path: "data.checked_amount" } }],
    };
    expect(toRuleCel(condition, ops)).toBe("data.amount >= data.checked_amount");
  });

  it("joins two complete rows with '&&'", () => {
    const condition: RuleCondition = {
      rows: [
        { kind: "cmp", operand: "data.amount", op: ">", value: { kind: "literal", value: 0 } },
        { kind: "cmp", operand: "data.note", op: "==", value: { kind: "literal", value: "x" } },
      ],
    };
    expect(toRuleCel(condition, ops)).toBe('data.amount > 0.0 && data.note == "x"');
  });

  it("skips an incomplete row, and no usable row yields undefined", () => {
    const half: RuleCondition = { rows: [{ kind: "cmp", operand: "data.amount", op: ">", value: { kind: "literal", value: undefined } }] };
    expect(toRuleCel(half, ops)).toBeUndefined();
    expect(toRuleCel({ rows: [] }, ops)).toBeUndefined();
  });

  it("parenthesises a raw fragment once a second row joins it", () => {
    const condition: RuleCondition = {
      rows: [
        { kind: "raw", src: "data.amount * 2.0 > 0.0" },
        { kind: "cmp", operand: "data.note", op: "==", value: { kind: "literal", value: "x" } },
      ],
    };
    expect(toRuleCel(condition, ops)).toBe('(data.amount * 2.0 > 0.0) && data.note == "x"');
  });

  it("isRuleRowComplete agrees with what toRuleCel actually writes", () => {
    const byPath = new Map(ops.map((o) => [o.path, o]));
    const complete: RuleCondition["rows"][number] = { kind: "cmp", operand: "data.amount", op: ">", value: { kind: "literal", value: 5 } };
    const incomplete: RuleCondition["rows"][number] = { kind: "cmp", operand: "data.amount", op: ">", value: { kind: "literal", value: undefined } };
    expect(isRuleRowComplete(complete, byPath)).toBe(true);
    expect(isRuleRowComplete(incomplete, byPath)).toBe(false);
  });
});

describe("a rule round-trips through fromRuleCel and toRuleCel", () => {
  it("a literal comparison", () => {
    const ops = operandsFor(field("amount", "number"));
    const src = "data.amount >= 1000.0";
    expect(toRuleCel(fromRuleCel(src, ops)!, ops)).toBe(src);
  });

  it("a field-against-field comparison", () => {
    const ops = operandsFor(field("amount", "number"), [field("checked_amount", "number")]);
    const src = "data.amount >= data.checked_amount";
    expect(toRuleCel(fromRuleCel(src, ops)!, ops)).toBe(src);
  });
});

describe("newRuleRow", () => {
  it("defaults to the first operand ('this answer', when present) and that celType's first comparator", () => {
    const ops = operandsFor(field("amount", "number"));
    expect(newRuleRow(ops)).toEqual({ kind: "cmp", operand: "data.amount", op: "==", value: { kind: "literal", value: undefined } });
  });

  it("defaults to an empty operand when the operand list is empty", () => {
    expect(newRuleRow([])).toEqual({ kind: "cmp", operand: "", op: "==", value: { kind: "literal", value: undefined } });
  });
});

describe("ruleOperandSignature", () => {
  it("changes when a field's celType changes", () => {
    const a = operandsFor(field("amount", "number"));
    const b = operandsFor({ ...field("amount", "number"), type: "string" } as DraftField);
    expect(ruleOperandSignature(a)).not.toBe(ruleOperandSignature(b));
  });

  it("is stable when only a label changes", () => {
    const a = operandsFor({ ...field("amount", "number"), label: { en: "One" } } as DraftField);
    const b = operandsFor({ ...field("amount", "number"), label: { en: "Two" } } as DraftField);
    expect(ruleOperandSignature(a)).toBe(ruleOperandSignature(b));
  });
});

describe("buildRuleOperands numbering", () => {
  it("numbers a second and later other field sharing a label, in catalog order", () => {
    const own = field("amount", "number");
    const named = (key: string, label: string) => field(key, "number", { label: { en: label } });
    const ops = operandsFor(own, [named("a", "Name"), named("b", "Name"), named("c", "Total"), named("d", "Name")]);
    expect(ops.map((o) => o.label)).toEqual(["this answer", "Name", "Name (2)", "Total", "Name (3)"]);
  });

  it("keeps 'this answer' first and uncounted although another field carries its label", () => {
    const own = field("amount", "number");
    const ops = operandsFor(own, [field("x", "number", { label: { en: "this answer" } }), field("y", "number", { label: { en: "this answer" } })]);
    expect(ops.map((o) => o.label)).toEqual(["this answer", "this answer", "this answer (2)"]);
  });

  it("counts a label shared with the field under edit as unique among the others", () => {
    const own = field("amount", "number", { label: { en: "Name" } });
    const ops = operandsFor(own, [field("other", "number", { label: { en: "Name" } })]);
    expect(ops.map((o) => o.label)).toEqual(["this answer", "Name"]);
  });
});

describe("ruleSentence", () => {
  const amount = field("amount", "number");
  const budget = field("budget", "number", { label: { en: "Budget" } });
  const ops = operandsFor(amount, [budget, field("limit", "number", { label: { en: "Budget" } })]);
  const cmp = (op: CmpOp, value: RuleValue, operand = "data.amount"): RuleRow => ({ kind: "cmp", operand, op, value });

  it("reads a literal comparison as a sentence", () => {
    const c: RuleCondition = { rows: [cmp(">=", { kind: "literal", value: 1000 })] };
    expect(ruleSentence(c, ops, "data.amount >= 1000.0")).toBe("This answer is at least 1,000.");
  });

  it("prints the other field's label as the value of a field comparison", () => {
    const c: RuleCondition = { rows: [cmp("<=", { kind: "field", path: "data.budget" })] };
    expect(ruleSentence(c, ops, undefined)).toBe("This answer is at most Budget.");
  });

  it("prints (unnamed field) for a field value no operand names, never its path", () => {
    const c: RuleCondition = { rows: [cmp("<=", { kind: "field", path: "data.gone" })] };
    expect(ruleSentence(c, ops, undefined)).toBe("This answer is at most (unnamed field).");
  });

  it("prints the counted label of a repeated field", () => {
    const c: RuleCondition = { rows: [cmp("<=", { kind: "field", path: "data.limit" })] };
    expect(ruleSentence(c, ops, undefined)).toBe("This answer is at most Budget (2).");
  });

  it("joins the complete rows by 'and' and skips an unfinished row", () => {
    const c: RuleCondition = {
      rows: [
        cmp(">", { kind: "literal", value: 0 }),
        cmp("<", { kind: "literal", value: undefined }),
        cmp("<", { kind: "literal", value: 10 }),
      ],
    };
    expect(ruleSentence(c, ops, undefined)).toBe("This answer is greater than 0 and this answer is less than 10.");
  });

  it("reads a raw row as a hand-written rule", () => {
    const c = fromRuleCel("data.amount > 0.0 || data.amount < -5.0", ops)!;
    expect(ruleSentence(c, ops, "data.amount > 0.0 || data.amount < -5.0")).toBe("A hand-written rule.");
  });

  it("reads no row and nothing stored as every answer passing", () => {
    expect(ruleSentence({ rows: [] }, ops, undefined)).toBe("No rule yet: every answer passes.");
    expect(ruleSentence({ rows: [] }, ops, "  ")).toBe("No rule yet: every answer passes.");
  });

  it("holds the stored rule while the author finishes a row", () => {
    const c: RuleCondition = { rows: [cmp(">", { kind: "literal", value: undefined })] };
    expect(ruleSentence(c, ops, "data.amount > 5.0")).toBe("Until you finish the row, the condition stays: this answer is greater than 5.");
  });

  it("asks for a finished row over an unfinished one with nothing stored", () => {
    const c: RuleCondition = { rows: [cmp(">", { kind: "literal", value: undefined })] };
    expect(ruleSentence(c, ops, undefined)).toBe("Finish a row to set the condition.");
  });

  it("prints no CEL", () => {
    const c: RuleCondition = { rows: [cmp(">=", { kind: "field", path: "data.budget" })] };
    expect(ruleSentence(c, ops, "data.amount >= data.budget")).not.toContain("data.");
  });
});
