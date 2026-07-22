import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { DraftGraph } from "./mapping";

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 56;

export interface LayoutedNode {
  id: string;
  x: number;
  y: number;
}

const elk = new ELK();

/** Layered auto-layout (elkjs) — node positions are computed, never authored (design.md decision 5). */
export async function layoutGraph(graph: DraftGraph): Promise<LayoutedNode[]> {
  if (graph.nodes.length === 0) return [];

  const elkGraph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    },
    children: graph.nodes.map((n) => ({ id: n.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: graph.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const result = await elk.layout(elkGraph);
  return (result.children ?? []).map((c) => ({ id: c.id, x: c.x ?? 0, y: c.y ?? 0 }));
}
