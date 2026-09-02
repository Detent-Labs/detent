import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * The studio's publish path raises no native browser prompt.
 *
 * A `confirm()` guarded the least reversible act in the product. A publish
 * mints a version that can never change, and the browser's own dialog named
 * neither the version nor that rule — and it bypassed the design language
 * entirely. Publish and Discard each confirm in the application's own modal
 * dialog now (studio-publish, studio-app). This is the mechanical marker that
 * keeps them there.
 *
 * A source test in the idiom `boundaries.test.ts` already uses: it reads the
 * file, matches a pattern, and asserts nothing hits. No harness in this
 * package can click a menu item and observe which dialog opened, so the
 * regression is guarded at the source instead.
 *
 * It names two files and no others. Seven further `confirm()` sites in the
 * studio area stay as they are in this change, and proposal.md names their
 * conversion as a follow-up. A wider pattern would fail on all seven today.
 *
 * The pattern matches the CALL, `confirm(`, never the word: three comments in
 * these two files discuss confirmation, and two of them survive on purpose.
 * Comments are stripped before the match runs, so prose can never fail it.
 */
const FILES = ["src/areas/studio/panels/DraftToolbar.tsx", "src/areas/studio/panels/ProcessHeaderBar.tsx"];

/** Block comments first, then line comments — the order matters for a `//`
 * inside a block comment. `boundaries.test.ts` strips the same way, for the
 * same reason: a name in a comment is not a call. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** `\b` before a lowercase `confirm` leaves `onConfirm(` alone and still
 * catches the qualified `window.confirm(` form. */
const NATIVE_PROMPT = /\bconfirm\s*\(/;

describe("the studio publish path raises no native prompt", () => {
  for (const file of FILES) {
    it(`${file} calls no confirm()`, () => {
      const code = stripComments(readFileSync(new URL(`../${file}`, import.meta.url).pathname, "utf8"));
      expect(NATIVE_PROMPT.test(code), `${file} calls the browser's own confirm()`).toBe(false);
    });
  }

  it("the pattern matches a call and not the word, so a comment cannot fail it", () => {
    expect(NATIVE_PROMPT.test(stripComments("// this used to call confirm(t('key'))\nconst a = 1;"))).toBe(false);
    expect(NATIVE_PROMPT.test(stripComments("/** the discard confirm() this replaced */\nconst a = 1;"))).toBe(false);
    expect(NATIVE_PROMPT.test(stripComments("const ok = confirm('really?');"))).toBe(true);
    expect(NATIVE_PROMPT.test(stripComments("const ok = window.confirm('really?');"))).toBe(true);
    expect(NATIVE_PROMPT.test(stripComments("<Dialog onConfirm={run} />"))).toBe(false);
  });
});
