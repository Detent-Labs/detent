/**
 * Every word the canvas prints or announces: the stamps, a way out's
 * sentence, and the accessible names of a node and a path. Pure, so a test
 * reads each sentence without a renderer.
 *
 * No word here carries a step key, a trigger's enum value, a `priority`
 * number or CEL source (`studio-canvas`).
 */

import type { Path } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftStep } from "../draft/createStep";
import { performedByFor } from "../draft/performedBy";
import { stepKindPhrase } from "../draft/guided-labels";
import { guardPhrase, type Operand } from "../panels/shared/conditionLogic";
import { fill } from "../panels/shared/optionText";
import { t, type CatalogKey } from "../catalog.js";
import { NODE_WIDTH } from "./geometry";

type DraftPath = DraftOf<Path>;

/** The words on a node's two stamps. A step carries neither, one or both. */
export interface StampWords {
  start?: string;
  end?: string;
}

/** The initial step's stamp reads "Start". An end reads "End", or "End:" and
 * the outcome's whole name. */
export function stampWords(step: DraftStep, initialStepId: string | undefined): StampWords {
  const words: StampWords = {};
  if (step.id !== undefined && step.id === initialStepId) words.start = t("canvas.startStamp");
  if (step.terminal === true) {
    words.end = step.outcome ? fill(t("canvas.endStampOutcome"), { outcome: step.outcome }) : t("canvas.endStamp");
  }
  return words;
}

/** How far a stamp stands in from the node's left or right edge, and how far
 * below the top edge its host ends (design.md D4). */
export const STAMP_INSET = 8;
/** The room between two stamps on one node. */
export const STAMP_GAP = 4;
/** A stamp's width cap: the node less an inset on each side. A node carrying
 * both stamps splits it, less the gap between them. */
export const STAMP_CAP = NODE_WIDTH - 2 * STAMP_INSET;
export const STAMP_CAP_SHARED = (STAMP_CAP - STAMP_GAP) / 2;

/** The width each of a node's stamps takes: the whole cap alone, half of it
 * beside the other stamp. */
export function stampWidth(words: StampWords): number {
  return words.start !== undefined && words.end !== undefined ? STAMP_CAP_SHARED : STAMP_CAP;
}

/** The stamp's rule, each side. */
export const STAMP_RULE = 2;
/** The stamp's padding inside the rule, left and right. */
export const STAMP_PADDING_X = 4;
/** One stamp line's height. */
export const STAMP_LINE_HEIGHT = 13;
/** The rule and the padding above and below the lines. */
export const STAMP_CHROME_HEIGHT = 6;
/** The 11px mono advance plus its 0.08em tracking. */
const STAMP_CHAR_WIDTH = 7.5;

/**
 * How many lines a stamp of `width` takes for `text`, so the host
 * `<foreignObject>` frames the stamp's real extent for `getBBox()`. A greedy
 * wrap at spaces, and a word wider than a line breaks anywhere, as
 * `overflowWrap: anywhere` breaks it. The count reads the uppercase form,
 * since the stamp prints uppercase and "ß" prints as "SS".
 */
export function stampLines(text: string, width: number): number {
  const inner = width - 2 * (STAMP_RULE + STAMP_PADDING_X);
  const perLine = Math.max(1, Math.floor(inner / STAMP_CHAR_WIDTH));
  const words = text.toLocaleUpperCase("en").split(/\s+/).filter(Boolean);
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

/** A ranked sentence's key, one whole sentence per place. */
const RANKED: readonly CatalogKey[] = [
  "canvas.onlyIf.first",
  "canvas.onlyIf.second",
  "canvas.onlyIf.third",
  "canvas.onlyIf.fourth",
  "canvas.onlyIf.fifth",
];

/** A path counts as guarded where its source holds text after trimming. */
function guardSource(path: DraftPath): string | undefined {
  const src = path.guard?.src;
  return src?.trim() ? src : undefined;
}

/**
 * The path's place among the step's automatic paths that carry a numeric
 * `priority`, lowest first, ties in array order. `undefined` for a path
 * outside that set.
 */
function rankOf(path: DraftPath, step: DraftStep): number | undefined {
  const ranked = (step.paths ?? [])
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p.trigger === "automatic" && typeof p.priority === "number")
    .sort((a, b) => a.p.priority! - b.p.priority! || a.index - b.index);
  const at = ranked.findIndex(({ p }) => p === path);
  return at === -1 ? undefined : at + 1;
}

/**
 * The sentence a way out's line draws, or `undefined` where the path has
 * nothing to say. `path` is one of `step.paths`.
 *
 * - Guarded, automatic, beside another automatic path, with a `priority`:
 *   its place, then "only if" and the condition.
 * - Guarded otherwise: "Only if" and the condition.
 * - Guardless and automatic, beside another automatic path: "Otherwise".
 * - Guardless and manual, or the step's only automatic path: none.
 */
export function wayOutSentence(path: DraftPath, step: DraftStep, operands: Operand[]): string | undefined {
  const automatic = path.trigger === "automatic";
  const besideOthers = automatic && (step.paths ?? []).filter((p) => p.trigger === "automatic").length >= 2;
  const src = guardSource(path);
  if (src === undefined) return besideOthers ? t("canvas.otherwise") : undefined;
  const phrase = guardPhrase(src, operands);
  const rank = besideOthers ? rankOf(path, step) : undefined;
  if (rank === undefined) return fill(t("canvas.onlyIf"), { phrase });
  const key = RANKED[rank - 1];
  return key ? fill(t(key), { phrase }) : fill(t("canvas.onlyIf.nth"), { phrase, n: String(rank) });
}

/**
 * A node's accessible name: the step's text, its kind phrase and its count
 * of ways out, then each stamp's word, start before end. `text` is the
 * step's entry in `stepTextMap`. `outgoing` counts the paths the traversal
 * reaches.
 */
export function nodeName(step: DraftStep, text: string, outgoing: number, stamps: StampWords): string {
  const slots = { label: text, kind: stepKindPhrase(performedByFor(step.type, step.terminal)), count: String(outgoing) };
  const parts = [fill(t(outgoing === 1 ? "canvas.nodeLabelOneWayOut" : "canvas.nodeLabel"), slots)];
  if (stamps.start !== undefined) parts.push(stamps.start);
  if (stamps.end !== undefined) parts.push(stamps.end);
  return parts.join(", ");
}

/**
 * A path's accessible name: its label, both steps' text, how it is taken,
 * and `sentence`, the sentence its line draws (`wayOutSentence`). A path
 * whose line draws none says it has no condition.
 */
export function pathName(path: DraftPath, source: string, target: string, sentence: string | undefined): string {
  const taken =
    path.trigger === "manual"
      ? t("canvas.pathTakenManual")
      : path.trigger === "automatic"
        ? t("canvas.pathTakenAutomatic")
        : t("canvas.pathTakenUnset");
  return fill(t("canvas.pathLabel"), {
    label: path.label?.trim() || t("paths.unnamedPath"),
    source,
    target,
    taken,
    sentence: sentence ?? t("canvas.pathNoCondition"),
  });
}
