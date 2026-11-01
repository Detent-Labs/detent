/**
 * The Remove field dialog's fact rows: what a removal reaches, named in the
 * author's words. One row per kind of reach, in the order the dialog prints
 * them, and a kind the removal does not carry has no row. Pure, so every
 * kind is testable without a DOM.
 */

import type { FieldRemovalReach, WriterPosition } from "../draft/field-removal";
import type { DraftField } from "../draft/fields";
import { resolveDraftLocalizedText } from "../draft/localized-text";
import type { Draft } from "../draft/types";
import { t, type CatalogKey } from "../catalog.js";
import type { RemovalNameRow } from "./RemoveFieldDialog";
import { readByPlaces } from "./readByRows";
import { fill, numberRepeats, plainStepTextMap, stepText, stepTextMap, wayOutHeading } from "./shared/optionText";

const WRITER_WORDS: Record<Exclude<WriterPosition, "outputMapping">, CatalogKey> = {
  onEntry: "fieldCatalog.removeWriterOnEntry",
  onExit: "fieldCatalog.removeWriterOnExit",
  onCancel: "fieldCatalog.removeWriterOnCancel",
  onPath: "fieldCatalog.removeWriterOnPath",
  onFire: "fieldCatalog.removeWriterOnFire",
};

/** `names` without a repeat, in first-seen order. */
const unique = (names: readonly string[]) => [...new Set(names)];

/**
 * The fact rows for `reach`, measured on `draft` before any write. A step
 * reads its text, with its steps-rail number where two steps share a label. A
 * field reads its label at `contentLocale`, else the base locale. Each list
 * drops repeats, since two rules on one place read the same. Two fields sharing
 * a label are two places, so a list of fields numbers them instead.
 */
export function removalNames(draft: Draft, reach: FieldRemovalReach, contentLocale: string): RemovalNameRow[] {
  const { sites } = reach;
  const baseLocale = draft.baseLocale ?? "en";
  const steps = draft.workflow?.steps ?? [];
  const stepTexts = stepTextMap(steps, contentLocale, baseLocale);
  const plainTexts = plainStepTextMap(steps, contentLocale, baseLocale);

  const stepWord = (step: (typeof steps)[number]) =>
    (step.id === undefined ? undefined : stepTexts.get(step.id)) ?? stepText(step, contentLocale, baseLocale);
  const fieldWord = (field: DraftField) =>
    resolveDraftLocalizedText(field.label, contentLocale, baseLocale)?.trim() || t("condition.unnamedField");
  // A field carrying two mappings onto the removed one is still one field.
  const fieldWords = (fields: readonly DraftField[]) => numberRepeats([...new Set(fields)], fieldWord);

  const writers = sites.writers.map(({ step, position, path }) => {
    const slots = { step: stepWord(step) };
    if (position === "outputMapping") return fill(t("readBy.childOut"), slots);
    const wayOut = position === "onPath" && path !== undefined ? wayOutHeading(path, stepTexts, plainTexts) : "";
    return fill(t(WRITER_WORDS[position]), { ...slots, wayOut });
  });

  const contract = [
    ...(sites.contract.includes("input") ? [t("fieldCatalog.removeDialogContractIn")] : []),
    ...(sites.contract.includes("output") ? [t("fieldCatalog.removeDialogContractOut")] : []),
  ];

  const settings = sites.pluginSettings.map((path) => {
    if (path[0] === "workflow" && path[1] === "steps" && typeof path[2] === "number") {
      const step = steps[path[2]];
      if (step !== undefined) return stepWord(step);
    }
    if (path[0] === "dataSources" && typeof path[1] === "number") {
      const key = draft.dataSources?.[path[1]]?.key;
      if (key) return key;
    }
    return t("fieldCatalog.removeDialogThisProcess");
  });

  const rows: RemovalNameRow[] = [
    { term: t("fieldCatalog.removeDialogFieldsInsideTerm"), names: fieldWords(sites.fieldsInside) },
    { term: t("fieldCatalog.removeDialogAskedOnTerm"), names: sites.steps.map(stepWord) },
    { term: t("fieldCatalog.removeDialogWrittenByTerm"), names: writers },
    { term: t("fieldCatalog.removeDialogPartOfTerm"), names: contract },
    { term: t("fieldCatalog.removeDialogFilledInFromTerm"), names: fieldWords(sites.columnMappings) },
    { term: t("fieldCatalog.removeDialogReadByTerm"), names: readByPlaces(draft, sites.celReads, contentLocale) },
    { term: t("fieldCatalog.removeDialogSettingsTerm"), names: settings },
  ];
  return rows.map((row) => ({ ...row, names: unique(row.names) })).filter((row) => row.names.length > 0);
}
