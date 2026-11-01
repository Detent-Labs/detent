import { describe, expect, it } from "bun:test";
import { NODE_HEIGHT, NODE_WIDTH, type Point } from "../src/areas/studio/canvas/geometry.js";
import {
  handleObstacle,
  nodeObstacle,
  placeSentences,
  sentenceFloor,
  sentenceLines,
  stampObstacles,
  SENTENCE_LINE_KEEP,
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

const areaOver = (box: Rect, rects: Rect[]): number =>
  rects.reduce((sum, r) => {
    const w = Math.min(box.x + box.width, r.x + r.width) - Math.max(box.x, r.x);
    const h = Math.min(box.y + box.height, r.y + r.height) - Math.max(box.y, r.y);
    return sum + (w > 0 && h > 0 ? w * h : 0);
  }, 0);

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
    // The second left its midpoint, where the first already stands.
    expect(centre(second)).not.toEqual({ x: 210, y: 90 });
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

  it("shifts a box sideways across an off-centre route until it clears the gap", () => {
    // Two columns of steps, tall enough that no box clears them above or
    // below, with the 60-unit gap between them. The route runs down the gap
    // 22 units from the left column, so a 56-wide box centred on it meets
    // that column. Shifted 8 units right, it stands clear.
    const left = { x: 478, y: -400, width: 184, height: 1000 };
    const right = { x: 718, y: -400, width: 184, height: 1000 };
    const route = [{ x: 682, y: 0 }, { x: 682, y: 200 }];

    const placed = placeSentences([{ key: "p1", text: SENTENCE, route, midpoint: { x: 682, y: 100 } }], [left, right]);
    const box = placed.get("p1");

    expect(box).toBeDefined();
    if (!box) return;
    expect(areaOver(box, [left, right])).toBe(0);
    expect(box.width).toBe(SENTENCE_MIN_WIDTH);
    expect(centre(box)).toEqual({ x: 690, y: 100 });
    // The line still runs through the box, at least 4 units inside it.
    expect(box.x).toBeLessThanOrEqual(682 - SENTENCE_LINE_KEEP);
    expect(box.x + box.width).toBeGreaterThanOrEqual(682 + SENTENCE_LINE_KEEP);
  });

  it("keeps a short sentence at least as wide as its longest word in a 60-unit gap", () => {
    // "Otherwise" needs 9 × 6.5 + 2 × 4 = 66.5, so 72 on the width grid. The
    // gap holds 56, so no box is clear, and the fallback still keeps 72.
    expect(sentenceFloor("Otherwise")).toBe(72);
    const placed = placeSentences(
      [{ key: "p1", text: "Otherwise", route: [{ x: 180, y: 30 }, { x: 240, y: 30 }], midpoint: { x: 210, y: 30 } }],
      [nodeObstacle(LEFT), nodeObstacle(RIGHT), handleObstacle(LEFT)],
    );
    const box = placed.get("p1");

    expect(box).toBeDefined();
    if (!box) return;
    expect(box.width).toBeGreaterThanOrEqual(72);
    expect(box.lines).toBe(1);
  });

  it("leaves the cap as the only width for a word wider than the cap", () => {
    expect(sentenceFloor("x".repeat(40))).toBe(SENTENCE_MAX_WIDTH);
    expect(sentenceFloor("First, only if Booking Status is Booked")).toBe(SENTENCE_MIN_WIDTH);
  });

  it("keeps a sentence off the connect handle of the step its way out leaves", () => {
    // Tall columns either side of the 60-unit gap, and the left step's
    // handle at (180, 30). The route leaves the handle and turns up the gap;
    // its midpoint stands level with the handle.
    const left = { x: -400, y: -400, width: 582, height: 1000 };
    const right = { x: 238, y: -400, width: 400, height: 1000 };
    const handle = handleObstacle(LEFT);
    const input = [
      {
        key: "p1",
        text: SENTENCE,
        route: [{ x: 180, y: 30 }, { x: 210, y: 30 }, { x: 210, y: -60 }],
        midpoint: { x: 210, y: 0 },
      },
    ];
    expect(handle).toEqual({ x: 171, y: 21, width: 18, height: 18 });

    const box = placeSentences(input, [left, right, handle]).get("p1");
    // The positive control: with no handle obstacle the box covers it.
    const unaware = placeSentences(input, [left, right]).get("p1");

    expect(box && unaware).toBeDefined();
    if (!box || !unaware) return;
    expect(areaOver(unaware, [handle])).toBeGreaterThan(0);
    expect(areaOver(box, [handle, left, right])).toBe(0);
  });

  it("takes the box with the least overlap where none is clear", () => {
    // A band 20 units tall along the route: a one-line box (24 tall) overlaps
    // 2 units above and below it, the least any box can. "Otherwise" takes
    // one line from width 72 up, so 72 at the midpoint overlaps least: 288.
    const above = { x: -1000, y: -1000, width: 3000, height: 990 };
    const below = { x: -1000, y: 10, width: 3000, height: 990 };

    const placed = placeSentences(
      [{ key: "p1", text: "Otherwise", route: [{ x: 0, y: 0 }, { x: 600, y: 0 }], midpoint: { x: 300, y: 0 } }],
      [above, below],
    );
    const box = placed.get("p1");

    expect(box).toBeDefined();
    if (!box) return;
    expect(box.width).toBe(72);
    expect(box.lines).toBe(1);
    expect(centre(box)).toEqual({ x: 300, y: 0 });
    expect(areaOver(box, [above, below])).toBe(288);
    // The old floor box, 56 wide at the midpoint over two lines, overlaps far more.
    const floor = { x: 300 - SENTENCE_MIN_WIDTH / 2, y: -20, width: SENTENCE_MIN_WIDTH, height: 40 };
    expect(areaOver(floor, [above, below])).toBeGreaterThan(288);
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
