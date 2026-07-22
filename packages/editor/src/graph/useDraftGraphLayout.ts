import { useEffect, useState } from "react";
import type { Draft } from "../draft/types";
import { draftToGraph, type DraftGraph } from "./mapping";
import { layoutGraph, type LayoutedNode } from "./layout";

/**
 * Node content (labels, terminal/initial flags) is re-derived from the
 * Draft on every render, so it's always current. The async elkjs layout
 * pass itself only re-runs when the *structure* (which node/edge ids
 * exist, and which nodes an edge connects) changes — keyed by a signature,
 * not the whole Draft — so unrelated edits (renaming a field, tweaking an
 * action's config) don't jitter every node's position on each keystroke.
 * Both spec scenarios ("new step appears", "new path appears as an edge")
 * are themselves structural changes, so they still trigger a fresh layout.
 */
export function useDraftGraphLayout(draft: Draft): { graph: DraftGraph; positions: Record<string, LayoutedNode> } {
  const graph = draftToGraph(draft);
  const [positions, setPositions] = useState<Record<string, LayoutedNode>>({});

  const signature = JSON.stringify({
    nodes: graph.nodes.map((n) => n.id),
    edges: graph.edges.map((e) => [e.id, e.source, e.target]),
  });

  useEffect(() => {
    let cancelled = false;
    layoutGraph(graph).then((laid) => {
      if (cancelled) return;
      const next: Record<string, LayoutedNode> = {};
      laid.forEach((n) => {
        next[n.id] = n;
      });
      setPositions(next);
    });
    return () => {
      cancelled = true;
    };
    // Re-run only when the structural signature changes, not on every `graph`
    // identity (a fresh object every render) or unrelated Draft field.
  }, [signature]);

  return { graph, positions };
}
