/**
 * StyleX 0.19 emits no `border` rule and no `background` rule. A style object
 * declaring either shorthand compiles to nothing. The compiler reports no
 * error, the build stays green, and the border or fill never paints.
 *
 * Measured against the production bundle on 2026-09-08: of 471 rules, four
 * declared `border` and twelve declared `background`, and every one of those
 * sixteen came from a hand-written sheet. Not one carried a StyleX atom
 * selector. 113 declarations across 41 files compiled away, 80 of them a
 * border or a fill that should have painted.
 *
 * `web-styling` bans both keys. This test is the ban.
 *
 * What it cannot see: whether a converted border paints. The harness lays out
 * nothing and resolves no custom property. `docs/browser-checks.md` carries
 * that half, per `development-toolchain`'s split rule.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

/** Both source trees the styling model covers. */
const TREES = [new URL("../src/", import.meta.url).pathname, new URL("../../form-ui/src/", import.meta.url).pathname];

/**
 * The one exemption. `tokens.stylex.ts` declares a design token named `border`
 * through `defineVars`. That is a variable name, not a CSS property, and it
 * compiles to a custom property like every other token.
 */
const EXEMPT = /tokens\.stylex\.ts$/;

/**
 * The keys the compiler drops, as they appear at the head of a line.
 *
 * `border` and `background` are the obvious two. The four sides and the two
 * logical axes drop the same way, which cost the field matrix every rule it
 * draws: `matrixCell` asked for a 1px hairline on two edges and computed
 * `0px/none` on both. An earlier version of this file banned only the first
 * two, and 33 directional declarations across 12 files survived it.
 *
 * The longhands survive. `borderBottomWidth` and its siblings emit atoms,
 * which is why every element already using them kept painting while the ones
 * beside it went blank.
 */
const DROPPED = /^\s*(border|background|border(Top|Bottom|Left|Right|Block|Inline)):\s/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const modules = TREES.flatMap(walk).filter((f) => /\.tsx?$/.test(f) && !EXEMPT.test(f));

/** Every dropped declaration, as `<path>:<line>  <source line>`. */
function hits(files: string[]): string[] {
  return files.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, i) => (DROPPED.test(line) ? [`${file.slice(file.indexOf("packages/"))}:${i + 1}  ${line.trim()}`] : [])),
  );
}

describe("the shorthands StyleX drops", () => {
  it("finds modules to check, so an empty walk cannot pass", () => {
    // A broken path would return no files and report no hit, which reads as
    // a pass. The count is the guard on the guard.
    expect(modules.length).toBeGreaterThan(200);
  });

  it("no style object declares a shorthand the compiler drops", () => {
    // The message carries every hit, so one run names every site to fix
    // rather than one per run.
    expect(hits(modules)).toEqual([]);
  });

  it("reports a file that declares either key", () => {
    // Mutation cover: without this, a walk that silently matched nothing
    // would still pass the assertion above.
    const fixture = new URL("./fixtures/dropped-shorthand.txt", import.meta.url).pathname;
    const found = readFileSync(fixture, "utf8")
      .split("\n")
      .flatMap((line, i) => (DROPPED.test(line) ? [i + 1] : []));
    expect(found).toEqual([3, 4, 5, 6]);
  });

  it("leaves the longhand keys alone", () => {
    const sample = [
      "  borderWidth: 1,",
      '  borderStyle: "solid",',
      "  borderColor: colors.border,",
      "  backgroundColor: colors.surface,",
      "  borderBottomWidth: 1,",
      '  borderBottomStyle: "solid",',
      "  borderBottomColor: colors.border,",
      "  borderInlineStartWidth: 2,",
    ];
    expect(sample.filter((l) => DROPPED.test(l))).toEqual([]);
  });

  it("keeps `background-color: none` out of the tree", () => {
    // `background: "none"` is valid and `background-color: none` is not, so
    // the conversion reads `transparent`. A browser drops the invalid form
    // and the element falls back to whatever else applies.
    const bad = modules.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) => (/backgroundColor:.*"none"/.test(line) ? [`${file}:${i + 1}`] : [])),
    );
    expect(bad).toEqual([]);
  });
});
