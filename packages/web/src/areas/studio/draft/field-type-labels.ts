import type { BaseFieldType, FieldControl, FieldFormat } from "workflow-engine/schema";

/**
 * One friendly name and a short note per `baseFieldType` value — the type
 * picker's whole list (design.md decision 2). Display-layer only: the picker
 * writes the raw `BaseFieldType` value, and the definition serializes
 * unchanged. Follows the exhaustive-record pattern `JS_TYPE`
 * (`src/schema/definition.ts`) already takes over the same enum, rather than
 * two parallel lookup functions, so a future member missing here is a
 * compile error instead of a silently unlabeled entry.
 *
 * Six types, one value form each. A picker is no longer a type of its own:
 * what makes a field a picker is the presence of `options` or `dataSource`,
 * and the cardinality IS the type — one pick is `string`, several are `list`.
 */
export const FIELD_TYPE_LABELS: Record<BaseFieldType, { name: string; note: string }> = {
  string: { name: "Text", note: "A line of text, or one choice from a list." },
  number: { name: "Number", note: "A number, with optional min/max checks." },
  boolean: { name: "Yes/no", note: "A single checkbox." },
  list: { name: "List", note: "Any number of choices from a list." },
  file: { name: "File", note: "A reference to an uploaded file." },
  group: { name: "Group", note: "A container for other fields, not a value of its own." },
};

/**
 * The format picker's list, on the same exhaustive-record pattern. A format
 * narrows what the value may be, so the note states the domain the engine
 * checks a submitted value against, not how the input looks.
 */
export const FIELD_FORMAT_LABELS: Record<FieldFormat, { name: string; note: string }> = {
  date: { name: "Date", note: "A calendar date, with no time of day." },
  datetime: { name: "Date and time", note: "A calendar date with a time of day." },
  integer: { name: "Whole number", note: "No decimal part. Conditions compare it as a whole number." },
  email: { name: "Email address", note: "One address the browser and the engine both check." },
};

/**
 * The control picker's list. A control changes what a participant sees and
 * nothing else, so the note describes the input alone.
 */
export const FIELD_CONTROL_LABELS: Record<FieldControl, { name: string; note: string }> = {
  multiline: { name: "Multiple lines", note: "A text box that grows, instead of one line." },
  radio: { name: "Radio buttons", note: "Every choice visible at once, one pickable." },
  checkboxes: { name: "Checkboxes", note: "Every choice visible at once, any number pickable." },
};
