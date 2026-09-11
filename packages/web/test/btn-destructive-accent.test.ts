/**
 * `tokens.css` gave `.btn-destructive` the accent `color` and `border-color`
 * above `.btn-secondary`'s ink `color` and divider `border-color`. Both
 * selectors weigh one class, so the later rule in source order won: every
 * destructive control rendered like the plain secondary button beside it. A
 * browser measured it on 2026-09-11, on the form editor's group Remove
 * control — see this change's proposal,
 * `openspec/changes/destructive-buttons-show-the-accent/proposal.md`.
 *
 * Four facts pin the fix. The `.btn-destructive` rule must stay ordered after
 * every `.btn-secondary` rule, so its accent wins the cascade. Every
 * `className` naming `btn-destructive` must also name `btn-secondary`, since
 * the accent treatment rides alongside the secondary control's background
 * and hover wash rather than replacing them. The `.btn-destructive:hover`
 * and `:active` rule, also after every `.btn-secondary` rule, sets text and
 * border to `--color-accent-on-muted`: the plain accent measures under 4.5:1
 * on the secondary control's hover and pressed washes. And the
 * `.btn-destructive:disabled` rule follows that one and sets both back to
 * `--color-accent`: a disabled control keeps the accent under the pointer,
 * and the two rules tie at two classes.
 *
 * What it cannot see: whether the accent actually renders. `docs/browser-checks.md`
 * carries that half, per `development-toolchain`'s split rule.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

const TOKENS_CSS = new URL("../src/shell/tokens.css", import.meta.url).pathname;

const SRC = new URL("../src/", import.meta.url).pathname;

// Matches the selector prefix, not one exact opener: a grouped selector line
// ending in "," (as tokens.css:138-139 and :191-192 both use) and any
// pseudo-class or attribute after .btn-secondary both count as a rule that
// must precede .btn-destructive.
const SECONDARY_OPENER = /^\.btn-secondary\b[^{]*[{,]\s*$/;

const HOVER_AND_PRESS = /^\.btn-destructive:hover,\s*\.btn-destructive:active\s*\{([^}]*)\}/m;

const DISABLED = /^\.btn-destructive:disabled,\s*\.btn-destructive\[aria-disabled="true"\]\s*\{([^}]*)\}/m;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const modules = walk(SRC).filter((f) => /\.tsx?$/.test(f));

/** Line indices opening a rule `opener` matches, in source order. */
function ruleLines(css: string, opener: RegExp): number[] {
  return css.split("\n").flatMap((line, i) => (opener.test(line) ? [i] : []));
}

/** A rule body's declarations, property to value. */
function declarations(body: string): Record<string, string> {
  return Object.fromEntries(
    body.split(";").flatMap((declaration) => {
      const colon = declaration.indexOf(":");
      return colon < 0 ? [] : [[declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()]];
    }),
  );
}

/**
 * Every `className` site naming `btn-destructive`, and whether it also names `btn-secondary`.
 *
 * ponytail: scans one line at a time. Ceiling: a `className` wrapped across
 * multiple lines goes unscanned and passes silently, since neither line
 * carries both tokens — the sites-found positive control below does not
 * catch it, because it only guards against an empty scan, not a partial
 * one. Upgrade: read the JSX through the TypeScript compiler API instead of
 * a text scan, when a call site actually wraps.
 */
function destructiveClassNameSites(files: string[]): { site: string; pairsSecondary: boolean }[] {
  return files.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, i) => {
        // Requiring `className` on the same line excludes a comment that
        // merely mentions the class, such as ProcessHeaderBar.tsx's doc
        // comment above the discard dialog.
        if (!line.includes("className") || !/\bbtn-destructive\b/.test(line)) return [];
        const rel = file.slice(file.indexOf("packages/"));
        return [{ site: `${rel}:${i + 1}`, pairsSecondary: /\bbtn-secondary\b/.test(line) }];
      }),
  );
}

describe("the destructive button's accent outline", () => {
  it("finds modules to check, so an empty walk cannot pass", () => {
    // A broken path would return no files and report no hit, which reads as
    // a pass. The count is the guard on the guard.
    // 150 exceeds any one area (studio: 126) and either extension (.ts: 128), so a partial walk fails.
    expect(modules.length).toBeGreaterThan(150);
  });

  it("orders .btn-destructive after every .btn-secondary rule in tokens.css", () => {
    const css = readFileSync(TOKENS_CSS, "utf8");
    const destructiveLines = ruleLines(css, /^\.btn-destructive\s*\{/);
    const secondaryLines = ruleLines(css, SECONDARY_OPENER);
    expect(destructiveLines.length).toBe(1);
    expect(secondaryLines.length).toBeGreaterThan(0);
    expect(destructiveLines[0]).toBeGreaterThan(Math.max(...secondaryLines));
  });

  it("reads --color-accent-on-muted on hover and press, in a rule after every .btn-secondary rule", () => {
    const css = readFileSync(TOKENS_CSS, "utf8");
    const rule = HOVER_AND_PRESS.exec(css);
    expect(rule).not.toBeNull();
    const line = css.slice(0, rule?.index ?? 0).split("\n").length - 1;
    expect(line).toBeGreaterThan(Math.max(...ruleLines(css, SECONDARY_OPENER)));
    expect(declarations(rule?.[1] ?? "")).toMatchObject({
      color: "var(--color-accent-on-muted)",
      "border-color": "var(--color-accent-on-muted)",
    });
  });

  it("keeps --color-accent on a disabled control, in a rule after the hover and press rule", () => {
    const css = readFileSync(TOKENS_CSS, "utf8");
    const hoverAndPress = HOVER_AND_PRESS.exec(css);
    const disabled = DISABLED.exec(css);
    expect(hoverAndPress).not.toBeNull();
    expect(disabled).not.toBeNull();
    expect(disabled?.index ?? -1).toBeGreaterThan(hoverAndPress?.index ?? Number.POSITIVE_INFINITY);
    expect(declarations(disabled?.[1] ?? "")).toMatchObject({
      color: "var(--color-accent)",
      "border-color": "var(--color-accent)",
    });
  });

  it("pairs every btn-destructive className with btn-secondary", () => {
    const sites = destructiveClassNameSites(modules);
    // Mutation cover: a scan matching nothing would pass vacuously.
    expect(sites.length).toBeGreaterThan(0);
    const unpaired = sites.filter((s) => !s.pairsSecondary).map((s) => s.site);
    expect(unpaired).toEqual([]);
  });
});
