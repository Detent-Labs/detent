import type { EditorIssue } from "../draft/issues";
import type { DraftGraph } from "./mapping";
import { t } from "../i18n/catalog";

/**
 * Mermaid flowchart node ids are unambiguous with word characters and
 * underscores; our ids are UUIDv4-suffixed (`step_xxxxxxxx-xxxx-...`), so
 * hyphens are swapped for underscores. The mapping is 1:1 and reversible
 * (ids never contain underscores of their own — see CLAUDE.md "Identity"),
 * so no collision risk, but it does mean any code reading the generated
 * SVG's element ids back out must undo the same substitution.
 */
export function mermaidNodeId(id: string): string {
  return id.replace(/-/g, "_");
}

/** Mermaid quoted node/edge text treats everything literally except the
 * quote character itself, which would otherwise close the label early. */
function escapeLabel(text: string): string {
  return text.replace(/"/g, "&quot;");
}

/**
 * Generates a `flowchart LR` Mermaid DSL string from a `DraftGraph`
 * (`mapping.ts::draftToGraph`, unchanged), coloring issue-flagged
 * nodes/edges via `style`/`linkStyle` the same way `GraphView.tsx` used to
 * flag them via React Flow node/edge `style` props (editor-graph-view spec:
 * "Graph view reflects validation issues"). Node/edge labels already carry
 * locale-resolved text and the initial/terminal suffixes (`draftToGraph`
 * still resolves those); this only adds the visible issue badge, matching
 * the prior `⚠ N` / `⚠` markers.
 *
 * `linkStyle` addresses edges positionally (not by id), so issue-flagged
 * edges are tracked by their emission index during the single pass over
 * `graph.edges`.
 */
export function generateMermaidDsl(graph: DraftGraph, issues: EditorIssue[]): string {
  const issuesByEntity = new Map<string, EditorIssue[]>();
  for (const issue of issues) {
    const list = issuesByEntity.get(issue.entityId);
    if (list) list.push(issue);
    else issuesByEntity.set(issue.entityId, [issue]);
  }

  const lines = ["flowchart LR"];
  const styleLines: string[] = [];
  const linkStyleLines: string[] = [];

  for (const n of graph.nodes) {
    const nodeIssues = issuesByEntity.get(n.id) ?? [];
    const suffix = (n.isInitial ? t("graph.initialSuffix") : "") + (n.terminal ? t("graph.terminalSuffix") : "");
    const badge = nodeIssues.length > 0 ? ` ⚠ ${nodeIssues.length}` : "";
    lines.push(`  ${mermaidNodeId(n.id)}["${escapeLabel(n.label + suffix + badge)}"]`);
    if (nodeIssues.length > 0) styleLines.push(`  style ${mermaidNodeId(n.id)} stroke:#c00,stroke-width:2px`);
  }

  graph.edges.forEach((e, index) => {
    const edgeIssues = issuesByEntity.get(e.id) ?? [];
    const badge = edgeIssues.length > 0 ? " ⚠" : "";
    const labelText = e.label || edgeIssues.length > 0 ? `|"${escapeLabel(e.label + badge)}"|` : "";
    lines.push(`  ${mermaidNodeId(e.source)} -->${labelText} ${mermaidNodeId(e.target)}`);
    if (edgeIssues.length > 0) linkStyleLines.push(`  linkStyle ${index} stroke:#c00`);
  });

  return [...lines, ...styleLines, ...linkStyleLines].join("\n");
}
