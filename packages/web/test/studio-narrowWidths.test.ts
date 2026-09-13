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

const FORM_EDITOR = "src/areas/studio/screens/FormEditorScreen.tsx";
const FORM_PREVIEW = "src/areas/studio/panels/FormPreview.tsx";

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
