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

/**
 * Whether `entry`'s own field has a writer besides `entry` itself, per
 * `written` (`writtenFieldCounts`). A structural source (action output,
 * subprocess `outputMapping`, `columnMapping`, `contract.inputFields`) bumps
 * its field's count by `Infinity`, so it always counts as "another" writer.
 * A live, editable view entry (`visible !== false`, `readonly !== true`)
 * bumps its field's count by one FOR EACH such entry in the draft,
 * `entry` included when `entry` itself is currently editable — so `entry`'s
 * own contribution has to come back out before comparing, or an entry would
 * always read as its own writer the moment it stops being `readonly`, which
 * is exactly the state `gatedKeys` needs to gate. */
function writtenByOther(entry: DraftViewField, written: Map<string, number>): boolean {
  if (!entry.ref) return false;
  const total = written.get(entry.ref) ?? 0;
  const selfWrites = entry.visible !== false && entry.readonly !== true;
  return total - (selfWrites ? 1 : 0) > 0;
}

/** Which controls the entry's current state disables right now.
 *
 * A literal `visible: false` disables both other flags, since the engine
 * never resolves them for a hidden field. A `visible` holding a CEL
 * expression gates nothing: nobody can read its value without an instance.
 *
 * Where nothing besides `entry` itself already writes the entry's field
 * (`writtenByOther`), `required` and `readonly` gate each other, but only
 * one way: checking one disables the other only while the other does not
 * already read `true`. An entry that already carries both stays fully
 * editable, so an author can always uncheck out of that state (design.md
 * decision 1, `gate-required-readonly-conflict`).
 */
export function gatedKeys(entry: DraftViewField, written: Map<string, number>): FlagKey[] {
  if (entry.visible === false) return ["required", "readonly"];

  const gated: FlagKey[] = [];
  if (!writtenByOther(entry, written)) {
    if (entry.required === true && entry.readonly !== true) gated.push("readonly");
    if (entry.readonly === true && entry.required !== true) gated.push("required");
  }
  return gated;
}

function readerLabel(field: DraftField | undefined, ref: string): string {
  return field?.key || ref;
}

/**
 * Every field id some source in the body supplies a value for, counted: a
 * live, editable (`visible !== false`, `readonly !== true`) view entry adds
 * one FOR EACH such entry the field has anywhere in the draft; an action's
 * `output`, a step's `subprocess.outputMapping`, a field's `columnMapping`,
 * or a `contract.inputFields` entry each add `Infinity`, since none of those
 * four is ever the specific view entry a caller is asking about. `gatedKeys`
 * (via `writtenByOther`) needs the count, not just presence, to tell "some
 * OTHER source writes this field" apart from "this very entry, still
 * editable, is the only reason the field reads as written" — a plain
 * Set<string> can't make that distinction. Shared by `checkViewFlags`'s own
 * finding, the field matrix's flagged-cell marker (`panels/
 * fieldMatrixLogic.ts`), and `gatedKeys`, so none of the three can disagree
 * about what "already written" means (design.md decision 5, `field-matrix-
 * toolbar-and-inline-editing`; decision 2, `gate-required-readonly-
 * conflict`).
 */
export function writtenFieldCounts(body: Draft): Map<string, number> {
  const steps = body.workflow?.steps ?? [];
  const fieldsById = new Map(flattenDraftFields(body.fields).map((f) => [f.id, f]));
  const counts = new Map<string, number>();
  const bump = (id: string, by: number) => counts.set(id, (counts.get(id) ?? 0) + by);

  for (const step of steps) {
    for (const entry of step.view?.fields ?? []) {
      const field = entry.ref ? fieldsById.get(entry.ref) : undefined;
      if (isGroupField(field)) continue;
      if (entry.visible !== false && entry.readonly !== true && entry.ref) bump(entry.ref, 1);
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
        for (const key of Object.keys(action?.output ?? {})) bump(key, Infinity);
      }
    }
    for (const key of Object.keys(step.subprocess?.outputMapping ?? {})) bump(key, Infinity);
  }
  for (const field of fieldsById.values()) {
    for (const target of Object.values(field.columnMapping ?? {})) {
      if (typeof target === "string") bump(target, Infinity);
    }
  }
  for (const id of body.contract?.inputFields ?? []) {
    if (id) bump(id, Infinity);
  }

  return counts;
}

/** `writtenFieldCounts`, collapsed to presence. Every consumer that only
 * asks "is this field written at all" — `checkViewFlags`'s own finding, the
 * field matrix's flagged-cell marker — reads this instead: neither examines
 * one specific entry's own contribution the way `gatedKeys` does, so neither
 * needs the count. */
export function writtenFieldIds(body: Draft): Set<string> {
  const counts = writtenFieldCounts(body);
  const written = new Set<string>();
  for (const [id, count] of counts) {
    if (count > 0) written.add(id);
  }
  return written;
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
  const written = writtenFieldIds(body);

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
