/**
 * Leaf module (no imports): error types shared across layers that would
 * otherwise create an import cycle. `RequestShapeError` lives here rather
 * than in `http/errors.ts` because `engine/drafts.ts`'s envelope check raises
 * it too, and `http/errors.ts` in turn imports `DraftConflictError` from
 * `engine/drafts.ts` for its own mapping — `http/errors.ts` re-exports this
 * for its existing callers.
 */

/** A request's shape (a query parameter, a JSON body) is malformed — the client can fix it by reading the API. */
export class RequestShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestShapeError";
  }
}
