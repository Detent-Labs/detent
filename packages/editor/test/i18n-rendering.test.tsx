import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider, useLocale, useT } from "../src/i18n/store";
import { LocaleSwitcher } from "../src/i18n/LocaleSwitcher";
import { SUPPORTED_LOCALES } from "../src/i18n/catalog";
import { NotCheckedBadge } from "../src/panels/shared/IssueList";

/**
 * Uses `react-dom/server`'s `renderToStaticMarkup` rather than a DOM-testing library — it needs
 * no `window`/`document` (unlike `@testing-library/react`, which isn't a dependency here and
 * would be new machinery for three small checks), matching this package's existing convention of
 * testing plain logic without a DOM. Covers what `resolveTranslation`/`resolveInitialLocale`'s
 * pure-function tests can't: that the pieces actually compose through a rendered React tree.
 */

function TitleProbe() {
  const t = useT();
  return <>{t("app.title")}</>;
}

function LocaleProbe() {
  const { locale } = useLocale();
  return <>{locale}</>;
}

describe("useT() through LocaleProvider", () => {
  it("resolves catalog text for the active locale", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <TitleProbe />
      </LocaleProvider>,
    );
    expect(html).toBe("Workflow Editor");
  });
});

describe("useLocale() independent of the catalog", () => {
  it("is readable by a component that never imports the translation lookup", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    );
    expect(html).toBe("en");
  });
});

describe("LocaleSwitcher", () => {
  it("renders exactly the entries of SUPPORTED_LOCALES, no more and no fewer", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <LocaleSwitcher />
      </LocaleProvider>,
    );
    const optionCount = (html.match(/<option/g) ?? []).length;
    expect(optionCount).toBe(SUPPORTED_LOCALES.length);
    for (const code of SUPPORTED_LOCALES) {
      expect(html).toContain(`>${code}</option>`);
    }
  });
});

describe("NotCheckedBadge", () => {
  it("composes the caller-supplied label with the translated 'not checked' suffix", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <NotCheckedBadge label="cross-process" />
      </LocaleProvider>,
    );
    expect(html).toContain("cross-process");
    expect(html).toContain("not checked");
  });
});
