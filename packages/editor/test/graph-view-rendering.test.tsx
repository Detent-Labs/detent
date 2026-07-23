import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

/** `layout.ts` constructs a real `elkjs` `ELK()` at module scope, which in
 * turn constructs a `Worker` for its bundled fallback — `bun test`'s runtime
 * doesn't provide one, so importing `layout.ts` (transitively, via
 * `GraphView.tsx` -> `useDraftGraphLayout.ts` -> `layout.ts`) throws at
 * import time. No existing test imported `GraphView.tsx` before this one,
 * so this never surfaced. Mocked here rather than worked around in
 * `layout.ts` itself — this test only needs static markup, never a real
 * layout pass, and reaching into ELK's worker setup is out of scope for an
 * edge-routing/arrowhead change. */
mock.module("../src/graph/layout", () => ({
  NODE_WIDTH: 180,
  NODE_HEIGHT: 56,
  layoutGraph: async () => [],
}));

const { DraftProvider } = await import("../src/draft/store");
const { LocaleProvider } = await import("../src/i18n/store");
const { GraphView } = await import("../src/graph/GraphView");
const { mintId } = await import("../src/draft/ids");
import type { Draft } from "../src/draft/types";

/** Matches the `content-locale-rendering.test.tsx` / `i18n-rendering.test.tsx`
 * convention: `react-dom/server`'s `renderToStaticMarkup`, no jsdom/testing-
 * library. Turns out edges themselves don't render at all under this
 * technique: React Flow only paints an edge path once each endpoint node's
 * handle bounds are measured, which happens via a `ResizeObserver`-driven
 * effect that never fires under SSR (confirmed empirically — the rendered
 * markup has both nodes and the marker `<defs>`, but no edge `<path>`). So
 * this can't assert on `markerEnd` after all; it instead asserts on what
 * *does* render synchronously — each node's `data-handlepos` — covering the
 * handle-position fix (editor-graph-edge-routing design.md) instead. The
 * marker/edge-rendering and fitView timing stay manually verified (see
 * design.md's Manual Verification section); this was confirmed working live
 * against the dev server before deciding it can't be a static test. */

describe("GraphView", () => {
  it("renders each node's handles on the left/right (not top/bottom)", () => {
    const stepA = mintId("step");
    const stepB = mintId("step");
    const pathId = mintId("path");
    const draft: Draft = {
      workflow: {
        initialStep: stepA,
        steps: [
          { id: stepA, key: "start", label: { en: "Start" }, type: "task", paths: [{ id: pathId, key: "go", to: stepB, trigger: "manual" }] },
          { id: stepB, key: "end", label: { en: "End" }, type: "task", terminal: true },
        ],
      },
    };

    const html = renderToStaticMarkup(
      <LocaleProvider>
        <DraftProvider initial={draft}>
          <GraphView />
        </DraftProvider>
      </LocaleProvider>,
    );

    expect(html).toContain('data-handlepos="left"');
    expect(html).toContain('data-handlepos="right"');
    expect(html).not.toContain('data-handlepos="top"');
    expect(html).not.toContain('data-handlepos="bottom"');
  });
});
