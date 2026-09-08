/**
 * The Field matrix's pressed bulk badge fills with its own flag color, never
 * with the accent.
 *
 * The badge declared `background: colors.accent` for as long as it existed,
 * and StyleX drops that shorthand, so the fill never painted and nobody saw
 * the problem. `stylex-shorthand-repair` converted the declaration, which
 * made six accent fills appear on one screen at once.
 *
 * Three rules say the accent is wrong here, and the last one is measurable:
 *
 * 1. The legend twelve pixels away names one color per flag. A REQ badge
 *    filled with the accent contradicts the key that explains it.
 * 2. `design-language.md` rule 3: the accent marks state and the one primary
 *    action per screen. Publish already holds it.
 * 3. The accent fill clears the 4.5:1 AA floor by 0.025, at 4.525:1 under
 *    this badge's own 11px text. Each flag color clears it by 1.9 or more.
 *
 * The contrast case is asserted rather than described, over the real tokens
 * in both schemes, so a token edit that breaks it fails here first.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const ROOT = new URL("../", import.meta.url).pathname;
const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");

const GRID = "src/areas/studio/panels/FieldMatrixGrid.tsx";
const TOKENS = "src/shell/tokens.css";

/** WCAG 2.1 relative luminance, then the contrast ratio between two hexes. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const chan = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The value of one custom property. `scheme` picks which declaration wins:
 * "light" takes the first, "dark" takes the last, since the dark block is a
 * `prefers-color-scheme` override further down the same file.
 */
function token(css: string, name: string, scheme: "light" | "dark"): string {
  const all = [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "gi"))].map((m) => m[1]!);
  expect(all.length).toBeGreaterThan(0);
  return scheme === "light" ? all[0]! : all[all.length - 1]!;
}

const FLAGS = ["visible", "required", "readonly"] as const;

describe("the mixed bulk badge", () => {
  const grid = read(GRID);

  it("carries one mixed style per flag", () => {
    for (const flag of FLAGS) {
      const cap = `${flag[0]!.toUpperCase()}${flag.slice(1)}`;
      expect(grid).toContain(`matrixFlagBadgeMixed${cap}: {`);
    }
  });

  it("differs from the pressed style by the fill", () => {
    // Mixed and full share the flag's color. The fill is what separates
    // them, so an author reads flag and state from one mark.
    for (const flag of FLAGS) {
      const cap = `${flag[0]!.toUpperCase()}${flag.slice(1)}`;
      const block = (name: string) => {
        const start = grid.indexOf(`${name}: {`);
        expect(start).toBeGreaterThan(-1);
        return grid.slice(start, grid.indexOf("},", start));
      };
      const mixed = block(`matrixFlagBadgeMixed${cap}`);
      const full = block(`matrixFlagBadgePressed${cap}`);
      expect(full).toContain(`backgroundColor: colors.flag${cap}`);
      expect(mixed).not.toContain("backgroundColor");
      expect(mixed).toContain(`borderColor: colors.flag${cap}`);
      expect(mixed).toContain(`color: colors.flag${cap}`);
    }
  });

  it("picks its style and its aria-pressed from the same state", () => {
    expect(grid).toContain("badgeStateStyle(state, key)");
    expect(grid).toContain("badgeAriaPressed(state)");
    // A tri-state toggle button says "mixed". That is the ARIA value for
    // exactly this case, so the state reaches assistive tech unaided.
    expect(grid).toContain('state === "mixed" ? "mixed" : false');
  });

  it("leaves the empty state carrying neither flag color", () => {
    const start = grid.indexOf("matrixFlagBadge: {");
    const base = grid.slice(start, grid.indexOf("},", grid.indexOf(":hover", start)));
    expect(base).toContain("borderColor: colors.border");
    expect(base).toContain("color: colors.textMuted");
  });
});

describe("the pressed bulk badge", () => {
  const grid = read(GRID);

  it("carries one pressed style per flag, and no shared accent one", () => {
    for (const flag of FLAGS) {
      const name = `matrixFlagBadgePressed${flag[0]!.toUpperCase()}${flag.slice(1)}`;
      expect(grid).toContain(`${name}: {`);
    }
    // The accent-filled style is gone, not merely unused.
    expect(grid).not.toMatch(/matrixFlagBadgePressed: \{/);
  });

  it("fills each badge from its own flag token", () => {
    for (const flag of FLAGS) {
      const cap = `${flag[0]!.toUpperCase()}${flag.slice(1)}`;
      const block = grid.slice(grid.indexOf(`matrixFlagBadgePressed${cap}: {`));
      const body = block.slice(0, block.indexOf("},"));
      expect(body).toContain(`backgroundColor: colors.flag${cap}`);
      expect(body).toContain(`borderColor: colors.flag${cap}`);
      expect(body).not.toContain("colors.accent,");
    }
  });

  it("picks the style from the same key the button announces", () => {
    // A JS-computed choice reading the flag, not a selector on the DOM.
    expect(grid).toContain("FLAG_BADGE_PRESSED[key]");
    for (const flag of FLAGS) {
      const cap = `${flag[0]!.toUpperCase()}${flag.slice(1)}`;
      expect(grid).toContain(`${flag}: styles.matrixFlagBadgePressed${cap},`);
    }
  });

  it("clears the AA floor for 11px text, in both schemes", () => {
    const css = read(TOKENS);
    for (const scheme of ["light", "dark"] as const) {
      // `--color-accent-contrast` resolves to `--paper-50`, which the dark
      // block redefines, so the badge text flips with the ground under it.
      const text = token(css, "paper-50", scheme);
      for (const flag of FLAGS) {
        const fill = token(css, `color-flag-${flag}`, scheme);
        const ratio = contrast(text, fill);
        expect(ratio, `${scheme} ${flag}: ${text} on ${fill}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("beats the accent fill it replaced, by a real margin", () => {
    // Mutation cover, and the substantive claim. `--color-accent` resolves
    // to `--stamp-600`, which clears AA at 4.525:1 — by 0.025. A token edit
    // of 1% would sink it. Each flag color stands 1.9 or more above that, so
    // the swap buys margin, not merely compliance.
    const css = read(TOKENS);
    const text = token(css, "paper-50", "light");
    const accent = contrast(text, token(css, "stamp-600", "light"));
    expect(accent).toBeGreaterThanOrEqual(4.5);
    expect(accent).toBeLessThan(4.6);
    for (const flag of FLAGS) {
      const flagRatio = contrast(text, token(css, `color-flag-${flag}`, "light"));
      expect(flagRatio - accent, `${flag} margin over the accent`).toBeGreaterThan(1.9);
    }
  });
});
