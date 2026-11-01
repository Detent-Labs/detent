/** Where Tab goes from `active`, or undefined when the browser's own step is right. */
export function wrapTarget<T>(focusables: readonly T[], active: T | null, shift: boolean): T | undefined {
  if (focusables.length === 0) return undefined;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const index = active === null ? -1 : focusables.indexOf(active);
  if (index === -1) return shift ? last : first;
  if (shift) return index === 0 ? last : undefined;
  return index === focusables.length - 1 ? first : undefined;
}

const TAB_STOPS = "a[href], button, input, select, textarea, summary, [tabindex]";

/** Whether a closed `details` hides `element`. A closed `details` keeps its own
 * `summary` reachable, and nothing else, a nested `summary` included. */
function insideClosedDetails(element: HTMLElement): boolean {
  for (
    let closed = element.closest("details:not([open])");
    closed !== null;
    closed = closed.parentElement?.closest("details:not([open])") ?? null
  ) {
    if (closed.querySelector(":scope > summary") !== element) return true;
  }
  return false;
}

/** The dialog's Tab stops: visible, enabled, and outside a closed `details` unless it is that one's `summary`. */
export function dialogFocusables(dialog: HTMLDialogElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(TAB_STOPS)].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !insideClosedDetails(element) &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden",
  );
}

/** The control holding the focus now. A caller with no stable opener ref writes
 * this into its ref at the press, and the dialog's focus return reads that ref. */
export function activeControl(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement ? active : null;
}
