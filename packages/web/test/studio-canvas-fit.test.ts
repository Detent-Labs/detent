import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { computeFit, MIN_SCALE, FIT_GUTTER, type Box, type Insets, type Fit } from "../src/areas/studio/canvas/fit.js";

/**
 * Where the content box lands on screen, in the element's own pixel space.
 *
 * This mirrors what the browser does with Panzoom's transform, and it is the
 * reason the assertions below read as geometry rather than as a second copy
 * of the formula: `transform: scale(s) translate(x, y)` with
 * `transform-origin: 50% 50%` maps a user-space point `p` to
 * `C + s * (p + t - C)`, where `C` is the element centre.
 */
function project(fit: Fit, content: Box, element: { width: number; height: number }) {
  const cx = element.width / 2;
  const cy = element.height / 2;
  const left = cx + fit.scale * (content.x + fit.x - cx);
  const top = cy + fit.scale * (content.y + fit.y - cy);
  return { left, top, right: left + content.width * fit.scale, bottom: top + content.height * fit.scale };
}

/** The area the fit must land inside, after the insets come off. */
function target(element: { width: number; height: number }, insets: Insets) {
  return {
    left: insets.left,
    top: insets.top,
    right: element.width - insets.right,
    bottom: element.height - insets.bottom,
  };
}

// A toolbar 38px tall at 8px from the top edge, plus the gutter.
const TOOLBAR_CLEARANCE = 38 + 8 + FIT_GUTTER;
const INSETS: Insets = { top: TOOLBAR_CLEARANCE, right: FIT_GUTTER, bottom: FIT_GUTTER, left: FIT_GUTTER };

// The graph from issue #3: request -> decision -> approved/rejected, as
// `autoPlaceSteps` positions it (three columns of 240, two rows of 110, nodes
// 180x64).
const GRAPH: Box = { x: 0, y: 0, width: 660, height: 174 };

describe("canvas fit: a canvas wider than the graph", () => {
  const element = { width: 1200, height: 800 };

  it("keeps the scale at 1 and centres the graph in the inset area", () => {
    // Worked by hand, so a reader can check it without running anything.
    // Usable area 1168x722. Scale min(1168/660, 722/174, 1) = 1.
    // Target centre (16 + 584, 62 + 361) = (600, 423); element centre
    // (600, 400); content centre (330, 87).
    // x = (600 - 600)/1 + 600 - 330 = 270
    // y = (423 - 400)/1 + 400 -  87 = 336
    const fit = computeFit(GRAPH, element, INSETS);
    expect(fit.scale).toBe(1);
    expect(fit.x).toBeCloseTo(270, 6);
    expect(fit.y).toBeCloseTo(336, 6);
  });

  it("lands the graph inside the inset area", () => {
    const fit = computeFit(GRAPH, element, INSETS);
    const box = project(fit, GRAPH, element);
    const area = target(element, INSETS);
    expect(box.left).toBeGreaterThanOrEqual(area.left);
    expect(box.top).toBeGreaterThanOrEqual(area.top);
    expect(box.right).toBeLessThanOrEqual(area.right);
    expect(box.bottom).toBeLessThanOrEqual(area.bottom);
  });
});

describe("canvas fit: a canvas narrower than the graph", () => {
  // 500px wide is the studio canvas with the inspector open, which is the
  // case issue #3 reports and the case the shipped formula gets wrong. 576px
  // is the canvas's 36rem floor, not its height: the column grows with the
  // window above that floor. `computeFit` takes the size as an argument, so
  // this case holds whatever the real column measures.
  const element = { width: 500, height: 576 };

  it("reduces the scale below 1", () => {
    const fit = computeFit(GRAPH, element, INSETS);
    expect(fit.scale).toBeLessThan(1);
    expect(fit.scale).toBeCloseTo(468 / 660, 6);
  });

  it("lands both horizontal edges exactly on the inset area", () => {
    const fit = computeFit(GRAPH, element, INSETS);
    const box = project(fit, GRAPH, element);
    const area = target(element, INSETS);
    expect(box.left).toBeCloseTo(area.left, 6);
    expect(box.right).toBeCloseTo(area.right, 6);
  });

  it("centres the graph vertically within the inset area", () => {
    const fit = computeFit(GRAPH, element, INSETS);
    const box = project(fit, GRAPH, element);
    const area = target(element, INSETS);
    expect((box.top + box.bottom) / 2).toBeCloseTo((area.top + area.bottom) / 2, 6);
  });

  it("clips no edge of the graph", () => {
    const fit = computeFit(GRAPH, element, INSETS);
    const box = project(fit, GRAPH, element);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(element.width);
    expect(box.bottom).toBeLessThanOrEqual(element.height);
  });
});

describe("canvas fit: the toolbar overlay", () => {
  it("keeps the graph's top edge below the toolbar", () => {
    const element = { width: 500, height: 576 };
    const fit = computeFit(GRAPH, element, INSETS);
    const box = project(fit, GRAPH, element);
    expect(box.top).toBeGreaterThanOrEqual(TOOLBAR_CLEARANCE);
  });

  it("does not spend the toolbar's clearance on the bottom edge as well", () => {
    // A symmetric inset would; this asymmetry is why the pan carries the
    // division by the scale.
    const element = { width: 500, height: 576 };
    const fit = computeFit(GRAPH, element, INSETS);
    const box = project(fit, GRAPH, element);
    expect(element.height - box.bottom).toBeLessThan(box.top);
  });
});

describe("canvas fit: a content box offset from the origin", () => {
  it("frames a graph whose steps all sit at negative coordinates", () => {
    const element = { width: 500, height: 576 };
    const shifted: Box = { x: -900, y: -400, width: 660, height: 174 };
    const fit = computeFit(shifted, element, INSETS);
    const box = project(fit, shifted, element);
    const area = target(element, INSETS);
    expect(box.left).toBeCloseTo(area.left, 6);
    expect(box.right).toBeCloseTo(area.right, 6);
    expect((box.top + box.bottom) / 2).toBeCloseTo((area.top + area.bottom) / 2, 6);
  });
});

describe("canvas fit: repeated activation", () => {
  it("returns the same result for the same inputs", () => {
    const element = { width: 500, height: 576 };
    const first = computeFit(GRAPH, element, INSETS);
    const second = computeFit(GRAPH, element, INSETS);
    expect(second).toEqual(first);
  });

  it("ignores the scale the canvas already holds", () => {
    // The element size is the layout box, so it does not change with the
    // zoom. Feeding the same layout box twice must agree, which is what the
    // shipped code fails by reading a transformed rect instead.
    const element = { width: 500, height: 576 };
    const fit = computeFit(GRAPH, element, INSETS);
    const again = computeFit(GRAPH, { width: 500, height: 576 }, INSETS);
    expect(again).toEqual(fit);
  });
});

describe("canvas fit: bounds", () => {
  it("clamps to the minimum scale for a graph far wider than the canvas", () => {
    const element = { width: 500, height: 576 };
    const huge: Box = { x: 0, y: 0, width: 20000, height: 174 };
    expect(computeFit(huge, element, INSETS).scale).toBe(MIN_SCALE);
  });

  it("never magnifies a graph smaller than the canvas", () => {
    const element = { width: 1200, height: 800 };
    const tiny: Box = { x: 0, y: 0, width: 100, height: 50 };
    expect(computeFit(tiny, element, INSETS).scale).toBe(1);
  });
});

/**
 * The arithmetic above cannot frame what the drawing surface refuses to draw.
 * An inline `<svg>` carries `overflow: hidden` from the UA stylesheet, and
 * Panzoom transforms that element, so the clip window travels with the
 * content. `docs/browser-checks.md` holds the visual half of this check.
 * These two assertions hold the CSS that makes it possible.
 */
describe("canvas fit: the clipping surface", () => {
  const css = readFileSync(new URL("../src/areas/studio/app.css", import.meta.url), "utf-8");

  function rule(selector: string): string {
    const body = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
    if (!body) throw new Error(`no rule for ${selector} in app.css`);
    return body[1] as string;
  }

  it("does not let the canvas SVG clip its own graph", () => {
    expect(rule(".canvas-svg")).toContain("overflow: visible");
  });

  it("keeps the clipping edge on the wrap", () => {
    expect(rule(".canvas-wrap")).toContain("overflow: hidden");
  });

  it("paints the grid on the wrap, which the zoom does not move", () => {
    expect(rule(".canvas-wrap")).toContain("background-image");
    expect(rule(".canvas-svg")).not.toContain("background-image");
  });
});

describe("canvas fit: an empty canvas", () => {
  it("returns a neutral fit for a zero-sized content box", () => {
    const element = { width: 500, height: 576 };
    expect(computeFit({ x: 0, y: 0, width: 0, height: 0 }, element, INSETS)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("returns a neutral fit for a zero-sized element", () => {
    expect(computeFit(GRAPH, { width: 0, height: 0 }, INSETS)).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
