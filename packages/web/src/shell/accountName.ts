import type { Session } from "./session.js";

export interface AccountName {
  text: string;
  mono: boolean;
}

/**
 * `displayName`, or the session's own `actorId` where none is set: a
 * federated actor, or the window before `GET /account/me` hydrates.
 */
export function accountName(session: Pick<Session, "displayName" | "actorId">): AccountName {
  if (session.displayName) return { text: session.displayName, mono: false };
  return { text: session.actorId, mono: true };
}
