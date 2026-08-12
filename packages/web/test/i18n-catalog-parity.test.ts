/**
 * Every locale a catalog ships declares the same keys.
 *
 * `CatalogKey` derives from `en`, so `tsc --noEmit` already rejects a `de` map
 * that is missing a key. It does not reject the other direction: a `de` key
 * that `en` never declared typechecks and then sits in the file forever,
 * unreachable and untranslatable. This asserts both directions.
 *
 * The admin and reporting catalogs arrived together, so they are asserted
 * together. `shell` and `app` are here for the same reason, and `studio` ships
 * `en` alone by an earlier decision.
 */
import { describe, expect, it } from "bun:test";
import { BUILTIN_CATALOGS } from "../src/i18n/catalogs/index.js";

const TWO_LOCALE_AREAS = ["shell", "app", "admin", "reporting"];

describe("catalog key parity", () => {
  for (const area of TWO_LOCALE_AREAS) {
    it(`declares the same keys in en and de for ${area}`, () => {
      const catalog = BUILTIN_CATALOGS[area];
      expect(catalog, area).toBeDefined();
      const en = Object.keys(catalog!.en ?? {}).sort();
      const de = Object.keys(catalog!.de ?? {}).sort();
      expect(en.length, `${area} declares no key`).toBeGreaterThan(0);
      expect(de, `${area}: de against en`).toEqual(en);
    });

    it(`leaves no value blank in either locale for ${area}`, () => {
      const catalog = BUILTIN_CATALOGS[area]!;
      for (const locale of ["en", "de"]) {
        for (const [key, value] of Object.entries(catalog[locale]!)) {
          expect(value.trim().length, `${area}/${locale}/${key}`).toBeGreaterThan(0);
        }
      }
    });
  }

  it("carries every area the picker offers", () => {
    for (const area of ["shell", "app", "studio", "admin", "reporting"]) {
      expect(BUILTIN_CATALOGS[area], area).toBeDefined();
    }
  });
});
