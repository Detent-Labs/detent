/**
 * Leaf module (no imports): error types shared across layers that would
 * otherwise create an import cycle. `RequestShapeError` lives here rather
 * than in `http/errors.ts` because `engine/drafts.ts`'s envelope check raises
 * it too, and `http/errors.ts` in turn imports `DraftConflictError` from
 * `engine/drafts.ts` for its own mapping — `http/errors.ts` re-exports this
 * for its existing callers. `NotFoundError` and `InstanceNotRunningError`
 * live here for the same reason: `runtime/api.ts` throws them, `http/errors.ts`
 * maps them, and neither module already imports the other.
 */

/** A request's shape (a query parameter, a JSON body) is malformed — the client can fix it by reading the API. */
export class RequestShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestShapeError";
  }
}

/**
 * A requested instance, or the published body it pins to, does not exist.
 * Thrown in place of the Runtime API Layer's former untyped `Error`s so
 * `mapError`'s fallback can go message-free without silently swallowing this
 * one, spec-pinned scenario. Deliberately still maps to 500, not 404 — see
 * design.md's "Keep not-found at 500" and the recorded open question.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * A submit, claim or release targeted an instance whose status is not
 * `running`. Thrown at the runtime-API boundary — after the instance is
 * loaded under its row lock, before any work commits — so a caller is told
 * rather than receiving a silent no-op. `status` is the instance's observed
 * status, so a client can tell "already finished" from "cancelled". The
 * engine-level no-op (`commitManualTransition`, `updateAssignment`) is
 * unrelated and stays: it exists for internal idempotent re-entry, which has
 * no caller to report to.
 */
export class InstanceNotRunningError extends Error {
  constructor(
    readonly instanceId: string,
    readonly status: string,
  ) {
    super(`instance ${instanceId} is not running (status: ${status})`);
    this.name = "InstanceNotRunningError";
  }
}

/**
 * Redaction targeted an instance whose status is `running`. The mirror image
 * of `InstanceNotRunningError`: most operations refuse a non-running
 * instance, this one refuses a running one, so it needs its own type rather
 * than an inverted reuse of that one.
 */
export class InstanceRunningError extends Error {
  constructor(
    readonly instanceId: string,
    readonly status: string,
  ) {
    super(`instance ${instanceId} is running (status: ${status})`);
    this.name = "InstanceRunningError";
  }
}
