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
