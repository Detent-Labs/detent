import { describe, expect, it } from "bun:test";
import { adoptHydratedLocale, detectLocale, loadLocale, persistLocale, LOCALE_STORAGE_KEY } from "../src/i18n/locale.js";
import { t } from "../src/areas/app/catalog.js";

describe("detectLocale", () => {
  it("recognizes a supported language tag", () => {
    expect(detectLocale("de-DE")).toBe("de");
    expect(detectLocale("en-US")).toBe("en");
  });

  it("falls back to en for an unsupported or missing language", () => {
    expect(detectLocale("fr-FR")).toBe("en");
    expect(detectLocale(undefined)).toBe("en");
  });
});

describe("loadLocale", () => {
  it("a persisted choice wins over navigator.language", () => {
    const store = new Map([[LOCALE_STORAGE_KEY, "de"]]);
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(loadLocale(storage, "en-US")).toBe("de");
  });

  it("falls back to navigator.language with no persisted choice", () => {
    const storage = { getItem: () => null, setItem: () => {} };
    expect(loadLocale(storage, "de-DE")).toBe("de");
  });

  it("ignores an unsupported persisted value", () => {
    const store = new Map([[LOCALE_STORAGE_KEY, "fr"]]);
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(loadLocale(storage, "en-US")).toBe("en");
  });
});

describe("persistLocale", () => {
  it("writes the choice under the stable storage key", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    persistLocale("de", storage);
    expect(store.get(LOCALE_STORAGE_KEY)).toBe("de");
  });
});

describe("adoptHydratedLocale", () => {
  function fakeStorage(seed?: string) {
    const store = new Map<string, string>(seed ? [[LOCALE_STORAGE_KEY, seed]] : []);
    return { store, getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  }

  it("a new device adopts the account's locale and writes it to storage", () => {
    const storage = fakeStorage();
    expect(adoptHydratedLocale("de", storage)).toBe("de");
    expect(storage.store.get(LOCALE_STORAGE_KEY)).toBe("de");
  });

  it("a language chosen on this browser survives hydration", () => {
    const storage = fakeStorage("en");
    expect(adoptHydratedLocale("de", storage)).toBeUndefined();
    expect(storage.store.get(LOCALE_STORAGE_KEY)).toBe("en");
  });

  it("adopts nothing where the account holds no locale", () => {
    const storage = fakeStorage();
    expect(adoptHydratedLocale(undefined, storage)).toBeUndefined();
    expect(storage.store.has(LOCALE_STORAGE_KEY)).toBe(false);
  });

  it("adopts over an unsupported stored value, and never adopts an unsupported account value", () => {
    const stale = fakeStorage("fr");
    expect(adoptHydratedLocale("de", stale)).toBe("de");
    const empty = fakeStorage();
    expect(adoptHydratedLocale("fr", empty)).toBeUndefined();
    expect(empty.store.has(LOCALE_STORAGE_KEY)).toBe(false);
  });
});

describe("t (UI catalog)", () => {
  it("resolves a key in each supported locale", () => {
    expect(t("en", "tasks.title")).toBe("My tasks");
    expect(t("de", "tasks.title")).toBe("Meine Aufgaben");
  });
});
