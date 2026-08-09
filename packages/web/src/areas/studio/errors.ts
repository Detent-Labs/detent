import type { ClientError } from "./api/types.js";
import { StudioClientError } from "./api/client.js";
import { t } from "./catalog.js";

/**
 * Maps a client error to developer-facing text, keyed on `error.type`. Never
 * reads `error.message`: the server does not guarantee that string is safe to
 * show, and after `correct-api-error-responses` an unexpected 500 sends none
 * at all. `status` is unused now that "network" (a fetch that never reached
 * the server) and "internal" (the server answering with a failure) are
 * distinct `ClientError` members — kept in the signature since both call
 * sites pass `err.status` positionally. Same file position and name as
 * `packages/app/src/errors.ts::describeError`, so the three packages read
 * alike; narrower because studio does not drive a claim state machine.
 */
export function describeError(error: ClientError, _status?: number): string {
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
    // The one place `message`/`issues` ARE shown. The caveat above holds for a
    // participant-facing string; these six come from the publish chain's own
    // validators, address a developer, and name the exact location in a body
    // that developer supplied. Reducing them to "the server hit an error"
    // leaves the only actionable detail on the floor.
    case "publish-validation":
      return error.issues.length === 0
        ? t("error.publishRejected")
        : `${t("error.publishRejected")}\n${error.issues.map((i) => (i.loc === "" ? i.message : `${i.loc}: ${i.message}`)).join("\n")}`;
    case "cross-process-validation":
      return `${t("error.crossProcess")}\n${error.message}`;
    case "network":
      return t("error.network");
    case "internal":
      return t("error.serverError");
    default:
      // `ClientError` is the union of every server error type, so it carries
      // variants only another area provokes. If one reaches a developer screen
      // it reads as a generic failure rather than falling off the switch.
      return "Something went wrong.";
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
