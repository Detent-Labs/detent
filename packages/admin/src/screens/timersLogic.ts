/** `now` is a parameter (not `Date.now()` read internally) so this stays pure and testable. */
export function isOverdue(nextTimerAt: string, now: number = Date.now()): boolean {
  return new Date(nextTimerAt).getTime() <= now;
}
