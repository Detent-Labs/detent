import type { Step } from "workflow-engine/schema";
import type { Draft, DraftOf } from "../draft/types.js";
import type { DraftField } from "../draft/fields.js";
import type { EditorIssue } from "../draft/issues.js";
import { flattenDraftFields } from "../draft/fields.js";
import { isDraftViewField, type DraftViewEntry } from "../draft/view-layout.js";
import { resolveDraftLocalizedText } from "../draft/localized-text.js";
import { roleStampFor, type StepRole } from "../draft/roleStamp.js";
import { t } from "../catalog.js";

type DraftStep = DraftOf<Step>;

/**
 * One mark of a card's miniature: a field entry's own bar, or a group
 * entry's group break in its place (`studio-forms-overview`: "A card carries
 * a miniature of its form"). Drawn without a label — the miniature stands
 * for the form's shape, not its content.
 *
 * `height` is the mark's own height in pixels, from the field's kind alone,
 * so a long-text field reads taller than a one-line field without the card
 * drawing a single real control. On a group break `height` is the group
 * break's own fixed height, not a field kind's.
 */
export interface MiniatureEntry {
  /** The entry's index in `view.fields`, the miniature's React key. */
  index: number;
  /** True where this entry is a group entry: it draws a group break, not a
   * mark. */
  groupBreak: boolean;
  height: number;
  required: boolean;
}

/** The group break's own fixed height, in pixels — a group opens a section
 * of the form, not a field of its own, so it draws at one height regardless
 * of any field kind. */
const GROUP_BREAK_HEIGHT = 24;

/** One plate on the Forms tab: everything the card prints, resolved. */
export interface FormCardRow {
  stepId: string;
  /** The step's own name, or its key, or the unnamed-step string. */
  label: string;
  /** The kicker's subject — the step's role, worded by `stepRole.*`. */
  role: StepRole;
  /** Field entries alone. A note occupies no catalog row and raises none. */
  fieldCount: number;
  /** How many of `entries`, group breaks aside, declare `required: true` —
   * the miniature's accessible name states this beside `fieldCount`. */
  requiredCount: number;
  entries: MiniatureEntry[];
  /** The open issues naming this step's view, and whether any refuses a
   * publish. `count` at zero draws no badge. */
  issues: { count: number; blocker: boolean };
}

/**
 * The mark height one field entry draws, in pixels, on the 4-point scale
 * `design-language.md` fixes.
 *
 * Four heights and no fifth: 8 for a checkbox, 12 for a one-line field, 16
 * for a choice — a `radio` or `checkboxes` control, or a `list` field — and
 * 24 for long text. A field the catalog no longer declares takes the
 * one-line height: the entry still stands in the view, and the card's own
 * badge is what reports the unresolved reference. A group entry never
 * reaches this function; it draws a group break instead.
 */
export function miniatureBarHeight(field: DraftField | undefined): number {
  if (field === undefined) return 12;
  if (field.control === "multiline") return 24;
  if (field.control === "radio" || field.control === "checkboxes" || field.type === "list") return 16;
  if (field.type === "boolean") return 8;
  return 12;
}

/** True where an issue's location names the step's view rather than anything
 * else the step declares. Both the studio's own `view` findings and the
 * schema's unresolved-reference issue carry a `view` segment in their `loc`,
 * and both resolve to the step that holds the view. */
function namesTheView(loc: string): boolean {
  return /(^|\.)view(\[|\.|$)/.test(loc);
}

/**
 * The open issues naming one step's view (`studio-forms-overview`: "A card
 * reports its step's form issues").
 *
 * `blocker` is true where any of them refuses a publish. The studio's own
 * `view` source never does; every other source is an engine validator, so an
 * unresolved view reference blocks — the same rule the steps rail's own badge
 * already applies to a whole step.
 */
export function viewIssues(issues: readonly EditorIssue[], stepId: string): { count: number; blocker: boolean } {
  const mine = issues.filter((i) => i.entityId === stepId && namesTheView(i.loc));
  return { count: mine.length, blocker: mine.some((i) => i.source !== "view") };
}

/**
 * Every plate the Forms tab lays out, in the draft's own `workflow.steps`
 * order, the same order the steps rail lists (`studio-forms-overview`: "The
 * Forms tab carries one card per step that asks for something").
 *
 * A step declaring no view contributes no row. A step declaring an empty view
 * does contribute one: an empty form is a state an author has to see, and the
 * card marks it.
 *
 * Pure. Nothing here mutates and nothing here renders, so a unit test drives
 * the order, the counts and the miniature without a DOM.
 */
export function formCardRows(draft: Draft, issues: readonly EditorIssue[], contentLocale: string): FormCardRow[] {
  const baseLocale = draft.baseLocale ?? "en";
  const byId = new Map(
    flattenDraftFields(draft.fields).filter((f) => f.id !== undefined).map((f) => [f.id!, f]),
  );
  const initialStep = draft.workflow?.initialStep;

  const rowFor = (step: DraftStep): FormCardRow | undefined => {
    if (step.id === undefined || step.view === undefined) return undefined;
    const viewEntries: DraftViewEntry[] = step.view.fields ?? [];
    const marks = viewEntries
      .map((entry, index) => miniatureEntry(entry, index, byId))
      .filter((entry): entry is MiniatureEntry => entry !== undefined);
    return {
      stepId: step.id,
      label: resolveDraftLocalizedText(step.label, contentLocale, baseLocale) || step.key || t("steps.unnamedStep"),
      role: roleStampFor(step, initialStep).role,
      fieldCount: viewEntries.filter(isDraftViewField).length,
      requiredCount: marks.filter((m) => !m.groupBreak && m.required).length,
      entries: marks,
      issues: viewIssues(issues, step.id),
    };
  };

  return (draft.workflow?.steps ?? [])
    .map(rowFor)
    .filter((row): row is FormCardRow => row !== undefined);
}

/** A note draws no mark, so it yields `undefined` here — `formCardRows`
 * drops it from `entries`. A group entry draws a group break in place of a
 * mark, at the group break's own fixed height. */
function miniatureEntry(entry: DraftViewEntry, index: number, byId: Map<string, DraftField>): MiniatureEntry | undefined {
  if (!isDraftViewField(entry)) return undefined;
  const field = entry.ref === undefined ? undefined : byId.get(entry.ref);
  const groupBreak = field?.type === "group";
  return {
    index,
    groupBreak,
    height: groupBreak ? GROUP_BREAK_HEIGHT : miniatureBarHeight(field),
    required: entry.required === true,
  };
}
