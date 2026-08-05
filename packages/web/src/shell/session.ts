/**
 * The one session for the whole frontend. One storage key, one login: an actor
 * holding two roles reaches both areas without signing in twice.
 *
 * `expiresAt` is recorded, never consulted. The `end-user-app` capability
 * requires that the frontend run no client-side expiry check and treat a `401`
 * as the sole signal that a session has ended; storing the value keeps that
 * requirement intact while a later change that wants to act on it has the value
 * already.
 *
 * The four per-package keys this replaces (`app.session`, `admin.session`,
 * `studio.session`, `reporting.session`) are not read and not migrated.
 */
export const SESSION_STORAGE_KEY = "web.session";

export interface Session {
  token: string;
  actorId: string;
  roles: string[];
  expiresAt: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Exported for `App.tsx`, which reads the same storage for the locale. */
export function browserStorage(): StorageLike | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

/** Pure (storage injectable) — round-trips directly in tests without mounting a Provider. */
export function loadSession(storage: StorageLike | undefined = browserStorage()): Session | undefined {
  const raw = storage?.getItem(SESSION_STORAGE_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed.token || !parsed.actorId || !Array.isArray(parsed.roles)) return undefined;
    return { token: parsed.token, actorId: parsed.actorId, roles: parsed.roles, expiresAt: parsed.expiresAt ?? "" };
  } catch {
    return undefined;
  }
}

export function persistSession(session: Session, storage: StorageLike | undefined = browserStorage()): void {
  storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(storage: StorageLike | undefined = browserStorage()): void {
  storage?.removeItem(SESSION_STORAGE_KEY);
}
