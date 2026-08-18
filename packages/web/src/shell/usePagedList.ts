import { useCallback, useState } from "react";

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
   * page that fetch already retrieved instead of refetching page one.
   */
  reset: (items: T[], cursor?: string) => void;
}

/**
 * The load/loadMore/error/loading state machine every paged screen in
 * `app`/`admin` rebuilt inline. It owns only that state machine, not the
 * network call: `fetchPage` is the screen's own adapter, so the hook stays
 * agnostic to endpoint, query params, and response shape — the six call
 * sites converge only on `{items, cursor}`.
 */
export function usePagedList<T>(fetchPage: (cursor?: string) => Promise<Page<T>>): PagedList<T> {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // A caller that also needs area-specific handling (a 401 redirect, an
  // `errorText`-mapped message) puts that in `fetchPage`'s own try/catch,
  // which already closes over the screen's `fail`/`setError` — this hook's
  // own `error` stays a plain fallback for a caller with no such wiring.
  // Swallowed here, not rethrown: `load`/`loadMore` stay safe to call as
  // `void load()`, the same fire-and-forget shape every converted screen
  // already used.
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const page = await fetchPage();
      setItems(page.items);
      setCursor(page.cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoading(true);
    setError(undefined);
    try {
      const page = await fetchPage(cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fetchPage, cursor]);

  const reset = useCallback((nextItems: T[], nextCursor?: string) => {
    setItems(nextItems);
    setCursor(nextCursor);
  }, []);

  return { items, cursor, loading, error, load, loadMore, reset };
}
