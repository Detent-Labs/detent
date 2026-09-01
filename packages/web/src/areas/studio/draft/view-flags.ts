import { computeDominatorSets, dominates } from "workflow-engine/schema/step-graph";
import type { Action } from "workflow-engine/schema";
import type { Draft, DraftOf } from "./types";
import { isDraftViewField, type DraftViewField } from "./view-layout";
import type { DraftField } from "./fields";
import { flattenDraftFields } from "./fields";
import type { EditorIssue } from "./issues";
import type { BoolOrExpr } from "../panels/shared/overrideMode";

export type FlagKey = "visible" | "required" | "readonly";

/** The engine's own three defaults for an absent view-flag key.
 * `resolveFields` (`src/runtime/api.ts`) reads a missing `visible` as true and
 * a missing `required`/`readonly` as false — the same call that turns a view
 * entry into what a participant sees. */
export const FLAG_DEFAULT: Record<FlagKey, boolean> = {
  visible: true,
  required: false,
  readonly: false,
};

/** What the engine resolves for `key`, given the raw value a view entry
 * carries for it: the engine's default for an absent key (`undefined`), the
 * value itself otherwise, expression included. A bare value is enough —
 * reading an absent key off a draft entry already yields `undefined` in JS,
 * so an entry-typed parameter would collapse to the same check. */
export function effectiveFlag(value: BoolOrExpr, key: FlagKey): BoolOrExpr {
  return value === undefined ? FLAG_DEFAULT[key] : value;
}

function isGroupField(f: DraftField | undefined): boolean {
  return typeof f?.type === "string" && f.type === "group";
}

/**
 * Writes `key` to `next` on a copy of `entry`, deleting the key instead of
 * writing it where `next` is the engine's own default (or `undefined`, the
 * mode select's CEL-arm write) — the same in-memory shape a view entry
 * authored before this change already has. A patch (`{ ...entry, key: next
 * }`) cannot delete a key: `visible: undefined` still satisfies `"visible" in
 * entry`, so the JSON surface would show a key the author cleared. See
 * design.md decision 2.
 *
 * Setting `visible` to literal `false` also deletes `required` and
 * `readonly` on the same call (design.md decision 3): one writer for the
 * gate, so the form editor and a future field matrix cannot produce a gated
 * pair between them.
 */
export function setFlag(entry: DraftViewField, key: FlagKey, next: BoolOrExpr): DraftViewField {
  const out = { ...entry };
  if (next === undefined || next === FLAG_DEFAULT[key]) {
    delete out[key];
  } else {
    out[key] = next;
  }
  if (key === "visible" && next === false) {
    delete out.required;
    delete out.readonly;
  }
  return out;
}

/**
 * Every field id some source in the draft writes, GUARANTEED before a given
 * step is submitted — a per-`(fieldId, ownStepIndex)` accessor, since
 * dominance is inherently step-relative (an entry at `start` can dominate
 * `middle` and `end` without the reverse holding). Returns `Infinity` for a
 * body-wide structural writer (a `contract.inputFields` entry, a
 * `columnMapping` target, or a step-scoped structural writer — action
 * output, subprocess `outputMapping` — whose own step dominates
 * `ownStepIndex`), the count of OTHER, dominating steps' editable view
 * entries otherwise, `0` for none.
 *
 * A step-scoped writer counts only when its own step dominates
 * `ownStepIndex` (self included — a step dominates itself), computed once
 * per draft via the same `step-graph.ts` dominance helper the compile
 * pass's `checkUnsatisfiableRequiredReadonly` uses
 * (`workflow-engine/schema/step-graph`), so the two can never disagree about
 * which step guarantees a value first (gate-required-readonly-reachability's
 * design.md).
 *
 * On the entry's OWN step: an action's `onEntry` output always counts;
 * `onExit`/`onPath`/`onCancel` never do, since they fire only after the
 * submission gate they cannot help (mirroring `computeWriterSet`'s `!own`
 * guard, `src/schema/compile.ts`); a timer's `onFire` output counts only
 * when that timer declares a `targetPath` — a plain reminder timer is not
 * guaranteed to fire before the participant resubmits. `subprocess.
 * outputMapping` carries no own-step exclusion: it commits at the
 * subprocess step's own spawn/return, not gated by a participant submission.
 * An editable OTHER-step view entry (`visible !== false`, `readonly !==
 * true`) counts only when that step, other than `ownStepIndex` itself,
 * dominates it.
 *
 * Two documented divergences from the engine's own `computeWriterSet` stay:
 * `columnMapping`'s target counts unconditionally, body-wide, regardless of
 * where — or whether — the mapping field is placed editable in the draft
 * (past the dominance test the two share for every OTHER step-scoped case);
 * the engine additionally counts a literal catalog `default`, which the
 * studio does not (design.md § Decisions).
 *
 * Shared by `checkViewFlags`'s own finding, the field matrix's flagged-cell
 * marker (`panels/fieldMatrixLogic.ts`), and `gatedKeys`, so none of the
 * three can disagree about what "already written" means (design.md decision
 * 5, `field-matrix-toolbar-and-inline-editing`; decision 2,
 * `gate-required-readonly-conflict`).
 */
export type WrittenAccessor = (fieldId: string, ownStepIndex: number) => number;

export function writtenFieldCounts(body: Draft): WrittenAccessor {
  const steps = body.workflow?.steps ?? [];
  const dom = computeDominatorSets(steps, body.workflow?.initialStep);
  const fieldsById = new Map(flattenDraftFields(body.fields).map((f) => [f.id, f]));

  const contractWritten = new Set<string>();
  for (const id of body.contract?.inputFields ?? []) {
    if (id) contractWritten.add(id);
  }
  const columnMappingWritten = new Set<string>();
  for (const field of fieldsById.values()) {
    for (const target of Object.values(field.columnMapping ?? {})) {
      if (typeof target === "string") columnMappingWritten.add(target);
    }
  }

  return (fieldId: string, ownStepIndex: number): number => {
    if (contractWritten.has(fieldId) || columnMappingWritten.has(fieldId)) return Infinity;

    const ownStepId = steps[ownStepIndex]?.id;
    let editableCount = 0;
    let structural = false;

    for (const [si, step] of steps.entries()) {
      const own = si === ownStepIndex;
      const stepDominatesOwn = own || dominates(dom, step.id, ownStepId);

      if (stepDominatesOwn) {
        const addOutputs = (actions: DraftOf<Action>[] | undefined) => {
          for (const action of actions ?? []) {
            if (action?.output && fieldId in action.output) structural = true;
          }
        };
        addOutputs(step.onEntry);
        if (!own) {
          addOutputs(step.onExit);
          addOutputs(step.onCancel);
          for (const p of step.paths ?? []) addOutputs(p?.onPath);
        }
        for (const t of step.timers ?? []) {
          if (own && typeof t?.onFire?.targetPath !== "string") continue;
          addOutputs(t?.onFire?.actions);
        }
        if (step.subprocess?.outputMapping && fieldId in step.subprocess.outputMapping) structural = true;
      }

      if (!own && stepDominatesOwn) {
        for (const entry of (step.view?.fields ?? []).filter(isDraftViewField)) {
          if (entry.ref !== fieldId) continue;
          if (isGroupField(fieldsById.get(entry.ref))) continue;
          if (entry.visible === false || entry.readonly === true) continue;
          editableCount += 1;
        }
      }
    }

    return structural ? Infinity : editableCount;
  };
}

/** `writtenFieldCounts`'s accessor, collapsed to a per-step boolean:
 * whether a source OTHER than `entry` itself writes `entry`'s field,
 * guaranteed before `ownStepIndex`. The accessor already excludes `entry`'s
 * own step from the editable-entry count (a step never counts as an "other"
 * writer of itself under the dominance rule), so no self-subtraction is
 * needed here the way the old flat, non-step-aware version required. */
function writtenByOther(entry: DraftViewField, written: WrittenAccessor, ownStepIndex: number): boolean {
  if (!entry.ref) return false;
  return written(entry.ref, ownStepIndex) > 0;
}

/** Which controls the entry's current state disables right now, for the
 * step at `ownStepIndex` (the entry's own step).
 *
 * A technical field's entry gates both `required` and `readonly`
 * unconditionally: the definition contract rejects either key on a
 * technical field's view entry, so no builder control may leave a path to
 * set one (technical-field-marker design.md). This overrides the
 * both-flags escape below — a technical field stays gated even where its
 * entry already carries both flags.
 *
 * A literal `visible: false` disables both other flags, since the engine
 * never resolves them for a hidden field. A `visible` holding a CEL
 * expression gates nothing: nobody can read its value without an instance.
 *
 * Where nothing besides `entry` itself, guaranteed before `ownStepIndex`,
 * already writes the entry's field (`writtenByOther`), `required` and
 * `readonly` gate each other, but only one way: checking one disables the
 * other only while the other does not already read `true`. An entry that
 * already carries both stays fully editable, so an author can always
 * uncheck out of that state (design.md decision 1,
 * `gate-required-readonly-conflict`).
 */
export function gatedKeys(
  entry: DraftViewField,
  written: WrittenAccessor,
  technicalFieldIds: Set<string>,
  ownStepIndex: number,
): FlagKey[] {
  if (entry.ref !== undefined && technicalFieldIds.has(entry.ref)) return ["required", "readonly"];
  if (entry.visible === false) return ["required", "readonly"];

  const gated: FlagKey[] = [];
  if (!writtenByOther(entry, written, ownStepIndex)) {
    if (entry.required === true && entry.readonly !== true) gated.push("readonly");
    if (entry.readonly === true && entry.required !== true) gated.push("required");
  }
  return gated;
}

/** Whether `key` is one of `entry`'s gated flags right now, for the step at
 * `ownStepIndex` — the same question `gatedKeys(...).includes(key)` answers,
 * wrapped so the field matrix's `onChange` guard (which carries the native
 * `disabled` attribute's old job, now that a gated checkbox stays enabled
 * for `accent-color`'s sake — design.md's accent-color decision,
 * field-matrix-checkbox-colors) reads as one call instead of re-deriving the
 * array on every keystroke. */
export function isFlagGated(
  entry: DraftViewField,
  written: WrittenAccessor,
  technicalFieldIds: Set<string>,
  key: FlagKey,
  ownStepIndex: number,
): boolean {
  return gatedKeys(entry, written, technicalFieldIds, ownStepIndex).includes(key);
}

function readerLabel(field: DraftField | undefined, ref: string): string {
  return field?.key || ref;
}

/**
 * The studio's own findings over the whole draft, reported as `EditorIssue`s
 * with the `"view"` source. Both rules read a literal flag alone — an
 * expression resolves only against an instance, which the studio holds none
 * of — and both skip a view entry naming a group-container field, since the
 * engine forces `required`/`readonly` to false there (see design.md decision
 * 5a). Neither rule blocks a publish; see `studio-checks-rail`'s "Every
 * publish blocker is visible" requirement.
 */
export function checkViewFlags(body: Draft): EditorIssue[] {
  const issues: EditorIssue[] = [];
  const steps = body.workflow?.steps ?? [];
  const fieldsById = new Map(flattenDraftFields(body.fields).map((f) => [f.id, f]));
  const written = writtenFieldCounts(body);

  steps.forEach((step, stepIndex) => {
    if (!step.id) return;
    for (const entry of (step.view?.fields ?? []).filter(isDraftViewField)) {
      if (!entry.ref) continue;
      const field = fieldsById.get(entry.ref);
      if (isGroupField(field)) continue;
      const label = readerLabel(field, entry.ref);

      if (entry.visible === false && entry.required === true) {
        issues.push({
          entityType: "step",
          entityId: step.id,
          source: "view",
          message: `Field "${label}" is required but hidden (visible: false), so its requirement is never enforced.`,
        });
      }

      if (entry.readonly === true && entry.required === true && written(entry.ref, stepIndex) === 0) {
        issues.push({
          entityType: "step",
          entityId: step.id,
          source: "view",
          message: `Field "${label}" is required and read-only here, and nothing writes it: every submission will fail.`,
        });
      }
    }
  });

  return issues;
}

/** A field's structural (non-editable-entry) writers, body-wide and
 * position-unconditional — action output at any position, subprocess
 * `outputMapping`, `columnMapping`, `contract.inputFields` — mirroring the
 * pre-dominance `computeWriterSet`'s own unconditional accumulation.
 * `checkUnwrittenTechnicalFields` alone reads this (task 3.5): a
 * `technical` field's requiredness is forced engine-wide, not per-step, so
 * its "does anything write it" check stays body-wide even after
 * `writtenFieldCounts`'s return shape became step-aware. Folding across
 * every step's dominance-scoped, own-step-reminder-timer-excluded count
 * would wrongly miss a technical field whose sole writer is a same-step
 * reminder timer: that timer's output is real (it fires and writes the
 * field every time), and the reminder-timer exclusion exists only to serve
 * the required+readonly "guaranteed before submission" rule. */
function structuralWriterIds(body: Draft): Set<string> {
  const steps = body.workflow?.steps ?? [];
  const written = new Set<string>();

  for (const step of steps) {
    const actionLists = [
      step.onEntry,
      step.onExit,
      step.onCancel,
      ...(step.paths ?? []).map((p) => p?.onPath),
      ...(step.timers ?? []).map((t) => t?.onFire?.actions),
    ];
    for (const list of actionLists) {
      for (const action of list ?? []) {
        for (const key of Object.keys(action?.output ?? {})) written.add(key);
      }
    }
    for (const key of Object.keys(step.subprocess?.outputMapping ?? {})) written.add(key);
  }

  const fieldsById = new Map(flattenDraftFields(body.fields).map((f) => [f.id, f]));
  for (const field of fieldsById.values()) {
    for (const target of Object.values(field.columnMapping ?? {})) {
      if (typeof target === "string") written.add(target);
    }
  }
  for (const id of body.contract?.inputFields ?? []) {
    if (id) written.add(id);
  }

  return written;
}

/**
 * The inverse of the publish-blocking rule the compile pass enforces
 * (`compile.ts::checkTechnicalFields`): a field declaring `technical: true`
 * that no structural source writes. Reports under the `"view"` source, like
 * `checkViewFlags`, but anchors on the FIELD itself (`entityType: "field"`)
 * rather than a step — `technical` is a catalog-level declaration, not a
 * per-step one, and the two `checkViewFlags` findings above both anchor on a
 * step for that reason. This finding is never blocking; the compile pass's
 * own rejection of a technical field's wired-editable view entry is the
 * publish-blocking half of this pair (design.md).
 *
 * Reads `structuralWriterIds`, not the step-aware `writtenFieldCounts`: see
 * that function's own doc comment for why. `FieldDef.default` exempts
 * nothing — nothing in the engine applies a `default` to `instance.data`,
 * so a technical field whose only "writer" is a `default` still never holds
 * a value, which is exactly the case this finding exists to report
 * (design.md Risks).
 */
export function checkUnwrittenTechnicalFields(body: Draft): EditorIssue[] {
  const issues: EditorIssue[] = [];
  const fieldsById = new Map(flattenDraftFields(body.fields).map((f) => [f.id, f]));
  const structural = structuralWriterIds(body);

  for (const field of fieldsById.values()) {
    if (field.technical !== true || field.id === undefined) continue;
    if (structural.has(field.id)) continue;
    issues.push({
      entityType: "field",
      entityId: field.id,
      source: "view",
      message: `Field "${readerLabel(field, field.id)}" is technical, and no structural source writes it: it can never hold a value.`,
    });
  }

  return issues;
}
