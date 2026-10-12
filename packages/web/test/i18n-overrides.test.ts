/**
 * `src/i18n/overrides.ts`: the resolver every `t()` consults first, and the boot
 * fetch that fills it.
 *
 * The map is a module variable, so each test installs what it needs and the
 * last one puts an empty map back. `resolveOverride` must be total — a `t()`
 * call for a key no deployment has ever overridden is the common case, and it
 * runs on every render.
 */
import { afterEach, describe, expect, it } from "bun:test";
import {
  setUiStringOverrides,
  resolveOverride,
  loadUiStringOverrides,
  UI_STRINGS_TIMEOUT_MS,
} from "../src/i18n/overrides.js";
import { t as shellT } from "../src/shell/catalog.js";
import { t as appT } from "../src/areas/app/catalog.js";
import { t as studioT } from "../src/areas/studio/catalog.js";

afterEach(() => setUiStringOverrides({}));

describe("resolveOverride", () => {
  it("answers the stored value for a key that has one", () => {
    setUiStringOverrides({ shell: { en: { "login.title": "Sign in" } } });
    expect(resolveOverride("shell", "en", "login.title")).toBe("Sign in");
  });

  it("answers undefined for an absent key, an absent locale and an absent area", () => {
    setUiStringOverrides({ shell: { en: { "login.title": "Sign in" } } });
    expect(resolveOverride("shell", "en", "login.email")).toBeUndefined();
    expect(resolveOverride("shell", "de", "login.title")).toBeUndefined();
    expect(resolveOverride("studio", "en", "login.title")).toBeUndefined();
  });

  it("answers undefined against an empty map rather than throwing", () => {
    setUiStringOverrides({});
    expect(resolveOverride("shell", "en", "login.title")).toBeUndefined();
  });
});

describe("t() consults the override before the builtin catalog", () => {
  it("an override wins in the shell, in the app area and in studio", () => {
    setUiStringOverrides({
      shell: { en: { "login.title": "Sign in" } },
      app: { de: { "tasks.title": "Meine Arbeit" } },
      // Studio carries `en` alone, and its `t(key)` passes that fixed locale.
      studio: { en: { "app.title": "Acme Designer" } },
    });
    expect(shellT("en", "login.title")).toBe("Sign in");
    expect(appT("de", "tasks.title")).toBe("Meine Arbeit");
    expect(studioT("app.title")).toBe("Acme Designer");
  });

  it("a key with no override keeps its builtin value", () => {
    setUiStringOverrides({ shell: { en: { "login.title": "Sign in" } } });
    expect(shellT("en", "login.email")).toBe("Email");
    // The override is scoped to one locale: `de` is untouched by an `en` row.
    expect(shellT("de", "login.title")).toBe("Anmelden");
  });
});

describe("loadUiStringOverrides", () => {
  /**
   * Runs the boot fetch against `stub` and restores the real `fetch`. The cast
   * goes through `unknown`: React's DOM types add `preconnect` to `fetch`, and
   * a stub answering one request needs none of it.
   */
  const withFetch = async (stub: () => Promise<Response>): Promise<void> => {
    const real = globalThis.fetch;
    globalThis.fetch = stub as unknown as typeof globalThis.fetch;
    try {
      await loadUiStringOverrides();
    } finally {
      globalThis.fetch = real;
    }
  };

  it("installs the map the route returns", async () => {
    await withFetch(async () => Response.json({ overrides: { shell: { en: { "login.title": "Sign in" } } } }));
    expect(shellT("en", "login.title")).toBe("Sign in");
  });

  it("leaves the map empty when the fetch rejects, and t() still answers with builtin values", async () => {
    await withFetch(() => Promise.reject(new Error("connection refused")));
    expect(resolveOverride("shell", "en", "login.title")).toBeUndefined();
    expect(shellT("en", "login.title")).toBe("Log in");
  });

  it("leaves the map empty when the route answers a non-2xx status", async () => {
    await withFetch(async () => new Response("", { status: 503 }));
    expect(shellT("en", "login.title")).toBe("Log in");
  });

  it("leaves the map empty when the body carries no overrides object", async () => {
    await withFetch(async () => Response.json({ overrides: "not a map" }));
    expect(shellT("en", "login.title")).toBe("Log in");
  });

  it("stops waiting for a request that never answers, and leaves the map empty", async () => {
    const real = globalThis.fetch;
    // Answers only by rejecting when the caller's signal aborts, as a real fetch does.
    const hung = (_url: unknown, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) return reject(signal.reason);
        signal.addEventListener("abort", () => reject(signal.reason));
      });
    globalThis.fetch = hung as unknown as typeof globalThis.fetch;
    try {
      await loadUiStringOverrides(20);
    } finally {
      globalThis.fetch = real;
    }
    expect(resolveOverride("shell", "en", "login.title")).toBeUndefined();
    expect(shellT("en", "login.title")).toBe("Log in");
  }, 1000);

  it("limits the read to 5000 ms", () => {
    expect(UI_STRINGS_TIMEOUT_MS).toBe(5000);
  });
});
