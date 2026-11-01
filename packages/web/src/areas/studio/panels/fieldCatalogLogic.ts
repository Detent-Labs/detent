import type { FieldControl, FieldFormat } from "workflow-engine/schema";
import { t, type CatalogKey } from "../catalog.js";
import { deriveKey, dedupeKey, shouldAutoDeriveKey } from "../draft/deriveKey.js";
import { draftFields, flattenDraftFields, type DraftField } from "../draft/fields.js";
import { resolveDraftLocalizedText, type DraftLocalizedText } from "../draft/localized-text.js";
import { countKeyReaders, readKeys } from "../draft/key-readers.js";
import { flattenRailFields } from "../draft/panel-rail.js";
import type { Draft } from "../draft/types.js";

/**
 * A field's label edit's whole key decision (design.md: "Extract the
 * field-key decision"), the same shape as `stepsPanelLogic.ts::nextStepKey`
 * and for the same reason — base-locale resolution, the lock check against
 * the prior derivation, and catalog-wide dedup all compose in one function.
 * Called from `labelChangePatch` and `view-group-sync.ts::writeGroupLabel`,
 * for a field at any nesting depth, since `FieldDef.key` is one flat CEL
 * namespace regardless of depth.
 *
 * `taken` is the set the key must step past, excluding the field being
 * edited: `takenFieldKeys` for a field that is not a `group`.
 *
 * The prior derivation is deduped against `taken` too, so a key that took a
 * `_2` suffix beside another field's key still reads as derived and keeps
 * following the label. So does the prior derivation with any `_<n>` suffix:
 * the field that forced the suffix may have taken another key since.
 * (`deriveKey` yields `[a-z0-9_]` only, so the pattern needs no escaping.)
 *
 * `locked` is the caller's verdict that a published version holds the field
 * (`isFieldKeyLocked`). It stops auto-fill for a non-empty key, even while
 * the key equals the prior derivation. An empty key has no publication, so it
 * derives regardless.
 *
 * `currentKeyRead` says a CEL expression reads `currentKey`. A prior label
 * that derives no key then counts the current key as derived, while the new
 * base label derives a non-empty key: `labelChangePatch` kept that key
 * through the empty label for its readers, and it follows again here.
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
  locked = false,
  currentKeyRead = false,
): string | undefined {
  if (locked && currentKey !== "") return undefined;
  const priorBase = deriveKey(resolveDraftLocalizedText(priorLabel, baseLocale, baseLocale) ?? "");
  const newDerived = deriveKey(resolveDraftLocalizedText(newLabel, baseLocale, baseLocale) ?? "");
  const priorSuffixed = priorBase !== "" && new RegExp(`^${priorBase}_[0-9]+$`).test(currentKey);
  const priorEmptyHeld = currentKeyRead && priorBase === "" && newDerived !== "";
  if (!shouldAutoDeriveKey(currentKey, dedupeKey(priorBase, taken)) && !priorSuffixed && !priorEmptyHeld) return undefined;

  return dedupeKey(newDerived, taken);
}

/**
 * Whether a label change may no longer set `field`'s key: the draft's base
 * version holds a field with the same `id`. A CEL expression that reads the
 * key does not lock it, since a key change rewrites its readers. `published`
 * is `usePublishedFieldIds()`'s value, and `undefined` (the base version not
 * read yet, or its read failed) counts every field that has an `id` as
 * published, the safe side. A field with no `id` is not published. A `group`
 * field sits outside the lock.
 */
export function isFieldKeyLocked(field: DraftField, published: ReadonlySet<string> | undefined): boolean {
  if (field.type === "group" || field.id === undefined) return false;
  return published === undefined || published.has(field.id);
}

/** The words CEL reads as a literal, so `data.<word>` cannot name a field. */
export const CEL_LITERAL_KEYS: ReadonlySet<string> = new Set(["in", "true", "false", "null"]);

/**
 * The keys a derived key steps past, for the field carrying `exceptId` or a
 * field about to be minted (`exceptId` `undefined`). Three parts:
 *
 * - every other field's non-empty key, at any depth;
 * - each key an expression reads (`readKeys`) that no field carries, so a
 *   label typed through it cannot capture its readers;
 * - the CEL literal words, `CEL_LITERAL_KEYS`.
 *
 * The last two parts apply to a field that is not a `group`. `group` names
 * whether the field is one, and defaults to `false`. A mint has no field in
 * the draft yet, so with `exceptId` `undefined` every field counts, a field
 * with no id included. A key-less field adds nothing, so a label beside one
 * does not derive `_2`.
 */
export function takenFieldKeys(draft: Draft, exceptId?: string, group = false): Set<string> {
  const fields = draftFields(draft);
  const others = exceptId === undefined ? fields : fields.filter((f) => f.id !== exceptId);
  const taken = new Set(others.map((f) => f.key ?? "").filter((key) => key !== ""));
  if (group) return taken;
  const carried = new Set(fields.map((f) => f.key ?? ""));
  for (const key of readKeys(draft)) if (!carried.has(key)) taken.add(key);
  for (const word of CEL_LITERAL_KEYS) taken.add(word);
  return taken;
}

/**
 * The patch a label change writes to a field that is not a `group`: the new
 * label, plus the key `nextFieldKey` derives while the lock leaves auto-fill
 * live, against `takenFieldKeys`. A label that derives an empty key keeps the
 * current key while an expression reads it, since its readers would otherwise
 * read `data.` with no name. A key nothing reads follows to empty.
 *
 * The patch moves the key and nothing else. `draft/fieldLabel.ts::writeFieldLabel`
 * also rewrites the readers of the old key. A group's label goes through
 * `view-group-sync.ts::writeGroupLabel` instead, which rewrites the view
 * entries naming its key.
 */
export function labelChangePatch(
  draft: Draft,
  field: DraftField,
  label: DraftField["label"],
  baseLocale: string,
  published: ReadonlySet<string> | undefined,
): Partial<DraftField> {
  const current = field.key ?? "";
  // A locked non-empty key never moves (`nextFieldKey`'s first check), so the
  // two draft walks below would decide nothing.
  const locked = isFieldKeyLocked(field, published);
  if (locked && current !== "") return { label };
  const read = countKeyReaders(draft, current) > 0;
  const taken = takenFieldKeys(draft, field.id, false);
  const derivedKey = nextFieldKey(current, field.label, label, baseLocale, taken, locked, read);
  if (derivedKey === undefined || (derivedKey === "" && read)) return { label };
  return { label, key: derivedKey };
}

/** The grammar a published `FieldDef.key` takes (`compile.ts::checkFieldKeyFormat`). */
const FIELD_KEY_GRAMMAR = /^[a-z_][a-z0-9_]*$/;

/**
 * Why a key commit of `typed` onto `field` cannot work, or `undefined` when it
 * can. Checked in order: `"empty"` for no text, `"grammar"` for text outside
 * `FIELD_KEY_GRAMMAR`, `"literal"` for a word CEL reads as a literal, and
 * `"taken"` for a key another field carries. A key only an expression reads
 * is not taken here: the commit binds those readers to the field on purpose,
 * which repairs a dangling guard. A `group` answers `undefined` always, since
 * its key keeps the group rule (`view-group-sync.ts::writeGroupKey`).
 */
export function keyCommitProblem(
  draft: Draft,
  field: DraftField,
  typed: string,
): KeyCommitProblem | undefined {
  if (field.type === "group") return undefined;
  if (typed === "") return "empty";
  if (!FIELD_KEY_GRAMMAR.test(typed)) return "grammar";
  if (CEL_LITERAL_KEYS.has(typed)) return "literal";
  if (keyHolder(draft, field, typed) !== undefined) return "taken";
  return undefined;
}

/** The field other than `field` that carries `key`, at any depth, or `undefined`. */
export function keyHolder(draft: Draft, field: DraftField, key: string): DraftField | undefined {
  return draftFields(draft).find((f) => f.id !== field.id && f.key === key);
}

/**
 * The name the taken refusal gives the field that carries `key`: its label at
 * `contentLocale`, else at the base locale, else "(unnamed field)". The empty
 * string when no other field carries `key`.
 */
export function keyHolderName(draft: Draft, field: DraftField, key: string, contentLocale: string): string {
  const holder = keyHolder(draft, field, key);
  if (holder === undefined) return "";
  const baseLocale = draft.baseLocale ?? "en";
  return resolveDraftLocalizedText(holder.label, contentLocale, baseLocale)?.trim() || t("panelsScreen.unnamedField");
}

/**
 * Whether `field`'s key still follows its label: the key is empty, or reads
 * as the base-locale label's derivation, plain or with the `_<n>` suffix a
 * dedupe adds. Under a label that derives no key, the key follows while an
 * expression reads it, since `labelChangePatch` held that key for its readers
 * and the next label moves it. The answer ignores the lock; the caller reads
 * `isFieldKeyLocked` first.
 */
export function keyFollowsLabel(draft: Draft, field: DraftField): boolean {
  const key = field.key ?? "";
  if (key === "") return true;
  const baseLocale = draft.baseLocale ?? "en";
  const base = deriveKey(resolveDraftLocalizedText(field.label, baseLocale, baseLocale) ?? "");
  if (base === "") return field.type !== "group" && countKeyReaders(draft, key) > 0;
  return key === base || new RegExp(`^${base}_[0-9]+$`).test(key);
}

/** What happens to a key input: the author types, blur or Enter commits, or
 * Escape drops the typed text. */
export type KeyInputEvent = { kind: "type"; text: string } | { kind: "commit" } | { kind: "escape" };

/**
 * One step of a key input. It holds the typed text until a commit, and
 * `typed` is `undefined` while the input shows the field's own key. Typing
 * only changes the text, and a commit hands back the key to write: `write`
 * is `undefined` when nothing was typed or the text equals `currentKey`. A
 * commit clears the typed text, so the blur that follows an Enter writes
 * nothing. Escape clears it too and writes nothing.
 */
export function keyInputStep(
  typed: string | undefined,
  event: KeyInputEvent,
  currentKey: string,
): { typed: string | undefined; write?: string } {
  if (event.kind === "type") return { typed: event.text };
  if (event.kind === "escape" || typed === undefined || typed === currentKey) return { typed: undefined };
  return { typed: undefined, write: typed };
}

/** Why a key commit cannot work (`keyCommitProblem`). */
export type KeyCommitProblem = "empty" | "grammar" | "literal" | "taken";

const KEY_REFUSAL: Record<KeyCommitProblem, CatalogKey> = {
  empty: "fieldCatalog.keyEmpty",
  grammar: "fieldCatalog.keyGrammar",
  literal: "fieldCatalog.keyLiteral",
  taken: "fieldCatalog.keyTaken",
};

/** The sentence a refused key commit shows under the key input. `holder`
 * names the field that carries the key, for the taken refusal
 * (`keyHolderName`). */
export const keyRefusalFor = (problem: KeyCommitProblem, holder = ""): string =>
  t(KEY_REFUSAL[problem]).replace("{field}", () => holder);

/**
 * The sentence in a field's Developer view on where its key comes from, or
 * `undefined` for none. `published` says the draft's base version holds the
 * field, and is `undefined` while the base version loads. `follows` is
 * `keyFollowsLabel`'s answer. Publication wins over following. An empty key
 * shows nothing.
 */
export function keyNoticeFor(key: string, published: boolean | undefined, follows: boolean): string | undefined {
  if (key === "" || published === undefined) return undefined;
  if (published) return t("fieldCatalog.keyPublished");
  return t(follows ? "fieldCatalog.keyFollows" : "fieldCatalog.keyByHand");
}

/**
 * The line under a field's label row after a key change, or the empty string
 * while no write has rewritten an expression. `count` is the number of
 * expressions the last such write rewrote.
 */
export function rewriteLineFor(count: number | undefined): string {
  if (count === undefined || count < 1) return "";
  if (count === 1) return t("fieldCatalog.rewroteOne");
  return t("fieldCatalog.rewroteMany").replace("{count}", () => String(count));
}

/** The rewrite line's state: the count `rewriteLineFor` reads, and how many
 * writes rewrote an expression. The line's text node is keyed on `write`. */
export interface RewriteLineState {
  count: number | undefined;
  write: number;
}

/**
 * The rewrite line after a write that rewrote `rewrote` expressions. A write
 * that rewrote none leaves the state as it was. Any other write takes a new
 * `write`, so the line's text node is replaced and a screen reader announces
 * a second write with the same count too.
 */
export function nextRewriteLine(state: RewriteLineState, rewrote: number): RewriteLineState {
  if (rewrote < 1) return state;
  return { count: rewrote, write: state.write + 1 };
}

/** The id a field's key notice takes, so its key input names it in `aria-describedby`. */
export const fieldKeyNoticeId = (fieldId: string) => `studio-field-key-notice-${fieldId}`;

/** The id a refused key commit's sentence takes, for the same reason. */
export const fieldKeyRefusalId = (fieldId: string) => `studio-field-key-refusal-${fieldId}`;

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
 * function's own result. `view-group-sync.ts::moveFieldAndSyncViews` is that
 * caller: it runs this function, then `syncViewGroupsOnFieldMove`, inside the
 * one `mutate` that `EntityTabs.tsx`'s `moveField` opens. `moveField` calls
 * this function once before that, only to skip a refused move. Widening this
 * function to take the whole draft and do that rewrite itself would give the
 * rail's pure tree function a second job (design.md: "One helper keeps the
 * view entries level with the catalog").
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
 * The recursive rebuild `moveFieldToGroup` and `removeFieldIn` share for
 * dropping a field: it filters the field carrying `targetId` out of the tree,
 * at any depth. Every field holding a `fields` array becomes a new object; a
 * leaf keeps its reference. Not exported; each caller carries its own
 * existence check and its own no-op case.
 */
const pruneField = (list: DraftField[], targetId: string): DraftField[] =>
  list.filter((f) => f.id !== targetId).map((f) => (f.fields ? { ...f, fields: pruneField(f.fields, targetId) } : f));

/**
 * The recursive rebuild `moveFieldToGroup` and `appendToGroup` share for
 * hanging a field: `field` lands at the end of the `fields` array belonging
 * to whichever field in the tree carries `targetId`. The target becomes a new
 * object, and so does every field holding a `fields` array outside the
 * target's own subtree. Every other leaf, and every field below the target,
 * keeps its reference. Not exported; each caller carries its own existence
 * check and its own no-op case.
 */
const graftField = (list: DraftField[], targetId: string, field: DraftField): DraftField[] =>
  list.map((f) => {
    if (f.id === targetId) return { ...f, fields: [...(f.fields ?? []), field] };
    return f.fields ? { ...f, fields: graftField(f.fields, targetId, field) } : f;
  });

/**
 * Appends `field` to the `fields` of the field carrying `groupId`, at any
 * depth, through the shared `graftField`. A missing `fields` array on that
 * field starts as `[field]`.
 *
 * The "Fields inside this group" zone in a group's `FieldEditor` reaches this
 * through `FieldsTab::addField`, in its own `mutate` recipe (design.md: "One
 * add function serves the rail, the start state and the group zone"). An add
 * without a group id appends to `fields` directly and never calls this.
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
 * `draft/field-removal.ts::removeFieldAndReferences` runs this as its last
 * write, once every id reference to a removed field outside a plugin `config`
 * is gone (design.md, decision: "One recipe collects, then cleans, then
 * prunes").
 * `focusAfterRemove` reads its answer, a new tree, for the rail entries a
 * removal keeps.
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
 * The id a field's Remove field control takes. `FieldsTab` points the removal
 * dialog's trigger ref at that control, so a declined removal hands focus
 * back to it (design.md, decision: "The tab renders the dialog, and focus
 * follows the removal"). Sits beside `moveControlId`, in its style.
 * `FieldEditor` places it on the control.
 */
export const removeControlId = (fieldId: string) => `studio-field-remove-${fieldId}`;

/**
 * The id a field's label input takes, so the tab can focus a new field's
 * label after any add (`spa-accessibility`). Sits beside `moveControlId`, in
 * its style. `LocalizedTextInput` places it on the label input it renders.
 */
export const fieldLabelInputId = (fieldId: string) => `studio-field-label-${fieldId}`;

/**
 * The id a field's rail entry takes, so the tab can scroll it into the rail's
 * view after an add or a move through the move control (`spa-accessibility`),
 * and focus it after a removal (`focusAfterRemove`). Sits beside
 * `moveControlId`, in its style. `PanelsRailFieldRow` places it on the
 * entry's own button.
 */
export const railEntryId = (fieldId: string) => `studio-field-rail-${fieldId}`;

/**
 * The id the start state's first-field control (`fieldCatalog.addFirstField`)
 * takes, so the tab can focus it after a removal leaves the entity rail with
 * no entry (`focusAfterRemove`). The start state renders one such control, so
 * the id names no field.
 */
export const ADD_FIRST_FIELD_ID = "studio-field-add-first";

/**
 * The id of the field currently holding `fieldId` as a child — a group, or a
 * parent `changeKind` rewrote out of one — or `undefined` at the top level.
 * `moveTargetsFor` below, and `FieldsTab`'s `moveField` and its rail loop in
 * `EntityTabs.tsx`, all read this one lookup, so none of them can disagree
 * about a field's parent.
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
 * its closure before its `mutate` recipe runs `removeFieldAndReferences`.
 * `focusAfterRemove` hands keyboard focus to the answer's rail entry.
 *
 * A field nested in a group, at any depth: the next field in the same
 * `fields` array, else the previous one, else that group's own id. A
 * top-level field: the next top-level field, else the previous one, else
 * `undefined`. `undefined` also answers for an id no field carries.
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

/**
 * The id of the element that takes keyboard focus once `fieldId` leaves the
 * draft's field tree (design.md, decision: "The tab renders the dialog, and
 * focus follows the removal"). Reads the tree as it stands before the
 * removal, the way `neighbourAfterRemove` does.
 *
 * The rail entry of the field `neighbourAfterRemove` selects. Else the first
 * rail entry the pruned tree keeps, the entry `FieldsTab` selects when no
 * other selection resolves: the neighbour rule answers nothing where neither
 * adjacent sibling nor the parent carries an id, and the rail lists no field
 * without one. Else `ADD_FIRST_FIELD_ID`, since a tree with no rail entry
 * opens the start state.
 */
export function focusAfterRemove(fields: DraftField[], fieldId: string): string {
  const neighbour = neighbourAfterRemove(fields, fieldId);
  if (neighbour !== undefined) return railEntryId(neighbour);
  const first = flattenRailFields(removeFieldIn(fields, fieldId))[0];
  return first === undefined ? ADD_FIRST_FIELD_ID : railEntryId(first.id);
}

/**
 * The sentence the Fields tab's live region announces for a removal
 * (design.md, "Announcements and the live region's name"). `label` is the
 * removed field's label as the entity rail resolves it, fallback included;
 * `fieldsInside` is its `fieldRemovalReach` count, so a plain field (zero)
 * reads apart from a group that took fields with it.
 *
 * One key per case under `panelsScreen`, matching the shape brief's copy
 * table: the bare form at zero, the singular at one, the plural above one.
 * `{count}` fills before `{field}`, so a label holding the text `{count}`
 * reads as the author typed it. Each fill passes a replacer function, so
 * `String.prototype.replace` expands no `$` pattern: a label holding `$&`
 * reads as the author typed it too.
 */
export function removalAnnouncement(label: string, fieldsInside: number): string {
  if (fieldsInside === 0) return t("panelsScreen.fieldRemoved").replace("{field}", () => label);
  if (fieldsInside === 1) return t("panelsScreen.fieldRemovedWithOne").replace("{field}", () => label);
  return t("panelsScreen.fieldRemovedWithMany")
    .replace("{count}", () => String(fieldsInside))
    .replace("{field}", () => label);
}

/** The controls that offer a participant a list to pick from. */
const PICKER_CONTROLS: ReadonlySet<string> = new Set(["select", "radio", "checkboxes"]);

/**
 * Whether the field card draws its Choices section (design.md D1). It does
 * for a picker control, for a `string` or `list` field with no `format`, and
 * for any field already carrying `options` or a `dataSource`. A date, an
 * email or a person field with neither draws none, and neither does a group.
 */
export function showsChoices(field: Pick<DraftField, "type" | "format" | "control" | "options" | "dataSource">): boolean {
  if (field.control !== undefined && PICKER_CONTROLS.has(field.control)) return true;
  if ((field.options?.length ?? 0) > 0 || field.dataSource !== undefined) return true;
  return (field.type === "string" || field.type === "list") && field.format === undefined;
}
