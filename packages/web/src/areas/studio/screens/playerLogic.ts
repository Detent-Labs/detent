export { describeRecordElement } from "../../../api/record.js";

/** Seeds the form's local edit state from a fresh InstanceView, keyed by field id. */
export function seedFormValues(fields: { field: { id: string }; value: unknown }[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((f) => [f.field.id, f.value]));
}
