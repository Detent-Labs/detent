import { FIELD_KINDS, type FieldKindName } from "workflow-engine/schema";
import type { DraftField } from "./fields";
import { mintId } from "./ids";

/** The palette's "add a field to the process" entries, by type. The mockup's
 * five (design.md's open question, settled here at implementation time):
 * text, choice, date, file, section. Each names one `BaseFieldType` a drop
 * mints; "section" is the mockup's word for a `group` field. */
export type PaletteFieldKind = "text" | "choice" | "date" | "file" | "section";

export const PALETTE_FIELD_KINDS: PaletteFieldKind[] = ["text", "choice", "date", "file", "section"];

/** The engine kind each palette entry mints. "Date" is the one entry whose
 * name differs from the kind's: a date is a `string` whose format says so.
 * "Choice" mints the same plain `text` kind "Text" does — what makes a field a
 * picker is the options an author adds next, not its type. "Section" is the
 * mockup's word for a `group` field. */
const KIND_BY_PALETTE_KIND: Record<PaletteFieldKind, FieldKindName> = {
  text: "text",
  choice: "text",
  date: "date",
  file: "file",
  section: "group",
};

/** The catalog declaration a palette entry mints, read off the engine's own
 * field-kind table rather than restated here. A second hand-written copy of
 * the type-and-format mapping would drift from `FIELD_KINDS`, and the drift
 * would first show at publish (design.md, decision: field kind). */
export function baseTypeForPaletteKind(kind: PaletteFieldKind): (typeof FIELD_KINDS)[FieldKindName] {
  return FIELD_KINDS[KIND_BY_PALETTE_KIND[kind]];
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
  const { type, format, control } = baseTypeForPaletteKind(kind);
  const field: DraftField = { id: mintId("field"), key: "", label, type };
  if (format !== undefined) field.format = format;
  if (control !== undefined) field.control = control;
  if (type === "group") field.fields = [];
  return field;
}
