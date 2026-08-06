import type { UiLocale } from "../locale.js";

/**
 * Chrome strings the shell owns: login, the account menu, the area names and
 * the refusal an actor sees on a forbidden area. Area catalogs stay per area
 * and keep their own screen strings; the few keys that look alike here are two
 * separate modules, not one shared vocabulary to keep in sync.
 *
 * The data sits here rather than in `shell/catalog.ts` so the admin area's
 * UI-strings screen can list its keys. `packages/web/test/boundaries.test.ts`
 * forbids an area importing another area, so anything two areas read moves up.
 */
export const en = {
  "login.title": "Log in",
  "login.email": "Email",
  "login.password": "Password",
  "login.submit": "Log in",
  "login.failed": "That email or password didn't work.",
  "account.menu": "Account",
  "account.logout": "Log out",
  "account.language": "Language",
  "account.switchArea": "Go to",
  "area.app": "Tasks",
  "area.admin": "Operations",
  "area.studio": "Studio",
  "area.reporting": "Reports",
  "area.forbidden": "Your account does not have access to this area.",
  "area.loading": "Loading",
  "error.generic": "Something went wrong.",
  "error.retry": "Retry",
};

export const de: Record<keyof typeof en, string> = {
  "login.title": "Anmelden",
  "login.email": "E-Mail",
  "login.password": "Passwort",
  "login.submit": "Anmelden",
  "login.failed": "E-Mail oder Passwort stimmt nicht.",
  "account.menu": "Konto",
  "account.logout": "Abmelden",
  "account.language": "Sprache",
  "account.switchArea": "Wechseln zu",
  "area.app": "Aufgaben",
  "area.admin": "Betrieb",
  "area.studio": "Studio",
  "area.reporting": "Berichte",
  "area.forbidden": "Ihr Konto hat keinen Zugriff auf diesen Bereich.",
  "area.loading": "Wird geladen",
  "error.generic": "Etwas ist schiefgelaufen.",
  "error.retry": "Erneut versuchen",
};

export type ShellKey = keyof typeof en;

export const shellCatalog: Record<UiLocale, Record<ShellKey, string>> = { en, de };
