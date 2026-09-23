/** True for a keyboard focus. An engine that cannot parse `:focus-visible`
 * reads false, so its pointer presses never scroll. */
export function focusVisible(element: { matches(selector: string): boolean }): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
}

/** The part of a focus target `scrollKeyboardFocusIntoView` reads. */
type FocusTarget = {
  matches(selector: string): boolean;
  closest(selector: string): unknown;
  scrollIntoView(options?: ScrollIntoViewOptions): void;
};

/**
 * A surface root's `onFocusCapture` handler (`studio-focus-ring-clipping`).
 * A Tab-key focus leaves a partly visible control where it stands, with its
 * ring cut at the scroll box's edge. `nearest` scrolls every scroll box
 * around the target by the least distance, clear of each box's scroll
 * padding, so one handler at the root serves every nested box.
 *
 * A pointer focus does not match `:focus-visible` and scrolls nothing, so a
 * click never moves its control before `mouseup`. A target inside an `<svg>`
 * scrolls nothing either: the canvas pans its own nodes.
 */
export function scrollKeyboardFocusIntoView(event: { target: EventTarget | null }): void {
  const target = event.target as FocusTarget | null;
  if (target === null || typeof target.scrollIntoView !== "function") return;
  if (!focusVisible(target)) return;
  if (target.closest("svg") !== null) return;
  target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
}
