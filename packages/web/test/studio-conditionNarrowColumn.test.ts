import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * At 400px the guard fieldset overflowed the step page's column: the UA gives
 * a fieldset `min-inline-size: min-content`, and the operand select sized to
 * its longest option. Width is a browser fact, checked in a browser; this pins
 * the styles that let the fieldset and the row's controls shrink.
 */

const read = (file: string) => readFileSync(new URL(`../src/areas/studio/panels/${file}`, import.meta.url), "utf-8");

/** One `stylex.create` entry, from its name to its closing brace. */
function styleBlock(source: string, name: string): string {
  const start = source.indexOf(`  ${name}: {`);
  expect({ name, found: start > -1 }).toEqual({ name, found: true });
  return source.slice(start, source.indexOf("\n  },", start));
}

describe("the guard fieldset", () => {
  it("drops the UA minimum, so it shrinks to the column", () => {
    const block = styleBlock(read("PathsPanel.tsx"), "studioOnlyWhen");

    expect(block).toContain("minInlineSize: 0");
    expect(block).toContain("minWidth: 0");
  });
});

describe("the builder row's controls", () => {
  for (const [file, controls] of [
    // operand, operator, and the value editor's bool select, option select and input.
    ["shared/ConditionBuilder.tsx", 5],
    // the same five, plus the "a field" value select.
    ["shared/RuleBuilder.tsx", 6],
  ] as const) {
    it(`shrink to the row in ${file}`, () => {
      const source = read(file);
      const block = styleBlock(source, "conditionControl");

      expect(block).toContain('maxWidth: "100%"');
      expect(block).toContain("minWidth: 0");
      expect([...source.matchAll(/\{\.\.\.stylex\.props\(styles\.conditionControl\)\}/g)].length).toBe(controls);
      if (file.endsWith("RuleBuilder.tsx")) expect(styleBlock(source, "conditionRaw")).toContain('maxWidth: "100%"');
      if (file.endsWith("ConditionBuilder.tsx")) expect(styleBlock(source, "conditionRawSentence")).toContain('maxWidth: "100%"');
    });
  }
});
