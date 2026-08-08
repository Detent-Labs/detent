import { describe, expect, it } from "bun:test";
import { syncLocaleChange } from "../src/shell/localeSync.js";
import { LOCALE_STORAGE_KEY, type UiLocale } from "../src/i18n/locale.js";
import type { Session } from "../src/shell/session.js";

function fakeStorage(seed?: string) {
  const store = new Map<string, string>(seed ? [[LOCALE_STORAGE_KEY, seed]] : []);
  return { store, getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
}

function recorder() {
  const calls: { token: string; changes: { locale: UiLocale } }[] = [];
  return {
    calls,
    patchAccount: (token: string, changes: { locale: UiLocale }) => {
      calls.push({ token, changes });
      return Promise.resolve({});
    },
  };
}

const SESSION: Session = { token: "tok-1", actorId: "u-1", roles: ["participant"], expiresAt: "", locale: "en" };

describe("syncLocaleChange", () => {
  it("a signed-in choice reaches the account and the returned session", () => {
    const storage = fakeStorage("en");
    const patch = recorder();

    const updated = syncLocaleChange("de", { session: SESSION, storage, patchAccount: patch.patchAccount });

    expect(patch.calls).toEqual([{ token: "tok-1", changes: { locale: "de" } }]);
    expect(updated?.locale).toBe("de");
    expect(updated?.token).toBe("tok-1");
    expect(storage.store.get(LOCALE_STORAGE_KEY)).toBe("de");
  });

  it("with no session the choice stays in the browser and reaches no account route", () => {
    const storage = fakeStorage();
    const patch = recorder();

    const updated = syncLocaleChange("de", { session: undefined, storage, patchAccount: patch.patchAccount });

    expect(patch.calls).toEqual([]);
    expect(updated).toBeUndefined();
    expect(storage.store.get(LOCALE_STORAGE_KEY)).toBe("de");
  });

  it("a rejected account write leaves the browser's choice standing", () => {
    const storage = fakeStorage();
    const updated = syncLocaleChange("de", {
      session: SESSION,
      storage,
      patchAccount: () => Promise.reject(new Error("offline")),
    });

    expect(updated?.locale).toBe("de");
    expect(storage.store.get(LOCALE_STORAGE_KEY)).toBe("de");
  });
});
