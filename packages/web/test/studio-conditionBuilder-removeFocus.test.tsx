import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { ConditionBuilder, removeFocusIndex } from "../src/areas/studio/panels/shared/ConditionBuilder.js";
import type { Operand } from "../src/areas/studio/panels/shared/conditionLogic.js";

/**
 * A row's remove control unmounts with its row, which would drop focus to
 * `<body>`. Focus lands on the remove control of the row now at that index,
 * else the previous row's, else the add-row button.
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

  it("raises the flag in the remove handler", () => {
    expect(source).toMatch(/const removeRow = \(index: number\) => \{\n {4}setFocusAfterRemove\(index\);\n/);
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
            { kind: "cmp", operand: "data.amount", op: ">", value: 5 },
            { kind: "cmp", operand: "data.amount", op: "<", value: 9 },
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
