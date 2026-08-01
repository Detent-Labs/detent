/**
 * The one declaration of what an area is: its URL prefix and the role that
 * reveals it. `AreaNav`, the `/` redirect and the direct-hit guard all read
 * this table, so they cannot disagree.
 *
 * The gate is display logic. The engine answers 403 to a direct API call
 * whatever this says — see the `authorization` capability.
 */
export const AREAS = ["app", "admin", "studio", "reporting"] as const;

export type Area = (typeof AREAS)[number];

/** The role an actor needs to see the area, or `undefined` when a session is enough. */
const REQUIRED_ROLE: Record<Area, string | undefined> = {
  app: undefined,
  admin: "system:admin",
  studio: "system:developer",
  reporting: "system:reports",
};

export function isArea(value: string): value is Area {
  return (AREAS as readonly string[]).includes(value);
}

export function mayEnter(area: Area, roles: readonly string[]): boolean {
  const role = REQUIRED_ROLE[area];
  return role === undefined || roles.includes(role);
}

/** Every area the actor may see, in declaration order. */
export function permittedAreas(roles: readonly string[]): Area[] {
  return AREAS.filter((area) => mayEnter(area, roles));
}

/**
 * Where `/` lands: the first role-gated area the actor may enter, and the app
 * area otherwise.
 *
 * Gated areas come first on purpose. Every actor may see the app area, so
 * "first permitted area" would land an operator on the task inbox rather than
 * on Operations — the reading a browser walk caught. An actor holding no
 * reserved role still lands on the app area, so `/` is never a dead end.
 */
export function landingArea(roles: readonly string[]): Area {
  return permittedAreas(roles).find((area) => REQUIRED_ROLE[area] !== undefined) ?? "app";
}
