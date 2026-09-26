/** True for a keyboard focus. An engine that cannot parse `:focus-visible`
 * reads false, so its pointer presses never scroll. */
export function focusVisible(element: { matches(selector: string): boolean }): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
}

/** The last input modality, `"pointer"` or `"keyboard"` (`studio-focus-ring-
 * clipping`, I-4). Chrome and Firefox both match `:focus-visible` on a
 * pointer focus of any control that takes keyboard input — a text
 * `<input>`, a `<textarea>`, a contenteditable — so `:focus-visible` alone
 * cannot tell a mousedown on such a field from a Tab-key arrival. This flag
 * disambiguates. It defaults to `"keyboard"`, so a focus that lands with no
 * prior pointer or key event (a programmatic focus on mount, for example)
 * still scrolls. */
export type InputModality = "pointer" | "keyboard";
let lastInputModality: InputModality = "keyboard";

/** Sets the last input modality. The module-level capture listeners below
 * call this from a real `pointerdown`/`keydown`; a test with no DOM calls it
 * directly to set up a case. */
export function noteInputModality(modality: InputModality): void {
  lastInputModality = modality;
}

/** Installs once, at module load, guarded for a no-DOM environment
 * (bun:test mounts none). A capture-phase listener sees the event before any
 * `stopPropagation` downstream, so no descendant can hide its input kind
 * from this flag. */
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", () => noteInputModality("pointer"), { capture: true });
  document.addEventListener("keydown", () => noteInputModality("keyboard"), { capture: true });
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
 * A pointer focus scrolls nothing, so a click never moves its control
 * before `mouseup`. `:focus-visible` alone is not enough to prove that: it
 * also matches a pointer focus of a text field, a `<textarea>` or a
 * contenteditable in Chrome and Firefox, so this also requires the last
 * input modality to read `"keyboard"` (see `lastInputModality` above). A
 * target inside an `<svg>` scrolls nothing either: the canvas pans its own
 * nodes.
 */
export function scrollKeyboardFocusIntoView(event: { target: EventTarget | null }): void {
  const target = event.target as FocusTarget | null;
  if (target === null || typeof target.scrollIntoView !== "function") return;
  if (lastInputModality !== "keyboard") return;
  if (!focusVisible(target)) return;
  if (target.closest("svg") !== null) return;
  target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
}
