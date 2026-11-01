import type { ClientError } from "./api/types.js";
import { StudioClientError } from "./api/client.js";
import { t } from "./catalog.js";
import type { Draft } from "./draft/types.js";
import { resolveLoc } from "./draft/issues.js";
import { checkAnswer } from "./draft/checkSentence.js";

/**
 * Maps a client error to developer-facing text, keyed on `error.type`. Never
 * reads `error.message`: the server does not guarantee that string is safe to
 * show, and after `correct-api-error-responses` an unexpected 500 sends none
 * at all. Same file position and name as
 * `packages/web/src/areas/app/errors.ts::describeError`, so the three packages read
 * alike; narrower because studio does not drive a claim state machine.
 */
export function describeError(error: ClientError): string {
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
    // participant-facing string; these seven come from the publish chain's own
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

/** A refused publish read for the author. `text` is for the alert. `detail` is
 * the server's own text, for a closed Developer view beside it. */
export interface PublishRefusal {
  text: string;
  detail: string;
}

/**
 * Reads a refused publish as sentences. A located issue prints as the sentence
 * `checkSentence` states for it, one per line after the first text. A dialog has
 * no row to point at, so an answer that fell to the entity fallback reads the
 * process-wide fallback text instead. The server's lines go in `detail`.
 * Returns `undefined` for any other error: the caller keeps `describeError`.
 */
export function describePublishRefusal(error: ClientError, draft: Draft): PublishRefusal | undefined {
  if (error.type === "cross-process-validation") {
    return { text: t("checks.publishRefusedCrossProcess"), detail: error.message };
  }
  if (error.type !== "publish-validation") return undefined;

  const detail = [error.kind, ...error.issues.map((i) => (i.loc === "" ? i.message : `${i.loc}: ${i.message}`))].join("\n");
  const sentences: string[] = [];
  for (const issue of error.issues) {
    // The schema validator joins its path with dots, as in `workflow.steps.0.paths`.
    const loc = issue.loc.replace(/\.(\d+)(?=\.|$)/g, "[$1]");
    const answer = checkAnswer(draft, { loc, message: issue.message, ...resolveLoc(draft, loc) });
    const sentence = answer.key.startsWith("checks.fallback.") ? t("checks.publishRefusedFallback") : answer.sentence;
    if (!sentences.includes(sentence)) sentences.push(sentence);
  }
  if (sentences.length === 0) return { text: t("checks.publishRefusedFallback"), detail };
  return { text: [t("checks.publishRefused"), ...sentences].join("\n"), detail };
}

/**
 * Reduces any caught value to developer-facing text — the shape every
 * `else throw err` in this package becomes. A non-`StudioClientError` throw
 * should not happen (every network path wraps its failure), but a screen
 * still must not rethrow one, so it gets the same generic text rather than
 * an unhandled rejection.
 */
export function describeCaughtError(err: unknown): string {
  if (err instanceof StudioClientError) return describeError(err.error);
  return t("error.generic");
}
