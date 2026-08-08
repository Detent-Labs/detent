/**
 * The language picker's decision, kept out of `App.tsx` so it can be asserted
 * without a DOM. One picker exists, in the account menu, and it has two cases:
 * a signed-in actor's choice belongs to the account as well as to the browser,
 * and a choice made with no session belongs to the browser alone.
 *
 * `localStorage` is written in both cases and stays the source before login. It
 * also stays the fallback when the account write fails: the PATCH is dispatched
 * and never awaited, so a rejected one costs the account row and leaves the
 * interface in the chosen language.
 */
import { persistLocale, type UiLocale } from "../i18n/locale.js";
import type { Session } from "./session.js";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LocaleSyncDeps {
  /** The signed-in session, or `undefined` before login. This is the whole decision. */
  session: Session | undefined;
  storage: StorageLike | undefined;
  /** `patchAccount` from the API client, injectable so a test records the call instead of making it. */
  patchAccount: (token: string, changes: { locale: UiLocale }) => Promise<unknown>;
}

/**
 * Returns the session carrying the chosen locale, for the caller to hold and
 * persist, or `undefined` where there is no session to carry it.
 */
export function syncLocaleChange(next: UiLocale, deps: LocaleSyncDeps): Session | undefined {
  persistLocale(next, deps.storage);
  const { session } = deps;
  if (!session) return undefined;
  void deps.patchAccount(session.token, { locale: next }).catch(() => {
    // Best-effort: the browser already holds the choice.
  });
  return { ...session, locale: next };
}
