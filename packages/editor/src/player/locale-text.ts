import type { LocalizedText } from "workflow-engine/schema";

/** The first available translation, in whatever key order the record has — not locale-priority-aware, just "something to show". */
export function firstLocalizedText(value: LocalizedText | undefined): string {
  if (!value) return "";
  return Object.values(value)[0] ?? "";
}
