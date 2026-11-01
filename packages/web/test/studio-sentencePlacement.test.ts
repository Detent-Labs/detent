import { describe, expect, it } from "bun:test";
import { NODE_HEIGHT, NODE_WIDTH, type Point } from "../src/areas/studio/canvas/geometry.js";
import {
  nodeObstacle,
  placeSentences,
  sentenceLines,
  stampObstacles,
  SENTENCE_MAX_WIDTH,
  SENTENCE_MIN_WIDTH,
  type Rect,
} from "../src/areas/studio/canvas/sentencePlacement.js";

/**
 * `studio-canvas`: a way out's sentence clears the nodes, the stamps and the
 * other sentences (design.md D5). Arrange leaves 60 units between columns
 * and rows, with 180-by-60 nodes, so the geometry below is the common case.
 */

const nodeRect = (at: Point): Rect => ({ x: at.x, y: at.y, width: NODE_WIDTH, height: NODE_HEIGHT });

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

// Two steps side by side, the 60-unit gap Arrange leaves between them.
const LEFT = { x: 0, y: 0 };
const RIGHT = { x: 240, y: 0 };
const BELOW_RIGHT = { x: 240, y: 120 };
const SENTENCE = "First, only if Booking Status is Booked";

describe("placeSentences", () => {
  it("stands a 39-character sentence inside a 60-unit column gap, over more lines", () => {
    expect(SENTENCE.length).toBe(39);
    const stamps = [...stampObstacles({ start: "Start" }, LEFT), ...stampObstacles({ end: "End: booked" }, RIGHT)];
    const obstacles = [nodeObstacle(LEFT), nodeObstacle(RIGHT), ...stamps];

    const placed = placeSentences(
      [{ key: "p1", text: SENTENCE, route: [{ x: 180, y: 30 }, { x: 240, y: 30 }], midpoint: { x: 210, y: 30 } }],
      obstacles,
    );
    const box = placed.get("p1");

    expect(box).toBeDefined();
    if (!box) return;
    expect(box.x).toBeGreaterThanOrEqual(LEFT.x + NODE_WIDTH);
    expect(box.x + box.width).toBeLessThanOrEqual(RIGHT.x);
    expect(box.lines).toBeGreaterThan(1);
    expect(box.lines).toBeLessThanOrEqual(6);
    expect(overlaps(box, nodeRect(LEFT))).toBe(false);
    expect(overlaps(box, nodeRect(RIGHT))).toBe(false);
    for (const stamp of stamps) expect(overlaps(box, stamp)).toBe(false);
  });

  it("slides two sentences in one column gap apart along their routes", () => {
    const obstacles = [nodeObstacle(LEFT), nodeObstacle(RIGHT), nodeObstacle(BELOW_RIGHT)];
    // The first runs straight across the gap. The second turns down the same
    // gap to the row below, so both midpoints stand in one column of it.
    const straight = [{ x: 180, y: 30 }, { x: 240, y: 30 }];
    const turning = [{ x: 180, y: 30 }, { x: 210, y: 30 }, { x: 210, y: 150 }, { x: 240, y: 150 }];

    const placed = placeSentences(
      [
        { key: "p1", text: SENTENCE, route: straight, midpoint: { x: 210, y: 30 } },
        { key: "p2", text: "Second, only if Booking Status is Open", route: turning, midpoint: { x: 210, y: 90 } },
      ],
      obstacles,
    );
    const first = placed.get("p1");
    const second = placed.get("p2");

    expect(first && second).toBeDefined();
    if (!first || !second) return;
    expect(overlaps(first, second)).toBe(false);
    for (const box of [first, second]) {
      for (const node of [LEFT, RIGHT, BELOW_RIGHT]) expect(overlaps(box, nodeRect(node))).toBe(false);
    }
    // The second slid along its own route: its centre left the midpoint and
    // still stands on the vertical run.
    expect(centre(second).x).toBe(210);
    expect(centre(second).y).not.toBe(90);
  });

  it("centres a sentence on its midpoint over open canvas, at most 200 wide", () => {
    const placed = placeSentences(
      [{ key: "p1", text: SENTENCE, route: [{ x: 0, y: 0 }, { x: 600, y: 0 }], midpoint: { x: 300, y: 0 } }],
      [],
    );
    const box = placed.get("p1");

    expect(box).toBeDefined();
    if (!box) return;
    expect(centre(box)).toEqual({ x: 300, y: 0 });
    expect(box.width).toBeLessThanOrEqual(SENTENCE_MAX_WIDTH);
    expect(box.width).toBe(SENTENCE_MAX_WIDTH);
  });

  it("takes the floor width at the midpoint where no box fits", () => {
    const everywhere = { x: -1000, y: -1000, width: 3000, height: 3000 };

    const placed = placeSentences(
      [{ key: "p1", text: SENTENCE, route: [{ x: 0, y: 0 }, { x: 600, y: 0 }], midpoint: { x: 300, y: 0 } }],
      [everywhere],
    );
    const box = placed.get("p1");

    expect(box).toBeDefined();
    if (!box) return;
    expect(box.width).toBe(SENTENCE_MIN_WIDTH);
    expect(centre(box)).toEqual({ x: 300, y: 0 });
  });

  it("places each sentence the same way on every run", () => {
    const input = [
      { key: "p1", text: SENTENCE, route: [{ x: 180, y: 30 }, { x: 240, y: 30 }], midpoint: { x: 210, y: 30 } },
      { key: "p2", text: "Otherwise", route: [{ x: 180, y: 30 }, { x: 240, y: 30 }], midpoint: { x: 210, y: 30 } },
    ];
    const obstacles = [nodeObstacle(LEFT), nodeObstacle(RIGHT)];

    expect([...placeSentences(input, obstacles)]).toEqual([...placeSentences(input, obstacles)]);
  });
});

describe("sentenceLines", () => {
  it("wraps at spaces and counts six lines for the gap's sentence at the floor width", () => {
    expect(sentenceLines(SENTENCE, SENTENCE_MAX_WIDTH)).toBe(2);
    expect(sentenceLines(SENTENCE, SENTENCE_MIN_WIDTH)).toBe(6);
    expect(sentenceLines("Otherwise", SENTENCE_MAX_WIDTH)).toBe(1);
  });
});

describe("stampObstacles", () => {
  it("frames each stamp where NodeStamp draws it, ending 8 below the node's top", () => {
    const [start, end] = stampObstacles({ start: "Start", end: "End" }, { x: 100, y: 200 });

    // Two stamps share the 164-unit cap, 80 each.
    expect(start).toEqual({ x: 108, y: 200 + 8 - 19, width: 80, height: 19 });
    expect(end).toEqual({ x: 100 + NODE_WIDTH - 8 - 80, y: 200 + 8 - 19, width: 80, height: 19 });
  });
});
