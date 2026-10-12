import { isResolvedViewField, type ResolvedViewEntry, type ResolvedViewField } from "./types.js";

function isGroupField(field: ResolvedViewField): boolean {
  return field.field.type === "group";
}

/** Visible, non-readonly, non-group-container field ids — the field-set
 * boundary `submitAndTransition` enforces server-side. A consumer filters its
 * submitted data through this before calling submit. A note contributes no
 * key: it carries no `ref`, so it is never editable. */
export function editableFieldIds(fields: ResolvedViewEntry[]): Set<string> {
  return new Set(
    fields.filter(isResolvedViewField).filter((f) => !isGroupField(f) && !f.readonly).map((f) => f.field.id),
  );
}

/** True when the form has nothing to submit: the instance is not `running`,
 * or no path is available on its step. A consumer passes the answer to
 * `FieldForm` as `readonly`. */
export function formIsReadonly(view: { status: string; availablePaths: unknown[] }): boolean {
  return view.availablePaths.length === 0 || view.status !== "running";
}

/** Keeps a `null` value: a cleared field travels in a submission and a saved
 * form draft, and the engine reads it as a removed field. */
export function filterToEditable(data: Record<string, unknown>, fields: ResolvedViewEntry[]): Record<string, unknown> {
  const editable = editableFieldIds(fields);
  const filtered: Record<string, unknown> = {};
  for (const [fieldId, value] of Object.entries(data)) {
    if (editable.has(fieldId)) filtered[fieldId] = value;
  }
  return filtered;
}
