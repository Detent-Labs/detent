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

/**
 * The roles that reveal an area — any one of them admits. An empty set means a
 * session is enough.
 *
 * The admin area carries two because the data list screens live in it while
 * their maintainers must not hold `system:admin`. The studio area carries
 * three for the same reason: the templates screen lives in it while a template
 * curator must not hold `system:developer`, and the authoring screens live in
 * it while an author must not hold `system:developer` either — that role also
 * opens migration planning. Area entry is therefore the weaker gate in both,
 * and each screen inside keeps its own role check — see the `ROUTE_ROLE` map
 * each area's `routing.ts` declares.
 */
const REQUIRED_ROLE: Record<Area, readonly string[]> = {
  app: [],
  admin: ["system:admin", "system:datalists"],
  studio: ["system:developer", "system:author", "system:templates"],
  reporting: ["system:reports"],
};

export function isArea(value: string): value is Area {
  return (AREAS as readonly string[]).includes(value);
}

export function mayEnter(area: Area, roles: readonly string[]): boolean {
  const required = REQUIRED_ROLE[area];
  return required.length === 0 || required.some((role) => roles.includes(role));
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
  return permittedAreas(roles).find((area) => REQUIRED_ROLE[area].length > 0) ?? "app";
}
