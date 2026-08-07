import { useState } from "react";
import { SquarePlus, Share2, Flag } from "lucide-react";
import { t, type TranslationKey } from "../catalog.js";
import type { StepKind } from "../draft/createStep";

interface Props {
  /** Fires on release, screen (client) coordinates: the palette itself holds
   * no canvas geometry, so resolving a client point to a canvas point — and
   * deciding whether the release even landed on the canvas — is the caller's
   * job (`EditorArea`, which owns the canvas's own SVG element). */
  onDrop: (kind: StepKind, clientX: number, clientY: number) => void;
}

const ENTRIES: { kind: StepKind; label: TranslationKey; Icon: typeof SquarePlus }[] = [
  { kind: "task", label: "palette.step", Icon: SquarePlus },
  { kind: "subprocess", label: "palette.subprocess", Icon: Share2 },
  { kind: "end", label: "palette.end", Icon: Flag },
];

/**
 * Always-available "add a step" entry point (studio-canvas: "A palette
 * offers Step, Subprocess, and End"), beside the inspector's own no-selection
 * "+ Add step" button. Drag-to-place uses Pointer Events throughout —
 * `onPointerDown`/`onPointerMove`/`onPointerUp` — never native HTML5
 * Drag-and-Drop (design.md): the palette sits outside the canvas SVG
 * entirely, so Panzoom's own pointer handling never sees these events
 * regardless, and one drag implementation covers both the canvas's own node
 * drags and this one.
 */
export function StepPalette({ onDrop }: Props) {
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

  return (
    <nav className="studio-palette" aria-label={t("palette.heading")}>
      <h2>{t("palette.heading")}</h2>
      <ul className="studio-palette-list">
        {ENTRIES.map(({ kind, label, Icon }) => (
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
          {t(ENTRIES.find((entry) => entry.kind === dragging.kind)!.label)}
        </div>
      )}
    </nav>
  );
}
