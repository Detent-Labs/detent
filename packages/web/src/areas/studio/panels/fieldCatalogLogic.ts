import type { FieldControl, FieldFormat } from "workflow-engine/schema";
import { deriveKey, dedupeKey, shouldAutoDeriveKey } from "../draft/deriveKey.js";
import { flattenDraftFields, type DraftField } from "../draft/fields.js";
import { resolveDraftLocalizedText, type DraftLocalizedText } from "../draft/localized-text.js";

/**
 * A field's label edit's whole key decision (design.md: "Extract the
 * field-key decision"), the same shape as `stepsPanelLogic.ts::nextStepKey`
 * and for the same reason — base-locale resolution, the lock check against
 * the prior derivation, and catalog-wide dedup all compose in one function.
 * Called from `FieldEditor`'s own label writer, for the selected field at
 * any nesting depth, since `FieldDef.key` is one flat CEL namespace
 * regardless of depth.
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
 * own. No CEL expression and no column mapping changes: a group carries no
 * entry in the flat `data` namespace, `FieldDef.key` is unique across every
 * depth, and column mappings reference the `id` (design.md, decision: group
 * change).
 *
 * A view entry's `group` is the one reference this move strands: the
 * definition contract binds it to the field's catalog parent, so this
 * function's caller owns rewriting it, in the same draft change as this
 * function's own result. `EntityTabs.tsx`'s `moveField` calls
 * `view-group-sync.ts::syncViewGroupsOnFieldMove`. Widening this function to
 * take the whole draft and do that rewrite itself would give the rail's pure
 * tree function a second job (design.md: "One helper keeps the view entries
 * level with the catalog").
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

  const pruned = pruneField(fields, fieldId);
  if (targetGroupId === undefined) return [...pruned, moved];

  return graftField(pruned, targetGroupId, moved);
}

/**
 * The recursive rebuild `moveFieldToGroup`, `appendToGroup` and
 * `removeFieldIn` all share for dropping a field: every field on the path
 * from the root down to the one carrying `targetId` is a new object, and
 * every other field keeps its old reference. Not exported; each caller
 * carries its own existence check and its own no-op case.
 */
const pruneField = (list: DraftField[], targetId: string): DraftField[] =>
  list.filter((f) => f.id !== targetId).map((f) => (f.fields ? { ...f, fields: pruneField(f.fields, targetId) } : f));

/**
 * The recursive rebuild `moveFieldToGroup` and `appendToGroup` share for
 * hanging a field: `field` lands at the end of the `fields` array belonging
 * to whichever field in the tree carries `targetId`, and every field on
 * that path down is a new object, exactly as `pruneField` copies its own
 * path. Not exported; each caller carries its own existence check and its
 * own no-op case.
 */
const graftField = (list: DraftField[], targetId: string, field: DraftField): DraftField[] =>
  list.map((f) => {
    if (f.id === targetId) return { ...f, fields: [...(f.fields ?? []), field] };
    return f.fields ? { ...f, fields: graftField(f.fields, targetId, field) } : f;
  });

/**
 * Re-hangs a field into a group field's own `fields`, at the end, at any
 * depth, through the shared `graftField`. A missing `fields` array on the
 * target starts as `[field]`.
 *
 * `FieldsTab`'s `addField` takes an optional group id and calls this inside
 * the same `mutate` recipe `moveFieldToGroup` sits in, for the rail's
 * "Fields inside this group" zone (design.md: "One add function serves the
 * rail, the start state and the group zone"). The top-level "+ Add field"
 * path appends to `fields` directly and never calls this.
 *
 * Answers the array it was given, unchanged, where `groupId` names no field
 * in the tree.
 */
export function appendToGroup(fields: DraftField[], groupId: string, field: DraftField): DraftField[] {
  const flat = flattenDraftFields(fields);
  if (!flat.some((f) => f.id === groupId)) return fields;

  return graftField(fields, groupId, field);
}

/**
 * Removes the field carrying `fieldId` from the draft's field tree, at any
 * depth, through the shared `pruneField`.
 *
 * `FieldsTab`'s `removeField` calls this (design.md: "Remove selects a
 * sibling, then the group"). Its caller reads `neighbourAfterRemove` first,
 * against the tree this function is about to prune.
 *
 * Answers the array it was given, unchanged, where `fieldId` names no field
 * in the tree.
 */
export function removeFieldIn(fields: DraftField[], fieldId: string): DraftField[] {
  const flat = flattenDraftFields(fields);
  if (!flat.some((f) => f.id === fieldId)) return fields;

  return pruneField(fields, fieldId);
}

/**
 * Every group the field may join, as ids, in rail order.
 *
 * The keyboard's target picker offers exactly this set plus the top level,
 * so it reaches every destination a drop reaches. `moveFieldToGroup` refuses
 * the same three cases this filter drops, and refusing twice is deliberate:
 * the picker must not offer a target the write would then reject.
 *
 * Excludes the field itself, and every group inside it, since a group cannot
 * move into its own subtree. Keeps the current parent, so the picker can
 * show where the field sits today.
 */
export function groupTargetsFor(fields: DraftField[], fieldId: string): string[] {
  const flat = flattenDraftFields(fields);
  const moved = flat.find((f) => f.id === fieldId);
  if (!moved) return [];
  const inside = new Set(flattenDraftFields(moved.fields).map((f) => f.id));
  return flat
    .filter((f) => f.type === "group" && f.id !== undefined && f.id !== fieldId && !inside.has(f.id))
    .map((f) => f.id as string);
}

/**
 * The id a field's move control takes, so the tab can put focus back on it
 * after a move re-orders the list (`spa-accessibility`). Lives here, not in
 * `EntityTabs.tsx`: `FieldCatalogPanel` reads it, and `EntityTabs.tsx`
 * imports `FieldCatalogPanel` (design.md, decision: "One write, one
 * announcement, and focus back on the control").
 */
export const moveControlId = (fieldId: string) => `studio-field-move-${fieldId}`;

/**
 * The id a new field's label input takes, so the tab can focus it after an
 * add lands the field inside a group (`spa-accessibility`). Sits beside
 * `moveControlId`, in its style. `LocalizedTextInput` places it on the label
 * input it renders.
 */
export const fieldLabelInputId = (fieldId: string) => `studio-field-label-${fieldId}`;

/**
 * The id a new field's rail entry takes, so the tab can scroll it into view
 * after an add lands the field inside a group (`spa-accessibility`). Sits
 * beside `moveControlId`, in its style. `PanelsRailFieldRow` places it on
 * the entry's own button.
 */
export const railEntryId = (fieldId: string) => `studio-field-rail-${fieldId}`;

/**
 * The id of the field currently holding `fieldId` as a child — a group, or a
 * parent `changeKind` rewrote out of one — or `undefined` at the top level.
 * `moveTargetsFor` below and `EntityTabs.tsx`'s `moveField` both read this
 * one lookup, so neither can disagree with the other about a field's parent.
 */
export function parentIdOf(fields: DraftField[], fieldId: string): string | undefined {
  return flattenDraftFields(fields).find((f) => (f.fields ?? []).some((c) => c.id === fieldId))?.id;
}

/**
 * Every destination a field's move control offers, plus the group (or
 * non-group parent) holding it today. `undefined` names the top level.
 *
 * `targetIds` orders the top level first, then the current parent when it is
 * no group — a field can sit inside a parent `changeKind` rewrote from a
 * group into something else, and the control's value has to name an option
 * it holds — then every group `groupTargetsFor` returns. `FieldCatalogPanel`'s
 * move control and `EntityTabs.tsx`'s `FieldsTab` read this one function the
 * same way, so the two agree on one shared build (design.md, decision: "One
 * write, one announcement, and focus back on the control").
 */
export function moveTargetsFor(
  fields: DraftField[],
  fieldId: string,
): { currentId: string | undefined; targetIds: (string | undefined)[] } {
  const currentId = parentIdOf(fields, fieldId);
  const groupTargets = groupTargetsFor(fields, fieldId);
  const orphanedParent = currentId !== undefined && !groupTargets.includes(currentId) ? [currentId] : [];
  return { currentId, targetIds: [undefined, ...orphanedParent, ...groupTargets] };
}

/**
 * The id to select after removing `fieldId` from the draft's field tree
 * (design.md: "Remove selects a sibling, then the group"). Reads the tree as
 * it stands before the removal: `FieldsTab`'s `removeField` reads this from
 * its closure before its own `mutate` recipe splices the field out through
 * `removeFieldIn`.
 *
 * A field nested in a group, at any depth: the next field in the same
 * `fields` array, else the previous one, else that group's own id. A
 * top-level field: the next top-level field, else the previous one, else
 * `undefined` — today's rule in `EntityTabs.tsx`'s `removeField(index)`.
 * `undefined` also answers for an id no field carries.
 */
export function neighbourAfterRemove(fields: DraftField[], fieldId: string): string | undefined {
  const locate = (
    list: DraftField[],
    parentId: string | undefined,
  ): { siblings: DraftField[]; parentId: string | undefined } | undefined => {
    if (list.some((f) => f.id === fieldId)) return { siblings: list, parentId };
    for (const f of list) {
      if (f.fields) {
        const found = locate(f.fields, f.id);
        if (found) return found;
      }
    }
    return undefined;
  };

  const located = locate(fields, undefined);
  if (!located) return undefined;

  const { siblings, parentId } = located;
  const index = siblings.findIndex((f) => f.id === fieldId);
  return siblings[index + 1]?.id ?? siblings[index - 1]?.id ?? parentId;
}
