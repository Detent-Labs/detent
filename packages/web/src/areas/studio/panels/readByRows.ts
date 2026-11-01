/**
 * The field editor's "Read by" rows: one per expression that reads a field's
 * key, in draft order. Each row names the expression's place in the author's
 * words, and a condition's row adds its sentence. Pure, so every place kind
 * is testable without a DOM.
 */

import type { Draft } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { draftFields } from "../draft/fields";
import type { DraftStep } from "../draft/createStep";
import { resolveDraftLocalizedText } from "../draft/localized-text";
import { keyReaderSites } from "../draft/key-readers";
import { buildOperands, readerSentence, type Operand } from "./shared/conditionLogic";
import { fill, plainStepTextMap, stepText, stepTextMap, wayOutHeading } from "./shared/optionText";
import { t, type CatalogKey } from "../catalog.js";

/** The place a Read by row's "Open" command reaches (design.md D4). */
export type ReadByTarget =
  | { kind: "wayOut"; stepId: string; pathId: string }
  | { kind: "form"; stepId: string }
  | { kind: "step"; stepId: string }
  | { kind: "field"; fieldId: string };

/** A target outside the Fields tab: the tab itself selects a `field` one. */
export type OutsidePlace = Exclude<ReadByTarget, { kind: "field" }>;

export interface ReadByRow {
  /** Where the expression sits, in the author's words. */
  place: string;
  /** The condition as a sentence, for the seven condition places only. */
  sentence?: string;
  /** Where "Open" goes. Absent for a fallback place, and for a place whose
   * step, way out or field carries no id yet. */
  target?: ReadByTarget;
}

type Path = readonly (string | number)[];

/** The place a site's path names: the catalog key, its slots, and whether it holds a condition. */
interface Place {
  key: CatalogKey;
  slots: Record<string, string>;
  condition: boolean;
  target?: ReadByTarget;
}

const VIEW_FLAG_PLACES: Record<string, CatalogKey> = {
  visible: "readBy.asked",
  required: "readBy.required",
  readonly: "readBy.readonly",
};

/** True when `path` from `at` on reads exactly `tail`. */
function endsAs(path: Path, at: number, tail: readonly (string | number)[]): boolean {
  return path.length === at + tail.length && tail.every((part, i) => path[at + i] === part);
}

/**
 * The place of a JSON path in the draft: the one classification `readByRows`
 * and `readByPlaces` read. A step reads `stepText`, a way out reads
 * `wayOutHeading` over the maps the step page builds, after the step it
 * leaves, and a field reads its label at `contentLocale`, else the base
 * locale, else "(unnamed field)".
 */
function placeOfIn(draft: Draft, contentLocale: string): (path: Path) => Place {
  const baseLocale = draft.baseLocale ?? "en";
  const steps: DraftStep[] = draft.workflow?.steps ?? [];
  const stepTexts = stepTextMap(steps, contentLocale, baseLocale);
  const plainTexts = plainStepTextMap(steps, contentLocale, baseLocale);
  const byId = new Map<string, DraftField>(draftFields(draft).flatMap((f) => (f.id === undefined ? [] : [[f.id, f] as const])));

  const fieldText = (field: DraftField | undefined) =>
    resolveDraftLocalizedText(field?.label, contentLocale, baseLocale)?.trim() || t("condition.unnamedField");

  const stepPlace = (step: DraftStep, rest: Path): Place => {
    const onStep = { step: stepText(step, contentLocale, baseLocale) };
    const [section, index] = rest;
    const stepId = step.id;
    const onStepTarget = (kind: "form" | "step"): { target?: ReadByTarget } =>
      stepId === undefined ? {} : { target: { kind, stepId } };

    if (section === "paths" && typeof index === "number" && endsAs(rest, 2, ["guard"])) {
      const path = step.paths?.[index];
      const wayOut = path ? wayOutHeading(path, stepTexts, plainTexts) : t("paths.unnamedPath");
      const wayOutTarget: { target?: ReadByTarget } =
        stepId !== undefined && path?.id !== undefined ? { target: { kind: "wayOut", stepId, pathId: path.id } } : {};
      return { key: "readBy.wayOut", slots: { ...onStep, wayOut }, condition: true, ...wayOutTarget };
    }

    if (section === "view" && index === "fields" && typeof rest[2] === "number") {
      const entry = step.view?.fields?.[rest[2]] as { kind?: string; ref?: string } | undefined;
      const field = { ...onStep, field: fieldText(entry?.ref !== undefined ? byId.get(entry.ref) : undefined) };
      const flag = rest[3];
      if (rest.length === 4 && flag === "visible" && entry?.kind === "note") {
        return { key: "readBy.noteShown", slots: onStep, condition: true, ...onStepTarget("form") };
      }
      if (rest.length === 4 && typeof flag === "string" && flag in VIEW_FLAG_PLACES) {
        return { key: VIEW_FLAG_PLACES[flag]!, slots: field, condition: true, ...onStepTarget("form") };
      }
      if (endsAs(rest, 3, ["validation", "rule"])) {
        return { key: "readBy.stepRule", slots: field, condition: true, ...onStepTarget("form") };
      }
    }

    if (section === "timers" && typeof index === "number" && endsAs(rest, 2, ["deadline"])) {
      return { key: "readBy.timeLimit", slots: onStep, condition: false, ...onStepTarget("step") };
    }

    if (section === "subprocess" && rest.length === 3 && (index === "inputMapping" || index === "outputMapping")) {
      return {
        key: index === "inputMapping" ? "readBy.childIn" : "readBy.childOut",
        slots: onStep,
        condition: false,
        ...onStepTarget("step"),
      };
    }

    return { key: "readBy.otherOnStep", slots: onStep, condition: false };
  };

  /** A path under the catalog root: `fields[i](.fields[j])*`, then the rule or the default. */
  const catalogPlace = (path: Path): Place | undefined => {
    let list: DraftField[] | undefined = draft.fields;
    let field: DraftField | undefined;
    let at = 0;
    while (path[at] === "fields" && typeof path[at + 1] === "number") {
      field = list?.[path[at + 1] as number];
      list = field?.fields;
      at += 2;
    }
    if (at === 0) return undefined;
    const slots = { field: fieldText(field) };
    const target: { target?: ReadByTarget } = field?.id === undefined ? {} : { target: { kind: "field", fieldId: field.id } };
    if (endsAs(path, at, ["validation", "rule"])) return { key: "readBy.fieldRule", slots, condition: true, ...target };
    if (endsAs(path, at, ["default"])) return { key: "readBy.default", slots, condition: false, ...target };
    return undefined;
  };

  const placeOf = (path: Path): Place => {
    if (path[0] === "workflow" && path[1] === "steps" && typeof path[2] === "number") {
      const step = steps[path[2]];
      if (step !== undefined) return stepPlace(step, path.slice(3));
    }
    if (path[0] === "fields") {
      const place = catalogPlace(path);
      if (place !== undefined) return place;
    }
    return { key: "readBy.other", slots: {}, condition: false };
  };

  return placeOf;
}

/**
 * Turns every expression in `draft` that reads `data.<key>` into a row, in
 * draft order.
 */
export function readByRows(draft: Draft, key: string, contentLocale: string): ReadByRow[] {
  const sites = keyReaderSites(draft, key);
  if (sites.length === 0) return [];

  const placeOf = placeOfIn(draft, contentLocale);
  const operands: Operand[] = buildOperands({ fields: draft.fields, locale: contentLocale, baseLocale: draft.baseLocale ?? "en" });

  return sites.map(({ path, src }) => {
    const place = placeOf(path);
    const row: ReadByRow = { place: fill(t(place.key), place.slots) };
    if (place.condition) row.sentence = readerSentence(src, operands);
    if (place.target !== undefined) row.target = place.target;
    return row;
  });
}

/** The place words of each JSON path, with no sentence and no target: what a
 * Read by row's place prints. */
export function readByPlaces(draft: Draft, paths: readonly Path[], contentLocale: string): string[] {
  if (paths.length === 0) return [];
  const placeOf = placeOfIn(draft, contentLocale);
  return paths.map((path) => {
    const place = placeOf(path);
    return fill(t(place.key), place.slots);
  });
}
