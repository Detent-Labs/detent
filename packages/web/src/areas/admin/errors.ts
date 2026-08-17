import type { ClientError } from "./api/types.js";
import { AdminClientError } from "./api/client.js";
import type { UiLocale } from "../../i18n/locale.js";
import { t } from "./catalog.js";

/**
 * Maps a client error to operator-facing text, keyed on `error.type`. Never
 * reads `error.message`: the server does not guarantee that string is safe to
 * show, and after `correct-api-error-responses` an unexpected 500 sends none
 * at all. Same file position and name as
 * `packages/web/src/areas/app/errors.ts::describeError`, so the three packages read
 * alike; narrower because admin does not drive a claim state machine.
 */
export function describeError(error: ClientError, locale: UiLocale): string {
  switch (error.type) {
    case "authorization":
      return t(locale, "error.authorization");
    case "actor-resolution":
      return t(locale, "error.actorResolution");
    case "request-shape":
      return t(locale, "error.requestShape");
    case "not-found":
      return t(locale, "error.notFound");
    case "conflict":
      return t(locale, "error.conflict");
    case "migration-plan":
      return t(locale, "error.migrationPlan");
    case "self-role-strip":
      return t(locale, "error.selfRoleStrip");
    case "self-manager":
      return t(locale, "error.selfManager");
    case "unknown-manager":
      return t(locale, "error.unknownManager");
    case "email-in-use":
      return t(locale, "error.emailInUse");
    case "network":
      return t(locale, "error.network");
    case "internal":
      return t(locale, "error.internal");
    default:
      // `ClientError` is the union of every server error type, so it carries
      // variants only another area provokes. If one reaches an operator screen
      // it reads as a generic failure rather than falling off the switch.
      return t(locale, "error.generic");
  }
}

/**
 * Reduces any caught value to operator-facing text — the shape every
 * `else throw err` in this package becomes. A non-`AdminClientError` throw
 * should not happen (every network path wraps its failure), but a screen
 * still must not rethrow one, so it gets the same generic text rather than
 * an unhandled rejection.
 */
export function describeCaughtError(err: unknown, locale: UiLocale): string {
  if (err instanceof AdminClientError) return describeError(err.error, locale);
  return t(locale, "error.genericRetry");
}
