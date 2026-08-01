import { describe, expect, it } from "bun:test";
import { resolveBaseLocaleChange } from "../src/areas/studio/screens/processHeaderLogic.js";
import { seedLocalizedText, mergeLocalizedTextEntry } from "../src/areas/studio/draft/localized-text.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * `ProcessHeader` has no interactive DOM test environment to render through
 * (this repo's only "component tests" — packages/form-ui/test/field-form.test.tsx —
 * use react-dom/server's renderToStaticMarkup, which never fires an event or
 * re-renders on state change), so typing into the base-locale control and then
 * into a label can't be driven directly. This is the same documented fallback
 * draftToolbarState.ts takes: the control's decision is extracted into
 * resolveBaseLocaleChange, and this test drives it through the exact sequence
 * ProcessHeader's wiring produces.
 *
 * The failure this guards is in the *wiring*, not in the gate —
 * resolveAddLocaleAttempt is correct and separately tested
 * (studio-localizedText.test.ts). The risk is that the header writes
 * `baseLocale` and leaves the content locale behind, which is invisible to a
 * test of the gate alone: every value typed afterwards lands under the old
 * locale, and the base-locale invariant then reports entries that visibly hold
 * text. Each test below therefore ends at the entry a later keystroke writes,
 * not at the resolver's return value.
 */

/** What ProcessHeader does with one keystroke: both writes, unconditional. */
function typeBaseLocale(draft: Draft, contentLocale: string, typed: string): { draft: Draft; contentLocale: string } {
  const change = resolveBaseLocaleChange(typed, contentLocale);
  return { draft: { ...draft, baseLocale: change.baseLocale }, contentLocale: change.contentLocale };
}

describe("the base-locale control's wiring (processHeaderLogic.ts)", () => {
  it("declare 'de' -> add a step: the step's label seeds under 'de', so it satisfies the base-locale invariant", () => {
    const state = typeBaseLocale({}, "en", "de");

    expect(state.draft.baseLocale).toBe("de");
    // StepsPanel seeds a new entity's label with seedLocalizedText(contentLocale).
    const stepLabel = seedLocalizedText(state.contentLocale);
    expect(Object.keys(stepLabel!)).toEqual(["de"]);

    // The exact regression, spelled out: had the wiring written baseLocale
    // without moving the content locale, the same step would seed under "en"
    // and report a missing 'de' entry while visibly holding whatever the
    // author types into it.
    const ifTheWiringForgot = seedLocalizedText("en");
    expect(Object.keys(ifTheWiringForgot!)).toEqual(["en"]);
    expect(ifTheWiringForgot!["de"]).toBeUndefined();
  });

  it("declare 'de' -> type a label: the entry lands under 'de', not the locale that was current before", () => {
    const state = typeBaseLocale({}, "en", "de");

    // LocalizedTextInput merges into value[contentLocale] on every keystroke.
    const label = mergeLocalizedTextEntry(undefined, state.contentLocale, "Urlaubsantrag");

    expect(label).toEqual({ de: "Urlaubsantrag" });
    expect(label![state.draft.baseLocale!]).toBe("Urlaubsantrag");
  });

  it("a part-typed 'd' on the way to 'de' writes baseLocale but leaves the content locale alone", () => {
    const midway = typeBaseLocale({}, "en", "d");

    expect(midway.draft.baseLocale).toBe("d");
    expect(midway.contentLocale).toBe("en");
    // Nothing may seed under "d" — collectUsedLocales derives the switcher's
    // options from the Draft's content, so one such entry would offer "d" for
    // the rest of the session.
    expect(Object.keys(seedLocalizedText(midway.contentLocale)!)).toEqual(["en"]);

    // Finishing the word moves it.
    const finished = typeBaseLocale(midway.draft, midway.contentLocale, "de");
    expect(finished.contentLocale).toBe("de");
  });

  it("accepts a region-qualified code and moves to it", () => {
    expect(typeBaseLocale({}, "en", "de-AT").contentLocale).toBe("de-AT");
  });

  it("clearing the field writes the empty value through without moving the content locale", () => {
    const cleared = typeBaseLocale({ baseLocale: "de" }, "de", "");

    expect(cleared.draft.baseLocale).toBe("");
    expect(cleared.contentLocale).toBe("de");
  });

  it("re-declaring the locale already being edited is a no-op on the content locale", () => {
    expect(typeBaseLocale({ baseLocale: "de" }, "de", "de").contentLocale).toBe("de");
  });
});
