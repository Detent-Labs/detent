import { describe, expect, it } from "bun:test";
import { loadSession, persistSession, clearSession, SESSION_STORAGE_KEY } from "../src/session.js";

function fakeStorage() {
  const store = new Map<string, string>();
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
}

describe("session persistence", () => {
  it("round-trips a persisted session", () => {
    const storage = fakeStorage();
    persistSession({ token: "tok_abc", actorId: "user_1" }, storage);
    expect(loadSession(storage)).toEqual({ token: "tok_abc", actorId: "user_1" });
  });

  it("returns undefined with nothing stored", () => {
    expect(loadSession(fakeStorage())).toBeUndefined();
  });

  it("returns undefined for corrupt stored JSON", () => {
    const storage = fakeStorage();
    storage.setItem(SESSION_STORAGE_KEY, "{not json");
    expect(loadSession(storage)).toBeUndefined();
  });

  it("clearSession removes the persisted session", () => {
    const storage = fakeStorage();
    persistSession({ token: "tok_abc", actorId: "user_1" }, storage);
    clearSession(storage);
    expect(loadSession(storage)).toBeUndefined();
  });

  it("uses a stable storage key", () => {
    expect(SESSION_STORAGE_KEY).toBe("app.session");
  });
});
