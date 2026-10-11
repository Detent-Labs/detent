/** Answers whether a request is still the newest one its gate started. */
export type IsCurrent = () => boolean;

export interface LatestGate {
  /** Starts a generation. Every `IsCurrent` of an earlier generation turns false. */
  next: () => IsCurrent;
  /** The running generation's `IsCurrent`. Starts none, so it turns nothing stale. */
  current: () => IsCurrent;
}

/**
 * Newest answer wins: a request that outlives a newer one finds its
 * `IsCurrent` false and drops its result. The counter is the whole state, so
 * a gate costs no timer and no `AbortController`.
 */
export function createLatestGate(): LatestGate {
  let generation = 0;
  const current = (): IsCurrent => {
    const mine = generation;
    return () => mine === generation;
  };
  return {
    next: () => {
      generation += 1;
      return current();
    },
    current,
  };
}
