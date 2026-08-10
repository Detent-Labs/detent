import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Panzoom, { type PanzoomObject } from "@panzoom/panzoom";
import { useDraft } from "../draft/store";
import { updateInDraftArray } from "../draft/draft-array-crud";
import { newStep } from "../draft/createStep";
import { newPath } from "../draft/createPath";
import { seedLocalizedText, resolveDraftLocalizedText } from "../draft/localized-text";
import { t } from "../catalog.js";
import { autoPlaceSteps, type LayoutStep } from "./layout";
import { dragDelta, svgPointFromClient, NODE_WIDTH, NODE_HEIGHT, type Point, type NodePosition } from "./geometry";
import { computeFit, MIN_SCALE, MAX_SCALE, FIT_GUTTER, type Fit } from "./fit";
import { resolveDropGesture } from "./dropGesture";
import { inlineRenamePatch } from "./inlineRename";
import { buildOperands, guardEdgeLabel } from "../panels/shared/conditionLogic";

const HANDLE_RADIUS = 7;
const CLICK_THRESHOLD = 4;
const REJECT_MESSAGE_MS = 4000;

interface Props {
  layout: Record<string, unknown>;
  onMoveStep: (stepId: string, point: Point) => void;
  selectedStepId: string | undefined;
  /** The second argument carries the clicked path's id (task 3.13),
   * `undefined` for a node click or a deselect — `PathsPanel` uses it to
   * highlight one row rather than only expanding its section. */
  onSelectStep: (stepId: string | undefined, pathId?: string) => void;
  selectedPathId?: string;
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
export function CanvasView({ layout, onMoveStep, selectedStepId, onSelectStep, selectedPathId }: Props) {
  const { draft, mutate, contentLocale, loadedChildren } = useDraft();
  const steps = draft.workflow?.steps ?? [];
  const initialStepId = draft.workflow?.initialStep;
  const baseLocale = draft.baseLocale ?? "en";

  const svgRef = useRef<SVGSVGElement | null>(null);
  const panzoomRef = useRef<PanzoomObject | null>(null);
  // The toolbar overlays the canvas, so `fitToView` measures it rather than
  // framing content underneath it.
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  // Latches after the first successful auto-fit so the view then stays under
  // the author's own pan/zoom. A ref, not a `[]` effect dep: a brand-new
  // draft mounts with zero steps, and `nodePositions` only turns non-empty
  // once the first step lands.
  const hasFitOnLoad = useRef(false);

  // Shared by the initial `Panzoom()` construction below and by `fitToView`
  // itself: both need the same scale/pan for the same content, measured the
  // same way.
  const measureFit = (svg: SVGSVGElement): Fit => {
    // `getBBox()` reports what the canvas actually draws, in user space and
    // free of Panzoom's transform. That covers the start arrow and start
    // stamp beside the initial step, and the terminal stamp above a
    // terminal step — none of which the node rectangles contain.
    const content = svg.getBBox();

    // `clientWidth`/`clientHeight`, never `getBoundingClientRect()`: Panzoom
    // transforms this same element, so a client rect shrinks with the zoom
    // and a second fit would frame a smaller canvas than the first.
    //
    // Two properties of `.canvas-svg` and `.canvas-wrap` make these two the
    // right reading, and a change to either would break this silently:
    //   - `.canvas-wrap` is `overflow: hidden`. A transform can otherwise
    //     grow an ancestor's scrollable overflow, and a classic scrollbar
    //     appearing re-lays out a `width: 100%` child, which would feed the
    //     zoom back into the measurement after all.
    //   - `.canvas-svg` carries no padding. `clientWidth` is the padding box,
    //     while an SVG with no `viewBox` anchors user space to the content
    //     box; padding would offset the origin and overstate the viewport.
    // Both round to whole pixels, so the framing can sit up to a pixel off.
    // The gutter is 16px, so that is not visible.
    const element = { width: svg.clientWidth, height: svg.clientHeight };

    // The toolbar sits over the top left corner. `offsetTop`/`offsetHeight`
    // are layout values against `.canvas-wrap`, the same origin the SVG box
    // starts from, and no transform touches them.
    //
    // Read the bottom edge, not the height: the toolbar starts `--space-2`
    // below the canvas top, and clearing the height alone leaves it
    // overlapping by those 8px. Measuring the container rather than the
    // button also covers a second control, which belongs in this same flex
    // row.
    const toolbar = toolbarRef.current;
    const toolbarBottom = toolbar ? toolbar.offsetTop + toolbar.offsetHeight : 0;

    return computeFit(content, element, { top: toolbarBottom + FIT_GUTTER, right: FIT_GUTTER, bottom: FIT_GUTTER, left: FIT_GUTTER });
  };

  // Layout, not passive: the auto-fit effect below reads `panzoomRef` and
  // must find it already set. React always runs every layout effect before
  // any passive effect on mount, so that ordering holds only because this
  // effect is a layout effect too — a passive one here would still run
  // after the auto-fit effect's own useLayoutEffect and leave it reading a
  // null ref on the one render that matters.
  useLayoutEffect(() => {
    if (!svgRef.current) return;
    const el = svgRef.current;
    const wrap = el.parentElement;
    // Panzoom's own down-handler binds to `.canvas-wrap` (`canvas: true`),
    // not to `el`: a non-identity transform moves `el`'s own hit-testable
    // box away from the visible canvas, while `.canvas-wrap` never
    // transforms and always covers it (design.md - Decisions). Native
    // addEventListener there runs and calls stopPropagation() *before*
    // React's synthetic event system — bound higher up the tree — ever sees
    // the event, so a React-level e.stopPropagation() inside a node/handle
    // handler is too late to stop it. `panzoom-exclude` (its own default
    // exclude class) is the sanctioned way to opt an element out of
    // Panzoom's own handling instead — every node and edge group carries
    // it, and so does `.canvas-toolbar` now that `.canvas-wrap` is its
    // ancestor too. A future control added over the canvas needs the same
    // class, plus the wheel guard's own exclusion below.
    //
    // Panzoom's own constructor applies `startScale` synchronously but
    // defers `pan(startX, startY)` to a `setTimeout` (its own source: it
    // waits a tick so `zoom` has settled before it reads dimensions to
    // constrain the initial pan). Left at the (0, 0) default, that deferred
    // call would land after the auto-fit effect below has already panned
    // the just-mounted graph into view, and silently reset it back to the
    // top-left corner one tick later. Feeding the same fit in as the start
    // position closes the race instead of trying to out-time it: the
    // deferred call still fires, but lands on the values already showing.
    const initialFit = measureFit(el);
    const panzoom = Panzoom(el, {
      minScale: MIN_SCALE,
      maxScale: MAX_SCALE,
      canvas: true,
      startScale: initialFit.scale,
      startX: initialFit.x,
      startY: initialFit.y,
    });
    panzoomRef.current = panzoom;
    // The manual `wheel` listener binds to the same `.canvas-wrap` element,
    // for the same reason. `zoomWithWheel` carries no `panzoom-exclude`
    // check of its own, so the toolbar needs an explicit guard here — by
    // class name, not a general `.closest(".panzoom-exclude")` walk, since
    // every node and edge already carries that class and already receives
    // wheel-zoom today (design.md - Decisions).
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element).closest(".canvas-toolbar")) return;
      panzoom.zoomWithWheel(e);
    };
    wrap?.addEventListener("wheel", onWheel);
    return () => {
      wrap?.removeEventListener("wheel", onWheel);
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
  // The step node whose label is being renamed inline (task 3.8), and the
  // text field's live value. Neither writes the draft until commit.
  const [renaming, setRenaming] = useState<{ stepId: string; value: string } | null>(null);

  const toSvgPoint = (e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    return svgPointFromClient(svg, e.clientX, e.clientY);
  };

  const fitToView = () => {
    const panzoom = panzoomRef.current;
    const svg = svgRef.current;
    if (!panzoom || !svg || nodePositions.length === 0) return;
    const fit = measureFit(svg);
    panzoom.zoom(fit.scale, { animate: false });
    panzoom.pan(fit.x, fit.y, { animate: false });
  };

  // Centers the graph on open, so an author never has to click "Fit to
  // view" just to see what they opened. Layout, not passive, effect:
  // `fitToView` reads `clientWidth`/`getBBox()` off the just-committed DOM,
  // and running before paint means the very first frame is already framed,
  // instead of flashing the raw top-left layout first.
  useLayoutEffect(() => {
    if (hasFitOnLoad.current || nodePositions.length === 0) return;
    hasFitOnLoad.current = true;
    fitToView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodePositions]);

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

  const startRename = (stepId: string, currentLabel: string) => {
    setRenaming({ stepId, value: currentLabel });
  };

  const commitRename = () => {
    if (!renaming) return;
    const index = steps.findIndex((s) => s.id === renaming.stepId);
    const step = steps[index];
    if (step) {
      const patch = inlineRenamePatch(step.label, contentLocale, renaming.value);
      if (patch) updateInDraftArray(mutate, (d) => d.workflow?.steps?.[index], { label: patch });
    }
    setRenaming(null);
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

  const showRejection = (e: { clientX: number; clientY: number }, text: string) => {
    // Screen-relative, not the SVG's (panned/zoomed) user-space `point` — the
    // message is an absolutely-positioned HTML sibling of the SVG.
    const rect = svgRef.current?.getBoundingClientRect();
    setRejectMessage({ text, x: rect ? e.clientX - rect.left : 0, y: rect ? e.clientY - rect.top : 0 });
    setTimeout(() => setRejectMessage(null), REJECT_MESSAGE_MS);
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!connectDrag) return;
    const point = toSvgPoint(e);
    const sourceIndex = steps.findIndex((s) => s.id === connectDrag.sourceStepId);
    const sourceStep = steps[sourceIndex];

    if (sourceStep?.id) {
      const existingPaths = sourceStep.paths ?? [];
      const candidateTrigger = existingPaths[0]?.trigger ?? "manual";
      const result = resolveDropGesture(point, nodePositions, existingPaths, candidateTrigger, sourceStep.terminal === true);

      if (result.kind === "rejected") {
        showRejection(e, result.reason);
      } else if (result.kind === "connect-to-step") {
        const path = newPath(result.targetStepId, result.trigger);
        updateInDraftArray(mutate, (d) => d.workflow?.steps?.[sourceIndex], { paths: [...existingPaths, path] });
      } else {
        // create-step-and-connect: the step first, then the path (design.md)
        // — a candidate already accepted by resolveDropGesture above never
        // leaves an orphan step behind, but ordering it this way keeps that
        // true even if a future change moves the check.
        const step = newStep("task", seedLocalizedText(contentLocale));
        const path = newPath(step.id, result.trigger);
        mutate((d) => {
          d.workflow ??= {};
          d.workflow.steps ??= [];
          d.workflow.steps.push(step);
          const source = d.workflow.steps[sourceIndex];
          if (source) {
            source.paths ??= [];
            source.paths.push(path);
          }
        });
        if (step.id) onMoveStep(step.id, result.point);
      }
    }
    setConnectDrag(null);
  };

  const onBackgroundPointerUp = (e: React.PointerEvent) => {
    if (e.target === svgRef.current) onSelectStep(undefined);
  };

  const stepLabel = (s: (typeof steps)[number]) =>
    s.key || resolveDraftLocalizedText(s.label, contentLocale, baseLocale) || t("steps.unnamedStep");

  // Guard labels render in their own pass, after every node (below), instead
  // of inline in the edge that computes them: `.canvas-node-rect` is opaque,
  // and nodes draw after edges, so a label inline in the edge group could
  // sit partly behind a nearby node's fill and read as a clipped fragment.
  // Collected here during the edge pass, rendered after the node pass.
  const guardLabels: Array<{ key: string; x: number; y: number; maxWidth: number; text: string; stepId: string; pathId: string | undefined }> =
    [];

  return (
    <div className="canvas-wrap">
      <div className="canvas-toolbar panzoom-exclude" ref={toolbarRef}>
        <button type="button" className="btn btn-secondary" onClick={fitToView}>
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
          const operands = buildOperands({
            fields: draft.fields,
            locale: contentLocale,
            baseLocale,
            child: loadedChildren[step.id],
          });
          return (step.paths ?? []).map((path, pathIndex) => {
            if (!path.to) return null;
            const target = positionOf(path.to);
            const targetAnchor = { x: target.x, y: target.y + NODE_HEIGHT / 2 };
            const midX = (sourceAnchor.x + targetAnchor.x) / 2;
            const midY = (sourceAnchor.y + targetAnchor.y) / 2;
            const automaticGuarded = path.trigger === "automatic" && path.guard !== undefined;
            const automaticDefault = path.trigger === "automatic" && path.guard === undefined;
            const isSelected = path.id !== undefined && path.id === selectedPathId;
            const guardSrc = path.guard?.src;
            const guardLabel = automaticGuarded && guardSrc ? guardEdgeLabel(guardSrc, operands) : undefined;
            if (guardLabel) {
              // Cap the label to the free space between the two node
              // anchors it sits between, so it never needs to spill onto a
              // neighboring node in the first place; the post-node paint
              // order (below) is the fallback for when that gap is too
              // narrow for even the ellipsis to clear it.
              const gap = Math.abs(targetAnchor.x - sourceAnchor.x);
              const maxWidth = Math.min(220, Math.max(60, gap - 24));
              guardLabels.push({
                key: path.id ?? `${step.id}-${pathIndex}-guard`,
                x: midX,
                y: midY + 4,
                maxWidth,
                text: guardLabel,
                stepId: step.id as string,
                pathId: path.id,
              });
            }
            return (
              <g
                key={path.id ?? `${step.id}-${pathIndex}`}
                className={`canvas-edge-group panzoom-exclude${isSelected ? " canvas-edge-group-selected" : ""}`}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  onSelectStep(step.id, path.id);
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
          const isRenaming = renaming?.stepId === step.id;

          return (
            <g
              key={step.id}
              transform={`translate(${x}, ${y})`}
              className="canvas-node panzoom-exclude"
              onPointerDown={(e) => onNodePointerDown(e, step.id as string)}
              onPointerUp={(e) => onNodePointerUp(e, step.id as string)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startRename(step.id as string, stepLabel(step));
              }}
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
              {isRenaming ? (
                <foreignObject x={6} y={14} width={NODE_WIDTH - 12} height={22} className="panzoom-exclude">
                  <input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    aria-label={t("stepSections.renameLabel")}
                    className="canvas-rename-input"
                    value={renaming.value}
                    onChange={(e) => setRenaming({ stepId: step.id as string, value: e.target.value })}
                    onBlur={commitRename}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      else if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                </foreignObject>
              ) : (
                <text x={10} y={24} className="canvas-node-label">
                  {stepLabel(step)}
                </text>
              )}
              <text x={10} y={44} className="canvas-node-key">
                {step.key ?? ""}
              </text>
              {isTerminal && (
                <g transform={`translate(${NODE_WIDTH - 22}, -12) rotate(-8)`} className="canvas-terminal-stamp">
                  <circle r={16} />
                  <text y={4}>{(step.outcome ?? "").slice(0, 4) || "•"}</text>
                </g>
              )}
              {isInitial && (
                <g transform="translate(22, -12)" className="canvas-initial-stamp">
                  <circle r={16} />
                  <text y={4}>{t("canvas.initialStamp")}</text>
                </g>
              )}
              <circle
                cx={NODE_WIDTH}
                cy={NODE_HEIGHT / 2}
                r={HANDLE_RADIUS}
                className={isTerminal ? "canvas-connect-handle canvas-connect-handle-terminal" : "canvas-connect-handle"}
                onPointerDown={(e) => onHandlePointerDown(e, step.id as string)}
                onPointerUp={onHandlePointerUp}
              />
            </g>
          );
        })}

        {guardLabels.map((label) => (
          <foreignObject
            key={label.key}
            x={label.x - label.maxWidth / 2}
            y={label.y}
            width={label.maxWidth}
            height={16}
            className="panzoom-exclude"
          >
            <div
              className="canvas-edge-guard-label"
              title={label.text}
              onPointerUp={(e) => {
                e.stopPropagation();
                onSelectStep(label.stepId, label.pathId);
              }}
            >
              {label.text}
            </div>
          </foreignObject>
        ))}
      </svg>
      {rejectMessage && (
        <div className="canvas-reject-message" style={{ left: rejectMessage.x, top: rejectMessage.y }}>
          {rejectMessage.text}
        </div>
      )}
    </div>
  );
}
