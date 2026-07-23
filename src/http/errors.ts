/**
 * Maps a thrown value from the Runtime API Layer to a plain
 * `{status, body}` shape. `routes.ts` hands this whatever it catches;
 * `server.ts` turns the result into a real `Response`. Only the Runtime API
 * Layer's typed errors get a specific status — anything else (including its
 * own untyped "not found" `Error`s) falls back to 500. See design.md's
 * "Error mapping" for why not-found stays 500 instead of 404.
 */
import {
  SubmissionValidationError,
  GuardRefused,
  ConcurrencyConflict,
  PinMismatch,
  NotAssignedError,
  NotACandidateError,
  AlreadyClaimedError,
  NotClaimedError,
  NotClaimantError,
} from "../runtime/api.js";
import { ActorResolutionError } from "../auth/resolve.js";

export type HttpResult = { status: number; body: unknown };

export function mapError(err: unknown): HttpResult {
  if (err instanceof SubmissionValidationError) {
    return { status: 422, body: { error: { type: "validation", issues: err.issues } } };
  }
  if (err instanceof GuardRefused) {
    return { status: 409, body: { error: { type: "guard-refused", message: err.message } } };
  }
  if (err instanceof ConcurrencyConflict) {
    return { status: 409, body: { error: { type: "concurrency-conflict" } } };
  }
  if (err instanceof PinMismatch) {
    return { status: 500, body: { error: { type: "internal", message: err.message } } };
  }
  if (err instanceof ActorResolutionError) {
    return { status: 401, body: { error: { type: "actor-resolution", message: err.message } } };
  }
  if (err instanceof NotAssignedError) {
    return { status: 403, body: { error: { type: "not-assigned", message: err.message } } };
  }
  if (err instanceof NotACandidateError) {
    return { status: 403, body: { error: { type: "not-a-candidate", message: err.message } } };
  }
  if (err instanceof AlreadyClaimedError) {
    return { status: 403, body: { error: { type: "already-claimed", message: err.message } } };
  }
  if (err instanceof NotClaimedError) {
    return { status: 403, body: { error: { type: "not-claimed", message: err.message } } };
  }
  if (err instanceof NotClaimantError) {
    return { status: 403, body: { error: { type: "not-claimant", message: err.message } } };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { status: 500, body: { error: { type: "internal", message } } };
}
