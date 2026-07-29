import type { ClientError } from "./api/types.js";
import { StudioClientError } from "./api/client.js";
import { t } from "./i18n/catalog.js";

/**
 * Maps a client error to developer-facing text, keyed on `error.type` — and,
 * for "internal" (the type both a network failure and an unexpected 5xx
 * collapse into, see `api/client.ts::request`), on whether a status ever
 * arrived. Never reads `error.message`: the server does not guarantee that
 * string is safe to show, and after `correct-api-error-responses` an
 * unexpected 500 sends none at all. Same file position and name as
 * `packages/app/src/errors.ts::describeError`, so the three packages read
 * alike; narrower because studio does not drive a claim state machine.
 */
export function describeError(error: ClientError, status?: number): string {
  switch (error.type) {
    case "authorization":
      return t("error.authorization");
    case "actor-resolution":
      return t("error.actorResolution");
    case "request-shape":
      return t("error.requestShape");
    case "not-found":
      return t("error.notFound");
    case "draft-conflict":
      return t("error.draftConflict");
    case "migration-plan":
      return t("error.migrationPlan");
    case "already-claimed":
      return t("error.alreadyClaimed");
    case "not-a-candidate":
      return t("error.notACandidate");
    case "not-claimed":
      return t("error.notClaimed");
    case "not-claimant":
      return t("error.notClaimant");
    case "not-assigned":
      return t("error.notAssigned");
    case "guard-refused":
      return t("error.guardRefused");
    case "concurrency-conflict":
      return t("error.concurrencyConflict");
    case "validation":
      // form-ui's Player attaches these per-field instead — a caller reaching
      // this case generically (not the expected path) still gets a message.
      return t("error.requestShape");
    case "internal":
      return status === undefined ? t("error.network") : t("error.serverError");
  }
}

/**
 * Reduces any caught value to developer-facing text — the shape every
 * `else throw err` in this package becomes. A non-`StudioClientError` throw
 * should not happen (every network path wraps its failure), but a screen
 * still must not rethrow one, so it gets the same generic text rather than
 * an unhandled rejection.
 */
export function describeCaughtError(err: unknown): string {
  if (err instanceof StudioClientError) return describeError(err.error, err.status);
  return t("error.generic");
}
