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
    case "internal":
      return status === undefined
        ? "Could not reach the server. Check your connection and try again."
        : "The server hit an error. Try again.";
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
