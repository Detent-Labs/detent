/** Least gap between two requests for a screen that refetches on focus: Users and Groups load the whole account directory. */
export const DIRECTORY_FOCUS_INTERVAL_MS = 30000;

/** True once `minMs` or more have passed since the screen's last request. A `minMs` of 0 is always due, and so is a clock that stepped backward. */
export function focusRefetchDue(lastAt: number, now: number, minMs: number): boolean {
  return minMs <= 0 || now < lastAt || now - lastAt >= minMs;
}
