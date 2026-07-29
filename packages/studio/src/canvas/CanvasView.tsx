import { useEffect, useMemo, useRef, useState } from "react";
import Panzoom, { type PanzoomObject } from "@panzoom/panzoom";
import type { PathTrigger } from "workflow-engine/schema";
import { useDraft } from "../draft/store";
import { updateInDraftArray } from "../draft/draft-array-crud";
import { mintId } from "../draft/ids";
import { resolveDraftLocalizedText } from "../draft/localized-text";
import { t } from "../i18n/catalog";
import { autoPlaceSteps, type LayoutStep } from "./layout";
import { hitTestNode, dragDelta, NODE_WIDTH, NODE_HEIGHT, type Point, type NodePosition } from "./geometry";
import { checkConnection } from "./connection";

const HANDLE_RADIUS = 7;
const CLICK_THRESHOLD = 4;
const REJECT_MESSAGE_MS = 4000;

interface Props {
  layout: Record<string, unknown>;
  onMoveStep: (stepId: string, point: Point) => void;
  selectedStepId: string | undefined;
  onSelectStep: (stepId: string | undefined) => void;
}

function isPoint(value: unknown): value is Point {
  return !!value && typeof (value as Point).x === "number" && typeof (value as Point).y === "number";
}

/**
 * Interactive, hand-rolled SVG canvas (design.md: not Mermaid, not a graph
 * library). Node position writes to `saveState.layout` via `onMoveStep`
 * (not the Draft model); path creation writes through `useDraft()`/
 * `mutate()`, the same surface `PathsPanel`'s "add path" action uses.
 */
export function CanvasView({ layout, onMoveStep, selectedStepId, onSelectStep }: Props) {
  const { draft, mutate, contentLocale } = useDraft();
  const steps = draft.workflow?.steps ?? [];
  const initialStepId = draft.workflow?.initialStep;
  const baseLocale = draft.baseLocale ?? "en";

  const svgRef = useRef<SVGSVGElement | null>(null);
  const panzoomRef = useRef<PanzoomObject | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const el = svgRef.current;
    // Panzoom binds its own down-handler directly on `el` (native
    // addEventListener), which runs and calls stopPropagation() *before*
    // React's synthetic event system — bound higher up the tree — ever sees
    // the event, so a React-level e.stopPropagation() inside a node/handle
    // handler is too late to stop it. `panzoom-exclude` (its own default
    // exclude class) is the sanctioned way to opt an element out of
    // Panzoom's own handling instead — every node and edge group carries it.
    const panzoom = Panzoom(el, { minScale: 0.25, maxScale: 2 });
    panzoomRef.current = panzoom;
    el.addEventListener("wheel", panzoom.zoomWithWheel);
    return () => {
      el.removeEventListener("wheel", panzoom.zoomWithWheel);
      panzoom.destroy();
      panzoomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Neither computation reads pointer/drag state, so without memoization
  // both re-run on every pointer-move event during a drag for nothing.
  // Keyed on their actual inputs only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const autoPlaced = useMemo(() => autoPlaceSteps(steps as LayoutStep[], initialStepId, layout), [steps, initialStepId, layout]);
  const positionOf = (stepId: string): Point => {
    const recorded = layout[stepId];
    if (isPoint(recorded)) return recorded;
    return autoPlaced[stepId] ?? { x: 0, y: 0 };
  };

  const nodePositions: NodePosition[] = useMemo(
    () => steps.filter((s) => s.id).map((s) => ({ id: s.id as string, ...positionOf(s.id as string) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, initialStepId, layout],
  );

  const [nodeDrag, setNodeDrag] = useState<{ stepId: string; startPointer: Point; startPos: Point; current: Point } | null>(null);
  const [connectDrag, setConnectDrag] = useState<{ sourceStepId: string; current: Point } | null>(null);
  const [rejectMessage, setRejectMessage] = useState<{ text: string; x: number; y: number } | null>(null);

  const toSvgPoint = (e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const transformed = pt.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  };

  const fitToView = () => {
    const panzoom = panzoomRef.current;
    const svg = svgRef.current;
    if (!panzoom || !svg || nodePositions.length === 0) return;
    const minX = Math.min(...nodePositions.map((n) => n.x));
    const minY = Math.min(...nodePositions.map((n) => n.y));
    const maxX = Math.max(...nodePositions.map((n) => n.x + NODE_WIDTH));
    const maxY = Math.max(...nodePositions.map((n) => n.y + NODE_HEIGHT));
    const rect = svg.getBoundingClientRect();
    const contentWidth = maxX - minX || 1;
    const contentHeight = maxY - minY || 1;
    const scale = Math.min(rect.width / contentWidth, rect.height / contentHeight, 1);
    panzoom.zoom(scale, { animate: false });
    panzoom.pan((rect.width - contentWidth * scale) / 2 - minX * scale, (rect.height - contentHeight * scale) / 2 - minY * scale, {
      animate: false,
    });
  };

  // Pointer capture keeps a fast drag tracking even if the pointer leaves
  // the element; failure to acquire it (e.g. an already-released pointer)
  // shouldn't abort the drag/connect gesture itself.
  const capturePointer = (e: React.PointerEvent) => {
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // best-effort
    }
  };

  const onNodePointerDown = (e: React.PointerEvent, stepId: string) => {
    e.stopPropagation();
    capturePointer(e);
    const p = toSvgPoint(e);
    setNodeDrag({ stepId, startPointer: p, startPos: positionOf(stepId), current: p });
  };

  const onNodePointerMove = (e: React.PointerEvent) => {
    if (!nodeDrag) return;
    setNodeDrag({ ...nodeDrag, current: toSvgPoint(e) });
  };

  const onNodePointerUp = (e: React.PointerEvent, stepId: string) => {
    e.stopPropagation();
    if (!nodeDrag) return;
    const delta = dragDelta(nodeDrag.startPointer, nodeDrag.current);
    if (Math.abs(delta.x) > CLICK_THRESHOLD || Math.abs(delta.y) > CLICK_THRESHOLD) {
      onMoveStep(nodeDrag.stepId, { x: nodeDrag.startPos.x + delta.x, y: nodeDrag.startPos.y + delta.y });
    } else {
      onSelectStep(stepId);
    }
    setNodeDrag(null);
  };

  const onHandlePointerDown = (e: React.PointerEvent, stepId: string) => {
    e.stopPropagation();
    capturePointer(e);
    setRejectMessage(null);
    setConnectDrag({ sourceStepId: stepId, current: toSvgPoint(e) });
  };

  const onHandlePointerMove = (e: React.PointerEvent) => {
    if (!connectDrag) return;
    setConnectDrag({ ...connectDrag, current: toSvgPoint(e) });
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!connectDrag) return;
    const point = toSvgPoint(e);
    const targetId = hitTestNode(point, nodePositions);
    const targetStep = targetId ? steps.find((s) => s.id === targetId) : undefined;
    const sourceIndex = steps.findIndex((s) => s.id === connectDrag.sourceStepId);
    const sourceStep = steps[sourceIndex];

    if (targetStep?.id && sourceStep) {
      const existingPaths = sourceStep.paths ?? [];
      const candidateTrigger: PathTrigger = existingPaths[0]?.trigger ?? "manual";
      const check = checkConnection(existingPaths, candidateTrigger);
      if (check.ok) {
        const newPath = { id: mintId("path"), key: "", to: targetStep.id, trigger: candidateTrigger };
        updateInDraftArray(mutate, (d) => d.workflow?.steps?.[sourceIndex], { paths: [...existingPaths, newPath] });
      } else {
        // Screen-relative, not the SVG's (panned/zoomed) user-space `point` —
        // the message is an absolutely-positioned HTML sibling of the SVG.
        const rect = svgRef.current?.getBoundingClientRect();
        setRejectMessage({
          text: check.reason ?? "invalid connection",
          x: rect ? e.clientX - rect.left : 0,
          y: rect ? e.clientY - rect.top : 0,
        });
        setTimeout(() => setRejectMessage(null), REJECT_MESSAGE_MS);
      }
    }
    setConnectDrag(null);
  };

  const onBackgroundPointerUp = (e: React.PointerEvent) => {
    if (e.target === svgRef.current) onSelectStep(undefined);
  };

  const stepLabel = (s: (typeof steps)[number]) =>
    s.key || resolveDraftLocalizedText(s.label, contentLocale, baseLocale) || t("steps.unnamedStep");

  return (
    <div className="canvas-wrap">
      <div className="canvas-toolbar">
        <button type="button" onClick={fitToView}>
          {t("canvas.fitToView")}
        </button>
      </div>
      <svg
        ref={svgRef}
        className="canvas-svg"
        onPointerMove={(e) => {
          onNodePointerMove(e);
          onHandlePointerMove(e);
        }}
        onPointerUp={(e) => {
          onBackgroundPointerUp(e);
        }}
      >
        <defs>
          <marker id="canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="canvas-arrowhead" />
          </marker>
        </defs>

        {steps.map((step) => {
          if (!step.id) return null;
          const source = positionOf(step.id);
          const sourceAnchor = { x: source.x + NODE_WIDTH, y: source.y + NODE_HEIGHT / 2 };
          return (step.paths ?? []).map((path, pathIndex) => {
            if (!path.to) return null;
            const target = positionOf(path.to);
            const targetAnchor = { x: target.x, y: target.y + NODE_HEIGHT / 2 };
            const midX = (sourceAnchor.x + targetAnchor.x) / 2;
            const midY = (sourceAnchor.y + targetAnchor.y) / 2;
            const automaticGuarded = path.trigger === "automatic" && path.guard !== undefined;
            const automaticDefault = path.trigger === "automatic" && path.guard === undefined;
            return (
              <g
                key={path.id ?? `${step.id}-${pathIndex}`}
                className="canvas-edge-group panzoom-exclude"
                onPointerUp={(e) => {
                  e.stopPropagation();
                  onSelectStep(step.id);
                }}
              >
                <line
                  x1={sourceAnchor.x}
                  y1={sourceAnchor.y}
                  x2={targetAnchor.x}
                  y2={targetAnchor.y}
                  className={path.trigger === "manual" ? "canvas-edge canvas-edge-manual" : "canvas-edge canvas-edge-automatic"}
                  markerEnd="url(#canvas-arrow)"
                />
                <line x1={sourceAnchor.x} y1={sourceAnchor.y} x2={targetAnchor.x} y2={targetAnchor.y} className="canvas-edge-hitarea" />
                {automaticGuarded && (
                  <text x={midX} y={midY - 6} className="canvas-edge-badge">
                    {path.priority ?? "?"}
                  </text>
                )}
                {automaticDefault && (
                  <text x={midX} y={midY - 6} className="canvas-edge-badge">
                    {t("canvas.elseMarker")}
                  </text>
                )}
              </g>
            );
          });
        })}

        {connectDrag &&
          (() => {
            const source = positionOf(connectDrag.sourceStepId);
            const start = { x: source.x + NODE_WIDTH, y: source.y + NODE_HEIGHT / 2 };
            return (
              <line
                x1={start.x}
                y1={start.y}
                x2={connectDrag.current.x}
                y2={connectDrag.current.y}
                className="canvas-edge canvas-edge-dragging"
              />
            );
          })()}

        {steps.map((step) => {
          if (!step.id) return null;
          const pos = positionOf(step.id);
          const dragged = nodeDrag?.stepId === step.id;
          const x = dragged ? nodeDrag!.startPos.x + dragDelta(nodeDrag!.startPointer, nodeDrag!.current).x : pos.x;
          const y = dragged ? nodeDrag!.startPos.y + dragDelta(nodeDrag!.startPointer, nodeDrag!.current).y : pos.y;
          const isSelected = selectedStepId === step.id;
          const isInitial = initialStepId === step.id;
          const isTerminal = step.terminal === true;

          return (
            <g
              key={step.id}
              transform={`translate(${x}, ${y})`}
              className="canvas-node panzoom-exclude"
              onPointerDown={(e) => onNodePointerDown(e, step.id as string)}
              onPointerUp={(e) => onNodePointerUp(e, step.id as string)}
            >
              {isInitial && (
                <line x1={-24} y1={NODE_HEIGHT / 2} x2={0} y2={NODE_HEIGHT / 2} className="canvas-initial-arrow" markerEnd="url(#canvas-arrow)" />
              )}
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={2}
                className={isSelected ? "canvas-node-rect canvas-node-selected" : "canvas-node-rect"}
              />
              <text x={10} y={24} className="canvas-node-label">
                {stepLabel(step)}
              </text>
              <text x={10} y={44} className="canvas-node-key">
                {step.key ?? ""}
              </text>
              {isTerminal && (
                <g transform={`translate(${NODE_WIDTH - 22}, -12) rotate(-8)`} className="canvas-terminal-stamp">
                  <circle r={16} />
                  <text y={4}>{(step.outcome ?? "").slice(0, 4) || "•"}</text>
                </g>
              )}
              <circle
                cx={NODE_WIDTH}
                cy={NODE_HEIGHT / 2}
                r={HANDLE_RADIUS}
                className="canvas-connect-handle"
                onPointerDown={(e) => onHandlePointerDown(e, step.id as string)}
                onPointerUp={onHandlePointerUp}
              />
            </g>
          );
        })}
      </svg>
      {rejectMessage && (
        <div className="canvas-reject-message" style={{ left: rejectMessage.x, top: rejectMessage.y }}>
          {rejectMessage.text}
        </div>
      )}
    </div>
  );
}
