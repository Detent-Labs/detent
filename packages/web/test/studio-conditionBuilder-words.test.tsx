/**
 * `studio-condition-builder`: "The builder's rows print no CEL", "Operators and
 * value editors follow the operand type" and "The operand picker offers the
 * catalog and the curated context".
 */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConditionBuilder } from "../src/areas/studio/panels/shared/ConditionBuilder.js";
import type { Condition, Operand } from "../src/areas/studio/panels/shared/conditionLogic.js";

const AMOUNT: Operand = { path: "data.amount", label: "Amount", celType: "double", group: "fields" };
const NOTE: Operand = { path: "data.note", label: "Note", celType: "string", group: "fields" };
const OUTCOME: Operand = { path: "child.outcome", label: "How the called process ended", celType: "string", group: "child" };
const STATUS: Operand = { path: "instance.status", label: "The case's status", celType: "string", group: "case" };
const ROLES: Operand = { path: "actor.roles", label: "The person's roles", celType: "list<string>", group: "person" };

const render = (condition: Condition, operands: Operand[]) =>
  renderToStaticMarkup(<ConditionBuilder condition={condition} operands={operands} onChange={() => {}} />);

/** The `<select>` carrying one aria-label, as markup. */
function selectLabelled(html: string, label: string): string {
  const found = (html.match(/<select[^>]*>(?:(?!<\/select>).)*<\/select>/g) ?? []).find((s) => s.includes(`aria-label="${label}"`));
  if (!found) throw new Error(`no select labelled ${label} in: ${html}`);
  return found;
}

const optionTexts = (select: string) => [...select.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);

describe("the operator select", () => {
  it("prints words for a number", () => {
    const html = render({ joiner: "&&", rows: [{ kind: "cmp", operand: "data.amount", op: ">", value: 5 }] }, [AMOUNT]);
    expect(optionTexts(selectLabelled(html, "operator"))).toEqual([
      "is",
      "is not",
      "is less than",
      "is at most",
      "is greater than",
      "is at least",
    ]);
  });

  it("prints no CEL symbol and keeps the symbol as the option value", () => {
    const html = render({ joiner: "&&", rows: [{ kind: "cmp", operand: "data.amount", op: ">", value: 5 }] }, [AMOUNT]);
    const select = selectLabelled(html, "operator");
    expect(select).toContain('value="&gt;"');
    expect(select).toMatch(/<option value="&gt;" selected="">is greater than<\/option>/);
    expect(optionTexts(select).some((text) => /[=<>!]/.test(text ?? ""))).toBe(false);
  });

  it("prints contains for a list", () => {
    const html = render({ joiner: "&&", rows: [{ kind: "cmp", operand: "actor.roles", op: "in", value: undefined }] }, [ROLES]);
    expect(optionTexts(selectLabelled(html, "operator"))).toEqual(["contains"]);
  });
});

describe("the joiner", () => {
  const rows: Condition["rows"] = [
    { kind: "cmp", operand: "data.amount", op: ">", value: 5 },
    { kind: "cmp", operand: "data.note", op: "==", value: "x" },
  ];
  const joiner = (html: string) => html.match(/<button[^>]*title="How the rows combine[^>]*>([^<]*)<\/button>/);

  it("prints and for &&, with its hint", () => {
    expect(joiner(render({ joiner: "&&", rows }, [AMOUNT, NOTE]))?.[1]).toBe("and");
  });

  it("prints or for ||, with its hint", () => {
    expect(joiner(render({ joiner: "||", rows }, [AMOUNT, NOTE]))?.[1]).toBe("or");
  });

  it("prints no symbol", () => {
    const html = render({ joiner: "&&", rows }, [AMOUNT, NOTE]);
    expect(html).not.toContain("&amp;&amp;");
    expect(html).not.toContain("||");
  });
});

describe("the operand picker", () => {
  const row: Condition["rows"] = [{ kind: "cmp", operand: "", op: "==", value: undefined }];
  const picker = (operands: Operand[]) => selectLabelled(render({ joiner: "&&", rows: row }, operands), "field");

  it("groups the operands under headings, in order", () => {
    const html = picker([AMOUNT, NOTE, OUTCOME, STATUS, ROLES]);
    const labels = [...html.matchAll(/<optgroup label="([^"]*)"/g)].map((m) => m[1]);
    expect(labels).toEqual(["Fields", "The called process", "The case", "The person"]);
    expect(html).toMatch(/<optgroup label="Fields"><option value="data.amount">Amount<\/option><option value="data.note">Note<\/option><\/optgroup>/);
  });

  it("draws no heading for a group with no operand", () => {
    const html = picker([AMOUNT, STATUS]);
    expect([...html.matchAll(/<optgroup label="([^"]*)"/g)].map((m) => m[1])).toEqual(["Fields", "The case"]);
    expect(html).not.toContain("The called process");
    expect(html).not.toContain("The person");
  });

  it("keeps the placeholder option outside any group", () => {
    expect(picker([AMOUNT])).toMatch(/^<select[^>]*><option value="" selected="">\(select a field\)<\/option><optgroup/);
  });

  it("lists an operand with no group after the groups, under no heading", () => {
    const loose: Operand = { path: "data.loose", label: "Loose", celType: "string" };
    const html = picker([loose, AMOUNT]);
    expect(html).toMatch(/<\/optgroup><option value="data.loose">Loose<\/option>/);
  });
});

describe("a raw row", () => {
  const html = render({ joiner: "&&", rows: [{ kind: "raw", src: "data.secret_flag.matches('x')" }] }, [AMOUNT]);

  it("prints a sentence in place of its source", () => {
    expect(html).toContain("A hand-written rule. The Developer view holds its text.");
  });

  it("prints no text input and none of the source", () => {
    expect(html).not.toContain("<input");
    expect(html).not.toContain("secret_flag");
    expect(html).not.toContain("matches");
  });

  it("keeps its remove control", () => {
    expect(html).toContain('aria-label="Remove row"');
  });
});
