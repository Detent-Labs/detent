/** Storage is injectable, so the session round-trips without a browser. Mirrors packages/admin/test/session.test.ts. */
import { test, expect } from "bun:test";
import { loadSession, persistSession, clearSession, SESSION_STORAGE_KEY, type Session } from "../src/session.js";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const session: Session = { token: "tok", actorId: "user_owner", roles: ["system:reports"] };

test("a session round-trips", () => {
  const storage = memoryStorage();
  persistSession(session, storage);
  expect(loadSession(storage)).toEqual(session);
});

test("its storage key is this package's own, so it does not collide with the other frontends", () => {
  expect(SESSION_STORAGE_KEY).toBe("reporting.session");
});

test("an absent, malformed or incomplete entry loads as undefined", () => {
  const storage = memoryStorage();
  expect(loadSession(storage)).toBeUndefined();
  storage.setItem(SESSION_STORAGE_KEY, "{not json");
  expect(loadSession(storage)).toBeUndefined();
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token: "tok" }));
  expect(loadSession(storage)).toBeUndefined();
});

test("clearing removes the entry", () => {
  const storage = memoryStorage();
  persistSession(session, storage);
  clearSession(storage);
  expect(loadSession(storage)).toBeUndefined();
});
