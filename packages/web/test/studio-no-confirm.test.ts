import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * The studio's publish, discard and field removal raise no native browser
 * prompt.
 *
 * A `confirm()` guarded the least reversible act in the product. A publish
 * mints a version that can never change, and the browser's own dialog named
 * neither the version nor that rule — and it bypassed the design language
 * entirely. Publish and Discard each confirm in the application's own modal
 * dialog now (studio-publish, studio-app). A field removal that reaches past
 * the field catalog confirms in one too (studio-app). This is the mechanical
 * marker that keeps all three there.
 *
 * A source test in the idiom `boundaries.test.ts` already uses: it reads the
 * file, matches a pattern, and asserts nothing hits. No harness in this
 * package can click a control and observe which dialog opened, so the
 * regression is guarded at the source instead.
 *
 * It names five files and no others: the two that carry publish and discard,
 * the Fields tab that asks before a removal, the removal dialog, and the
 * dialog hook all three dialogs share. Other `confirm()` calls in the studio
 * area stay as they are, `FieldCatalogPanel.tsx`'s two among them, and a
 * wider pattern would fail on each of them today.
 *
 * The pattern matches the CALL, `confirm(`, never the word: comments in these
 * files discuss confirmation on purpose. Comments are stripped before the
 * match runs, so prose can never fail it.
 */
const FILES = [
  "src/areas/studio/panels/DraftToolbar.tsx",
  // Both confirmation dialogs live here, with the controls that open them
  // (`studio-process-tabs`).
  "src/areas/studio/panels/ProcessHeaderBar.tsx",
  // `FieldsTab` decides whether a removal asks first, and renders the dialog.
  "src/areas/studio/panels/EntityTabs.tsx",
  "src/areas/studio/panels/RemoveFieldDialog.tsx",
  // The hook the publish, discard and removal dialogs open through.
  "src/areas/studio/panels/shared/confirmDialog.tsx",
];

/** Block comments first, then line comments — the order matters for a `//`
 * inside a block comment. `boundaries.test.ts` strips the same way, for the
 * same reason: a name in a comment is not a call. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** `\b` before a lowercase `confirm` leaves `onConfirm(` alone and still
 * catches the qualified `window.confirm(` form. */
const NATIVE_PROMPT = /\bconfirm\s*\(/;

describe("the studio's publish, discard and field removal raise no native prompt", () => {
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
