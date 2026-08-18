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
  "account.profile": "Your profile",
  "area.app": "Tasks",
  "area.admin": "Operations",
  "area.studio": "Studio",
  "area.reporting": "Reports",
  "area.profile": "Profile",
  "area.forbidden": "Your account does not have access to this area.",
  "area.loading": "Loading",
  "profile.title": "Your profile",
  "profile.id": "Actor id",
  "profile.email": "Email",
  "profile.roles": "Roles",
  "profile.manager": "Manager",
  "profile.displayName": "Display name",
  "profile.locale": "Language",
  "profile.save": "Save changes",
  "profile.saved": "Changes saved.",
  "profile.saveFailed": "Those changes were not saved. Check the display name and try again.",
  "profile.federated": "This account is managed outside the workflow engine, so nothing on this page can be changed here.",
  "error.generic": "Something went wrong.",
  "error.retry": "Retry",
  "error.failed": "Failed",
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
  "account.profile": "Ihr Profil",
  "area.app": "Aufgaben",
  "area.admin": "Betrieb",
  "area.studio": "Studio",
  "area.reporting": "Berichte",
  "area.profile": "Profil",
  "area.forbidden": "Ihr Konto hat keinen Zugriff auf diesen Bereich.",
  "area.loading": "Wird geladen",
  "profile.title": "Ihr Profil",
  "profile.id": "Akteur-ID",
  "profile.email": "E-Mail",
  "profile.roles": "Rollen",
  "profile.manager": "Vorgesetzte Person",
  "profile.displayName": "Anzeigename",
  "profile.locale": "Sprache",
  "profile.save": "Änderungen speichern",
  "profile.saved": "Änderungen gespeichert.",
  "profile.saveFailed": "Die Änderungen wurden nicht gespeichert. Prüfen Sie den Anzeigenamen und versuchen Sie es erneut.",
  "profile.federated": "Dieses Konto wird außerhalb der Workflow-Engine verwaltet. Auf dieser Seite lässt sich nichts ändern.",
  "error.generic": "Etwas ist schiefgelaufen.",
  "error.retry": "Erneut versuchen",
  "error.failed": "Fehlgeschlagen",
};

export type CatalogKey = keyof typeof en;

export const shellCatalog: Record<UiLocale, Record<CatalogKey, string>> = { en, de };
