import { useCallback, useState } from "react";
import { createLatestGate, type IsCurrent } from "./latestGate.js";

interface Page<T> {
  items: T[];
  cursor?: string;
}

interface PagedList<T> {
  items: T[];
  cursor: string | undefined;
  loading: boolean;
  error: string | undefined;
  /** Replaces `items` with the fetched page. */
  load: () => Promise<void>;
  /** Appends the fetched page to `items`. No-op while `cursor` is unset. */
  loadMore: () => Promise<void>;
  /**
   * Writes `items` and `cursor` directly, with no fetch of its own. For a
   * screen whose initial load is a compound fetch outside this hook (see
   * `InstanceScreen.tsx`), so the hook's own `loadMore` continues from the
   * page that fetch already retrieved instead of refetching page one. It also
   * ends any request in flight and clears `loading`.
   */
  reset: (items: T[], cursor?: string) => void;
}

/**
 * The load/loadMore/error/loading state machine every paged screen in
 * `app`/`admin` rebuilt inline. It owns only that state machine, not the
 * network call: `fetchPage` is the screen's own adapter, so the hook stays
 * agnostic to endpoint, query params, and response shape — the call sites
 * converge only on `{items, cursor}`.
 *
 * Only the newest request writes `items`, `cursor` and `error`, and only it
 * clears `loading`. `fetchPage` receives that request's `isCurrent` as its
 * second argument, for an effect of its own that must skip a stale answer
 * (the Outbox counts, a `fail` call). An adapter may declare fewer parameters.
 */
export function usePagedList<T>(fetchPage: (cursor: string | undefined, isCurrent: IsCurrent) => Promise<Page<T>>): PagedList<T> {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // Held in state so `load`, `loadMore` and `reset` keep their identities:
  // `InstanceScreen.tsx` lists `reset` in the dependencies of its own `load`.
  const [gate] = useState(createLatestGate);

  // A caller that also needs area-specific handling (a 401 redirect, an
  // `errorText`-mapped message) puts that in `fetchPage`'s own try/catch,
  // which already closes over the screen's `fail`/`setError` — this hook's
  // own `error` stays a plain fallback for a caller with no such wiring.
  // Swallowed here, not rethrown: `load`/`loadMore` stay safe to call as
  // `void load()`, the same fire-and-forget shape every converted screen
  // already used.
  const load = useCallback(async () => {
    const isCurrent = gate.next();
    setLoading(true);
    setError(undefined);
    try {
      const page = await fetchPage(undefined, isCurrent);
      if (!isCurrent()) return;
      setItems(page.items);
      setCursor(page.cursor);
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [fetchPage, gate]);

  // `current()` starts no generation, so an append never drops a replace in
  // flight; a later `load` or `reset` drops the append.
  const loadMore = useCallback(async () => {
    if (!cursor) return;
    const isCurrent = gate.current();
    setLoading(true);
    setError(undefined);
    try {
      const page = await fetchPage(cursor, isCurrent);
      if (!isCurrent()) return;
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.cursor);
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [fetchPage, cursor, gate]);

  // Ends any request in flight and starts none, so `loading` goes false here.
  const reset = useCallback(
    (nextItems: T[], nextCursor?: string) => {
      gate.next();
      setItems(nextItems);
      setCursor(nextCursor);
      setLoading(false);
    },
    [gate],
  );

  return { items, cursor, loading, error, load, loadMore, reset };
}
