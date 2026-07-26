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
import { AuthorizationError } from "../auth/authorize.js";
import {
  CrossProcessValidationError,
  CelValidationError,
  RegistryValidationError,
  AssignmentRegistryValidationError,
  DataSourceRegistryValidationError,
} from "../engine/definitions.js";
import { DurationValidationError } from "../schema/compile.js";
import { ZodError } from "zod";

export type HttpResult = { status: number; body: unknown };

/** A request's shape (a query parameter, a JSON body) is malformed — the client can fix it by reading the API. */
export class RequestShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestShapeError";
  }
}

export function mapError(err: unknown): HttpResult {
  if (err instanceof RequestShapeError) {
    return { status: 400, body: { error: { type: "request-shape", message: err.message } } };
  }
  if (err instanceof SubmissionValidationError) {
    return { status: 422, body: { error: { type: "validation", issues: err.issues } } };
  }
  if (
    err instanceof RegistryValidationError ||
    err instanceof AssignmentRegistryValidationError ||
    err instanceof DataSourceRegistryValidationError
  ) {
    return { status: 422, body: { error: { type: "registry-validation", issues: err.issues } } };
  }
  if (err instanceof CelValidationError) {
    return { status: 422, body: { error: { type: "cel-validation", issues: err.issues } } };
  }
  if (err instanceof CrossProcessValidationError) {
    return { status: 422, body: { error: { type: "cross-process-validation", message: err.message } } };
  }
  if (err instanceof DurationValidationError) {
    return { status: 422, body: { error: { type: "duration-validation", issues: err.issues } } };
  }
  if (err instanceof ZodError) {
    return { status: 422, body: { error: { type: "schema-validation", issues: err.issues } } };
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
  if (err instanceof AuthorizationError) {
    return { status: 403, body: { error: { type: "authorization", message: err.message } } };
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
