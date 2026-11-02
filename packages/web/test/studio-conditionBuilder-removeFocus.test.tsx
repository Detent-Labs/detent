import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { ConditionBuilder, removeControlIndex, removeFocusIndex } from "../src/areas/studio/panels/shared/ConditionBuilder.js";
import { withoutRow, type Condition, type Leaf, type Operand } from "../src/areas/studio/panels/shared/conditionLogic.js";

/**
 * A row's remove control unmounts with its row, which would drop focus to
 * `<body>`. Focus lands by DOM order among the remove controls, a group's own
 * included: on the control now at the pressed index, else the one before it,
 * else the add-row button.
 */

describe("removeFocusIndex", () => {
  it("lands on the row now at the removed index", () => {
    expect(removeFocusIndex(0, 2)).toBe(0);
    expect(removeFocusIndex(1, 2)).toBe(1);
  });

  it("lands on the previous row when the last row went", () => {
    expect(removeFocusIndex(2, 2)).toBe(1);
    expect(removeFocusIndex(1, 1)).toBe(0);
  });

  it("names no row when none stands, for the add-row button", () => {
    expect(removeFocusIndex(0, 0)).toBeNull();
  });
});

describe("focus after a row removal", () => {
  // No harness here can press the control. As for the clear command, this pins
  // the wiring: the press raises a flag, and an effect moves focus once the
  // next render has drawn the target.
  const source = readFileSync(new URL("../src/areas/studio/panels/shared/ConditionBuilder.tsx", import.meta.url), "utf-8");
  const AMOUNT: Operand = { path: "data.amount", label: "Amount", celType: "double", group: "fields" };

  it("raises the flag in the remove handler, at the pressed control's DOM index", () => {
    expect(source).toMatch(/const removeRow = \(at: RowAt\) => \{\n {4}setFocusAfterRemove\(removeControlIndex\(condition\.rows, at\)\);\n {4}onChange\(withoutRow\(condition, at\)\);\n/);
  });

  it("queries the remove controls and the add-row button under the builder's root", () => {
    expect(source).toContain('root.querySelectorAll<HTMLElement>("button[data-condition-remove]")');
    expect(source).toContain('root.querySelector<HTMLElement>("button.condition-add")');
    expect([...source.matchAll(/<div ref=\{rootRef\}/g)].length).toBe(1);
  });

  it("marks every row's remove control, and the add-row button stands with no row", () => {
    const two = renderToStaticMarkup(
      <ConditionBuilder
        condition={{
          joiner: "&&",
          rows: [
            { kind: "cmp", operand: "data.amount", op: ">", value: { kind: "literal" as const, value: 5 } },
            { kind: "cmp", operand: "data.amount", op: "<", value: { kind: "literal" as const, value: 9 } },
          ],
        }}
        operands={[AMOUNT]}
        onChange={() => {}}
      />,
    );
    expect([...two.matchAll(/data-condition-remove=""/g)].length).toBe(2);

    const none = renderToStaticMarkup(
      <ConditionBuilder condition={{ joiner: "&&", rows: [] }} operands={[AMOUNT]} onChange={() => {}} />,
    );
    expect(none).toContain("condition-add");
    expect(none).not.toContain("data-condition-remove");
  });
});

describe("focus after a removal inside a group", () => {
  const AMOUNT: Operand = { path: "data.amount", label: "Amount", celType: "double", group: "fields" };
  const row = (value: number): Leaf => ({ kind: "cmp", operand: "data.amount", op: ">", value: { kind: "literal", value } });
  // DOM order of the remove controls: 0 the first row, 1 the group, 2 and 3
  // the group's rows, 4 the last row.
  const condition: Condition = {
    joiner: "&&",
    rows: [row(1), { kind: "group", joiner: "||", rows: [row(2), row(3)] }, row(4)],
  };
  /** The remove controls left after the removal, then the focus index among them. */
  const landing = (c: Condition, at: Parameters<typeof withoutRow>[1]) => {
    const remaining = renderControls(withoutRow(c, at));
    return removeFocusIndex(removeControlIndex(c.rows, at), remaining);
  };
  const renderControls = (c: Condition) =>
    [...renderToStaticMarkup(<ConditionBuilder condition={c} operands={[AMOUNT]} onChange={() => {}} />).matchAll(/data-condition-remove=""/g)].length;

  it("marks the group's own remove control among the rows', in DOM order", () => {
    const html = renderToStaticMarkup(<ConditionBuilder condition={condition} operands={[AMOUNT]} onChange={() => {}} />);
    const labels = [...html.matchAll(/<button[^>]*aria-label="([^"]*)"[^>]*data-condition-remove=""/g)].map((m) => m[1]);
    expect(labels).toEqual(["Remove row", "Remove group", "Remove row", "Remove row", "Remove row"]);
  });

  it("counts the group's control before its rows'", () => {
    expect(removeControlIndex(condition.rows, { row: 0 })).toBe(0);
    expect(removeControlIndex(condition.rows, { row: 1 })).toBe(1);
    expect(removeControlIndex(condition.rows, { row: 1, inner: 0 })).toBe(2);
    expect(removeControlIndex(condition.rows, { row: 1, inner: 1 })).toBe(3);
    expect(removeControlIndex(condition.rows, { row: 2 })).toBe(4);
  });

  it("lands on the next control after a removal inside a group", () => {
    // The group's second row goes: the last row's control now stands at 3.
    expect(landing(condition, { row: 1, inner: 1 })).toBe(3);
    // The group's first row goes: its second row's control now stands at 2.
    expect(landing(condition, { row: 1, inner: 0 })).toBe(2);
  });

  it("lands on the control after the group when the group's own control removes it", () => {
    // Three controls go; the last row's control now stands at 1.
    expect(landing(condition, { row: 1 })).toBe(1);
  });

  it("lands on the control after the group when its last row takes the group", () => {
    const single: Condition = { joiner: "&&", rows: [row(1), { kind: "group", joiner: "||", rows: [row(2)] }, row(4)] };
    // The group's control stood at 1; the last row's control now stands there.
    expect(removeControlIndex(single.rows, { row: 1, inner: 0 })).toBe(1);
    expect(landing(single, { row: 1, inner: 0 })).toBe(1);
  });

  it("lands on the control before when the last group goes, else on the add-row button", () => {
    const last: Condition = { joiner: "&&", rows: [row(1), { kind: "group", joiner: "||", rows: [row(2)] }] };
    expect(landing(last, { row: 1, inner: 0 })).toBe(0);
    const only: Condition = { joiner: "&&", rows: [{ kind: "group", joiner: "||", rows: [row(2)] }] };
    expect(landing(only, { row: 0, inner: 0 })).toBeNull();
  });
});
