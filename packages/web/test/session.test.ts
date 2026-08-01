import { describe, expect, it } from "bun:test";
import { loadSession, persistSession, clearSession, SESSION_STORAGE_KEY } from "../src/shell/session.js";
import { landingArea, mayEnter, permittedAreas } from "../src/shell/areas.js";

function fakeStorage() {
  const store = new Map<string, string>();
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
}

const session = { token: "tok_abc", actorId: "user_1", roles: ["system:admin"], expiresAt: "2026-08-02T00:00:00.000Z" };

describe("session persistence", () => {
  it("round-trips a persisted session, roles and expiry included", () => {
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
});
