import { useCallback, useEffect, useState } from "react";

/**
 * A `reloadToken` a screen's fetch effect depends on: bumped by an explicit
 * `refresh()` call or when the window regains focus. No timer, no
 * websocket — see admin-app spec's "Data is refreshed on demand, not pushed".
 */
export function useRefresh(): { reloadToken: number; refresh: () => void } {
  const [reloadToken, setReloadToken] = useState(0);
  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  return { reloadToken, refresh };
}
