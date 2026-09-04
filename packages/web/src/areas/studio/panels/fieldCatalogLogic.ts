import type { FieldControl, FieldFormat } from "workflow-engine/schema";
import { deriveKey, dedupeKey, shouldAutoDeriveKey } from "../draft/deriveKey.js";
import { flattenDraftFields, type DraftField } from "../draft/fields.js";
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

/**
 * Which of a field's two presentation keys a switch to `kind` must drop.
 *
 * A kind names one `{type, format, control}` triple, and the picker writes
 * all three at once. A key the entry does not name has to go: leaving it in
 * place would let the developer publish a body
 * `compile.ts::checkFieldFormatControl` rejects, with nothing on screen
 * saying why — a `{type: "number"}` field carrying `format: "date"` fails at
 * publish, and the picker names no kind that still carries `date`.
 *
 * `undefined` names the plugin envelope, which declares neither key: its own
 * semantics live in its config.
 */
export function droppedByKindChange(
  field: { format?: FieldFormat; control?: FieldControl },
  kind: { format?: FieldFormat; control?: FieldControl } | undefined,
): ("format" | "control")[] {
  const dropped: ("format" | "control")[] = [];
  if (field.format !== undefined && field.format !== kind?.format) dropped.push("format");
  if (field.control !== undefined && field.control !== kind?.control) dropped.push("control");
  return dropped;
}

/**
 * Re-hangs one field inside the draft's field tree: into a `group` field's
 * own `fields` array, or back out to the top level when `targetGroupId` is
 * `undefined`. The one write both the rail's pointer drag and its keyboard
 * move reach, so the two gestures cannot drift (design.md Risks: "A keyboard
 * move is a second write path beside the drag").
 *
 * The move writes the field's place and nothing else. The field keeps its
 * `id`, its `key` and every other key it carries, and the group keeps its
 * own. Nothing else in the body needs rewriting: a group carries no entry in
 * the flat `data` namespace, `FieldDef.key` is unique across every depth, and
 * views and column mappings reference the `id` (design.md, decision: group
 * change). So no CEL expression, no view entry and no column mapping changes.
 *
 * Answers the array it was given, unchanged, where the move is not one to
 * make: no field carries `fieldId`, `targetGroupId` names no `group` field,
 * the target is the moved field itself or one of its own descendants (which
 * would drop the subtree), or the field already hangs where it would land.
 */
export function moveFieldToGroup(
  fields: DraftField[],
  fieldId: string,
  targetGroupId: string | undefined,
): DraftField[] {
  const flat = flattenDraftFields(fields);
  const moved = flat.find((f) => f.id === fieldId);
  if (!moved) return fields;

  if (targetGroupId !== undefined) {
    if (targetGroupId === fieldId) return fields;
    const target = flat.find((f) => f.id === targetGroupId);
    if (!target || target.type !== "group") return fields;
    if (flattenDraftFields(moved.fields).some((f) => f.id === targetGroupId)) return fields;
  }

  const currentParent = flat.find((f) => (f.fields ?? []).some((c) => c.id === fieldId));
  if (currentParent?.id === targetGroupId) return fields;

  const prune = (list: DraftField[]): DraftField[] =>
    list.filter((f) => f.id !== fieldId).map((f) => (f.fields ? { ...f, fields: prune(f.fields) } : f));

  const pruned = prune(fields);
  if (targetGroupId === undefined) return [...pruned, moved];

  const graft = (list: DraftField[]): DraftField[] =>
    list.map((f) => {
      if (f.id === targetGroupId) return { ...f, fields: [...(f.fields ?? []), moved] };
      return f.fields ? { ...f, fields: graft(f.fields) } : f;
    });

  return graft(pruned);
}
