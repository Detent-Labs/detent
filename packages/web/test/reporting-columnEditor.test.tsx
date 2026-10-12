import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ColumnEditor } from "../src/areas/reporting/screens/ColumnEditor.js";
import type { ClientError } from "../src/areas/reporting/api/types.js";
import type { UiLocale } from "../src/i18n/locale.js";

/**
 * `reporting-data-tables`: a failed column request shows an error note in
 * the column section, where the field picker sits.
 */

const FAILED: ClientError = { type: "internal", message: "boom" };
const TEXT: Record<UiLocale, string> = {
  en: "The server hit an error. Try again.",
  de: "Der Server hat einen Fehler gemeldet. Versuchen Sie es erneut.",
};

function render(locale: UiLocale, choicesError?: ClientError): string {
  return renderToStaticMarkup(
    <ColumnEditor columns={[]} choices={[]} versionsInRange={[]} onChange={() => {}} locale={locale} choicesError={choicesError} />,
  );
}

describe("the column section after a failed column request", () => {
  for (const locale of ["en", "de"] as const) {
    it(`shows the error note under the heading in ${locale}`, () => {
      const html = render(locale, FAILED);
      expect(html).toContain('role="alert"');
      expect(html).toContain(TEXT[locale]);
      expect(html.indexOf("</h2>")).toBeLessThan(html.indexOf('role="alert"'));
    });

    it(`shows no note without the error in ${locale}`, () => {
      const html = render(locale);
      expect(html).not.toContain('role="alert"');
      expect(html).not.toContain(TEXT[locale]);
    });
  }
});
