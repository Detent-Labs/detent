/**
 * The two server copies an admin editor holds while an operator types. A
 * refetch always stores `latest`. It refills the inputs, and moves `baseline`
 * to `latest`, only when the operator holds no unsaved input or the caller
 * asks for a reseed. Pure, so `bun:test` covers the decision the screens wire.
 */

/** `baseline` is the copy that filled the inputs; `latest` is the newest answer. */
export interface ServerCopies<S> {
  baseline: S;
  latest: S;
}

/**
 * Folds one server answer into the pair. `reseed` tells the screen to refill
 * its inputs from `next`. That happens on the first load and whenever
 * `keepEdits` is false; otherwise the baseline stays where the input started.
 */
export function absorbServerCopy<S>(
  prev: ServerCopies<S> | undefined,
  next: S,
  keepEdits: boolean,
): { copies: ServerCopies<S>; reseed: boolean } {
  if (prev === undefined || !keepEdits) return { copies: { baseline: next, latest: next }, reseed: true };
  return { copies: { baseline: prev.baseline, latest: next }, reseed: false };
}

/** Whether the server copy moved away from the one the input started from. */
export function serverCopyChanged<S>(copies: ServerCopies<S> | undefined, same: (a: S, b: S) => boolean): boolean {
  if (copies === undefined) return false;
  return !same(copies.baseline, copies.latest);
}
