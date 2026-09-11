/**
 * `tokens.css` gave `.btn-destructive` the accent `color` and `border-color`
 * above `.btn-secondary`'s ink `color` and divider `border-color`. Both
 * selectors weigh one class, so the later rule in source order won: every
 * destructive control rendered like the plain secondary button beside it. A
 * browser measured it on 2026-09-11, on the form editor's group Remove
 * control — see this change's proposal,
 * `openspec/changes/destructive-buttons-show-the-accent/proposal.md`.
 *
 * Two facts pin the fix. The `.btn-destructive` rule must stay ordered after
 * every `.btn-secondary` rule, so its accent wins the cascade. And every
 * `className` naming `btn-destructive` must also name `btn-secondary`, since
 * the accent treatment rides alongside the secondary control's background
 * and hover wash rather than replacing them.
 *
 * What it cannot see: whether the accent actually renders. `docs/browser-checks.md`
 * carries that half, per `development-toolchain`'s split rule.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

const TOKENS_CSS = new URL("../src/shell/tokens.css", import.meta.url).pathname;

const SRC = new URL("../src/", import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const modules = walk(SRC).filter((f) => /\.tsx?$/.test(f));

/** Line indices opening a `.btn-destructive` or `.btn-secondary` rule, in source order. */
function ruleLines(css: string, escapedSelector: string): number[] {
  const re = new RegExp(`^${escapedSelector}(:hover|:active)?\\s*\\{`);
  return css.split("\n").flatMap((line, i) => (re.test(line) ? [i] : []));
}

/** Every `className` site naming `btn-destructive`, and whether it also names `btn-secondary`. */
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
    expect(modules.length).toBeGreaterThan(150);
  });

  it("orders .btn-destructive after every .btn-secondary rule in tokens.css", () => {
    const css = readFileSync(TOKENS_CSS, "utf8");
    const destructiveLines = ruleLines(css, "\\.btn-destructive");
    const secondaryLines = ruleLines(css, "\\.btn-secondary");
    expect(destructiveLines.length).toBe(1);
    expect(secondaryLines.length).toBeGreaterThan(0);
    expect(destructiveLines[0]).toBeGreaterThan(Math.max(...secondaryLines));
  });

  it("pairs every btn-destructive className with btn-secondary", () => {
    const sites = destructiveClassNameSites(modules);
    // Mutation cover: a scan matching nothing would pass vacuously.
    expect(sites.length).toBeGreaterThan(0);
    const unpaired = sites.filter((s) => !s.pairsSecondary).map((s) => s.site);
    expect(unpaired).toEqual([]);
  });
});
