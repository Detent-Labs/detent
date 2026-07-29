import type { FieldDef } from "workflow-engine/schema";

/**
 * Both `DraftRecord.body` and `getVersionBody`'s result are opaque, unparsed
 * JSON client-side (same convention `JsonView`/`migrationPlanLogic` already
 * follow) — this reads out only the one array `checkAgainstFields` needs,
 * defensively, rather than trusting the shape.
 */
export function extractFields(rawBody: unknown): FieldDef[] {
  if (typeof rawBody !== "object" || rawBody === null) return [];
  const fields = (rawBody as { fields?: unknown }).fields;
  return Array.isArray(fields) ? (fields as FieldDef[]) : [];
}
