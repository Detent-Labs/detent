import { ALLOWED_BY_TYPE, type BaseFieldType, type FieldControl, type FieldFormat } from "workflow-engine/schema";
import { deriveKey, dedupeKey, shouldAutoDeriveKey } from "../draft/deriveKey.js";
import { resolveDraftLocalizedText, type DraftLocalizedText } from "../draft/localized-text.js";

/**
 * A field's label edit's whole key decision (design.md: "Extract the
 * field-key decision"), the same shape as `stepsPanelLogic.ts::nextStepKey`
 * and for the same reason — base-locale resolution, the lock check against
 * the prior derivation, and catalog-wide dedup all compose in one function.
 * Shared by the top-level field editor and the nested `group`-child field
 * editor, since `FieldDef.key` is one flat CEL namespace regardless of
 * nesting depth.
 *
 * `taken` is the caller's own `draftFields(draft)`-derived set (design.md:
 * "do not hand-roll a second flatten"), excluding the field being edited.
 *
 * Returns the derived-and-deduped key when the lock check says auto-fill is
 * still live, or `undefined` when it says to leave `key` untouched.
 */
export function nextFieldKey(
  currentKey: string,
  priorLabel: DraftLocalizedText,
  newLabel: DraftLocalizedText,
  baseLocale: string,
  taken: ReadonlySet<string>,
): string | undefined {
  const priorDerived = deriveKey(resolveDraftLocalizedText(priorLabel, baseLocale, baseLocale) ?? "");
  if (!shouldAutoDeriveKey(currentKey, priorDerived)) return undefined;

  const newDerived = deriveKey(resolveDraftLocalizedText(newLabel, baseLocale, baseLocale) ?? "");
  return dedupeKey(newDerived, taken);
}

/** The `format` members a type allows, and the `control` members it allows —
 * the same table `compile.ts::checkFieldFormatControl` verdicts a body
 * against, read here so the two pickers can only offer a pair that publishes.
 * A plugin envelope has no row: it declares neither key, since its own
 * semantics live in its config. */
export function allowedForType(type: unknown): { formats: readonly FieldFormat[]; controls: readonly FieldControl[] } {
  if (typeof type !== "string") return { formats: [], controls: [] };
  return ALLOWED_BY_TYPE[type as BaseFieldType] ?? { formats: [], controls: [] };
}

/**
 * Which of a field's two presentation keys a switch to `nextType` must drop.
 *
 * Leaving one in place would let the developer publish a body the compile
 * pass rejects, with no control on screen showing why: a `{type: "number"}`
 * field carrying `format: "date"` fails at publish, and neither picker offers
 * `date` any more to say so.
 */
export function droppedByTypeChange(
  field: { format?: FieldFormat; control?: FieldControl },
  nextType: unknown,
): ("format" | "control")[] {
  const allowed = allowedForType(nextType);
  const dropped: ("format" | "control")[] = [];
  if (field.format !== undefined && !allowed.formats.includes(field.format)) dropped.push("format");
  if (field.control !== undefined && !allowed.controls.includes(field.control)) dropped.push("control");
  return dropped;
}
