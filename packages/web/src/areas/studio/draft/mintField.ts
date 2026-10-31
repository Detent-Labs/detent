import { FIELD_KINDS, type FieldKindName } from "workflow-engine/schema";
import { t } from "../catalog";
import type { DraftField } from "./fields";
import { mintId } from "./ids";

/** The palette's "add a field to the process" entries: every kind of the
 * engine's own `FIELD_KINDS` table, in the table's order. A drop mints the
 * kind's `{type, format, control}` triple unchanged. */
export const PALETTE_FIELD_KINDS = Object.keys(FIELD_KINDS) as FieldKindName[];

/** The kinds whose field carries a pick list. A mint seeds two choices, so a
 * new field is already a working picker. */
const CHOICE_KINDS: ReadonlySet<FieldKindName> = new Set(["radioChoice", "multiChoice", "checkboxChoice"]);

/** The catalog declaration a palette entry mints, read off the engine's own
 * field-kind table rather than restated here. A second hand-written copy of
 * the type-and-format mapping would drift from `FIELD_KINDS`, and the drift
 * would first show at publish (design.md, decision: field kind). */
export function baseTypeForPaletteKind(kind: FieldKindName): (typeof FIELD_KINDS)[FieldKindName] {
  return FIELD_KINDS[kind];
}

/**
 * One field-minting call for the palette's drop and its click-to-place
 * fallback: `mintId` and the given label, the same pattern
 * `FieldsTab::addField` in `EntityTabs.tsx` follows for every add on the
 * Fields tab (design.md: "one call site keeps them from drifting by
 * construction"). A `group` field seeds an empty `fields` array, since its
 * own "Fields inside this group" zone (`FieldCatalogPanel`'s `FieldEditor`)
 * appends into it. A choice kind seeds two options, labelled in the base
 * locale, since every `LocalizedText` needs a non-empty base-locale entry.
 */
export function mintCatalogField(kind: FieldKindName, label: DraftField["label"], baseLocale: string): DraftField {
  const { type, format, control } = baseTypeForPaletteKind(kind);
  const field: DraftField = { id: mintId("field"), key: "", label, type };
  if (format !== undefined) field.format = format;
  if (control !== undefined) field.control = control;
  if (type === "group") field.fields = [];
  if (CHOICE_KINDS.has(kind)) {
    field.options = [1, 2].map((n) => ({
      value: `choice_${n}`,
      label: { [baseLocale]: t("formEditor.seedChoice").replace("{n}", String(n)) },
    }));
  }
  return field;
}
