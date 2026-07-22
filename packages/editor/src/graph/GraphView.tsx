import { ReactFlow, Background, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useDraft } from "../draft/store";
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
  const { draft, validation } = useDraft();
  const { graph, positions } = useDraftGraphLayout(draft);

  const nodes: Node[] = graph.nodes.map((n) => {
    const pos = positions[n.id];
    const issues = validation.issues.filter((i) => i.entityId === n.id);
    return {
      id: n.id,
      position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      data: {
        label: (
          <div title={issues.map((i) => i.message).join("\n") || undefined}>
            {n.label}
            {n.isInitial && " (initial)"}
            {n.terminal && " (terminal)"}
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
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: (
        <span title={issues.map((i) => i.message).join("\n") || undefined}>
          {e.label}
          {issues.length > 0 && " ⚠"}
        </span>
      ),
      style: issues.length > 0 ? { stroke: "#c00" } : undefined,
      labelStyle: issues.length > 0 ? { fill: "#c00" } : undefined,
      deletable: false,
    };
  });

  return (
    <div className="graph-view" style={{ height: 480, border: "1px solid #ccc" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
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
