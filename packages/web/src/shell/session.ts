/**
 * The one session for the whole frontend. One storage key, one login: an actor
 * holding two roles reaches both areas without signing in twice.
 *
 * The `end-user-app` capability requires that the frontend run no client-side
 * expiry check and treat a `401` as the sole signal that a session has ended.
 * `POST /auth/login`'s response still carries an expiry field
 * (`api/types.ts`'s `LoginResponse`); the session this module stores never
 * keeps it, since nothing here reads it.
 *
 * The four per-package keys this replaces (`app.session`, `admin.session`,
 * `studio.session`, `reporting.session`) are not read and not migrated.
 */
import { asUiLocale, type UiLocale } from "../i18n/locale.js";

export const SESSION_STORAGE_KEY = "web.session";

export interface Session {
  token: string;
  actorId: string;
  roles: string[];
  /**
   * Hydrated from `GET /account/me`, not from the login response. Absent until
   * that call resolves, and absent for good on a federated actor, who holds no
   * local account row. A session carrying neither field stays valid.
   */
  displayName?: string;
  locale?: UiLocale;
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
    // Rebuilt field by field, so every field the session carries is listed here
    // or dropped on reload. A session stored before hydration existed carries
    // neither of the last two, which is a session to hydrate, not a malformed one.
    return {
      token: parsed.token,
      actorId: parsed.actorId,
      roles: parsed.roles,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : undefined,
      locale: asUiLocale(parsed.locale),
    };
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

/** A session missing either hydrated field, whether fresh from login or restored from storage. */
export function needsHydration(session: Session): boolean {
  return session.displayName === undefined || session.locale === undefined;
}

/**
 * A `GET /account/me` response merged into the session. A field the account does
 * not carry leaves the session's own value alone: a federated actor's response
 * carries neither, and an account that never chose a locale carries no `locale`.
 */
export function hydrateSession(session: Session, account: { displayName?: string; locale?: string }): Session {
  return {
    ...session,
    displayName: account.displayName ?? session.displayName,
    locale: asUiLocale(account.locale) ?? session.locale,
  };
}
