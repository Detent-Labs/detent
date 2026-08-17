import { useRef } from "react";
import { AppClientError } from "../api/client.js";

/** True for a caught error that means the session expired: an `AppClientError` carrying HTTP 401. */
export function is401(err: unknown): boolean {
  return err instanceof AppClientError && err.status === 401;
}

/**
 * The 401 rule, stated once: a caught error either logs the actor out or
 * becomes a message. `onUnauthorized` and `onError` are read through refs
 * that every render updates, so the returned function keeps one identity for
 * the life of the component. A `useCallback` keyed on either argument would
 * hand back a new function whenever a caller passes an inline arrow, and any
 * effect listing it as a dependency would then refetch in a loop.
 */
export function useFail(onUnauthorized: () => void, onError: (err: unknown) => void): (err: unknown) => void {
  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  return useRef((err: unknown) => {
    if (is401(err)) onUnauthorizedRef.current();
    else onErrorRef.current(err);
  }).current;
}
