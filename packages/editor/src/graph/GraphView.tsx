import { useEffect, useRef } from "react";
import mermaid from "mermaid";
import Panzoom, { type PanzoomObject } from "@panzoom/panzoom";
import { useDraft } from "../draft/store";
import { draftToGraph } from "./mapping";
import { generateMermaidDsl } from "./mermaid";

// `securityLevel: "strict"` (mermaid's default, set explicitly here) runs
// every rendered SVG through DOMPurify.sanitize() internally before
// `mermaid.render()` resolves — confirmed in the installed bundle
// (mermaid.core.mjs, `svgCode = DOMPurify.sanitize(svgCode, ...)`). That's
// what makes the `containerRef.current.innerHTML = svg` assignment below
// safe despite `svg` ultimately being built from author-entered step/path
// labels (`generateMermaidDsl`) — the string it's set from has already been
// sanitized, not raw untrusted markup.
mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });

// mermaid.render() takes an id to use for the rendered SVG's element id;
// unique per call so a rapid succession of renders (e.g. fast typing while
// editing a label) never collides with an in-flight previous render.
let renderCounter = 0;

/**
 * Pure fit-to-container math, kept separate from DOM access so it's
 * directly unit-testable: given the diagram's own natural size (its
 * `viewBox`, set by Mermaid to its content's bounds) and the container's
 * rendered size, returns the scale and centering pan that fits the whole
 * diagram in both dimensions — capped at 1 so a small diagram isn't
 * blown up to fill the container. `null` for any non-positive input (an
 * empty graph, or a not-yet-laid-out container) — callers fall back to
 * the identity transform.
 */
export function computeFitTransform(
  contentWidth: number,
  contentHeight: number,
  containerWidth: number,
  containerHeight: number,
): { scale: number; x: number; y: number } | null {
  if (contentWidth <= 0 || contentHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) return null;
  const scale = Math.min(containerWidth / contentWidth, containerHeight / contentHeight, 1);
  return { scale, x: (containerWidth - contentWidth * scale) / 2, y: (containerHeight - contentHeight * scale) / 2 };
}

/**
 * Read-only in v1 (editor-graph-view spec): Mermaid's rendered SVG carries
 * no drag-to-reposition/drag-to-connect/delete affordance of its own —
 * unlike the prior React Flow implementation, there is no interactivity to
 * explicitly disable.
 */
export function GraphView() {
  const { draft, validation, contentLocale, loadGeneration } = useDraft();
  const graph = draftToGraph(draft, contentLocale, draft.baseLocale ?? "en");
  const dsl = generateMermaidDsl(graph, validation.issues);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const panzoomRef = useRef<PanzoomObject | null>(null);
  const hasFitRef = useRef(false);

  // A load/import (`replace`) may leave the generated DSL unchanged
  // (reloading the same file) — reset the gate here rather than relying on
  // `dsl` to change, since it wouldn't for a reload.
  useEffect(() => {
    hasFitRef.current = false;
  }, [loadGeneration]);

  // Mermaid regenerates a full SVG from `dsl` on every render — there is no
  // incremental DOM diffing the way React Flow's node/edge arrays had, so
  // the current pan/zoom transform has to be captured before the old SVG is
  // discarded and reapplied to the new one (editor-graph-view spec: a
  // structural edit, and now also a non-structural redraw such as a
  // content-locale switch, must preserve the viewport). The one exception
  // is the first render of a given load (`hasFitRef`/`loadGeneration`,
  // mirroring the previous `useDraftGraphLayout` gating), which fits to the
  // viewport instead.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = `graph-diagram-${++renderCounter}`;
      const { svg } = await mermaid.render(id, dsl || "flowchart LR");
      if (cancelled || !containerRef.current) return;

      const prevPan = panzoomRef.current?.getPan();
      const prevScale = panzoomRef.current?.getScale();
      panzoomRef.current?.destroy();

      containerRef.current.innerHTML = svg;
      const svgEl = containerRef.current.querySelector("svg");
      if (!svgEl) return;

      const panzoom = Panzoom(svgEl);
      panzoomRef.current = panzoom;
      svgEl.addEventListener("wheel", panzoom.zoomWithWheel);

      if (!hasFitRef.current) {
        const vb = svgEl.viewBox.baseVal;
        const rect = containerRef.current.getBoundingClientRect();
        const fit = computeFitTransform(vb.width, vb.height, rect.width, rect.height);
        if (fit) {
          panzoom.zoom(fit.scale, { animate: false });
          panzoom.pan(fit.x, fit.y, { animate: false });
        } else {
          panzoom.reset({ animate: false });
        }
        hasFitRef.current = true;
      } else if (prevPan && prevScale !== undefined) {
        panzoom.zoom(prevScale, { animate: false });
        panzoom.pan(prevPan.x, prevPan.y, { animate: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dsl, loadGeneration]);

  return <div className="graph-view" ref={containerRef} style={{ height: 480, border: "1px solid #ccc", overflow: "hidden" }} />;
}
