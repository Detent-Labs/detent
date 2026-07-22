import type { Draft } from "../draft/types";
import { resolveDraftLocalizedText } from "../draft/localized-text";

export interface GraphNode {
  id: string;
  label: string;
  stepKey: string;
  terminal: boolean;
  isInitial: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface DraftGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Steps become nodes, paths become directed edges (editor-graph-view spec).
 * Skips a step with no `id` yet (freshly minted entities always have one —
 * task 2.4 — so this only guards a still-loading/malformed Draft) and a
 * path whose `to` doesn't resolve to a node in this same pass, since an
 * unresolved target is a validation issue (`EditorIssue`), not something
 * the graph silently draws as an edge to nowhere.
 *
 * `contentLocale`/`baseLocale` resolve a step's `LocalizedText` label for
 * display (editor-graph-view spec) — this is a plain function with no
 * React context, so the caller (GraphView) supplies both explicitly rather
 * than this reading them off a hook itself.
 */
export function draftToGraph(draft: Draft, contentLocale: string, baseLocale: string): DraftGraph {
  const steps = draft.workflow?.steps ?? [];
  const nodeIds = new Set<string>();
  for (const s of steps) if (s.id) nodeIds.add(s.id);

  const nodes: GraphNode[] = [];
  for (const s of steps) {
    if (!s.id) continue;
    nodes.push({
      id: s.id,
      label: s.key || resolveDraftLocalizedText(s.label, contentLocale, baseLocale) || "(unnamed step)",
      stepKey: s.key ?? "",
      terminal: s.terminal === true,
      isInitial: draft.workflow?.initialStep === s.id,
    });
  }

  const edges: GraphEdge[] = [];
  for (const step of steps) {
    if (!step.id) continue;
    for (const path of step.paths ?? []) {
      if (!path.id || !path.to || !nodeIds.has(path.to)) continue;
      edges.push({ id: path.id, source: step.id, target: path.to, label: path.key ?? "" });
    }
  }

  return { nodes, edges };
}
