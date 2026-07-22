import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftProvider } from "../src/draft/store";
import { LocaleProvider, useT } from "../src/i18n/store";
import { LocaleSwitcher } from "../src/i18n/LocaleSwitcher";
import { LocalizedTextInput } from "../src/panels/shared/LocalizedTextInput";
import { ContentLocaleSwitcher } from "../src/panels/shared/ContentLocaleSwitcher";
import type { Draft } from "../src/draft/types";

/** Matches the existing `i18n-rendering.test.tsx` convention: `react-dom/server`'s
 * `renderToStaticMarkup`, no jsdom/testing-library. Static rendering has no
 * event dispatch, so these cover display only — the write-merge semantics are
 * covered as a pure function in `localized-text.test.ts`. */

function withProviders(initial: Draft, children: React.ReactNode) {
  return (
    <LocaleProvider>
      <DraftProvider initial={initial}>{children}</DraftProvider>
    </LocaleProvider>
  );
}

describe("LocalizedTextInput", () => {
  it("displays the Draft's default (en) content locale's entry", () => {
    const html = renderToStaticMarkup(
      withProviders({ baseLocale: "en" }, <LocalizedTextInput value={{ en: "Review", de: "Prüfen" }} onChange={() => {}} />),
    );
    expect(html).toContain('value="Review"');
    expect(html).not.toContain("Prüfen");
  });

  it("renders an empty value when the current content locale has no entry", () => {
    const html = renderToStaticMarkup(
      withProviders({ baseLocale: "en" }, <LocalizedTextInput value={{ de: "Prüfen" }} onChange={() => {}} />),
    );
    expect(html).toContain('value=""');
  });
});

describe("ContentLocaleSwitcher", () => {
  it("lists exactly the locales used in the Draft", () => {
    const draft: Draft = {
      baseLocale: "en",
      label: { en: "Process", de: "Prozess" },
    };
    const html = renderToStaticMarkup(withProviders(draft, <ContentLocaleSwitcher />));
    const optionCount = (html.match(/<option/g) ?? []).length;
    expect(optionCount).toBe(2);
    expect(html).toContain(">de</option>");
    expect(html).toContain(">en</option>");
  });

  it("falls back to just the base locale for a fresh draft", () => {
    const html = renderToStaticMarkup(withProviders({}, <ContentLocaleSwitcher />));
    const optionCount = (html.match(/<option/g) ?? []).length;
    expect(optionCount).toBe(1);
    expect(html).toContain(">en</option>");
  });
});

function UiChromeTitleProbe() {
  const t = useT();
  return <>{t("app.title")}</>;
}

describe("content locale is independent of the UI-chrome locale", () => {
  it("a Draft whose content locale is 'de' does not change the UI-chrome locale or its rendered text", () => {
    // A Draft entirely in "de" — the content-locale switcher resolves to "de",
    // but useLocale()/useT() (UI-chrome) must stay on "en": they read from a
    // separate LocaleContext with no code path connecting the two.
    const draft: Draft = { baseLocale: "de", label: { de: "Prozess" } };
    const html = renderToStaticMarkup(
      withProviders(
        draft,
        <>
          <ContentLocaleSwitcher />
          <LocaleSwitcher />
          <UiChromeTitleProbe />
        </>,
      ),
    );
    // Content-locale switcher resolves to the Draft's own locale ("de" is
    // the only rendered <option> and it's selected).
    expect(html).toContain('<option value="de" selected="">de</option>');
    // UI-chrome switcher and text stay on "en", unaffected by the Draft.
    expect(html).toContain('<select class="locale-switcher" aria-label="locale"><option value="en" selected="">en</option>');
    expect(html).toContain("Workflow Editor");
  });
});
