import { useEffect, useState } from "react";

/**
 * Fetches once per mount via `fetcher(token)`. `undefined` until it resolves,
 * and after a failed fetch. Shared body beneath `useDataLists` and
 * `useRegistry`.
 */
export function useFetchOnce<T>(token: string, fetcher: (token: string) => Promise<T>): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);

  useEffect(() => {
    let live = true;
    fetcher(token)
      .then((v) => live && setValue(v))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [token, fetcher]);

  return value;
}
