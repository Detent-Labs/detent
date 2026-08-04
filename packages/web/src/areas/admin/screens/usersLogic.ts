/**
 * Turns the roles editor's comma-separated text into the array `PATCH
 * /admin/users/:id/roles` takes. Pure, so it stays testable without the screen.
 *
 * An entry that is empty after trimming is dropped here, where the route would
 * refuse the whole request with a 400. That divergence is deliberate: a stray
 * or trailing comma is a typing artifact, not an error worth a banner. Every
 * other rule (the 64-character and 64-entry bounds, the absent character-set
 * check) is left to the route, which is the enforcement either way.
 */
export function parseRoles(text: string): string[] {
  const seen = new Set<string>();
  const roles: string[] = [];
  for (const entry of text.split(",")) {
    const role = entry.trim();
    if (!role || seen.has(role)) continue;
    seen.add(role);
    roles.push(role);
  }
  return roles;
}

/** Appends `role` to the editor's text unless it is already there, keeping the text the operator typed. */
export function appendRole(text: string, role: string): string {
  const roles = parseRoles(text);
  return roles.includes(role) ? text : [...roles, role].join(", ");
}

/** The subset of `UserSummary` the manager helpers below read, so they stay usable from a test without the whole type. */
interface ManagerCandidate {
  userId: string;
  email: string;
}

/**
 * The accounts offered as a manager for `userId`: every other listed account,
 * by email. The account itself is absent — the route refuses a self-pointer with
 * 400, so offering it would only produce a failure the operator can be spared.
 *
 * A disabled account stays on the list. Disabling blocks a login, and it does
 * not retire the person from an org chart; the strategy resolves the id either
 * way, and hiding it here would silently make an existing pointer unreproducible.
 */
export function managerChoices<T extends ManagerCandidate>(users: readonly T[], userId: string): T[] {
  return users.filter((u) => u.userId !== userId);
}

/**
 * The manager's email for display, or "—" when the account has none on record.
 * Falls back to the raw id when the manager is not in the listed set, so a
 * pointer never renders as blank.
 */
export function managerLabel(users: readonly ManagerCandidate[], managerUserId: string | undefined): string {
  if (!managerUserId) return "—";
  return users.find((u) => u.userId === managerUserId)?.email ?? managerUserId;
}

/** The `managerUserId` a select's value stands for: the empty option clears the pointer. */
export function managerValueOf(selectValue: string): string | null {
  return selectValue === "" ? null : selectValue;
}
