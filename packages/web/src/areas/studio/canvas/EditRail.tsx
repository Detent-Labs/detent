import { useState } from "react";
import { SquarePlus, Share2, Flag, ChevronRight } from "lucide-react";
import { t, type TranslationKey } from "../catalog.js";
import { useDraft } from "../draft/store.js";
import type { StepKind } from "../draft/createStep.js";
import { PANEL_VIEWS, type PanelView } from "../routing.js";
import { panelEntityCounts } from "../draft/panel-rail.js";

interface Props {
  /** Fires on release, screen (client) coordinates — same shape as the
   * now-removed `StepPalette`'s own `onDrop` (this section ported its
   * entries unchanged): the rail itself holds no canvas geometry, so
   * resolving a client point to a canvas point is the caller's job
   * (`EditorArea`). */
  onDrop: (kind: StepKind, clientX: number, clientY: number) => void;
  /** Navigates to the panels screen at the given view. It set component
   * state before the screen was routed (`setOpenPanel`). */
  onOpenPanel: (view: PanelView) => void;
}

const ADD_ENTRIES: { kind: StepKind; label: TranslationKey; Icon: typeof SquarePlus }[] = [
  { kind: "task", label: "palette.step", Icon: SquarePlus },
  { kind: "subprocess", label: "palette.subprocess", Icon: Share2 },
  { kind: "end", label: "palette.end", Icon: Flag },
];

const PROCESS_ROW_LABEL: Record<PanelView, TranslationKey> = {
  fields: "panelsScreen.linkFields",
  dataSources: "panelsScreen.linkDataSources",
  contract: "panelsScreen.linkContract",
  matrix: "panelsScreen.linkFieldMatrix",
};

const PROCESS_ROWS: { view: PanelView; label: TranslationKey }[] = PANEL_VIEWS.map((view) => ({
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
export function EditRail({ onDrop, onOpenPanel }: Props) {
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
    <div className="studio-rail">
      <section className="studio-rail-section" aria-labelledby="edit-rail-add-heading">
        <h2 id="edit-rail-add-heading">{t("palette.heading")}</h2>
        <ul className="studio-palette-list">
          {ADD_ENTRIES.map(({ kind, label, Icon }) => (
            <li key={kind}>
              <button
                type="button"
                className="studio-palette-entry"
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
          <div className="studio-palette-ghost" style={{ left: dragging.x, top: dragging.y }} aria-hidden="true">
            {t(ADD_ENTRIES.find((entry) => entry.kind === dragging.kind)!.label)}
          </div>
        )}
      </section>
      <section className="studio-rail-section" aria-labelledby="edit-rail-process-heading">
        <h2 id="edit-rail-process-heading">{t("app.processLegend")}</h2>
        <ul className="studio-palette-list">
          {PROCESS_ROWS.map(({ view, label }) => (
            <li key={view}>
              <button type="button" className="studio-palette-entry studio-rail-row" onClick={() => onOpenPanel(view)}>
                <span>{t(label)}</span>
                <span className="studio-rail-count">{entityCount[view]}</span>
                <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
