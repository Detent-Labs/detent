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

export function filterToEditable(data: Record<string, unknown>, fields: ResolvedViewEntry[]): Record<string, unknown> {
  const editable = editableFieldIds(fields);
  const filtered: Record<string, unknown> = {};
  for (const [fieldId, value] of Object.entries(data)) {
    if (editable.has(fieldId)) filtered[fieldId] = value;
  }
  return filtered;
}
