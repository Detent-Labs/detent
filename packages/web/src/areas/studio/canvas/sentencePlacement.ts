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

/** Whether two rectangles share area. Touching edges share none. */
function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The point `distance` units along `route` from its first point. */
function pointAlong(route: Point[], distance: number): Point {
  let travelled = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (travelled + length >= distance) {
      const ratio = length === 0 ? 0 : (distance - travelled) / length;
      return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
    }
    travelled += length;
  }
  return route[route.length - 1];
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

/** The slide offsets, nearest first: 0, then +8 and -8, then +16 and -16. */
function slideOffsets(): number[] {
  const offsets = [0];
  for (let d = SENTENCE_SLIDE_STEP; d <= SENTENCE_SLIDE_MAX; d += SENTENCE_SLIDE_STEP) offsets.push(d, -d);
  return offsets;
}

function boxAt(centre: Point, width: number, lines: number): SentenceBox {
  const height = lines * SENTENCE_LINE_HEIGHT + 2 * SENTENCE_PADDING;
  return { x: centre.x - width / 2, y: centre.y - height / 2, width, height, lines };
}

/**
 * Places every sentence at once, in the order given, so the result is
 * deterministic. Each sentence tries widths from `SENTENCE_MAX_WIDTH` down to
 * `SENTENCE_MIN_WIDTH`. At each width it tries places along its route, the
 * midpoint first, then `SENTENCE_SLIDE_STEP` further either way, up to
 * `SENTENCE_SLIDE_MAX`. It keeps the first box that meets no obstacle and no
 * sentence placed before it.
 *
 * A box holds at most `SENTENCE_MAX_LINES` lines; past them the clamp cuts
 * the text and the hover title carries it whole. Where no box fits, the
 * sentence takes the floor width at its midpoint.
 */
export function placeSentences(sentences: SentenceInput[], obstacles: Rect[]): Map<string, SentenceBox> {
  const placed = new Map<string, SentenceBox>();
  const taken: Rect[] = [...obstacles];
  const offsets = slideOffsets();
  for (const sentence of sentences) {
    const { total, at } = measure(sentence.route, sentence.midpoint);
    let chosen: SentenceBox | undefined;
    for (let width = SENTENCE_MAX_WIDTH; width >= SENTENCE_MIN_WIDTH && !chosen; width -= SENTENCE_WIDTH_STEP) {
      const lines = sentenceLines(sentence.text, width);
      for (const offset of offsets) {
        const distance = at + offset;
        if (distance < 0 || distance > total) continue;
        const candidate = boxAt(
          offset === 0 ? sentence.midpoint : pointAlong(sentence.route, distance),
          width,
          Math.min(lines, SENTENCE_MAX_LINES),
        );
        if (!taken.some((rect) => overlaps(candidate, rect))) {
          chosen = candidate;
          break;
        }
      }
    }
    chosen ??= boxAt(
      sentence.midpoint,
      SENTENCE_MIN_WIDTH,
      Math.min(sentenceLines(sentence.text, SENTENCE_MIN_WIDTH), SENTENCE_MAX_LINES),
    );
    placed.set(sentence.key, chosen);
    taken.push(chosen);
  }
  return placed;
}
