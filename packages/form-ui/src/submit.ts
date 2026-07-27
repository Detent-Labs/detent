import type { ResolvedViewField } from "./types.js";

function isGroupField(field: ResolvedViewField): boolean {
  return field.field.type === "group";
}

/** Visible, non-readonly, non-group-container field ids — the field-set
 * boundary `submitAndTransition` enforces server-side. A consumer filters its
 * submitted data through this before calling submit. */
export function editableFieldIds(fields: ResolvedViewField[]): Set<string> {
  return new Set(fields.filter((f) => !isGroupField(f) && !f.readonly).map((f) => f.field.id));
}

export function filterToEditable(data: Record<string, unknown>, fields: ResolvedViewField[]): Record<string, unknown> {
  const editable = editableFieldIds(fields);
  const filtered: Record<string, unknown> = {};
  for (const [fieldId, value] of Object.entries(data)) {
    if (editable.has(fieldId)) filtered[fieldId] = value;
  }
  return filtered;
}
