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

describe("the field matrix grid takes the tab body's height", () => {
  const FIELD_MATRIX_PANEL = "src/areas/studio/panels/FieldMatrixPanel.tsx";
  const FIELD_MATRIX_GRID = "src/areas/studio/panels/FieldMatrixGrid.tsx";

  it("grows the matrix column to fill the tab body, with no automatic minimum of its own", () => {
    const block = styleBlock(stripComments(read(FIELD_MATRIX_PANEL)), "matrix");

    // The column fills the tab body instead of measuring its content, so the
    // space it hands the grid follows the tab body's own height.
    expect(block).toMatch(/flexGrow: 1/);
    // A flex item that is not a scroll container takes its content height as
    // its automatic minimum, so the column needs the explicit zero to shrink
    // into the tab body at all.
    expect(block).toMatch(/minHeight: 0/);
  });

  it("holds the 24rem floor on a space around the scroll region", () => {
    const block = styleBlock(stripComments(read(FIELD_MATRIX_GRID)), "matrixScrollSpace");

    // The space is a flex column of its own, so the floor binds even when
    // the scroll region inside it shrinks to a short grid's rows.
    expect(block).toMatch(/display: "flex"/);
    expect(block).toMatch(/flexDirection: "column"/);
    expect(block).toMatch(/flex: "1 1 0"/);
    expect(block).toMatch(/minHeight: "24rem"/);
  });

  it("leaves the scroll region's own height to its rows, with no cap or floor", () => {
    const block = styleBlock(stripComments(read(FIELD_MATRIX_GRID)), "matrixScroll");

    // The region's automatic minimum is already zero, so it shrinks to a
    // short grid's rows inside the space that holds the floor.
    expect(block).not.toMatch(/minHeight/);
    expect(block).not.toMatch(/maxHeight/);
    // That shrinking holds only because the region is a scroll container,
    // the way the steps rail's own `overflowY: "auto"` above depends on it.
    expect(block).toMatch(/overflow: "auto"/);
  });

  it("draws the scroll region's own focus ring inside its frame", () => {
    const block = styleBlock(stripComments(read(FIELD_MATRIX_GRID)), "matrixScroll");

    // The frame reaches the tab body's clipping edge, so a positive offset
    // ring would clip there the way `studio-fieldMatrixTabStops.test.tsx`
    // records for this grid's headers; this region pulls its own ring
    // inward the same way.
    expect(block).toMatch(/outlineOffset: "-2px"/);
  });

  it("wraps the scroll region's markup inside the space's own element", () => {
    const source = stripComments(read(FIELD_MATRIX_GRID));

    // The space only holds the floor if its element is the scroll region's
    // actual DOM parent. A style assertion alone cannot see that; this reads
    // the markup and requires `matrixScrollSpace`'s div to open before
    // `matrixScroll`'s div, with nothing between the two but whitespace,
    // `>`, `{(` and `<div`. Removing the wrapper's opening tag fails this
    // match (proven with a one-off `bun -e` run against a copy of the
    // source, recorded in the change's fix report).
    expect(source).toMatch(
      /stylex\.props\(styles\.matrixScrollSpace\)\}>\s*\{\(\s*<div\s+\{\.\.\.stylex\.props\(styles\.matrixScroll\)/,
    );
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

describe("the miniature wraps and clips nothing", () => {
  it("wraps its marks onto a further line, aligned to the baseline", () => {
    const block = styleBlock(stripComments(read("src/areas/studio/panels/FormsTab.tsx")), "miniature");

    // design.md, "The miniature's box": marks and group breaks align to the
    // line's bottom edge, and a long form's marks wrap rather than overrun
    // the card.
    expect(block).toMatch(/flexWrap: "wrap"/);
    expect(block).toMatch(/alignItems: "flex-end"/);
  });

  it("clips no mark that outgrows one line", () => {
    const block = styleBlock(stripComments(read("src/areas/studio/panels/FormsTab.tsx")), "miniature");

    expect(block).not.toMatch(/overflow[XY]?: "hidden"/);
  });
});

describe("the required mark on the muted ground", () => {
  it("draws an ordinary mark as an outline, with no fill of its own", () => {
    const block = styleBlock(stripComments(read("src/areas/studio/panels/FormsTab.tsx")), "miniatureMark");

    expect(block).toMatch(/borderWidth: 1/);
    expect(block).not.toMatch(/backgroundColor/);
  });

  it("fills solid rather than merely coloring text, and reads a semantic alias, never a ramp step", () => {
    const source = stripComments(read("src/areas/studio/panels/FormsTab.tsx"));

    // design.md, "Required marks differ in fill as well as color": a required
    // mark fills solid, so the block sets `backgroundColor`, not `color` — the
    // mark itself is a box, not text. `accentOnMuted` is the semantic alias;
    // `accent400` and its siblings are the ramp. The neighbouring `cardEmpty`
    // reads `accent400` and predates this change, so the pattern stays on
    // this one block.
    const block = styleBlock(source, "miniatureRequired");
    expect(block).toMatch(/backgroundColor: \{\s*default: colors\.accentOnMuted,/);
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

  it("keeps its fill under forced colors, where a plain background is erased", () => {
    const source = stripComments(read("src/areas/studio/panels/FormsTab.tsx"));

    // The audit for forms-tab-form-strip: forced-colors mode maps
    // `accentOnMuted`'s background to Canvas, so a required mark drew as the
    // same outline as an ordinary one. `CanvasText` plus
    // `forcedColorAdjust: "none"` keeps the fill solid there too.
    expect(source).toMatch(/const FORCED_COLORS = "@media \(forced-colors: active\)";/);
    const block = styleBlock(source, "miniatureRequired");
    expect(block).toMatch(/backgroundColor: \{\s*default: colors\.accentOnMuted,\s*\[FORCED_COLORS\]: "CanvasText",?\s*\}/);
    expect(block).toMatch(/forcedColorAdjust: \{\s*default: "auto",\s*\[FORCED_COLORS\]: "none",?\s*\}/);
  });
});

describe("the conditional mark dashes its outline", () => {
  it("draws a dashed outline in the required color, with no fill, and keeps it under forced colors", () => {
    const source = stripComments(read("src/areas/studio/panels/FormsTab.tsx"));
    const block = styleBlock(source, "miniatureConditional");

    // design.md, "The dashed mark": the style stacks on `miniatureMark`, so
    // it declares the dash and the color alone. Forced colors keep a border's
    // style and replace its color, so `CanvasText` plus
    // `forcedColorAdjust: "none"` matches the solid fill and the group break.
    expect(block).toMatch(/borderStyle: "dashed"/);
    expect(block).toMatch(/borderColor: \{\s*default: colors\.accentOnMuted,\s*\[FORCED_COLORS\]: "CanvasText",?\s*\}/);
    expect(block).toMatch(/forcedColorAdjust: \{\s*default: "auto",\s*\[FORCED_COLORS\]: "none",?\s*\}/);
    expect(block).not.toMatch(/backgroundColor/);
    expect(block).not.toMatch(/colors\.[A-Za-z]+[0-9]/);
  });
});

describe("the empty card's foot keeps the control's trailing edge", () => {
  it("gives the open control its own margin, for when it stands alone in the foot", () => {
    const block = styleBlock(stripComments(read("src/areas/studio/panels/FormsTab.tsx")), "openControl");

    expect(block).toMatch(/marginInlineStart: "auto"/);
  });
});

describe("the open control meets the minimum target size", () => {
  it("stands at least 24px tall, WCAG 2.5.8's minimum", () => {
    const block = styleBlock(stripComments(read("src/areas/studio/panels/FormsTab.tsx")), "openControl");

    expect(block).toMatch(/minHeight: 24\b/);
  });
});

describe("the group break survives forced colors", () => {
  it("draws with a 1px border there, since a background alone is erased", () => {
    const source = stripComments(read("src/areas/studio/panels/FormsTab.tsx"));
    const block = styleBlock(source, "miniatureGroupBreak");

    // The audit: the group break is a 1px `background-color` line with no
    // border, so it vanishes under forced colors and the miniature ground
    // merges with the plate. A 1px system-color border, active only under
    // forced colors, keeps the break visible without changing its normal-mode
    // look (design.md, "Required marks differ in fill as well as color").
    expect(block).toMatch(/backgroundColor: colors\.textMuted/);
    expect(block).toMatch(/borderWidth: \{\s*default: 0,\s*\[FORCED_COLORS\]: 1,?\s*\}/);
    expect(block).toMatch(/borderColor: \{\s*default: "transparent",\s*\[FORCED_COLORS\]: "CanvasText",?\s*\}/);
    expect(block).toMatch(/forcedColorAdjust: \{\s*default: "auto",\s*\[FORCED_COLORS\]: "none",?\s*\}/);
  });
});
