/**
 * Where each way out's sentence stands on the canvas (design.md D5). Pure: it
 * reads geometry and nothing else, so a test places a sentence without a
 * renderer.
 *
 * Arrange leaves a 60-unit gap between columns and between rows. A sentence
 * centred on its route's midpoint at a comfortable width covers both
 * neighbours' labels and stamps there, so each sentence first narrows and
 * takes more lines, then slides along its own route.
 */

import { NODE_HEIGHT, NODE_WIDTH, type Point } from "./geometry";
import { STAMP_CHROME_HEIGHT, STAMP_INSET, STAMP_LINE_HEIGHT, stampLines, stampWidth, type StampWords } from "./mapWords";

/** A rectangle in canvas user units, by its top-left corner. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A placed sentence: its box, and the lines the estimate gave it. */
export interface SentenceBox extends Rect {
  lines: number;
}

/** One sentence the canvas draws, on its routed path. */
export interface SentenceInput {
  key: string;
  text: string;
  /** The routed path's corner points, source anchor first. */
  route: Point[];
  /** The route's midpoint, as `midpointOfRoute` gives it. */
  midpoint: Point;
}

/** The estimated advance of one character of the 12px body face. */
export const SENTENCE_CHAR_WIDTH = 6.5;
/** One sentence line's height. */
export const SENTENCE_LINE_HEIGHT = 16;
/** The room the estimate keeps around the text, each side. */
export const SENTENCE_PADDING = 3;
/** The lines a sentence takes before its clamp cuts it. */
export const SENTENCE_MAX_LINES = 6;
/** The widths the placement tries, widest first, in user units. */
export const SENTENCE_MAX_WIDTH = 200;
export const SENTENCE_MIN_WIDTH = 56;
export const SENTENCE_WIDTH_STEP = 8;
/** How far a sentence slides along its route, per try and at most, each way. */
export const SENTENCE_SLIDE_STEP = 8;
export const SENTENCE_SLIDE_MAX = 120;
/** How far inside a sideways-shifted box its place on the route stays. */
export const SENTENCE_LINE_KEEP = 4;
/** How far a node's rectangle grows each side as an obstacle. */
export const NODE_CLEARANCE = 2;

/**
 * How many lines `text` takes at `width`: a greedy wrap at spaces, where a
 * word wider than a line breaks anywhere, as `overflowWrap: anywhere` does.
 */
export function sentenceLines(text: string, width: number): number {
  const perLine = Math.max(1, Math.floor((width - 2 * SENTENCE_PADDING) / SENTENCE_CHAR_WIDTH));
  const words = text.split(/\s+/).filter(Boolean);
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const joined = used === 0 ? word.length : used + 1 + word.length;
    if (joined <= perLine) {
      used = joined;
      continue;
    }
    if (used > 0) lines++;
    lines += Math.ceil(word.length / perLine) - 1;
    used = word.length % perLine || perLine;
  }
  return lines;
}

/** A node's rectangle as an obstacle, grown by `NODE_CLEARANCE` each side. */
export function nodeObstacle(at: Point): Rect {
  return {
    x: at.x - NODE_CLEARANCE,
    y: at.y - NODE_CLEARANCE,
    width: NODE_WIDTH + 2 * NODE_CLEARANCE,
    height: NODE_HEIGHT + 2 * NODE_CLEARANCE,
  };
}

/** The rectangles a node's stamps take, in canvas units, as `NodeStamp` draws
 * them: each host ends `STAMP_INSET` below the node's top edge. */
export function stampObstacles(words: StampWords, at: Point): Rect[] {
  const width = stampWidth(words);
  const rects: Rect[] = [];
  const push = (text: string, x: number) => {
    const height = stampLines(text, width) * STAMP_LINE_HEIGHT + STAMP_CHROME_HEIGHT;
    rects.push({ x: at.x + x, y: at.y + STAMP_INSET - height, width, height });
  };
  if (words.start !== undefined) push(words.start, STAMP_INSET);
  if (words.end !== undefined) push(words.end, NODE_WIDTH - STAMP_INSET - width);
  return rects;
}

/** The area two rectangles share. Touching edges share none. */
function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** A place on the route: the point, and whether its segment runs across
 * (`x` changes) or down (`y` changes). A zero-length route counts as across. */
interface Place {
  point: Point;
  across: boolean;
}

/** The place `distance` units along `route` from its first point. */
function placeAlong(route: Point[], distance: number): Place {
  let travelled = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (length > 0 && travelled + length >= distance) {
      const ratio = (distance - travelled) / length;
      return { point: { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio }, across: a.y === b.y };
    }
    travelled += length;
  }
  return { point: route[route.length - 1], across: true };
}

/** The route's length, and how far along it `point` stands. The midpoint
 * sits at half the length; the second number reads it rather than assuming
 * so, and falls back to half where `point` lies on no segment. */
function measure(route: Point[], point: Point): { total: number; at: number } {
  let total = 0;
  let at: number | undefined;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const onSegment =
      point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x) && point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y);
    if (at === undefined && onSegment) at = total + Math.abs(point.x - a.x) + Math.abs(point.y - a.y);
    total += length;
  }
  return { total, at: at ?? total / 2 };
}

/** Offsets nearest first: 0, then +step and -step, and on up to `max`. */
function offsetsUpTo(max: number, step: number): number[] {
  const offsets = [0];
  for (let d = step; d <= max; d += step) offsets.push(d, -d);
  return offsets;
}

function boxAt(centre: Point, width: number, lines: number): SentenceBox {
  const height = lines * SENTENCE_LINE_HEIGHT + 2 * SENTENCE_PADDING;
  return { x: centre.x - width / 2, y: centre.y - height / 2, width, height, lines };
}

/** The rectangles that can touch any box placed for `route`: those within a
 * slide and a whole box of its bounds. */
function obstaclesNear(route: Point[], taken: Rect[]): Rect[] {
  const reach = SENTENCE_SLIDE_MAX + SENTENCE_MAX_WIDTH;
  const xs = route.map((p) => p.x);
  const ys = route.map((p) => p.y);
  const area = {
    x: Math.min(...xs) - reach,
    y: Math.min(...ys) - reach,
    width: Math.max(...xs) - Math.min(...xs) + 2 * reach,
    height: Math.max(...ys) - Math.min(...ys) + 2 * reach,
  };
  return taken.filter((rect) => overlapArea(area, rect) > 0);
}

/**
 * Places every sentence at once, in the order given, so the result is
 * deterministic. Each sentence tries widths from `SENTENCE_MAX_WIDTH` down to
 * `SENTENCE_MIN_WIDTH`. At each width it tries places along its route, the
 * midpoint first, then `SENTENCE_SLIDE_STEP` further either way, up to
 * `SENTENCE_SLIDE_MAX`. At each place it tries the box centred on the route,
 * then boxes shifted sideways across the route's segment by
 * `SENTENCE_SLIDE_STEP` either way, nearest first. A shift keeps the place
 * inside the box, `SENTENCE_LINE_KEEP` units clear of its edge, so the box
 * still sits on its line. The first box that meets no obstacle and no
 * sentence placed before it wins.
 *
 * Where no box is clear, the sentence takes the box it tried with the least
 * area over obstacles and earlier sentences. A tie goes to the wider box,
 * then to the one nearer the midpoint.
 *
 * A box holds at most `SENTENCE_MAX_LINES` lines; past them the clamp cuts
 * the text and the hover title carries it whole.
 */
export function placeSentences(sentences: SentenceInput[], obstacles: Rect[]): Map<string, SentenceBox> {
  const placed = new Map<string, SentenceBox>();
  const taken: Rect[] = [...obstacles];
  const slides = offsetsUpTo(SENTENCE_SLIDE_MAX, SENTENCE_SLIDE_STEP);
  for (const sentence of sentences) {
    const { total, at } = measure(sentence.route, sentence.midpoint);
    const near = obstaclesNear(sentence.route, taken);
    let chosen: SentenceBox | undefined;
    let least: { box: SentenceBox; area: number; distance: number } | undefined;
    for (let width = SENTENCE_MAX_WIDTH; width >= SENTENCE_MIN_WIDTH && !chosen; width -= SENTENCE_WIDTH_STEP) {
      const lines = Math.min(sentenceLines(sentence.text, width), SENTENCE_MAX_LINES);
      const height = lines * SENTENCE_LINE_HEIGHT + 2 * SENTENCE_PADDING;
      for (const slide of slides) {
        const distance = at + slide;
        if (distance < 0 || distance > total) continue;
        const place = placeAlong(sentence.route, distance);
        const point = slide === 0 ? sentence.midpoint : place.point;
        // Across a segment that runs across, the box shifts up or down;
        // across one that runs down, it shifts left or right.
        const room = (place.across ? height : width) / 2 - SENTENCE_LINE_KEEP;
        for (const shift of offsetsUpTo(room, SENTENCE_SLIDE_STEP)) {
          const centre = place.across ? { x: point.x, y: point.y + shift } : { x: point.x + shift, y: point.y };
          const candidate = boxAt(centre, width, lines);
          let area = 0;
          for (const rect of near) area += overlapArea(candidate, rect);
          if (area === 0) {
            chosen = candidate;
            break;
          }
          const fromMid = Math.hypot(centre.x - sentence.midpoint.x, centre.y - sentence.midpoint.y);
          // Widths run widest first, so a tie on area keeps the wider box
          // already held; within one width the nearer box wins.
          if (!least || area < least.area || (area === least.area && width === least.box.width && fromMid < least.distance)) {
            least = { box: candidate, area, distance: fromMid };
          }
        }
        if (chosen) break;
      }
    }
    chosen ??= least?.box ?? boxAt(sentence.midpoint, SENTENCE_MIN_WIDTH, Math.min(sentenceLines(sentence.text, SENTENCE_MIN_WIDTH), SENTENCE_MAX_LINES));
    placed.set(sentence.key, chosen);
    taken.push(chosen);
  }
  return placed;
}
