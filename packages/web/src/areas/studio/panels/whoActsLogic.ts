import { t } from "../catalog.js";
import { fieldHasWriter } from "../draft/assignmentConfig";
import { flattenDraftFields, type DraftField } from "../draft/fields";
import { resolveDraftLocalizedText } from "../draft/localized-text";
import { mintCatalogField } from "../draft/mintField";
import type { Draft } from "../draft/types";
import { takenFieldKeys } from "./fieldCatalogLogic.js";
import { fill, numberRepeats } from "./shared/optionText.js";
import type { AssignableGroups } from "./shared/useAssignableGroups.js";

/** One choice of a picker. The empty value is the placeholder and never stands here. */
export interface PickerOption {
  value: string;
  text: string;
}

/**
 * What the group picker draws. `value` is `""` while the placeholder reads.
 * `emptyUnder` keeps the empty sentence under a picker that stands only for a
 * held group. `peopleNote` names the picked group's effect on a person field.
 */
export type GroupPickerState =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "empty" }
  | { kind: "picker"; value: string; options: PickerOption[]; emptyUnder: boolean; peopleNote: boolean };

/**
 * A held id counts as chosen only on the process's own list, since the compile
 * check refuses any other. A chosen id the route omits reads its id, marked.
 */
export function groupPickerState(
  read: AssignableGroups,
  held: unknown,
  allowedGroups: readonly string[] | undefined,
  barePerson: boolean,
): GroupPickerState {
  if (read.status === "loading") return { kind: "loading" };
  if (read.status === "failed") return { kind: "failed", message: read.message };
  const value = typeof held === "string" && held !== "" && allowedGroups?.includes(held) ? held : "";
  if (read.groups.length === 0 && value === "") return { kind: "empty" };
  const names = numberRepeats(read.groups, (g) => g.name);
  const options: PickerOption[] = read.groups.map((g, i) => ({ value: g.groupId, text: names[i]! }));
  if (value !== "" && !read.groups.some((g) => g.groupId === value)) {
    options.unshift({ value, text: fill(t("whoActs.groupNotOffered"), { id: value }) });
  }
  return { kind: "picker", value, options, emptyUnder: read.groups.length === 0, peopleNote: value !== "" && barePerson };
}

/** What the person-field picker draws. `value` is `""` while the placeholder reads. */
export interface PersonPickerState {
  value: string;
  options: PickerOption[];
  /** The step holds a field for several people, which reaches nobody. */
  severalNote: boolean;
  /** The step holds a single-person field no source writes. */
  unwrittenNote: boolean;
}

const isSinglePerson = (f: DraftField) => f.format === "person" && f.type !== "list";
const isPeopleList = (f: DraftField) => f.format === "person" && f.type === "list";

/**
 * The single-person fields by label, nested ones included. A held list field
 * joins them, marked. Any other held id reads as the placeholder, so no id
 * stands on screen.
 */
export function personPickerState(
  draft: Draft,
  held: unknown,
  stepId: string,
  contentLocale: string,
  baseLocale: string,
): PersonPickerState {
  const fields = flattenDraftFields(draft.fields).filter((f) => f.id !== undefined);
  const listed = fields.filter((f) => isSinglePerson(f) || (f.id === held && isPeopleList(f)));
  const labels = numberRepeats(
    listed,
    (f) => resolveDraftLocalizedText(f.label, contentLocale, baseLocale)?.trim() || t("condition.unnamedField"),
  );
  const options = listed.map((f, i): PickerOption => ({
    value: f.id as string,
    text: isPeopleList(f) ? fill(t("whoActs.fieldSeveral"), { label: labels[i]! }) : labels[i]!,
  }));
  const chosen = listed.find((f) => f.id === held);
  if (chosen === undefined) return { value: "", options, severalNote: false, unwrittenNote: false };
  const value = chosen.id as string;
  const severalNote = isPeopleList(chosen);
  return { value, options, severalNote, unwrittenNote: !severalNote && !fieldHasWriter(draft, value, stepId) };
}

/** Whether the inline name can add a field. */
export function canAddField(name: string): boolean {
  return name.trim() !== "";
}

/** The field the inline name adds, minted outside the recipe since `mintId` is random. */
export function mintPersonField(draft: Draft, name: string, contentLocale: string, baseLocale: string): DraftField {
  return mintCatalogField("person", { [contentLocale]: name.trim() }, baseLocale, takenFieldKeys(draft));
}
