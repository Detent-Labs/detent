import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * The studio at narrow widths, guarded at the source. No DOM test library lays
 * out a grid here, so these checks read the style source; the browser check
 * in `docs/browser-checks.md` reads the widths themselves.
 */
const ROOT = new URL("../", import.meta.url).pathname;
const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");

/** Block comments first, then line comments — the order matters for a `//`
 * inside a block comment. A rule discussed in prose is not a rule declared. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** The `styles.<name>` object literal, from its brace to its match. */
function styleBlock(source: string, name: string): string {
  const start = source.search(new RegExp(`\\b${name}: \\{`));
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated style block ${name}`);
}

const FORM_EDITOR = "src/areas/studio/screens/FormEditorScreen.tsx";
const FORM_PREVIEW = "src/areas/studio/panels/FormPreview.tsx";
const TAB_ROW = "src/areas/studio/panels/ProcessTabRow.tsx";
const EDIT_SCREEN = "src/areas/studio/screens/EditScreen.tsx";

describe("the form editor turns its preview at 80rem", () => {
  for (const file of [FORM_EDITOR, FORM_PREVIEW]) {
    it(`${file} declares PREVIEW_NARROW at 80rem and names no 64rem`, () => {
      const source = stripComments(read(file));

      // `studio-form-editor`: "The preview stands under the canvas at 80rem
      // and below". The host grid and the preview's divider read one name.
      expect({
        file,
        declared: source.includes('const PREVIEW_NARROW = "@media (max-width: 80rem)";'),
        names64rem: source.includes("64rem"),
      }).toEqual({ file, declared: true, names64rem: false });
    });
  }
});

describe("the tab row keeps the open tab clear of its edge fades", () => {
  it("stops its scroll 32px in and sizes the fade layer to the band", () => {
    const block = styleBlock(stripComments(read(TAB_ROW)), "row");

    // `studio-process-tabs`: the open tab keeps 32px clear, outside the 24px
    // fade. The gradient layer covers the band alone, so the scrollbar and the
    // divider under it keep full strength.
    expect(block).toMatch(/scrollPaddingInline: space\.s8,/);
    expect(block).toMatch(/maskSize: "[^"]*--tab-row-band[^"]*",/);
    expect(block).toMatch(/maskPosition: "top, bottom",/);
    expect(block).toMatch(/maskRepeat: "no-repeat",/);
  });

  for (const name of ["fadeStart", "fadeEnd", "fadeBoth"]) {
    it(`drops the ${name} mask under forced colors`, () => {
      const source = stripComments(read(TAB_ROW));

      // Forced colors promise system contrast for every visible letter; the
      // scrollbar stays the cue there.
      expect(source).toMatch(/const FORCED_COLORS = "@media \(forced-colors: active\)";/);
      expect(styleBlock(source, name)).toMatch(/maskImage: \{[\s\S]*\[FORCED_COLORS\]: "none",?\s*\}/);
    });
  }

  it("declares no transition and no animation", () => {
    const source = stripComments(read(TAB_ROW));

    // The Still Page Rule: the row jumps, and a fade appears and leaves at once.
    expect(source).not.toMatch(/\btransition[A-Za-z]*\s*:/);
    expect(source).not.toMatch(/\banimation[A-Za-z]*\s*:/);
  });
});

describe("one function scrolls the tab row", () => {
  it("routes the edit screen's focus hand-off through scrollTabIntoRow", () => {
    const source = stripComments(read(EDIT_SCREEN));

    expect(source).toMatch(/\bscrollTabIntoRow\(/);
    expect(source).not.toContain("scrollIntoView");
  });

  it("names scrollIntoView once in the tab row, nearest inline and instant", () => {
    const source = stripComments(read(TAB_ROW));
    const call = /scrollIntoView\(\{([^}]*)\}\)/.exec(source);

    expect(source.match(/scrollIntoView/g) ?? []).toHaveLength(1);
    expect(call?.[1]).toMatch(/inline: "nearest"/);
    expect(call?.[1]).toMatch(/behavior: "instant"/);
  });
});
