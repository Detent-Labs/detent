import type { BaseFieldType, FieldFormat } from "workflow-engine/schema";
import type { DraftField } from "./fields";
import { mintId } from "./ids";

/** The palette's "add a field to the process" entries, by type. The mockup's
 * five (design.md's open question, settled here at implementation time):
 * text, choice, date, file, section. Each names one `BaseFieldType` a drop
 * mints; "section" is the mockup's word for a `group` field. */
export type PaletteFieldKind = "text" | "choice" | "date" | "file" | "section";

export const PALETTE_FIELD_KINDS: PaletteFieldKind[] = ["text", "choice", "date", "file", "section"];

/** The catalog declaration a palette entry mints: a `BaseFieldType`, plus the
 * `format` that entry names where the type alone does not carry it. "Date" is
 * the one such entry — a date is a `string` whose format says so. "Choice" is
 * a plain `string`: what makes a field a picker is the options an author adds
 * next, not its type. */
export function baseTypeForPaletteKind(kind: PaletteFieldKind): { type: BaseFieldType; format?: FieldFormat } {
  switch (kind) {
    case "text":
      return { type: "string" };
    case "choice":
      return { type: "string" };
    case "date":
      return { type: "string", format: "date" };
    case "file":
      return { type: "file" };
    case "section":
      return { type: "group" };
  }
}

/**
 * One field-minting call for the palette's drop (task 3.2) and its
 * click-to-place fallback: `mintId` and an empty seeded label, the same
 * pattern `FieldCatalogPanel.addField` and `StepsPanel.addStep` already
 * follow (design.md: "one call site keeps them from drifting by
 * construction"). A `group` field seeds an empty `fields` array, since its
 * own sub-field editor (`FieldCatalogPanel`) reads and appends to it.
 */
export function mintCatalogField(kind: PaletteFieldKind, label: DraftField["label"]): DraftField {
  const { type, format } = baseTypeForPaletteKind(kind);
  const field: DraftField = { id: mintId("field"), key: "", label, type };
  if (format !== undefined) field.format = format;
  if (type === "group") field.fields = [];
  return field;
}
