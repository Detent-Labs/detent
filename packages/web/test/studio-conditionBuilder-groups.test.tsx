/**
 * `studio-condition-builder`: "A group holds rows of its own, one level deep"
 * and "A row compares against another field", drawn by the builder's
 * components.
 *
 * No harness here presses a control. `GroupRow` and `ComparisonRow` hold no
 * hook, so a test calls them as functions, walks the elements they return and
 * calls a control's handler the way an activation calls it.
 */
import { describe, expect, it } from "bun:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { ComparisonRow, ConditionBuilder, GroupRow } from "../src/areas/studio/panels/shared/ConditionBuilder.js";
import {
  newGroup,
  rowCount,
  toCel,
  withoutRow,
  type Condition,
  type GroupRow as GroupRowModel,
  type Leaf,
  type Operand,
} from "../src/areas/studio/panels/shared/conditionLogic.js";

const AMOUNT: Operand = { path: "data.amount", label: "Amount", celType: "double", declaredType: "number", group: "fields" };
const LIMIT: Operand = { path: "data.limit", label: "Limit", celType: "double", declaredType: "number", group: "fields" };
const COUNT: Operand = { path: "data.count", label: "Count", celType: "int", declaredType: "number", format: "integer", group: "fields" };
const NOTE: Operand = { path: "data.note", label: "Note", celType: "string", group: "fields" };
const DUE: Operand = { path: "data.due", label: "Due", celType: "string", format: "date", group: "fields" };
const START: Operand = { path: "data.start", label: "Start", celType: "string", format: "date", group: "fields" };
const STARTS_AT: Operand = { path: "data.starts_at", label: "Starts at", celType: "string", format: "datetime", group: "fields" };
const STATUS: Operand = { path: "instance.status", label: "The case's status", celType: "string", group: "case" };
const ROLES: Operand = { path: "actor.roles", label: "The person's roles", celType: "list<string>", group: "person" };
const ALL = [AMOUNT, LIMIT, COUNT, NOTE, DUE, START, STARTS_AT, STATUS, ROLES];
const byPath = new Map(ALL.map((o) => [o.path, o]));

const leaf = (operand: string, op: "==" | ">" | "<", value: string | number | undefined): Leaf => ({
  kind: "cmp",
  operand,
  op,
  value: { kind: "literal", value },
});

const render = (condition: Condition, operands: Operand[] = ALL) =>
  renderToStaticMarkup(<ConditionBuilder condition={condition} operands={operands} onChange={() => {}} />);

/** The host elements under `node`, depth first, with every function component
 * called in place. Only hook-free components can stand under it. */
function hosts(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(hosts);
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<Record<string, unknown>>;
  if (typeof el.type === "function") return hosts((el.type as (p: unknown) => ReactNode)(el.props));
  const below = hosts(el.props.children as ReactNode);
  return typeof el.type === "string" ? [el, ...below] : below; // a Fragment holds no host of its own
}

const textOf = (el: ReactElement<Record<string, unknown>>): string => {
  const walk = (n: ReactNode): string =>
    Array.isArray(n) ? n.map(walk).join("") : isValidElement(n) ? walk((n.props as { children?: ReactNode }).children) : typeof n === "string" ? n : "";
  return walk(el.props.children as ReactNode);
};

function find(node: ReactNode, match: (el: ReactElement<Record<string, unknown>>) => boolean) {
  const found = hosts(node).find(match);
  if (!found) throw new Error("no matching element");
  return found;
}

const byLabel = (label: string) => (el: ReactElement<Record<string, unknown>>) => el.props["aria-label"] === label;
const buttonReading = (text: string) => (el: ReactElement<Record<string, unknown>>) => el.type === "button" && textOf(el) === text;

/** The `<select>` carrying one aria-label, as markup. */
function selectLabelled(html: string, label: string): string {
  const found = (html.match(/<select[^>]*>(?:(?!<\/select>).)*<\/select>/g) ?? []).find((s) => s.includes(`aria-label="${label.replaceAll("'", "&#x27;")}"`));
  if (!found) throw new Error(`no select labelled ${label} in: ${html}`);
  return found;
}
const optionTexts = (select: string) => [...select.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
const selectedText = (select: string) => select.match(/<option[^>]*selected=""[^>]*>([^<]*)<\/option>/)?.[1];

const group = (joiner: "&&" | "||", rows: Leaf[]): GroupRowModel => ({ kind: "group", joiner, rows });

const groupRow = (row: GroupRowModel, onChange: (next: GroupRowModel) => void = () => {}, onRemove: (inner?: number) => void = () => {}) =>
  GroupRow({ row, operands: ALL, byPath, onChange, onRemove });

describe("a group row", () => {
  const condition: Condition = {
    joiner: "&&",
    rows: [leaf("data.amount", ">", 1000), group("||", [leaf("data.note", "==", "sales"), leaf("data.note", "==", "marketing")])],
  };
  const html = render(condition);

  it("draws its rows in a list nested in the group's own item", () => {
    expect([...html.matchAll(/<ol/g)].length).toBe(2);
    expect(html).toMatch(/<li[^>]*><div[^>]*>(?:(?!<\/div>).)*<\/div><ol[^>]*><li/);
  });

  it("carries the control how the group's rows combine, with the two words", () => {
    const select = selectLabelled(html, "how the group's rows combine");
    expect(optionTexts(select)).toEqual(["any of these", "all of these"]);
    expect(selectedText(select)).toBe("any of these");
  });

  it("names its remove control Remove group", () => {
    expect(html).toMatch(/<button[^>]*aria-label="Remove group"[^>]*data-condition-remove=""/);
  });

  it("prints the group's joiner in its gutter as a word and no control", () => {
    const inner = renderToStaticMarkup(<ol>{groupRow(group("&&", [leaf("data.amount", ">", 1), leaf("data.note", "==", "x")]))}</ol>);
    const nested = inner.slice(inner.indexOf("<ol", 4));
    expect(nested).not.toContain('title="How the rows combine');
    expect(nested).toMatch(/<li[^>]*><span[^>]*>and<\/span><select/);
    const anyOf = renderToStaticMarkup(<ol>{groupRow(group("||", [leaf("data.amount", ">", 1), leaf("data.note", "==", "x")]))}</ol>);
    expect(anyOf.slice(anyOf.indexOf("<ol", 4))).toMatch(/<li[^>]*><span[^>]*>or<\/span><select/);
  });

  it("leads with the condition's joiner when it is not first", () => {
    expect(html).toMatch(/<li[^>]*><div[^>]*><button[^>]*title="How the rows combine[^"]*"[^>]*>and<\/button><select[^>]*aria-label="how the group&#x27;s rows combine"/);
  });

  it("offers + Add row to this group and no add-group command inside it", () => {
    const inner = renderToStaticMarkup(<ol>{groupRow(group("||", [leaf("data.amount", ">", 1)]))}</ol>);
    expect(inner).toContain("+ Add row to this group");
    expect(inner).not.toContain("+ Add group");
    expect([...html.matchAll(/\+ Add group/g)].length).toBe(1);
  });

  it("offers + Add group beside + Add row", () => {
    expect(html).toMatch(/condition-add[^>]*>\+ Add row<\/button><button[^>]*>\+ Add group<\/button>/);
  });

  it("flags a group with no finished row, and the row in it", () => {
    const unfinished = render({ joiner: "&&", rows: [group("||", [leaf("data.amount", ">", undefined)])] });
    expect(unfinished).toContain("Needs a finished row before it is written.");
    expect(unfinished).toContain("Needs a value before it is written.");
    expect(html).not.toContain("Needs a finished row before it is written.");
  });
});

describe("a new group", () => {
  it("starts with one empty row, and its control reads any of these under and", () => {
    const html = render({ joiner: "&&", rows: [leaf("data.amount", ">", 1), newGroup("&&", ALL)] });
    expect(selectedText(selectLabelled(html, "how the group's rows combine"))).toBe("any of these");
    const nested = html.slice(html.indexOf("<ol", html.indexOf("<ol") + 1));
    expect([...nested.matchAll(/aria-label="Remove row"/g)].length).toBe(1);
    expect(nested).toContain("Needs a value before it is written.");
  });

  it("is what + Add group adds, on the condition's joiner", () => {
    const source = readFileSync(new URL("../src/areas/studio/panels/shared/ConditionBuilder.tsx", import.meta.url), "utf-8");
    expect(source).toContain("newGroup(condition.joiner, operands)");
  });

  it("adds a fresh row inside on + Add row to this group", () => {
    let next: GroupRowModel | undefined;
    const tree = groupRow(group("||", [leaf("data.amount", ">", 1)]), (g) => (next = g));
    (find(tree, buttonReading("+ Add row to this group")).props.onClick as () => void)();
    expect(next?.rows.length).toBe(2);
    expect(next?.rows[1]).toEqual({ kind: "cmp", operand: "data.amount", op: "==", value: { kind: "literal", value: undefined } });
  });
});

describe("the group's control", () => {
  it("sets the group's joiner, whatever the condition's", () => {
    let next: GroupRowModel | undefined;
    const tree = groupRow(group("||", [leaf("data.amount", ">", 1), leaf("data.note", "==", "x")]), (g) => (next = g));
    (find(tree, byLabel("how the group's rows combine")).props.onChange as (e: unknown) => void)({ target: { value: "&&" } });
    expect(next?.joiner).toBe("&&");
    const written = toCel({ joiner: "||", rows: [leaf("data.amount", "<", 0), next!] }, ALL);
    expect(written).toBe('data.amount < 0.0 || (data.amount > 1.0 && data.note == "x")');
  });
});

describe("removing inside a group", () => {
  const two = group("||", [leaf("data.amount", ">", 1), leaf("data.note", "==", "x")]);

  it("hands the inner row's index to the remove handler, and none for the group", () => {
    const removed: (number | undefined)[] = [];
    const tree = groupRow(two, () => {}, (inner) => removed.push(inner));
    const removes = hosts(tree).filter((el) => el.props["data-condition-remove"] === "");
    expect(removes.map((el) => el.props["aria-label"])).toEqual(["Remove group", "Remove row", "Remove row"]);
    for (const el of removes) (el.props.onClick as () => void)();
    expect(removed).toEqual([undefined, 0, 1]);
  });

  it("removes the row and keeps the group while a row stands", () => {
    const condition: Condition = { joiner: "&&", rows: [leaf("data.amount", "<", 9), two] };
    const next = withoutRow(condition, { row: 1, inner: 0 });
    expect(next.rows).toEqual([leaf("data.amount", "<", 9), group("||", [leaf("data.note", "==", "x")])]);
  });

  it("removes the group with its last row, counting both", () => {
    const condition: Condition = { joiner: "&&", rows: [leaf("data.amount", "<", 9), group("||", [leaf("data.note", "==", "x")])] };
    const next = withoutRow(condition, { row: 1, inner: 0 });
    expect(next.rows).toEqual([leaf("data.amount", "<", 9)]);
    expect(rowCount(condition) - rowCount(next)).toBe(2);
  });

  it("removes a whole group by its own control", () => {
    expect(withoutRow({ joiner: "&&", rows: [two, leaf("data.amount", "<", 9)] }, { row: 0 }).rows).toEqual([leaf("data.amount", "<", 9)]);
  });
});

describe("the value swap command", () => {
  const comparison = (row: Extract<Leaf, { kind: "cmp" }>, onChange: (next: Leaf) => void = () => {}) =>
    ComparisonRow({ row, operands: ALL, byPath, onChange, onRemove: () => {} });
  const markup = (row: Extract<Leaf, { kind: "cmp" }>) => renderToStaticMarkup(<ol>{comparison(row)}</ol>);
  const fieldRow = (operand: string, op: "==" | ">", path: string) =>
    ({ kind: "cmp", operand, op, value: { kind: "field", path } }) as Extract<Leaf, { kind: "cmp" }>;

  it("reads Compare with a field instead over a value, under the editor", () => {
    expect(markup(leaf("data.amount", ">", 5) as Extract<Leaf, { kind: "cmp" }>)).toMatch(
      /<span[^>]*><input[^>]*aria-label="value"[^>]*\/><button[^>]*>Compare with a field instead<\/button><\/span>/,
    );
  });

  it("reads Type a value instead over a field, under the picker", () => {
    const html = markup(fieldRow("data.amount", ">", "data.limit"));
    expect(html).toMatch(/<\/select><button[^>]*>Type a value instead<\/button><\/span>/);
    expect(html).not.toContain('aria-label="value"');
  });

  it("lists the number fields of the same CEL type alone in a number row's picker", () => {
    const picker = selectLabelled(markup(fieldRow("data.amount", ">", "")), "field to compare with");
    expect(optionTexts(picker)).toEqual(["(select a field)", "Limit"]);
  });

  it("lists the date fields alone in a date row's picker", () => {
    const picker = selectLabelled(markup(fieldRow("data.due", ">", "")), "field to compare with");
    expect(optionTexts(picker)).toEqual(["(select a field)", "Start"]);
  });

  it("shows a read-back field value as the picker set to that field", () => {
    const picker = selectLabelled(markup(fieldRow("data.due", ">", "data.start")), "field to compare with");
    expect(selectedText(picker)).toBe("Start");
  });

  it("offers no command on a list row", () => {
    const html = markup({ kind: "cmp", operand: "actor.roles", op: "in", value: { kind: "literal", value: "manager" } });
    expect(html).not.toContain("Compare with a field instead");
  });

  it("offers no command on an operand with no candidate", () => {
    expect(markup(leaf("data.note", "==", "x") as Extract<Leaf, { kind: "cmp" }>)).not.toContain("Compare with a field instead");
    expect(markup(leaf("data.count", ">", 3) as Extract<Leaf, { kind: "cmp" }>)).not.toContain("Compare with a field instead");
  });

  it("empties the value on either swap", () => {
    let next: Leaf | undefined;
    const fromLiteral = comparison(leaf("data.amount", ">", 5) as Extract<Leaf, { kind: "cmp" }>, (l) => (next = l));
    (find(fromLiteral, buttonReading("Compare with a field instead")).props.onClick as () => void)();
    expect(next).toEqual({ kind: "cmp", operand: "data.amount", op: ">", value: { kind: "field", path: "" } });

    const fromField = comparison(fieldRow("data.amount", ">", "data.limit"), (l) => (next = l));
    (find(fromField, buttonReading("Type a value instead")).props.onClick as () => void)();
    expect(next).toEqual({ kind: "cmp", operand: "data.amount", op: ">", value: { kind: "literal", value: undefined } });
  });

  it("writes the picked field as the row's value", () => {
    let next: Leaf | undefined;
    const tree = comparison(fieldRow("data.due", ">", ""), (l) => (next = l));
    (find(tree, byLabel("field to compare with")).props.onChange as (e: unknown) => void)({ target: { value: "data.start" } });
    expect(next).toEqual(fieldRow("data.due", ">", "data.start"));
    expect(toCel({ joiner: "&&", rows: [next!] }, ALL)).toBe("data.due > data.start");
  });
});
