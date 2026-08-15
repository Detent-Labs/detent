import type { Draft } from "./types";
import type { DraftViewField } from "./view-layout";
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

/** Which controls a literal `visible: false` disables — both other flags,
 * since the engine never resolves them for a hidden field. A `visible`
 * holding a CEL expression gates nothing: nobody can read its value without
 * an instance. */
export function gatedKeys(entry: DraftViewField): FlagKey[] {
  return entry.visible === false ? ["required", "readonly"] : [];
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

  // The written-field set: every field id some other source in the body
  // supplies a value for, outside the view entry under test. Five sources,
  // two polarities (design.md decision 5).
  const written = new Set<string>();

  for (const step of steps) {
    for (const entry of step.view?.fields ?? []) {
      const field = entry.ref ? fieldsById.get(entry.ref) : undefined;
      if (isGroupField(field)) continue;
      if (entry.visible !== false && entry.readonly !== true && entry.ref) written.add(entry.ref);
    }
    const actionLists = [
      step.onEntry,
      step.onExit,
      step.onCancel,
      ...(step.paths ?? []).map((p) => p.onPath),
      ...(step.timers ?? []).map((t) => t.onFire?.actions),
    ];
    for (const list of actionLists) {
      for (const action of list ?? []) {
        for (const key of Object.keys(action?.output ?? {})) written.add(key);
      }
    }
    for (const key of Object.keys(step.subprocess?.outputMapping ?? {})) written.add(key);
  }
  for (const field of fieldsById.values()) {
    for (const target of Object.values(field.columnMapping ?? {})) {
      if (typeof target === "string") written.add(target);
    }
  }
  for (const id of body.contract?.inputFields ?? []) {
    if (id) written.add(id);
  }

  for (const step of steps) {
    if (!step.id) continue;
    for (const entry of step.view?.fields ?? []) {
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

      if (entry.readonly === true && entry.required === true && !written.has(entry.ref)) {
        issues.push({
          entityType: "step",
          entityId: step.id,
          source: "view",
          message: `Field "${label}" is required and read-only here, and nothing writes it: every submission will fail.`,
        });
      }
    }
  }

  return issues;
}
