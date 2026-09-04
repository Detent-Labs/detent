import { fieldKindOf, type FieldKindName } from "workflow-engine/schema";
import { t } from "../catalog.js";

/**
 * One friendly name and a short note per entry of the engine's `FIELD_KINDS`
 * table. The kind picker and the catalog rail's row both call this, so neither
 * can name a different word for the same field (design.md, decision: field
 * kind).
 *
 * A function, not a record: `t` reads a deployment's stored override on every
 * call, and a record built at module load would freeze the values before the
 * override store answers (`ui-string-overrides`).
 *
 * Exhaustiveness survives that move. `CatalogKey` is a closed union, so the
 * template literal below resolves to one key per `FieldKindName`. A kind the
 * engine adds and the catalog misses is a compile error here.
 *
 * Display layer only. The picker writes the raw `{type, format, control}`
 * members the engine entry names, and the definition serializes unchanged.
 */
export function fieldKindLabel(kind: FieldKindName): { name: string; note: string } {
  return { name: t(`fieldKind.${kind}.name`), note: t(`fieldKind.${kind}.note`) };
}

/**
 * The one word a surface prints for a declared field — the rail row's word
 * and the word the kind picker shows as selected (task 7.3). Both read
 * `fieldKindOf` and `fieldKindLabel`, so a `{type: "string", format: "date"}`
 * field reads "Date" in the rail and "Date" in the picker.
 *
 * Three answers, the same three the picker offers. A plugin envelope takes
 * the picker's own custom-type word. A triple the curated table names no kind
 * for takes the raw triple, which is a machine value and therefore mono at
 * the call site, never a translated word. Everything else takes its kind's
 * name.
 */
export function fieldKindWord(field: { type?: unknown; format?: unknown; control?: unknown }): string {
  if (typeof field.type === "object" && field.type !== null) return t("fieldCatalog.customTypeOption");
  const kind = fieldKindOf(field);
  if (kind !== undefined) return fieldKindLabel(kind).name;
  return [field.type, field.format, field.control].filter((m) => typeof m === "string").join(" / ");
}
