import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * `visually-hidden-text-page-bounds` design.md D1-D3: a scroll container
 * that sets no `position` clips no hidden text laid out inside it, so the
 * text keeps its static position against the page and the document grows to
 * reach it. Four scroll containers carry hidden text, and each must set
 * `position: relative`. `bun:test` cannot lay out a page, so it cannot see
 * containment; this guards the source the way
 * `studio-guidedSurfaceStyle.test.ts` guards its own layout rules — read the
 * file, strip comments, match a pattern.
 * `docs/browser-checks.md` covers what only a browser can see: that a
 * container actually clips and scrolls the text it holds.
 */
const ROOT = new URL("../", import.meta.url).pathname;
const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");

/** Block comments first, then line comments — the order matters for a `//`
 * inside a block comment. A rule discussed in prose is not a rule declared. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** The `<name>: {` style key, cut from its opening brace to its match. Fails
 * with a named message when the key is missing, rather than matching nothing
 * and passing vacuously, and again when the key appears more than once. */
function styleBlock(source: string, name: string): string {
  const marker = `${name}: {`;
  const start = source.indexOf(marker);
  expect(start, `style key "${name}" not found`).toBeGreaterThan(-1);
  expect(source.indexOf(marker, start + 1), `style key "${name}" appears more than once`).toBe(-1);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated style block ${name}`);
}

/** design.md D2: the four containers, each with the hidden text it holds. */
const CONTAINERS = [
  { file: "src/areas/studio/panels/ProcessTabRow.tsx", key: "row" },
  { file: "src/areas/studio/panels/EntityTabs.tsx", key: "rail" },
  { file: "src/areas/studio/screens/EditScreen.tsx", key: "tabBody" },
  { file: "../form-ui/src/FieldForm.tsx", key: "tabRow" },
];

describe("a scroll container holding hidden text positions itself", () => {
  for (const { file, key } of CONTAINERS) {
    it(`${file} styles.${key} sets position: "relative"`, () => {
      const block = styleBlock(stripComments(read(file)), key);
      expect(block).toMatch(/position: "relative"/);
    });
  }
});
