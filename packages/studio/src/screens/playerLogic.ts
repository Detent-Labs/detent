import type { InstanceRecordElement } from "../api/types.js";

/** Same compact summary `packages/admin`'s InstanceScreen derives — a one-line
 * description per record row, not the full raw payload. */
export function describeRecordElement(el: InstanceRecordElement): { at: string; summary: string } {
  if (el.kind === "transition") {
    const e = el.entry;
    return { at: e.at, summary: `transition — ${e.cause}${e.pathId ? ` via ${e.pathId}` : ""} — ${e.fromStepId ?? "(start)"} → ${e.toStepId}` };
  }
  return { at: el.event.at, summary: `event — ${el.event.kind}` };
}

/** Seeds the form's local edit state from a fresh InstanceView, keyed by field id. */
export function seedFormValues(fields: { field: { id: string }; value: unknown }[]): Record<string, unknown> {
  const seeded: Record<string, unknown> = {};
  for (const f of fields) seeded[f.field.id] = f.value;
  return seeded;
}
