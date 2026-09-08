import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * The design-language rules the guided surface broke, guarded at the source.
 *
 * Six defects reached a green suite: the steps rail scrolled the document
 * instead of itself, StyleX dropped a `border: none` shorthand and left ten
 * fieldsets in the UA's 2px groove, one rule stood at 3px, one softened into
 * a tint, four gaps missed the 4-point scale, and the required asterisk read
 * under 4.5:1 on the muted ground. None of them is visible to a harness that
 * cannot lay out a flex column or resolve a custom property, which is why
 * they got through — so they are asserted the way `studio-processSurface`
 * asserts the surface's own shape: read the file, match a pattern.
 *
 * A browser check covers what this cannot see, per `development-toolchain`'s
 * split rule: that the rail actually scrolls inside its column at 1440x900,
 * that no fieldset computes a groove, and the two contrast ratios.
 *
 * The scale and rule-weight checks run over the four files this change owns,
 * not the whole area. Six sibling panels carry a 3px left rule and eight
 * carry `border: "none"` today; a wider pattern would fail on all of them
 * and this change is not their cleanup.
 */
const ROOT = new URL("../", import.meta.url).pathname;
const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");

/** Block comments first, then line comments — the order matters for a `//`
 * inside a block comment. A rule discussed in prose is not a rule declared. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const SURFACE = "src/areas/studio/screens/EditScreen.tsx";
const TOKENS_CSS = "src/shell/tokens.css";
const TOKENS_STYLEX = "../form-ui/src/tokens.stylex.ts";

/** The four the guided surface added. */
const GUIDED = [
  "src/areas/studio/panels/StepsRail.tsx",
  "src/areas/studio/panels/StepPage.tsx",
  "src/areas/studio/panels/FormsTab.tsx",
  "src/areas/studio/panels/FormPreview.tsx",
];

/** The `styles.<name>` object literal, from its brace to its match. */
function styleBlock(source: string, name: string): string {
  const start = source.indexOf(`${name}: {`);
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated style block ${name}`);
}

describe("the steps rail scrolls, not the document", () => {
  it("gives the edit screen the viewport's height rather than its content's", () => {
    const block = styleBlock(stripComments(read(SURFACE)), "studioEditScreen");

    // `.shell` sets `min-height: 100vh` and no height, so it sizes to its
    // items. An `auto` basis feeds this screen's content back into that sum
    // and the whole document grows; a zero basis leaves `.shell` at 100vh.
    expect(block).toMatch(/flex: "1 1 0"/);
    // And the floor has to come off, or the screen cannot shrink into what
    // `.shell` hands back. A flex item's `min-height` is `auto` by default.
    expect(block).toMatch(/minHeight: 0/);
  });

  it("caps the rail itself only where no column bounds it", () => {
    const block = styleBlock(stripComments(read(GUIDED[0]!)), "rail");

    // Below the breakpoint the rail stands over the step page, in a row of
    // its own that no grid bounds, so it caps itself. Above it the tab body's
    // bounded height does the work and a cap would fight the column.
    expect(block).toMatch(/maxHeight: \{ default: "none", \[NARROW\]: "20rem" \}/);
    expect(block).toMatch(/overflowY: "auto"/);
    expect(block).toMatch(/minHeight: 0/);
  });
});

describe("what StyleX drops", () => {
  it("clears a fieldset's UA groove with the longhand", () => {
    for (const file of [...GUIDED, "src/areas/studio/panels/PathsPanel.tsx"]) {
      // StyleX drops `border: none` the way it dropped `background: none`,
      // and a `<fieldset>` keeps `2px groove` when it does.
      expect(stripComments(read(file))).not.toMatch(/border: "none"/);
    }
  });

  it("resets the groove once, for every fieldset in the package", () => {
    // StyleX emits no `border` shorthand at all, so no fieldset style can
    // clear the UA default with one. Two components name their fieldset with
    // a class that has no rule anywhere, and `FieldForm` carries the same
    // groove into a participant's own step form, so the reset is an element
    // rule in the one hand-written sheet.
    expect(read("src/shell/global.css")).toMatch(/fieldset \{\n\s*border: none;\n\}/);
  });

  it("states a kept frame in the component's own style, in longhands", () => {
    // A class beats the element selector, so a fieldset that means to keep a
    // frame says so itself — and says it in longhands, since the shorthand
    // never reaches the element.
    for (const [file, name] of [
      ["src/areas/studio/screens/PlayerScreen.tsx", "panel"],
      ["src/areas/studio/screens/ToolsScreen.tsx", "panel"],
      ["src/areas/studio/screens/MigrationPlanScreen.tsx", "panel"],
      ["src/areas/studio/panels/PathsPanel.tsx", "studioOnlyWhen"],
      ["src/areas/studio/panels/MigrationSpecEditor.tsx", "studioMapSection"],
    ] as const) {
      const block = styleBlock(stripComments(read(file)), name);

      expect({ file, block: block.includes("borderWidth: 1") }).toEqual({ file, block: true });
      expect({ file, block: block.includes('borderStyle: "solid"') }).toEqual({ file, block: true });
      expect({ file, block: block.includes("borderColor: colors.border") }).toEqual({ file, block: true });
    }
  });
});

describe("the design language's own numbers", () => {
  it("takes every gap off the 4-point scale", () => {
    for (const file of GUIDED) {
      const off = [...stripComments(read(file)).matchAll(/(?:column|row)?[Gg]ap: (\d+)/g)]
        .map((m) => Number(m[1]))
        .filter((px) => px % 4 !== 0);

      expect({ file, off }).toEqual({ file, off: [] });
    }
  });

  it("keeps to the two rule weights and nothing between them", () => {
    for (const file of GUIDED) {
      const off = [...stripComments(read(file)).matchAll(/border[A-Za-z]*Width: (\d+)/g)]
        .map((m) => Number(m[1]))
        .filter((px) => px > 2);

      expect({ file, off }).toEqual({ file, off: [] });
    }
  });

  it("softens no rule into a tint", () => {
    for (const file of GUIDED) {
      expect(stripComments(read(file))).not.toMatch(/border[A-Za-z]*Color: `?color-mix/);
    }
  });
});

describe("the required mark on the muted ground", () => {
  it("reads a semantic alias, never a ramp step", () => {
    const source = stripComments(read("src/areas/studio/panels/FormsTab.tsx"));

    // `design-language.md`: a component reads a semantic role, never a hex or
    // a ramp step directly. `accentOnMuted` is the alias, `accent400` and its
    // siblings are the ramp. The neighbouring `cardEmpty` reads `accent400`
    // and predates this change, so the pattern stays on this one block.
    const block = styleBlock(source, "miniatureRequired");
    expect(block).toMatch(/color: colors\.accentOnMuted/);
    expect(block).not.toMatch(/colors\.accent[0-9]/);
  });

  it("picks a step per scheme, because the accent ramp carries no dark override", () => {
    const css = read(TOKENS_CSS);
    const dark = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));

    // Light: --color-accent-700 (#ae1800) reads 5.91:1 on --ledger-100
    // (#eae9e9). Dark: --color-accent-400 (#ff9783) reads 6.71:1 on dark's
    // --ledger-100 (#2d2b2b). The plain role reads 4.17:1 and 4.46:1.
    expect(css).toContain("--color-accent-on-muted: var(--color-accent-700);");
    expect(dark).toContain("--color-accent-on-muted: var(--color-accent-400);");
    expect(read(TOKENS_STYLEX)).toContain('accentOnMuted: "var(--color-accent-on-muted)"');
  });
});
