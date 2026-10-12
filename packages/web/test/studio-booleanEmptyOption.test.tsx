/**
 * `studio-condition-builder`: "A new boolean row starts empty" and "Choosing
 * No on a new boolean row writes the row".
 *
 * A new row on a boolean operand holds `undefined`. The value select must show
 * the empty choice for it, so picking "No" is a change event and writes the
 * row. No harness here clicks, so the change handler's mapping is tested as a
 * pure pair and the markup test covers the rendered state.
 */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConditionBuilder } from "../src/areas/studio/panels/shared/ConditionBuilder.js";
import { RuleBuilder } from "../src/areas/studio/panels/shared/RuleBuilder.js";
import {
  boolChoiceOf,
  boolValueOf,
  fromCel,
  toCel,
  type Operand,
} from "../src/areas/studio/panels/shared/conditionLogic.js";
import { newRuleRow, toRuleCel } from "../src/areas/studio/panels/shared/ruleLogic.js";

const APPROVED: Operand = { path: "data.approved", label: "Approved", celType: "bool" };
const OPERANDS = [APPROVED];

/** The `<select>` carrying the value label, as markup. */
function valueSelect(html: string): string {
  const match = html.match(/<select[^>]*aria-label="[^"]*"[^>]*>(?:(?!<\/select>).)*<\/select>/g) ?? [];
  const found = match.find((s) => s.includes('value="true"') && s.includes('value="false"'));
  if (!found) throw new Error(`no boolean value select in: ${html}`);
  return found;
}

describe("boolean value select helpers", () => {
  it("maps an undefined value to the empty choice", () => {
    expect(boolChoiceOf(undefined)).toBe("");
  });

  it("maps a stored true and false to their choices", () => {
    expect(boolChoiceOf(true)).toBe("true");
    expect(boolChoiceOf(false)).toBe("false");
    expect(boolChoiceOf("true")).toBe("true");
  });

  it("maps the empty choice back to undefined and the others to booleans", () => {
    expect(boolValueOf("")).toBeUndefined();
    expect(boolValueOf("true")).toBe(true);
    expect(boolValueOf("false")).toBe(false);
  });

  it("writes data.approved == false once No is chosen on a new row", () => {
    const row = { kind: "cmp" as const, operand: "data.approved", op: "==" as const, value: boolValueOf("false") };
    expect(toCel({ joiner: "&&", rows: [row] }, OPERANDS)).toBe("data.approved == false");
  });
});

describe("ConditionBuilder on a new boolean row", () => {
  const condition = {
    joiner: "&&" as const,
    rows: [{ kind: "cmp" as const, operand: "data.approved", op: "==" as const, value: undefined }],
  };
  const html = renderToStaticMarkup(<ConditionBuilder condition={condition} operands={OPERANDS} onChange={() => {}} />);

  it("selects the empty option", () => {
    const select = valueSelect(html);
    expect(select).toMatch(/<option value="" selected="">/);
    expect(select).not.toMatch(/<option value="(true|false)" selected/);
  });

  it("carries the incomplete mark", () => {
    expect(html).toContain("Needs a value before it is written.");
  });

  it("keeps a stored true on the yes option, and the row complete", () => {
    const stored = { ...condition, rows: [{ ...condition.rows[0]!, value: true }] };
    const out = renderToStaticMarkup(<ConditionBuilder condition={stored} operands={OPERANDS} onChange={() => {}} />);
    expect(valueSelect(out)).toMatch(/<option value="true" selected="">/);
    expect(out).not.toContain("Needs a value before it is written.");
  });

  it("keeps a stored false on the no option, and the row complete", () => {
    const parsed = fromCel("data.approved == false", OPERANDS)!;
    const out = renderToStaticMarkup(<ConditionBuilder condition={parsed} operands={OPERANDS} onChange={() => {}} />);
    expect(valueSelect(out)).toMatch(/<option value="false" selected="">/);
    expect(out).not.toContain("Needs a value before it is written.");
  });
});

describe("RuleBuilder on a new boolean row", () => {
  const condition = { rows: [newRuleRow(OPERANDS)] };
  const html = renderToStaticMarkup(<RuleBuilder condition={condition} operands={OPERANDS} onChange={() => {}} />);

  it("selects the empty option", () => {
    const select = valueSelect(html);
    expect(select).toMatch(/<option value="" selected="">/);
    expect(select).not.toMatch(/<option value="(true|false)" selected/);
  });

  it("carries the incomplete mark", () => {
    expect(html).toContain("Needs a value before it is written.");
  });

  it("writes the rule once No is chosen", () => {
    const row = newRuleRow(OPERANDS);
    if (row.kind !== "cmp") throw new Error("expected a cmp row");
    const chosen = { ...row, value: { kind: "literal" as const, value: boolValueOf("false") } };
    expect(toRuleCel({ rows: [chosen] }, OPERANDS)).toBe("data.approved == false");
  });

  it("keeps a stored true on the yes option, and the row complete", () => {
    const row = newRuleRow(OPERANDS);
    if (row.kind !== "cmp") throw new Error("expected a cmp row");
    const stored = { rows: [{ ...row, value: { kind: "literal" as const, value: true } }] };
    const out = renderToStaticMarkup(<RuleBuilder condition={stored} operands={OPERANDS} onChange={() => {}} />);
    expect(valueSelect(out)).toMatch(/<option value="true" selected="">/);
    expect(out).not.toContain("Needs a value before it is written.");
  });
});
