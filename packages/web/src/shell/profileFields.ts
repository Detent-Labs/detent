/**
 * The profile page's two small helpers, kept out of the component so they can
 * be asserted without a DOM. `ProfilePage.tsx` renders the federated and
 * local branches directly as JSX; this module holds only what both branches
 * share: `rolesText`'s formatting, `editSeed`'s and `accountChanges`' form
 * bookkeeping, and the `ABSENT` placeholder all three use.
 */
import type { AccountView } from "../api/types.js";
import { asUiLocale, type UiLocale } from "../i18n/locale.js";

/** Printed where a local account holds no value for a row the page still shows. */
export const ABSENT = "—";

/** The two fields `PATCH /account/me` accepts, held as form state. */
export interface ProfileEdits {
  displayName: string;
  locale: UiLocale;
}

/** Role names print as one mono list rather than one row each: the row names the fact, the value carries every role the account holds. */
export function rolesText(roles: readonly string[]): string {
  return roles.length === 0 ? ABSENT : roles.join(", ");
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
