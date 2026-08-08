/**
 * The profile page's presentation decision, kept out of the component so it can
 * be asserted without a DOM. `ProfilePage.tsx` renders exactly what this
 * returns and decides nothing of its own.
 *
 * `GET /account/me` answers in two shapes behind one type: a local account
 * carries `editable: true` with the four stored fields, and a federated actor
 * carries `editable: false` with an id and roles alone. That split decides the
 * whole page, so it is made once, here.
 */
import type { AccountView } from "../api/types.js";
import type { ShellKey } from "../i18n/catalogs/shell.js";
import { asUiLocale, type UiLocale } from "../i18n/locale.js";

/** Printed where a local account holds no value for a row the page still shows. */
export const ABSENT = "—";

export type ProfileFieldKey = "id" | "email" | "roles" | "managerUserId" | "displayName" | "locale";

/**
 * `read-only` prints `value`; the other two render a control seeded from
 * `ProfileEdits`. `mono` marks a value the engine matches exactly — an actor id,
 * a manager id, a role name — which the design language sets in the mono face.
 */
export interface ProfileRow {
  key: ProfileFieldKey;
  labelKey: ShellKey;
  value: string;
  mono: boolean;
  control: "read-only" | "text" | "locale";
}

export interface ProfileView {
  editable: boolean;
  rows: ProfileRow[];
}

/** The two fields `PATCH /account/me` accepts, held as form state. */
export interface ProfileEdits {
  displayName: string;
  locale: UiLocale;
}

/** Role names print as one mono list rather than one row each: the row names the fact, the value carries every role the account holds. */
function rolesText(roles: readonly string[]): string {
  return roles.length === 0 ? ABSENT : roles.join(", ");
}

export function profileFields(account: AccountView): ProfileView {
  if (!account.editable) {
    return {
      editable: false,
      rows: [
        { key: "id", labelKey: "profile.id", value: account.id, mono: true, control: "read-only" },
        { key: "roles", labelKey: "profile.roles", value: rolesText(account.roles), mono: true, control: "read-only" },
      ],
    };
  }
  return {
    editable: true,
    rows: [
      { key: "email", labelKey: "profile.email", value: account.email ?? ABSENT, mono: false, control: "read-only" },
      { key: "roles", labelKey: "profile.roles", value: rolesText(account.roles), mono: true, control: "read-only" },
      { key: "managerUserId", labelKey: "profile.manager", value: account.managerUserId ?? ABSENT, mono: true, control: "read-only" },
      { key: "displayName", labelKey: "profile.displayName", value: account.displayName ?? "", mono: false, control: "text" },
      { key: "locale", labelKey: "profile.locale", value: asUiLocale(account.locale) ?? "", mono: false, control: "locale" },
    ],
  };
}

/**
 * Form state for a freshly loaded account. The name box seeds from
 * `storedDisplayName`, the raw column, never from `displayName`: that one
 * resolves to the email where no name is on record, so seeding from it would
 * pre-fill the email and write it back on the next save — including a save that
 * changed the locale alone. An account that never chose a locale seeds the
 * picker with the locale the interface is already running in, so the control
 * shows what the actor sees rather than an empty selection.
 */
export function editSeed(account: AccountView, active: UiLocale): ProfileEdits {
  return { displayName: account.storedDisplayName ?? "", locale: asUiLocale(account.locale) ?? active };
}

/**
 * The `PATCH /account/me` body. An emptied name clears the account's, which the
 * route accepts as `null` — sending `""` is a 400 there, since a blank display
 * name and an absent one are not the same thing.
 */
export function accountChanges(edits: ProfileEdits): { displayName: string | null; locale: UiLocale } {
  const displayName = edits.displayName.trim();
  return { displayName: displayName === "" ? null : displayName, locale: edits.locale };
}
