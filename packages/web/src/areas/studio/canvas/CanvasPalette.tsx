import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, space } from "form-ui/tokens.stylex";
import { SquarePlus, Share2, Flag } from "lucide-react";
import { t, type CatalogKey } from "../catalog.js";
import type { StepKind } from "../draft/createStep.js";

const styles = stylex.create({
  palette: {
    flex: "none",
    width: "12rem",
    minWidth: 0,
    overflowY: "auto",
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: 0,
  },
  paletteHeading: {
    margin: 0,
    paddingTop: 0,
    paddingInline: space.s3,
    paddingBottom: space.s2,
  },
  paletteList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  // A register row: a hairline between rows, content flush left.
  paletteEntry: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    width: "100%",
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    color: "inherit",
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    font: "inherit",
    textAlign: "left",
    cursor: "grab",
    touchAction: "none",
  },
  // Follows the pointer during a palette drag. Screen-fixed (`position:
  // fixed`, client coordinates straight from the pointer event) since the
  // drag crosses from the palette over the canvas, outside either element's
  // own local coordinate space.
  paletteGhost: {
    position: "fixed",
    zIndex: 3,
    transform: "translate(-50%, -50%)",
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.accent,
    color: colors.text,
    paddingBlock: space.s1,
    paddingInline: space.s2,
    fontSize: "0.85rem",
    pointerEvents: "none",
  },
});

interface Props {
  /** Fires on release, screen (client) coordinates: the palette holds no
   * canvas geometry, so resolving a client point to a canvas point is the
   * caller's job (`EditorArea`). */
  onDrop: (kind: StepKind, clientX: number, clientY: number) => void;
  /** Fires on every pointer move a drag makes, same coordinates as `onDrop`.
   * Drives the canvas's drop-target highlight while the drag is still live. */
  onDragMove: (kind: StepKind, clientX: number, clientY: number) => void;
}

const ADD_ENTRIES: { kind: StepKind; label: CatalogKey; Icon: typeof SquarePlus }[] = [
  { kind: "task", label: "palette.step", Icon: SquarePlus },
  { kind: "subprocess", label: "palette.subprocess", Icon: Share2 },
  { kind: "end", label: "palette.end", Icon: Flag },
];

/**
 * The palette, the expanded canvas ribbon's left edge (`studio-canvas`'s
 * palette requirement). Drag Step, Subprocess or End onto the canvas to add a
 * step of that kind at the drop point.
 *
 * The collapsed ribbon shows no palette, so the steps register carries the one
 * always-reachable way to add a first step.
 */
export function CanvasPalette({ onDrop, onDragMove }: Props) {
  const [dragging, setDragging] = useState<{ kind: StepKind; x: number; y: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent, kind: StepKind) => {
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // best-effort, matching CanvasView's own capturePointer
    }
    setDragging({ kind, x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging({ ...dragging, x: e.clientX, y: e.clientY });
    onDragMove(dragging.kind, e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    onDrop(dragging.kind, e.clientX, e.clientY);
    setDragging(null);
  };

  return (
    <section {...stylex.props(styles.palette)} aria-labelledby="studio-canvas-palette-heading">
      <h2 {...stylex.props(styles.paletteHeading)} id="studio-canvas-palette-heading">
        {t("palette.heading")}
      </h2>
      <ul {...stylex.props(styles.paletteList)}>
        {ADD_ENTRIES.map(({ kind, label, Icon }) => (
          <li key={kind}>
            <button
              type="button"
              {...stylex.props(styles.paletteEntry)}
              onPointerDown={(e) => onPointerDown(e, kind)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>{t(label)}</span>
            </button>
          </li>
        ))}
      </ul>
      {dragging && (
        <div {...stylex.props(styles.paletteGhost)} style={{ left: dragging.x, top: dragging.y }} aria-hidden="true">
          {t(ADD_ENTRIES.find((entry) => entry.kind === dragging.kind)!.label)}
        </div>
      )}
    </section>
  );
}
