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

export interface ReadByRow {
  /** Where the expression sits, in the author's words. */
  place: string;
  /** The condition as a sentence, for the seven condition places only. */
  sentence?: string;
}

type Path = readonly (string | number)[];

/** The place a site's path names: the catalog key, its slots, and whether it holds a condition. */
interface Place {
  key: CatalogKey;
  slots: Record<string, string>;
  condition: boolean;
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
 * Turns every expression in `draft` that reads `data.<key>` into a row. A
 * step reads `stepText`, a way out reads `wayOutHeading` over the maps the
 * step page builds, after the step it leaves, and a field reads its label at
 * `contentLocale`, else the base locale, else "(unnamed field)".
 */
export function readByRows(draft: Draft, key: string, contentLocale: string): ReadByRow[] {
  const sites = keyReaderSites(draft, key);
  if (sites.length === 0) return [];

  const baseLocale = draft.baseLocale ?? "en";
  const steps: DraftStep[] = draft.workflow?.steps ?? [];
  const stepTexts = stepTextMap(steps, contentLocale, baseLocale);
  const plainTexts = plainStepTextMap(steps, contentLocale, baseLocale);
  const byId = new Map<string, DraftField>(draftFields(draft).flatMap((f) => (f.id === undefined ? [] : [[f.id, f] as const])));
  const operands: Operand[] = buildOperands({ fields: draft.fields, locale: contentLocale, baseLocale });

  const fieldText = (field: DraftField | undefined) =>
    resolveDraftLocalizedText(field?.label, contentLocale, baseLocale)?.trim() || t("condition.unnamedField");

  const stepPlace = (step: DraftStep, rest: Path): Place => {
    const onStep = { step: stepText(step, contentLocale, baseLocale) };
    const [section, index] = rest;

    if (section === "paths" && typeof index === "number" && endsAs(rest, 2, ["guard"])) {
      const path = step.paths?.[index];
      const wayOut = path ? wayOutHeading(path, stepTexts, plainTexts) : t("paths.unnamedPath");
      return { key: "readBy.wayOut", slots: { ...onStep, wayOut }, condition: true };
    }

    if (section === "view" && index === "fields" && typeof rest[2] === "number") {
      const entry = step.view?.fields?.[rest[2]] as { kind?: string; ref?: string } | undefined;
      const field = { ...onStep, field: fieldText(entry?.ref !== undefined ? byId.get(entry.ref) : undefined) };
      const flag = rest[3];
      if (rest.length === 4 && flag === "visible" && entry?.kind === "note") {
        return { key: "readBy.noteShown", slots: onStep, condition: true };
      }
      if (rest.length === 4 && typeof flag === "string" && flag in VIEW_FLAG_PLACES) {
        return { key: VIEW_FLAG_PLACES[flag]!, slots: field, condition: true };
      }
      if (endsAs(rest, 3, ["validation", "rule"])) return { key: "readBy.stepRule", slots: field, condition: true };
    }

    if (section === "timers" && typeof index === "number" && endsAs(rest, 2, ["deadline"])) {
      return { key: "readBy.timeLimit", slots: onStep, condition: false };
    }

    if (section === "subprocess" && rest.length === 3 && (index === "inputMapping" || index === "outputMapping")) {
      return { key: index === "inputMapping" ? "readBy.childIn" : "readBy.childOut", slots: onStep, condition: false };
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
    if (endsAs(path, at, ["validation", "rule"])) return { key: "readBy.fieldRule", slots, condition: true };
    if (endsAs(path, at, ["default"])) return { key: "readBy.default", slots, condition: false };
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

  return sites.map(({ path, src }) => {
    const place = placeOf(path);
    const row: ReadByRow = { place: fill(t(place.key), place.slots) };
    if (place.condition) row.sentence = readerSentence(src, operands);
    return row;
  });
}
