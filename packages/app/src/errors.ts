import type { ClientError } from "./api/types.js";
import { AppClientError } from "./api/client.js";
import { t } from "./i18n/catalog.js";
import type { UiLocale } from "./i18n/locale.js";

/** What the Task screen should DO in response to a given error, distinct from
 * the message it shows — see design.md's error table. `validation` is
 * excluded: `form-ui` attaches those issues per-field instead of via this
 * generic path. A `401` is handled by the caller checking `status` directly,
 * before this function is ever consulted. */
export type ErrorOutcome =
  | { kind: "refresh-and-remove"; message: string }
  | { kind: "explain"; message: string }
  | { kind: "prompt-claim"; message: string }
  | { kind: "claim-lost"; message: string }
  | { kind: "reload-moved-on"; message: string };

export function describeError(error: Exclude<ClientError, { type: "validation" }>, locale: UiLocale): ErrorOutcome {
  switch (error.type) {
    case "already-claimed":
      return { kind: "refresh-and-remove", message: t(locale, "error.alreadyClaimed") };
    case "not-a-candidate":
      return { kind: "explain", message: t(locale, "error.notACandidate") };
    case "not-claimant":
      return { kind: "prompt-claim", message: t(locale, "error.notClaimant") };
    case "not-claimed":
      return { kind: "claim-lost", message: t(locale, "error.notClaimed") };
    case "concurrency-conflict":
      return { kind: "reload-moved-on", message: t(locale, "error.concurrencyConflict") };
    case "authorization":
      // The server's own message is a technical one ("actor 'x' may not
      // cancel instance 'y'") — not end-user copy, so this is the one case
      // where the friendly string wins over the server's message outright.
      return { kind: "explain", message: t(locale, "error.authorization") };
    case "not-assigned":
    case "guard-refused":
    case "actor-resolution":
    case "internal":
      return { kind: "explain", message: error.message || t(locale, "error.generic") };
  }
}

/**
 * Reduces any caught value to display text for screens that don't need
 * `describeError`'s outcome-kind machinery (TasksScreen, StartScreen,
 * LoginScreen — none of them drive a claim state machine). Deliberately
 * separate from `describeError` rather than a thin wrapper over it: unlike
 * that function (TaskScreen's existing template, not rewritten by this
 * change), this one never reads `error.message` — the server does not
 * guarantee that string is safe to show, and after
 * `correct-api-error-responses` an unexpected 500 sends none at all.
 */
export function describeCaughtError(err: unknown, locale: UiLocale): string {
  if (err instanceof AppClientError) {
    if (err.error.type === "internal") {
      return err.status === undefined ? t(locale, "error.network") : t(locale, "error.serverError");
    }
    if (err.error.type === "authorization") return t(locale, "error.authorization");
  }
  return t(locale, "error.generic");
}
