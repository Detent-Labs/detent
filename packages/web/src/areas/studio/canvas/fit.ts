/**
 * The "fit to view" arithmetic, as a pure function.
 *
 * Panzoom binds to the `<svg>` root itself and writes
 * `transform: scale(s) translate(x, y)`. The `translate` sits to the right of
 * the `scale`, so the browser scales it a second time. Panzoom also treats an
 * `<svg>` root as HTML rather than SVG (`isSVGElement` excludes it), which
 * leaves `transform-origin` at `50% 50%`. A user-space point `p` therefore
 * lands at `C + s * (p + t - C)` on screen, where `C` is the element centre
 * and `t` is the value handed to `panzoom.pan()`.
 *
 * Solving that for `t`, so that the content centre `m` lands on a chosen
 * screen point `T`, gives `t = (T - C) / s + C - m`.
 *
 * Every length here is a CSS pixel. The canvas carries no `viewBox`, so one
 * SVG user unit is one CSS pixel and the content box compares directly with
 * the element box. A `viewBox` on the canvas would break that, and the caller
 * would have to convert first.
 */

/** The bounds of the drawn content, in the canvas's user space. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The canvas's layout box. Never a transformed one: see `CanvasView`. */
export interface Size {
  width: number;
  height: number;
}

/** Pixels carved off each edge before the content is framed. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Fit {
  scale: number;
  x: number;
  y: number;
}

/** The bounds the `Panzoom` call declares. Exported so the two agree. */
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 2;

/**
 * The gap between the framed content and the canvas edge, and the part of the
 * top inset that is not the toolbar. 16px is `--space-4` on the 4-point scale
 * `.claude/rules/design-language.md` sets for every gap.
 */
export const FIT_GUTTER = 16;

/** Leaves the canvas as it is. Used where there is nothing to frame. */
const NEUTRAL: Fit = { scale: 1, x: 0, y: 0 };

/**
 * Scale and pan that put `content` inside `element` minus `insets`, centred.
 *
 * The scale never magnifies: a graph smaller than the canvas keeps its size
 * rather than filling it. It never falls below `MIN_SCALE` either, so a graph
 * wider than that floor allows stays centred and overflows, and the author
 * pans. `MAX_SCALE` is out of reach here for the same reason the cap at 1 is:
 * this function only ever shrinks.
 */
export function computeFit(content: Box, element: Size, insets: Insets): Fit {
  const usableWidth = element.width - insets.left - insets.right;
  const usableHeight = element.height - insets.top - insets.bottom;

  if (content.width <= 0 || content.height <= 0 || usableWidth <= 0 || usableHeight <= 0) {
    return { ...NEUTRAL };
  }

  const scale = Math.max(Math.min(usableWidth / content.width, usableHeight / content.height, 1), MIN_SCALE);

  // The origin the browser scales about.
  const centreX = element.width / 2;
  const centreY = element.height / 2;
  // Where the content centre has to land.
  const targetX = insets.left + usableWidth / 2;
  const targetY = insets.top + usableHeight / 2;
  // Where the content centre sits in user space.
  const contentX = content.x + content.width / 2;
  const contentY = content.y + content.height / 2;

  return {
    scale,
    x: (targetX - centreX) / scale + centreX - contentX,
    y: (targetY - centreY) / scale + centreY - contentY,
  };
}

/**
 * The insets every framing reads: the toolbar's bottom edge plus the gutter
 * on top, the gutter on the other three sides. Shared by `measureFit` and the
 * reveal on focus, so the two cannot drift.
 */
export function fitInsets(toolbarBottom: number): Insets {
  return { top: toolbarBottom + FIT_GUTTER, right: FIT_GUTTER, bottom: FIT_GUTTER, left: FIT_GUTTER };
}

/** The shift, in screen pixels, that brings one axis of a target into the room. */
function revealShift(start: number, length: number, low: number, high: number): number {
  if (length > high - low) return low - start;
  if (start < low) return low - start;
  if (start + length > high) return high - (start + length);
  return 0;
}

/**
 * The pan that brings `target` inside `view` minus `insets`, by the least
 * distance. `target` is in the frame's pixel space, as `getBoundingClientRect`
 * reads it. A target larger than the room aligns its leading edge to the
 * inset. A shift of `d` screen pixels moves the pan by `d / scale`, per the
 * projection above, and the scale stays as it was.
 */
export function revealPan(target: Box, view: Size, insets: Insets, current: Fit): Fit {
  const dx = revealShift(target.x, target.width, insets.left, view.width - insets.right);
  const dy = revealShift(target.y, target.height, insets.top, view.height - insets.bottom);
  return { scale: current.scale, x: current.x + dx / current.scale, y: current.y + dy / current.scale };
}

/** The factor one zoom key applies, each way. */
export const ZOOM_KEY_FACTOR = 1.25;

/**
 * The fit at `toScale` (clamped to the bounds) that keeps `anchor`, a screen
 * point in the frame's pixel space, where it is. From the projection above,
 * the pan moves by `(anchor - C) * (1/s' - 1/s)`, with `C` the view centre. An
 * anchor at the centre leaves the pan as it was.
 */
export function zoomAbout(current: Fit, toScale: number, anchor: { x: number; y: number }, view: Size): Fit {
  const scale = Math.min(Math.max(toScale, MIN_SCALE), MAX_SCALE);
  const k = 1 / scale - 1 / current.scale;
  return {
    scale,
    x: current.x + (anchor.x - view.width / 2) * k,
    y: current.y + (anchor.y - view.height / 2) * k,
  };
}
