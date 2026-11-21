import * as stylex from "@stylexjs/stylex";
import { colors } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { dockingEndOfAnchor, type DockingEnd, type Point } from "./geometry";

/** The drawn handle and its press target (design.md, Shape brief). */
const END_HANDLE_RADIUS = 5;
const END_HANDLE_TARGET_RADIUS = 12;

const styles = stylex.create({
  dot: {
    fill: colors.accent,
    stroke: colors.accent,
    strokeWidth: 1,
    pointerEvents: "none",
  },
  // Transparent counts as painted, so the circle takes the press.
  target: {
    fill: "transparent",
    cursor: "grab",
  },
});

/**
 * One end of the selected path, a handle its author drags to another docking
 * point of the same step. The press target draws over every docking point's, and
 * inside its circle this handle takes the press. `panzoom-exclude` keeps the
 * press off the canvas pan.
 */
export function EndHandle({
  at,
  pathId,
  end,
  stepId,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
}: {
  at: Point;
  pathId: string;
  end: "source" | "target";
  stepId: string;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
}): React.JSX.Element {
  return (
    <g className="panzoom-exclude" data-end-handle={end}
      data-end-handle-step={stepId}
      data-path-id={pathId}
      aria-hidden="true"
      onPointerLeave={onPointerLeave}
    >
      <circle cx={at.x} cy={at.y} r={END_HANDLE_RADIUS} {...stylex.props(styles.dot)} />
      <circle
        cx={at.x}
        cy={at.y}
        r={END_HANDLE_TARGET_RADIUS}
        {...stylex.props(styles.target)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        // The mouse press's default would move focus to the canvas `<svg>`,
        // which draws its outline around the whole graph.
        onMouseDown={(e) => e.preventDefault()}
      >
        <title>{t("canvas.endHandle")}</title>
      </circle>
    </g>
  );
}

/** One end handle to draw: where it sits, the step it hangs on, and the point a
 * drag may not take. On a path that starts and ends on one step, `exclude` is
 * the point the other end holds; on any other path it is absent. */
export interface EndHandleSpec {
  pathId: string;
  end: "source" | "target";
  stepId: string;
  anchor: Point;
  exclude: DockingEnd | undefined;
}

/**
 * The end handles of one drawn path: one per end, at the route's own first and
 * last point. An end on a hidden step, which a collapsed group's box stands in
 * for, has no docking point and gets none. On a path that starts and ends on one
 * step, each handle excludes the point the other end holds, so the two never
 * share one.
 */
export function endHandlesOf(input: {
  pathId: string;
  sourceId: string;
  targetId: string;
  route: Point[];
  positions: Record<string, Point>;
  hidden: ReadonlySet<string>;
}): EndHandleSpec[] {
  const { pathId, sourceId, targetId, route, positions, hidden } = input;
  const first = route[0];
  const last = route[route.length - 1];
  const held = (id: string, anchor: Point) => (positions[id] ? dockingEndOfAnchor(positions[id], anchor) : undefined);
  const sourceHeld = held(sourceId, first);
  const targetHeld = held(targetId, last);
  const self = sourceId === targetId;
  const out: EndHandleSpec[] = [];
  if (!hidden.has(sourceId)) {
    out.push({ pathId, end: "source", stepId: sourceId, anchor: first, exclude: self ? targetHeld : undefined });
  }
  if (!hidden.has(targetId)) {
    out.push({ pathId, end: "target", stepId: targetId, anchor: last, exclude: self ? sourceHeld : undefined });
  }
  return out;
}
