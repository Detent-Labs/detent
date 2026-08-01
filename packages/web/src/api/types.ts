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
