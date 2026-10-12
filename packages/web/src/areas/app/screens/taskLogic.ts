/**
 * Pure decisions of the task screen — no request, no React — so they are
 * testable without a renderer, like `claimLogic.ts` beside it.
 */
import type { InstanceView } from "../api/types.js";
import type { CatalogKey } from "../catalog.js";

/**
 * Seeds the form values from the loaded view. A form draft key wins over the
 * committed value, and the test is the key, not the value: a draft `null`
 * records a cleared field, and the committed value must not return.
 */
export function seedTaskValues(
  fields: ReadonlyArray<{ field: { id: string }; value?: unknown }>,
  draft: { data: Record<string, unknown> } | undefined,
): Record<string, unknown> {
  const seeded: Record<string, unknown> = {};
  for (const f of fields) {
    seeded[f.field.id] = draft !== undefined && f.field.id in draft.data ? draft.data[f.field.id] : f.value;
  }
  return seeded;
}

/**
 * The catalog key of the note that states why the form is read-only, or
 * `undefined` for an editable form. Mirrors `formIsReadonly`'s two causes:
 * a case that is not running, and a running step with no available path.
 */
export function readonlyNoteKey(view: Pick<InstanceView, "status" | "availablePaths">): CatalogKey | undefined {
  if (view.status !== "running") return "task.readonlyNotRunning";
  if (view.availablePaths.length === 0) return "task.readonlyNoPath";
  return undefined;
}
