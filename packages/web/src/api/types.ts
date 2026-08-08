/**
 * The three types every area shares. Domain types stay per area on purpose:
 * each declares only the fields it reads, off different endpoints with
 * different projections, so pairs that look identical today will drift.
 */
import type { SubmissionIssue } from "form-ui";

export type { SubmissionIssue };

export interface Actor {
  id: string;
  roles: string[];
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  actor: Actor;
}

/**
 * `GET`/`PATCH /account/me`, the actor's own account. A federated actor holds no
 * local account row and gets `editable: false` with `id` and `roles` alone, which
 * is why every other field is optional here rather than in two split types.
 */
export interface AccountView {
  id: string;
  roles: string[];
  editable: boolean;
  /** What to print: the stored name, or the email where the account set none. */
  displayName?: string;
  /** What the account actually set, `null` where it set nothing. The editable name box seeds from this, never from `displayName`. */
  storedDisplayName?: string | null;
  email?: string;
  managerUserId?: string;
  locale?: string;
}

/** One located publish rejection. `loc` is a JSON path into the submitted body. */
export interface PublishIssue {
  loc: string;
  message: string;
}

/**
 * Every error type the engine can answer with, in one union.
 *
 * Not a lowest common denominator: the four packages this replaces each mapped
 * only the subset their own screens could provoke and collapsed the rest into
 * `internal`, which is why they looked like the same type wearing four names.
 * The wire carries all of these, and the engine can answer any area with any of
 * them, so an area that does not render one specially falls to its describer's
 * default branch rather than pretending the variant cannot arrive.
 */
export type ClientError =
  | { type: "validation"; issues: SubmissionIssue[] }
  | { type: "already-claimed"; message: string }
  | { type: "not-a-candidate"; message: string }
  | { type: "not-claimed"; message: string }
  | { type: "not-claimant"; message: string }
  // `POST /instances/:id/delegate` naming a target the local account directory
  // does not hold. The repair is to pick another account, so it reads as its
  // own type rather than falling to `internal` with no message at all.
  | { type: "unknown-delegate"; message: string }
  | { type: "not-assigned"; message: string }
  | { type: "guard-refused"; message: string }
  | { type: "concurrency-conflict" }
  | { type: "authorization"; message: string }
  | { type: "actor-resolution"; message: string }
  | { type: "request-shape"; message: string }
  | { type: "not-found"; message: string }
  | { type: "conflict"; message: string }
  | { type: "draft-conflict"; message: string }
  | { type: "migration-plan"; message: string }
  // `PATCH /admin/users/:id/roles` refusing to strip `system:admin` from the
  // account making the request. A 409, but not a concurrency one: retrying
  // changes nothing, so it reads as its own type rather than "conflict".
  | { type: "self-role-strip"; message: string }
  // `PATCH /admin/users/:id/manager` refusing a pointer. Two 400s, distinct
  // because the repair differs: pick another account, or refresh first.
  | { type: "self-manager"; message: string }
  | { type: "unknown-manager"; message: string }
  // Publish-time rejections. The server maps six distinct error classes here
  // (registry, CEL, duration, compile, schema, cross-process); five carry
  // located `issues`, cross-process carries a message. All six reach a
  // developer publishing or importing a definition.
  | { type: "publish-validation"; kind: string; issues: PublishIssue[] }
  | { type: "cross-process-validation"; message: string }
  // A fetch that never reached the server. Distinct from `internal`, which is
  // the server answering with a failure.
  | { type: "network"; message: string }
  | { type: "internal"; message: string };
