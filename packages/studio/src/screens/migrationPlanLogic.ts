/**
 * The migration-plan editor is a raw JSON textarea over `MigrationSpec`
 * (stepMap/fieldMap/transforms/onUnmappable/unmappableStep) — no field-by-field
 * form exists anywhere in the repo for this shape to extend, and the server
 * already validates structure and CEL content at `PUT /migration-plans/...`
 * (studio-migration-planning spec), so a from-scratch bespoke widget per field
 * would duplicate validation the server already owns. This module is the
 * textarea's parse/format boundary, extracted so it's directly testable.
 */
export type ParsedSpec = { spec: unknown } | { error: string };

/** Never throws. Empty input is an empty plan, not an error — a plan with no rules is valid (every field is optional). */
export function parseSpecText(text: string): ParsedSpec {
  if (text.trim() === "") return { spec: {} };
  try {
    return { spec: JSON.parse(text) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "invalid JSON" };
  }
}

export function formatSpecText(spec: unknown): string {
  return JSON.stringify(spec ?? {}, null, 2);
}
