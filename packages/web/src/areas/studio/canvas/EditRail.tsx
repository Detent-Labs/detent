import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { SquarePlus, Share2, Flag, ChevronRight } from "lucide-react";
import { t, type CatalogKey } from "../catalog.js";
import { useDraft } from "../draft/store.js";
import type { StepKind } from "../draft/createStep.js";
import { PANEL_VIEWS, type PanelView } from "../routing.js";
import { panelEntityCounts } from "../draft/panel-rail.js";

const styles = stylex.create({
  rail: {
    minWidth: 0,
    overflowY: "auto",
    border: `1px solid ${colors.border}`,
  },
  railSection: {
    padding: `${space.s2} 0`,
  },
  // The structural rule between the two sections — the 2px divider, never
  // the 1px hairline the rows within a section use. EditRail always renders
  // exactly two sections, so this composes on the second one directly
  // instead of a `+`-combinator selector.
  railSectionDivider: {
    borderTop: `2px solid ${colors.border}`,
  },
  railSectionHeading: {
    margin: 0,
    padding: `0 ${space.s3} ${space.s2}`,
  },
  paletteList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  // A register row, like the panels rail and the step section index: a
  // hairline between rows, content flush left.
  paletteEntry: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    width: "100%",
    background: { default: "none", ":hover": colors.surfaceMuted },
    color: "inherit",
    border: "none",
    borderBottom: `1px solid ${colors.border}`,
    padding: `${space.s2} ${space.s3}`,
    font: "inherit",
    textAlign: "left",
    cursor: "grab",
    touchAction: "none",
  },
  // Follows the pointer during a palette drag. Screen-fixed (`position:
  // fixed`, client coordinates straight from the pointer event) since the
  // drag can cross from the palette column over the canvas, outside either
  // element's own local coordinate space.
  paletteGhost: {
    position: "fixed",
    zIndex: 3,
    transform: "translate(-50%, -50%)",
    background: colors.surface,
    border: `2px solid ${colors.accent}`,
    color: colors.text,
    padding: `${space.s1} ${space.s2}`,
    fontSize: "0.85rem",
    pointerEvents: "none",
  },
  // A Process row's count and chevron sit flush right, sharing
  // `paletteEntry`'s row shell (flex, hairline, flush-left label).
  railRow: {
    cursor: "pointer",
  },
  railCount: {
    marginLeft: "auto",
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },
});

interface Props {
  /** Fires on release, screen (client) coordinates — same shape as the
   * now-removed `StepPalette`'s own `onDrop` (this section ported its
   * entries unchanged): the rail itself holds no canvas geometry, so
   * resolving a client point to a canvas point is the caller's job
   * (`EditorArea`). */
  onDrop: (kind: StepKind, clientX: number, clientY: number) => void;
  /** Fires on every pointer move a drag makes, screen coordinates, the same
   * shape as `onDrop` (design.md: "The rail reports its moving position").
   * Drives the canvas's drop-target highlight while the drag is still live. */
  onDragMove: (kind: StepKind, clientX: number, clientY: number) => void;
  /** Navigates to the panels screen at the given view. It set component
   * state before the screen was routed (`setOpenPanel`). */
  onOpenPanel: (view: PanelView) => void;
}

const ADD_ENTRIES: { kind: StepKind; label: CatalogKey; Icon: typeof SquarePlus }[] = [
  { kind: "task", label: "palette.step", Icon: SquarePlus },
  { kind: "subprocess", label: "palette.subprocess", Icon: Share2 },
  { kind: "end", label: "palette.end", Icon: Flag },
];

const PROCESS_ROW_LABEL: Record<PanelView, CatalogKey> = {
  fields: "panelsScreen.linkFields",
  dataSources: "panelsScreen.linkDataSources",
  contract: "panelsScreen.linkContract",
  matrix: "panelsScreen.linkFieldMatrix",
};

const PROCESS_ROWS: { view: PanelView; label: CatalogKey }[] = PANEL_VIEWS.map((view) => ({
  view,
  label: PROCESS_ROW_LABEL[view],
}));

/**
 * The canvas edit screen's one rail (design.md: "One rail component, not
 * two side-by-side ones"). Two labeled sections share this single column:
 * "Add to canvas" — the place-on-canvas palette, ported unchanged from the
 * now-deleted `StepPalette` — and "Process" — the four entry points into the
 * panels screen that the now-removed `studio-panel-links` nav used to render.
 * Both groups are register rows, ruled the same way, with a structural
 * divider between the two sections.
 *
 * The Process rows only navigate: no inline editing moves in here, only a
 * count and a chevron per row. They opened a modal before stage 36 routed the
 * panels screen.
 */
export function EditRail({ onDrop, onDragMove, onOpenPanel }: Props) {
  const { draft } = useDraft();
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

  // One helper, so this rail and the panels screen's index rail cannot report
  // different numbers for one view. Each carried its own copy before.
  const entityCount = panelEntityCounts(draft);

  return (
    <div {...stylex.props(styles.rail)}>
      <section {...stylex.props(styles.railSection)} aria-labelledby="edit-rail-add-heading">
        <h2 {...stylex.props(styles.railSectionHeading)} id="edit-rail-add-heading">
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
      <section {...stylex.props(styles.railSection, styles.railSectionDivider)} aria-labelledby="edit-rail-process-heading">
        <h2 {...stylex.props(styles.railSectionHeading)} id="edit-rail-process-heading">
          {t("app.processLegend")}
        </h2>
        <ul {...stylex.props(styles.paletteList)}>
          {PROCESS_ROWS.map(({ view, label }) => (
            <li key={view}>
              <button type="button" {...stylex.props(styles.paletteEntry, styles.railRow)} onClick={() => onOpenPanel(view)}>
                <span>{t(label)}</span>
                <span {...stylex.props(styles.railCount)}>{entityCount[view]}</span>
                <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
