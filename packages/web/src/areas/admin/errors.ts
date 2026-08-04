import type { ClientError } from "./api/types.js";
import { AdminClientError } from "./api/client.js";

/**
 * Maps a client error to operator-facing text, keyed on `error.type` — and,
 * for "internal" (the type both a network failure and an unexpected 5xx
 * collapse into, see `api/client.ts::request`), on whether a status ever
 * arrived. Never reads `error.message`: the server does not guarantee that
 * string is safe to show, and after `correct-api-error-responses` an
 * unexpected 500 sends none at all. Same file position and name as
 * `packages/app/src/errors.ts::describeError`, so the three packages read
 * alike; narrower because admin does not drive a claim state machine.
 */
export function describeError(error: ClientError, status?: number): string {
  switch (error.type) {
    case "authorization":
      return "You don't have permission to do that.";
    case "actor-resolution":
      return "Your session could not be resolved. Sign in again.";
    case "request-shape":
      return "That request was malformed.";
    case "not-found":
      return "Not found.";
    case "conflict":
      return "This was changed elsewhere. Refresh and try again.";
    case "migration-plan":
      return "No migration plan is registered for that version pair.";
    case "self-role-strip":
      return "You cannot remove system:admin from your own account. Ask another administrator, or use the server CLI.";
    case "self-manager":
      return "A user cannot be their own manager. Pick a different account.";
    case "unknown-manager":
      return "That account no longer exists. Refresh and pick again.";
    case "internal":
      return status === undefined
        ? "Could not reach the server. Check your connection and try again."
        : "The server hit an error. Try again.";
    default:
      // `ClientError` is the union of every server error type, so it carries
      // variants only another area provokes. If one reaches an operator screen
      // it reads as a generic failure rather than falling off the switch.
      return "Something went wrong.";
  }
}

/**
 * Reduces any caught value to operator-facing text — the shape every
 * `else throw err` in this package becomes. A non-`AdminClientError` throw
 * should not happen (every network path wraps its failure), but a screen
 * still must not rethrow one, so it gets the same generic text rather than
 * an unhandled rejection.
 */
export function describeCaughtError(err: unknown): string {
  if (err instanceof AdminClientError) return describeError(err.error, err.status);
  return "Something went wrong. Try again.";
}
