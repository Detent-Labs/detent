import type { BaseFieldType } from "workflow-engine/schema";

/**
 * One friendly name and a short note per `baseFieldType` value — the type
 * picker's whole list (design.md decision 2). Display-layer only: the picker
 * writes the raw `BaseFieldType` value, and the definition serializes
 * unchanged. Follows the exhaustive-record pattern `JS_TYPE`
 * (`src/schema/definition.ts`) already takes over the same enum, rather than
 * two parallel lookup functions, so a future member missing here is a
 * compile error instead of a silently unlabeled entry.
 *
 * "Long text" is deliberately absent: the contract has no multiline type
 * (docs/decisions.md).
 */
export const FIELD_TYPE_LABELS: Record<BaseFieldType, { name: string; note: string }> = {
  string: { name: "Text", note: "A short line of text." },
  number: { name: "Number", note: "A number, with optional min/max checks." },
  select: { name: "Choice", note: "One choice from a list." },
  multiselect: { name: "Multiple choice", note: "Any number of choices from a list." },
  boolean: { name: "Yes/no", note: "A single checkbox." },
  date: { name: "Date", note: "A calendar date, with no time of day." },
  datetime: { name: "Date and time", note: "A calendar date with a time of day." },
  file: { name: "File", note: "A reference to an uploaded file." },
  reference: { name: "Reference", note: "A free-form reference to something outside this field." },
  group: { name: "Group", note: "A container for other fields, not a value of its own." },
};
