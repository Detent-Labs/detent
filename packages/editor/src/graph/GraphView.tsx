import { useEffect, useRef } from "react";
import { ReactFlow, Background, MarkerType, Position, type Node, type Edge, type ReactFlowInstance } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useDraft } from "../draft/store";
import { t } from "../i18n/catalog";
import { useDraftGraphLayout } from "./useDraftGraphLayout";
import { NODE_WIDTH, NODE_HEIGHT } from "./layout";

/**
 * Read-only in v1 (editor-graph-view spec): no drag-to-reposition
 * persistence, no drag-to-connect, no in-canvas delete. Interactions that
 * would create/move/delete entities by direct manipulation are disabled
 * outright rather than allowed-then-discarded, and there is no
 * `onNodesChange`/`onEdgesChange`/`onConnect` handler wired to any state —
 * `nodes`/`edges` are re-derived from the Draft on every render, so nothing
 * React Flow does internally can persist past the next render anyway.
 */
export function GraphView() {
  const { draft, validation, contentLocale, loadGeneration } = useDraft();
  const { graph, positions, isLayouted } = useDraftGraphLayout(draft, contentLocale, draft.baseLocale ?? "en");

  const instanceRef = useRef<ReactFlowInstance | null>(null);
  const hasFitRef = useRef(false);

  // A load/import (`replace`) may leave the graph's structural signature
  // unchanged (reloading the same file) — reset the gate here rather than
  // relying on `isLayouted` to flip, since it wouldn't for a reload.
  useEffect(() => {
    hasFitRef.current = false;
  }, [loadGeneration]);

  // Depends on both: `isLayouted` catches the ordinary first-load and
  // structural-change cases; `loadGeneration` catches a reload whose
  // signature is unchanged, where `isLayouted` never toggles.
  useEffect(() => {
    if (isLayouted && !hasFitRef.current) {
      instanceRef.current?.fitView();
      hasFitRef.current = true;
    }
  }, [isLayouted, loadGeneration]);

  const nodes: Node[] = graph.nodes.map((n) => {
    const pos = positions[n.id];
    const issues = validation.issues.filter((i) => i.entityId === n.id);
    return {
      id: n.id,
      position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      // Matches the ELK horizontal layout direction (layout.ts: elk.direction
      // RIGHT) so forward edges leave/enter directly instead of Top/Bottom
      // looping. DefaultNode already reads these two fields off the node
      // object (@xyflow/react NodeBase), so no custom node type is needed.
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        label: (
          <div title={issues.map((i) => i.message).join("\n") || undefined}>
            {n.label}
            {n.isInitial && t("graph.initialSuffix")}
            {n.terminal && t("graph.terminalSuffix")}
            {issues.length > 0 && <span className="graph-issue-badge"> ⚠ {issues.length}</span>}
          </div>
        ),
      },
      style: issues.length > 0 ? { border: "2px solid #c00" } : undefined,
      draggable: false,
      connectable: false,
      deletable: false,
    };
  });

  const edges: Edge[] = graph.edges.map((e) => {
    const issues = validation.issues.filter((i) => i.entityId === e.id);
    const issueColor = issues.length > 0 ? "#c00" : undefined;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      // smoothstep (right-angle segments) instead of the default Bezier
      // curve, which loops under fixed Left/Right handles; markerEnd
      // disambiguates counter-edges between the same two nodes (e.g. an
      // automatic failure path back to a manual retry path). The `color`
      // key must be omitted entirely (not passed as `undefined`) for a
      // non-issue edge: @xyflow/system's createMarkerIds does
      // `{ color: marker.color || defaultColor, ...marker }` — spreading
      // `marker` after already sets `color`, so an explicit `color:
      // undefined` key clobbers the computed fallback back to `undefined`,
      // making the arrowhead render with `stroke: none; fill: none`
      // (@xyflow/react's ArrowClosedSymbol defaults `color` to the string
      // `'none'`, not the theme default).
      type: "smoothstep",
      markerEnd: issueColor ? { type: MarkerType.ArrowClosed, color: issueColor } : { type: MarkerType.ArrowClosed },
      label: (
        <span title={issues.map((i) => i.message).join("\n") || undefined}>
          {e.label}
          {issues.length > 0 && " ⚠"}
        </span>
      ),
      style: issueColor ? { stroke: issueColor } : undefined,
      labelStyle: issueColor ? { fill: issueColor } : undefined,
      deletable: false,
    };
  });

  return (
    <div className="graph-view" style={{ height: 480, border: "1px solid #ccc" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={(instance) => {
          instanceRef.current = instance;
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        deleteKeyCode={null}
        panOnDrag
        zoomOnScroll
      >
        <Background />
      </ReactFlow>
    </div>
  );
}
