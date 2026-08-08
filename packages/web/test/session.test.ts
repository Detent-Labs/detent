import { describe, expect, it } from "bun:test";
import {
  loadSession,
  persistSession,
  clearSession,
  hydrateSession,
  needsHydration,
  SESSION_STORAGE_KEY,
} from "../src/shell/session.js";
import { landingArea, mayEnter, permittedAreas } from "../src/shell/areas.js";

function fakeStorage() {
  const store = new Map<string, string>();
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
}

const session = {
  token: "tok_abc",
  actorId: "user_1",
  roles: ["system:admin"],
  expiresAt: "2026-08-02T00:00:00.000Z",
  displayName: "Ada Lovelace",
  locale: "de" as const,
};

describe("session persistence", () => {
  it("round-trips a persisted session, roles, expiry and both hydrated fields included", () => {
    // `loadSession` rebuilds the object field by field, so a field absent from
    // that literal is dropped on every reload rather than on none.
    const storage = fakeStorage();
    persistSession(session, storage);
    expect(loadSession(storage)).toEqual(session);
  });

  it("returns undefined with nothing stored", () => {
    expect(loadSession(fakeStorage())).toBeUndefined();
  });

  it("returns undefined for corrupt stored JSON", () => {
    const storage = fakeStorage();
    storage.setItem(SESSION_STORAGE_KEY, "{not json");
    expect(loadSession(storage)).toBeUndefined();
  });

  it("returns undefined when roles are absent, so a pre-consolidation shape is not half-read", () => {
    const storage = fakeStorage();
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token: "tok_abc", actorId: "user_1" }));
    expect(loadSession(storage)).toBeUndefined();
  });

  it("clearSession removes the persisted session", () => {
    const storage = fakeStorage();
    persistSession(session, storage);
    clearSession(storage);
    expect(loadSession(storage)).toBeUndefined();
  });

  it("uses one storage key for every area", () => {
    expect(SESSION_STORAGE_KEY).toBe("web.session");
  });

  it("does not read the four keys it replaces", () => {
    const storage = fakeStorage();
    for (const old of ["app.session", "admin.session", "studio.session", "reporting.session"]) {
      storage.setItem(old, JSON.stringify(session));
    }
    expect(loadSession(storage)).toBeUndefined();
  });

  it("keeps a past expiry usable — a 401 is the only end-of-session signal", () => {
    const storage = fakeStorage();
    persistSession({ ...session, expiresAt: "2000-01-01T00:00:00.000Z" }, storage);
    expect(loadSession(storage)?.token).toBe("tok_abc");
  });

  it("loads a session stored before hydration existed, and marks it for hydration", () => {
    const storage = fakeStorage();
    storage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ token: "tok_abc", actorId: "user_1", roles: ["system:admin"], expiresAt: "2026-08-02T00:00:00.000Z" }),
    );
    const loaded = loadSession(storage);
    expect(loaded?.actorId).toBe("user_1");
    expect(loaded?.displayName).toBeUndefined();
    expect(loaded?.locale).toBeUndefined();
    expect(needsHydration(loaded!)).toBe(true);
  });

  it("drops a stored locale the catalogs do not cover", () => {
    const storage = fakeStorage();
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...session, locale: "fr" }));
    expect(loadSession(storage)?.locale).toBeUndefined();
  });
});

describe("session hydration", () => {
  const fresh = { token: "tok_abc", actorId: "user_1", roles: ["system:admin"], expiresAt: "2026-08-02T00:00:00.000Z" };

  it("fills in displayName and locale from a GET /account/me response", () => {
    const hydrated = hydrateSession(fresh, { displayName: "Ada Lovelace", locale: "de" });
    expect(hydrated.displayName).toBe("Ada Lovelace");
    expect(hydrated.locale).toBe("de");
    expect(hydrated.token).toBe("tok_abc");
    expect(needsHydration(hydrated)).toBe(false);
  });

  it("leaves a federated actor's session as it was — that response carries neither field", () => {
    expect(hydrateSession(fresh, {})).toEqual(fresh);
  });

  it("keeps a name already on the session where the account carries no locale", () => {
    const hydrated = hydrateSession({ ...fresh, displayName: "Ada Lovelace" }, { displayName: "Ada Lovelace" });
    expect(hydrated.displayName).toBe("Ada Lovelace");
    expect(hydrated.locale).toBeUndefined();
    expect(needsHydration(hydrated)).toBe(true);
  });

  it("reports a session carrying both fields as hydrated", () => {
    expect(needsHydration(session)).toBe(false);
  });
});

describe("area gating", () => {
  it("lets any session into the app area and gates the other three on a role", () => {
    expect(mayEnter("app", [])).toBe(true);
    expect(mayEnter("admin", [])).toBe(false);
    expect(mayEnter("admin", ["system:admin"])).toBe(true);
    expect(mayEnter("studio", ["system:developer"])).toBe(true);
    expect(mayEnter("reporting", ["system:reports"])).toBe(true);
  });

  it("lists exactly the areas the actor may see", () => {
    expect(permittedAreas([])).toEqual(["app"]);
    expect(permittedAreas(["system:admin"])).toEqual(["app", "admin"]);
    expect(permittedAreas(["system:admin", "system:developer", "system:reports"])).toEqual([
      "app",
      "admin",
      "studio",
      "reporting",
    ]);
  });

  it("lands a role-holder in their gated area, not the inbox everyone can see", () => {
    // Caught by a browser walk: "first permitted area" put an operator on the
    // task inbox, because every actor may see the app area.
    expect(landingArea(["system:admin"])).toBe("admin");
    expect(landingArea(["system:developer"])).toBe("studio");
    expect(landingArea(["system:reports"])).toBe("reporting");
  });

  it("always has somewhere to land, so / is never a dead end", () => {
    expect(landingArea([])).toBe("app");
    expect(landingArea(["system:publish"])).toBe("app");
  });

  it("admits a data list maintainer to the admin area and nowhere else gated", () => {
    // The screens live in the admin area, so entry admits either role; each
    // screen inside keeps its own check.
    expect(mayEnter("admin", ["system:datalists"])).toBe(true);
    expect(mayEnter("studio", ["system:datalists"])).toBe(false);
    expect(mayEnter("reporting", ["system:datalists"])).toBe(false);
    expect(permittedAreas(["system:datalists"])).toEqual(["app", "admin"]);
  });

  it("still prefers a gated area for a data list maintainer", () => {
    expect(landingArea(["system:datalists"])).toBe("admin");
  });

  it("offers the admin area in the switcher of a data list maintainer standing in the app area", () => {
    // Chrome.tsx's switcher is exactly `permittedAreas(roles)` minus the open area.
    const others = permittedAreas(["system:datalists"]).filter((a) => a !== "app");
    expect(others).toEqual(["admin"]);
  });
});
