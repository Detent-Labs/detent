import type { Expression } from "workflow-engine/schema";
import type { Draft } from "./types";
import type { DraftOf } from "./types";
import { resolveDraftLocalizedText } from "./localized-text";
import type { FlagKey } from "./view-flags";
import { isExpression, type BoolOrExpr } from "../panels/shared/overrideMode";
import { draftFields } from "./fields";
import { isDraftViewField } from "./view-layout";

/** One step whose view references the field, and which of `visible` /
 * `required` / `readonly` that step's view entry carries — regardless of
 * whether the value is a literal or an expression. `stepLabel` is the
 * step's resolved label in the caller's locale, falling back to `""` (the
 * key or an empty string) the same way `flattenRailFields`'s own `key`
 * does — the caller applies the unnamed-step catalog fallback, exactly as
 * `PanelsScreen` already does for an unnamed field's rail row. */
export interface FieldUsageRow {
  stepId: string;
  stepLabel: string;
  modes: FlagKey[];
}

const FLAG_KEYS: FlagKey[] = ["visible", "required", "readonly"];

/** Every step whose view references `fieldId`, and the flags that reference
 * sets. Shared by "Used in" (task 3.7) and `fieldVisibleOverrides` below —
 * both walks read the same view entries, so the two cannot disagree about
 * which steps reference the field (design.md decision 6). */
export function fieldUsage(draft: Draft, fieldId: string, locale: string, baseLocale: string): FieldUsageRow[] {
  const rows: FieldUsageRow[] = [];
  for (const step of draft.workflow?.steps ?? []) {
    if (step.id === undefined) continue;
    for (const entry of (step.view?.fields ?? []).filter(isDraftViewField)) {
      if (entry.ref !== fieldId) continue;
      rows.push({
        stepId: step.id,
        stepLabel: resolveDraftLocalizedText(step.label, locale, baseLocale) ?? step.key ?? "",
        modes: FLAG_KEYS.filter((k) => k in entry),
      });
    }
  }
  return rows;
}

/** The field catalog's "Only ask this when" row (design.md decision 3) reads
 * a field's cross-step `visible` state as one of three shapes. `"none"`: no
 * step view references the field, so there is nothing to read or write.
 * `"uniform"`: every referencing view's `visible` is the same expression (or
 * every one is absent) — `value` is that shared value, `undefined` for
 * "absent everywhere". `"divergent"`: the sources differ, or at least one
 * view holds a literal boolean (a literal always counts as a disagreement,
 * even against an otherwise-uniform set of absences: replacing a deliberate
 * `visible: false` without naming it would lose it). `literalStepIds` names
 * the steps a write would silently overwrite. */
export type FieldVisibleState =
  | { kind: "none" }
  | { kind: "uniform"; stepIds: string[]; value: DraftOf<Expression> | undefined }
  | { kind: "divergent"; stepIds: string[]; literalStepIds: string[] };

export function fieldVisibleOverrides(draft: Draft, fieldId: string): FieldVisibleState {
  const entries: { stepId: string; visible: BoolOrExpr }[] = [];
  for (const step of draft.workflow?.steps ?? []) {
    if (step.id === undefined) continue;
    for (const entry of (step.view?.fields ?? []).filter(isDraftViewField)) {
      if (entry.ref !== fieldId) continue;
      entries.push({ stepId: step.id, visible: entry.visible });
    }
  }

  if (entries.length === 0) return { kind: "none" };
  const stepIds = entries.map((e) => e.stepId);

  const literalStepIds = entries.filter((e) => typeof e.visible === "boolean").map((e) => e.stepId);
  if (literalStepIds.length > 0) return { kind: "divergent", stepIds, literalStepIds };

  // Every entry is now an expression or absent (`undefined`). Absent counts
  // as one shared source: several referencing views that have never carried
  // an override agree just as much as several sharing one written expression.
  const sources = new Set(entries.map((e) => (isExpression(e.visible) ? e.visible.src : undefined)));
  if (sources.size > 1) return { kind: "divergent", stepIds, literalStepIds: [] };

  return { kind: "uniform", stepIds, value: entries[0]!.visible as DraftOf<Expression> | undefined };
}

/**
 * The condition row's writer (design.md decision 3): a pure mutating recipe
 * of the shape `mutate` (`draft/store.tsx`) takes, not a function that
 * returns a patch — `applyVisibleOverride(draft, id, expr)` IS the recipe
 * body a caller passes straight to `mutate`. Walks every step's view and,
 * for each entry referencing `fieldId`, writes `visible` (adding the key
 * where it was absent, replacing an existing expression or literal) or
 * deletes it for `undefined` — never writes the key holding `undefined`
 * itself, which would show up as a stray key on the JSON surface.
 *
 * `visible` only ever takes an expression here: the row speaks CEL alone, so
 * this never overwrites `required`/`readonly` the way a literal `false`
 * write does elsewhere (`setFlag`, `view-flags.ts`).
 */
export function applyVisibleOverride(draft: Draft, fieldId: string, visible: DraftOf<Expression> | undefined): void {
  for (const step of draft.workflow?.steps ?? []) {
    for (const entry of (step.view?.fields ?? []).filter(isDraftViewField)) {
      if (entry.ref !== fieldId) continue;
      if (visible === undefined) delete entry.visible;
      else entry.visible = visible;
    }
  }
}

/** The field catalog's "Ask for this" row reads a field's cross-step
 * `required` state as one of three shapes, the twin of `FieldVisibleState`
 * above. `"none"`: no step view references the field. `"uniform"`: every
 * referencing view agrees, and `value` is what they agree on. `"divergent"`:
 * the views disagree, or at least one holds an expression — the row writes a
 * boolean alone, so an expression it cannot represent counts as a
 * disagreement. `differingStepIds` names the steps a write would overwrite.
 *
 * An absent `required` key reads as `false`. The definition contract makes
 * that the view entry's own default, so an entry that never carried the key
 * agrees with one carrying `required: false`. */
export type FieldRequiredState =
  | { kind: "none" }
  | { kind: "uniform"; stepIds: string[]; value: boolean }
  | { kind: "divergent"; stepIds: string[]; differingStepIds: string[] };

export function fieldRequiredOverrides(draft: Draft, fieldId: string): FieldRequiredState {
  const entries: { stepId: string; required: BoolOrExpr }[] = [];
  for (const step of draft.workflow?.steps ?? []) {
    if (step.id === undefined) continue;
    for (const entry of (step.view?.fields ?? []).filter(isDraftViewField)) {
      if (entry.ref !== fieldId) continue;
      entries.push({ stepId: step.id, required: entry.required });
    }
  }

  if (entries.length === 0) return { kind: "none" };
  const stepIds = entries.map((e) => e.stepId);

  const value = entries[0]!.required === true;
  const differingStepIds = entries
    .filter((e) => isExpression(e.required) || (e.required === true) !== value)
    .map((e) => e.stepId);
  if (differingStepIds.length > 0) return { kind: "divergent", stepIds, differingStepIds };

  return { kind: "uniform", stepIds, value };
}

/**
 * The "Ask for this" row's writer, a `mutate` recipe body of
 * `applyVisibleOverride`'s shape. Writes `required: true` on every view entry
 * referencing the field, or deletes the key for `false`: the definition
 * contract reads an absent `required` as `false`, so writing the literal
 * would add a key that says what its absence already says.
 *
 * The catalog itself keeps no `required` key. Requiredness lives in the view
 * alone, and this control does not bend that rule.
 */
export function applyRequiredOverride(draft: Draft, fieldId: string, required: boolean): void {
  for (const step of draft.workflow?.steps ?? []) {
    for (const entry of (step.view?.fields ?? []).filter(isDraftViewField)) {
      if (entry.ref !== fieldId) continue;
      if (required) entry.required = true;
      else delete entry.required;
    }
  }
}

/** Every `view.fields[]` entry across every step that names `fieldId` and
 * carries a `required` or `readonly` key — the set the Technical checkbox's
 * clearing pass deletes. Counted separately from `applyTechnicalMarker` so
 * the field catalog can name the count in its confirmation before the pass
 * runs (design.md: "Checking Technical clears the field's required/readonly
 * view keys"). */
export function countTechnicalClearKeys(draft: Draft, fieldId: string): number {
  let n = 0;
  for (const step of draft.workflow?.steps ?? []) {
    for (const entry of (step.view?.fields ?? []).filter(isDraftViewField)) {
      if (entry.ref !== fieldId) continue;
      if ("required" in entry) n++;
      if ("readonly" in entry) n++;
    }
  }
  return n;
}

/**
 * Whether the Technical checkbox needs to raise its confirm dialog before
 * running the clearing pass. `SubFieldRow` and `FieldEditor` both call this
 * with `next` and `countTechnicalClearKeys`'s own result, and skip
 * `confirm()` entirely when it reads `false`: unchecking the box (task 3.6)
 * needs no confirmation, and neither does checking a field with nothing to
 * clear (task 3.8). Pulled out so the decision itself is unit-testable —
 * this codebase has no DOM harness to click the checkbox and mock
 * `confirm()` itself, so that wiring stays verified by the manual browser
 * check (task 8.6).
 *
 * `DraftToolbar`'s discard no longer raises a native prompt at all. It opens a
 * modal dialog of the application's own, and that dialog is what the browser
 * check exercises there. This checkbox keeps the native prompt: converting the
 * studio's seven remaining prompts is a named follow-up.
 */
export function needsTechnicalToggleConfirm(next: boolean, clearCount: number): boolean {
  return next && clearCount > 0;
}

/**
 * The Technical checkbox's writer: a `mutate` recipe body (`applyVisibleOverride`
 * above's shape), not a function returning a patch. `next: true` writes
 * `field.technical = true` on the field found by id anywhere in the catalog
 * (top-level or nested inside a group), then walks EVERY step's
 * `view.fields[]` — not only the steps the field matrix currently draws,
 * since this panel holds no step filter of its own — and deletes `required`
 * and `readonly` off every entry naming that field. `next: false` deletes the
 * `technical` key and writes no flag key back: the pass records no prior
 * state, so an uncheck cannot restore an authored `required`/`readonly`
 * value the check deleted (design.md).
 */
export function applyTechnicalMarker(draft: Draft, fieldId: string, next: boolean): void {
  const field = draftFields(draft).find((f) => f.id === fieldId);
  if (!field) return;
  if (next) {
    field.technical = true;
    for (const step of draft.workflow?.steps ?? []) {
      for (const entry of (step.view?.fields ?? []).filter(isDraftViewField)) {
        if (entry.ref !== fieldId) continue;
        delete entry.required;
        delete entry.readonly;
      }
    }
  } else {
    delete field.technical;
  }
}
