import { readdirSync, readFileSync } from "node:fs";
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

describe("the path row's label leads key, both stacked, and the target select is styled", () => {
  const FILE = "src/areas/studio/panels/PathsPanel.tsx";

  it("renders the label field before the key field, both in the masthead's stacked pattern", () => {
    const source = stripComments(read(FILE));

    const labelIndex = source.indexOf("fieldLabelText)}>label</span>");
    const keyIndex = source.indexOf("fieldLabelText)}>key</span>");

    expect(labelIndex).toBeGreaterThan(-1);
    expect(keyIndex).toBeGreaterThan(-1);
    expect(labelIndex).toBeLessThan(keyIndex);
  });

  it("gives the key field's control the mono treatment the masthead gives a step's own key", () => {
    const source = stripComments(read(FILE));

    const keyIndex = source.indexOf("fieldLabelText)}>key</span>");
    const keyFieldBlock = source.slice(keyIndex, source.indexOf("</label>", keyIndex));

    expect(keyFieldBlock).toMatch(/styles\.monoInput/);
  });

  it("drops the select's own chevron in favor of a decorative one, layered over the trailing edge", () => {
    const source = stripComments(read(FILE));

    const selectBlock = styleBlock(source, "select");
    expect(selectBlock).toMatch(/appearance: "none"/);

    const iconBlock = styleBlock(source, "selectIcon");
    expect(iconBlock).toMatch(/position: "absolute"/);
    expect(iconBlock).toMatch(/color: colors\.textMuted/);
    expect(iconBlock).toMatch(/pointerEvents: "none"/);
  });

  it("wraps both target selects — the path row's and the add-path selector's — in the studio select pattern", () => {
    const source = stripComments(read(FILE));

    // `styles\.select\)` alone, not `styles.selectWrap)`/`styles.selectIcon)`:
    // the closing paren right after "select" picks out only the bare style.
    const selectWrapCount = [...source.matchAll(/stylex\.props\(styles\.selectWrap\)/g)].length;
    const selectCount = [...source.matchAll(/stylex\.props\(styles\.select\)/g)].length;
    const iconCount = [...source.matchAll(/stylex\.props\(styles\.selectIcon\)/g)].length;
    const chevronCount = [...source.matchAll(/<ChevronDown size=\{18\} strokeWidth=\{1\.75\} aria-hidden="true" \/>/g)].length;

    expect(selectWrapCount).toBe(2);
    expect(selectCount).toBe(2);
    expect(iconCount).toBe(2);
    expect(chevronCount).toBe(2);
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

describe("the legend wraps and clips nothing", () => {
  it("wraps onto a further line, 16px between items and 4px between lines", () => {
    const block = styleBlock(stripComments(read("src/areas/studio/panels/FormsTab.tsx")), "legend");

    // design.md, "The legend's box and the height budget": one line where
    // the tab body is wide enough, a further line below about 720px.
    expect(block).toMatch(/display: "flex"/);
    expect(block).toMatch(/flexWrap: "wrap"/);
    expect(block).not.toMatch(/overflow[XY]?: "hidden"/);
    expect(block).toMatch(/columnGap: space\.s4\b/);
    expect(block).toMatch(/rowGap: space\.s1\b/);
  });

  it("sets each item's words 4px after its sample group, on the group's bottom edge", () => {
    const block = styleBlock(stripComments(read("src/areas/studio/panels/FormsTab.tsx")), "legendItem");

    expect(block).toMatch(/display: "flex"/);
    expect(block).toMatch(/alignItems: "flex-end"/);
    expect(block).toMatch(/columnGap: space\.s1\b/);
  });

  it("stands each sample group 24px tall, its marks 4px apart on the bottom edge", () => {
    const block = styleBlock(stripComments(read("src/areas/studio/panels/FormsTab.tsx")), "legendSample");

    // A mark is an empty span, and an inline span ignores a width and a
    // height, so the group is a flex container.
    expect(block).toMatch(/display: "flex"/);
    expect(block).toMatch(/alignItems: "flex-end"/);
    expect(block).toMatch(/columnGap: space\.s1\b/);
    expect(block).toMatch(/\bheight: 24\b/);
  });
});

describe("the grid scrolls under the legend", () => {
  it("keeps its own vertical scroll, so the legend above it stays put", () => {
    const block = styleBlock(stripComments(read("src/areas/studio/panels/FormsTab.tsx")), "grid");

    expect(block).toMatch(/overflowY: "auto"/);
  });
});

describe("the card's heading keeps the label's look", () => {
  it("resets every h2 declaration global.css makes, at weight 800", () => {
    const block = styleBlock(stripComments(read("src/areas/studio/panels/FormsTab.tsx")), "name");

    // design.md, "The step label becomes a level-2 heading": `global.css`
    // gives every `h2` the heading face, a size, uppercase, tracking, a muted
    // color and margins. A compiled class outranks the element selector, so
    // the label prints as body text at weight 800.
    expect(block).toMatch(/fontWeight: 800\b/);
    expect(block).toMatch(/\bmargin: 0\b/);
    expect(block).toMatch(/fontFamily: fonts\.body\b/);
    expect(block).toMatch(/fontSize: "inherit"/);
    expect(block).toMatch(/textTransform: "none"/);
    expect(block).toMatch(/letterSpacing: "normal"/);
    expect(block).toMatch(/\bcolor: colors\.text\b/);
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
    // `accent400` and its siblings are the ramp.
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

  it("keeps its fill and its border in one system color under forced colors", () => {
    const source = stripComments(read("src/areas/studio/panels/FormsTab.tsx"));

    // The audit for forms-tab-form-strip: forced-colors mode maps
    // `accentOnMuted`'s background to Canvas, so a required mark drew as the
    // same outline as an ordinary one. `CanvasText` plus
    // `forcedColorAdjust: "none"` keeps the fill solid there too. That
    // `none` also stops the UA from replacing the border's color, so the
    // border declares `CanvasText` as well: the outline, the fill and the dash
    // read one system color and differ by shape alone (design.md, "The dashed
    // mark").
    expect(source).toMatch(/const FORCED_COLORS = "@media \(forced-colors: active\)";/);
    const block = styleBlock(source, "miniatureRequired");
    expect(block).toMatch(/backgroundColor: \{\s*default: colors\.accentOnMuted,\s*\[FORCED_COLORS\]: "CanvasText",?\s*\}/);
    expect(block).toMatch(/borderColor: \{\s*default: colors\.accentOnMuted,\s*\[FORCED_COLORS\]: "CanvasText",?\s*\}/);
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

type RGB = [number, number, number];

/** WCAG 2 relative luminance of one sRGB color, channels on 0-255, per
 * design.md's "Contrast figures". A channel may be fractional, since a
 * composited wash lands between integers. */
function luminance(color: RGB): number {
  const [r, g, b] = color.map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG 2 contrast ratio, the lighter color's luminance on top. */
function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * One custom property's hex, read as `token()` in
 * `studio-fieldMatrixBadge.test.ts` reads it: "light" takes the first
 * declaration, "dark" the last, since the dark block overrides further down
 * the same file.
 */
function token(css: string, name: string, scheme: "light" | "dark"): RGB {
  const all = [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "gi"))].map((m) => m[1]!);
  expect({ name, declared: all.length > 0 }).toEqual({ name, declared: true });
  const hex = scheme === "light" ? all[0]! : all[all.length - 1]!;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
}

/** The CSS block opening at `header`, from the header to its matching brace. */
function cssBlock(css: string, header: string): string {
  const start = css.indexOf(header);
  expect({ header, found: start > -1 }).toEqual({ header, found: true });
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`unterminated css block ${header}`);
}

const DARK_SCHEME = "@media (prefers-color-scheme: dark)";

describe("the advisory tone reads its own role", () => {
  it("declares the primitive and the alias in the light block, and the override alone in the dark block", () => {
    const css = stripComments(read(TOKENS_CSS));
    const light = cssBlock(css, ":root {");
    const dark = cssBlock(css, DARK_SCHEME);

    // design.md, "The advisory role rides its own primitive": the role
    // aliases the primitive and follows its dark override, as the dormant
    // and refusal roles do.
    expect(light).toContain("--advisory-500: #e25a40;");
    expect(light).toContain("--color-advisory: var(--advisory-500);");
    expect(dark).toContain("--advisory-500: #ff9783;");
    expect(dark).not.toContain("--color-advisory");
  });

  it("aliases the primitive and the role in the token module", () => {
    const tokenModule = stripComments(read(TOKENS_STYLEX));

    expect(tokenModule).toContain('advisory500: "var(--advisory-500)"');
    expect(tokenModule).toContain('advisory: "var(--color-advisory)"');
  });

  it("clears WCAG 1.4.11's 3:1 non-text minimum against paper and ledger, in both schemes", () => {
    const css = stripComments(read(TOKENS_CSS));

    // The light role reads 3.0035:1 on ledger, so a token edit that drops it
    // under the minimum fails here.
    for (const scheme of ["light", "dark"] as const) {
      const role = token(css, "advisory-500", scheme);
      for (const ground of ["paper-50", "ledger-100"]) {
        const ratio = contrast(role, token(css, ground, scheme));
        expect(ratio, `${scheme}: the advisory role on ${ground}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  // design.md's context table: every block that draws an advisory mark.
  const READERS = [
    ["src/areas/studio/panels/FormsTab.tsx", "cardEmpty", "borderColor"],
    ["src/areas/studio/panels/shared/ConditionBuilder.tsx", "conditionRowIncomplete", "borderColor"],
    ["src/areas/studio/panels/shared/RuleBuilder.tsx", "conditionRowIncomplete", "borderColor"],
    ["src/areas/studio/panels/MigrationSpecEditor.tsx", "studioMapUnresolved", "borderColor"],
    ["src/areas/studio/panels/DataSourcesPanel.tsx", "studioWarning", "borderLeftColor"],
    ["src/areas/studio/panels/FieldCatalogPanel.tsx", "studioWarning", "borderLeftColor"],
    ["src/areas/studio/panels/ProcessHeaderBar.tsx", "warning", "borderLeftColor"],
    ["src/areas/studio/panels/shared/InstanceQueryForm.tsx", "studioWarning", "borderLeftColor"],
    ["src/areas/studio/screens/FormEditorScreen.tsx", "studioWarning", "borderLeftColor"],
    ["src/areas/studio/screens/MigrationPlanScreen.tsx", "studioWarning", "borderLeftColor"],
    ["src/areas/studio/screens/ProcessesScreen.tsx", "warning", "borderLeftColor"],
  ] as const;

  for (const [file, name, property] of READERS) {
    it(`${name} in ${file} reads the role for its ${property}`, () => {
      const block = styleBlock(stripComments(read(file)), name);

      expect(block).toMatch(new RegExp(`\\b${property}: colors\\.advisory,`));
    });
  }

  it("leaves no module reading the accent ramp's light step, and reads the role on a border color alone", () => {
    const modules = ["src", "../form-ui/src"].flatMap((root) =>
      readdirSync(`${ROOT}${root}`, { recursive: true, encoding: "utf8" })
        .filter((path) => /\.tsx?$/.test(path))
        .map((path) => `${root}/${path.replaceAll("\\", "/")}`),
    );
    // A walk that finds nothing would pass the two lists below.
    expect(modules).toContain("src/areas/studio/panels/FormsTab.tsx");
    expect(modules).toContain("../form-ui/src/tokens.stylex.ts");

    const rampReaders: string[] = [];
    const offBorder: string[] = [];
    for (const file of modules) {
      const source = stripComments(read(file));
      // The primitive behind the role counts as a ramp read too: a component
      // reads the role, never the step under it.
      if (/\bcolors\.(?:accent400|advisory500)\b/.test(source)) rampReaders.push(file);
      const reads = source.match(/\bcolors\.advisory\b/g)?.length ?? 0;
      const onBorder = source.match(/\bborder[A-Za-z]*Color: colors\.advisory\b/g)?.length ?? 0;
      if (reads !== onBorder) offBorder.push(file);
    }

    expect(rampReaders).toEqual([]);
    expect(offBorder).toEqual([]);
  });
});

describe("the authoring command turns its text to ink under the pointer", () => {
  const STRIP = "src/areas/studio/panels/FormTabStrip.tsx";
  const COMMANDS = [
    ["src/areas/studio/panels/FormsTab.tsx", "openControl"],
    [STRIP, "control"],
    ["src/areas/studio/panels/ChangeList.tsx", "command"],
  ] as const;

  for (const [file, name] of COMMANDS) {
    it(`${name} in ${file} sets slate text at rest and ink under the pointer and while pressed, over its two washes`, () => {
      const block = styleBlock(stripComments(read(file)), name);

      // design.md, "The command's text turns to ink on hover and on press".
      // StyleX orders `:active` (170) after `:hover` (130), so a pressed
      // control takes its press values.
      expect(block).toMatch(/\bcolor: \{\s*default: colors\.textMuted,\s*":hover": colors\.text,\s*":active": colors\.text,?\s*\}/);
      expect(block).not.toMatch(/\bcolor: colors\./);
      expect(block).toMatch(
        /backgroundColor: \{\s*default: "transparent",\s*":hover": colors\.surfaceMuted,\s*":active": `color-mix\(in srgb, \$\{colors\.text\} 14%, transparent\)`,?\s*\}/,
      );
    });
  }

  it("controlDisabled in the strip holds slate text and a transparent ground at rest, under the pointer and while pressed", () => {
    const block = styleBlock(stripComments(read(STRIP)), "controlDisabled");

    // design.md, "A disabled command takes no hover or press look": the block
    // stacks after `control`, so it restates all three conditions of both
    // properties.
    expect(block).toMatch(/\bcolor: \{\s*default: colors\.textMuted,\s*":hover": colors\.textMuted,\s*":active": colors\.textMuted,?\s*\}/);
    expect(block).toMatch(/backgroundColor: \{\s*default: "transparent",\s*":hover": "transparent",\s*":active": "transparent",?\s*\}/);
  });

  it("holds ink at 4.5:1 or more against the hover wash and the press wash, in both schemes", () => {
    const css = stripComments(read(TOKENS_CSS));

    for (const scheme of ["light", "dark"] as const) {
      const ink = token(css, "ink-900", scheme);
      const paper = token(css, "paper-50", scheme);
      const ledger = token(css, "ledger-100", scheme);
      // `color-mix(in srgb, ink 14%, transparent)` is ink at alpha 0.14,
      // composited over the paper plate channel by channel.
      const press = ink.map((c, i) => 0.14 * c + 0.86 * paper[i]!) as RGB;

      expect(contrast(ink, ledger), `${scheme}: ink on the hover wash`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ink, press), `${scheme}: ink on the press wash`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
