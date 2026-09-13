import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * The shell header wraps at every width (`unified-shell`, "The header wraps at
 * every width"). No DOM test library lays out a flex row here, so these checks
 * read the style source; the browser check in `docs/browser-checks.md` reads
 * the thresholds.
 */
const ROOT = new URL("../", import.meta.url).pathname;
const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");

/** Block comments first, then line comments — the order matters for a `//`
 * inside a block comment. A rule discussed in prose is not a rule declared. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** The style object literal named `name`, from its brace to its match. */
function styleBlock(source: string, name: string): string {
  const start = source.indexOf(`${name}: {`);
  expect({ name, found: start > -1 }).toEqual({ name, found: true });
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated style block ${name}`);
}

const CHROME = "src/shell/Chrome.tsx";

describe("the shell header wraps at every width", () => {
  it("wraps the header with no media condition", () => {
    const block = styleBlock(stripComments(read(CHROME)), "header");

    expect({ wrap: /flexWrap: "wrap"/.test(block), names30rem: block.includes("30rem") }).toEqual({
      wrap: true,
      names30rem: false,
    });
  });

  it("grows the account group into its line's free room, with no leading auto margin", () => {
    const block = styleBlock(stripComments(read(CHROME)), "accountGroup");

    expect({ grow: /flexGrow: 1\b/.test(block), marginLeft: /marginLeft/.test(block) }).toEqual({
      grow: true,
      marginLeft: false,
    });
  });

  it("contains the identity span's inline size, grows it and ends its text, over the 6rem floor", () => {
    const block = styleBlock(stripComments(read(CHROME)), "accountName");

    // `contain` keeps the actor's name out of the group's content width, so
    // the line breaks on the 6rem floor instead of the whole name.
    expect({
      contain: /contain: "inline-size"/.test(block),
      grow: /flexGrow: 1\b/.test(block),
      textAlign: /textAlign: "end"/.test(block),
      floor: /minWidth: "6rem"/.test(block),
    }).toEqual({ contain: true, grow: true, textAlign: true, floor: true });
  });

  it("leaves the area nav with no flex shorthand, and keeps its two 30rem rules", () => {
    const block = styleBlock(stripComments(read("src/shell/navStyles.ts")), "nav");

    expect({
      flexShorthand: /\bflex: /.test(block),
      order: /order: \{ default: 0, "@media \(max-width: 30rem\)": 3 \}/.test(block),
      basis: /flexBasis: \{ default: "auto", "@media \(max-width: 30rem\)": "100%" \}/.test(block),
    }).toEqual({ flexShorthand: false, order: true, basis: true });
  });
});
