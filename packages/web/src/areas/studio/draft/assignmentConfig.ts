import type { Draft } from "./types";
import { flattenDraftFields } from "./fields";
import { isDraftViewField } from "./view-layout";
import { structuralWriterIds } from "./view-flags";

/**
 * Whether some source can write `fieldId` for the assignment on `stepId`. The
 * strategy reads the field at step entry, before an entry or an action on that
 * step lands, so neither counts. A later step on a loop still counts: this
 * reports no writer at all and proves no order. `writtenFieldCounts` is the
 * upgrade for a stricter reading.
 */
export function fieldHasWriter(draft: Draft, fieldId: string, stepId: string): boolean {
  const steps = draft.workflow?.steps ?? [];
  const others = steps.filter((s) => s.id !== stepId);
  if (structuralWriterIds({ ...draft, workflow: { ...draft.workflow, steps: others } }).has(fieldId)) return true;
  if (flattenDraftFields(draft.fields).some((f) => f.id === fieldId && f.default !== undefined)) return true;
  return others.some((s) =>
    (s.view?.fields ?? [])
      .filter(isDraftViewField)
      .some((entry) => entry.ref === fieldId && entry.visible !== false && entry.readonly !== true),
  );
}
