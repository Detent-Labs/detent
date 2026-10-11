import { useCallback, useEffect, useRef, useState } from "react";
import { focusRefetchDue } from "./refreshLogic.js";

/**
 * A `reloadToken` a screen's fetch effect depends on: bumped by an explicit
 * `refresh()` call or when the window regains focus. No timer, no
 * websocket — see admin-app spec's "Data is refreshed on demand, not pushed".
 *
 * `minFocusIntervalMs` (default 0) is the least time between a screen's last
 * request and a focus refetch. Opening the screen, `refresh()` and a focus
 * refetch each count as a request. `refresh()` itself never waits.
 */
export function useRefresh(options?: { minFocusIntervalMs?: number }): { reloadToken: number; refresh: () => void } {
  const minFocusIntervalMs = options?.minFocusIntervalMs ?? 0;
  const [reloadToken, setReloadToken] = useState(0);
  const lastRequestAt = useRef(Date.now());
  const refresh = useCallback(() => {
    lastRequestAt.current = Date.now();
    setReloadToken((t) => t + 1);
  }, []);

  useEffect(() => {
    const onFocus = () => {
      if (focusRefetchDue(lastRequestAt.current, Date.now(), minFocusIntervalMs)) refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, minFocusIntervalMs]);

  return { reloadToken, refresh };
}
