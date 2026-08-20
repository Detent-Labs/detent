import type { BaseFieldType, FieldOption, LocalizedText } from "workflow-engine/schema";
import type { ResolvedViewField } from "form-ui";
import type { DraftField } from "./fields";
import { resolveDraftLocalizedText, type DraftLocalizedText } from "./localized-text";

/** `text` resolved to a single entry keyed by `locale`, falling back to
 * `baseLocale` the way every other authoring surface does. `FieldForm`
 * itself carries no separate base-locale concept — its own read
 * (`resolveText(def.label, locale, locale)`, `packages/form-ui`) passes the
 * same value twice, which the Player's call relies on since it has no
 * content-locale concept of its own (design.md decision 5). Baking the
 * fallback in here, rather than passing the field's raw `LocalizedText`
 * through, is what lets the preview still read correctly in a multi-language
 * draft under the studio's own `contentLocale`. */
function resolvedLabel(text: DraftLocalizedText, locale: string, baseLocale: string): LocalizedText {
  return { [locale]: resolveDraftLocalizedText(text, locale, baseLocale) ?? "" };
}

/** One sample value per base type, for the "How it will look" preview
 * (design.md decision 5). A `select`/`multiselect` field previews its first
 * declared option when it carries one; a plugin (custom) type takes the
 * same free-text sample `FieldForm` itself falls back to for one — the
 * engine treats a plugin type as opaque the same way (`JS_TYPE`,
 * `src/schema/definition.ts`). */
function sampleValue(type: BaseFieldType, options: FieldOption[]): unknown {
  switch (type) {
    case "string":
    case "reference":
      return "Sample text";
    case "number":
      return 42;
    case "boolean":
      return true;
    case "date":
      return "2026-01-15";
    case "datetime":
      return "2026-01-15T09:00";
    case "select":
      return options[0]?.value;
    case "multiselect":
      return options[0] ? [options[0].value] : [];
    case "file":
      return "example.pdf";
    case "group":
      return undefined;
  }
}

/** For an id-less option, `""` — the same empty value an author mid-edit can
 * legitimately hold, and a value form-ui's own `FieldInput` falls back to
 * `o.value` for when the label resolves empty. */
function resolvedOptions(field: DraftField, locale: string, baseLocale: string): FieldOption[] {
  // A dataSource-backed field's choices resolve at runtime; the draft holds
  // no rows for one, and no studio client call fetches a data list's values
  // (only its columns). The preview names that instead of drawing an empty
  // control unexplained (design.md decision 5) — task 3.6 reads `dataSource`
  // off the field to show that note; this stays empty either way.
  if (field.dataSource !== undefined) return [];
  return (field.options ?? []).map((o) => ({
    value: o.value ?? "",
    label: resolvedLabel(o.label, locale, baseLocale),
    attributes: o.attributes as FieldOption["attributes"],
  }));
}

function synthesizeEntry(field: DraftField, group: string | undefined, locale: string, baseLocale: string): ResolvedViewField {
  const key = field.key || field.id || "";
  // A custom plugin type is opaque to `FieldForm` — it draws the same
  // free-text control a `string` field does (no dedicated branch for one) —
  // so it takes the same sample and the same declared type as a missing
  // type, rather than carrying its own (partial, mid-edit) envelope through.
  const type: BaseFieldType = typeof field.type === "string" ? field.type : "string";
  const options = resolvedOptions(field, locale, baseLocale);
  return {
    field: {
      id: field.id!,
      key,
      label: resolvedLabel(field.label, locale, baseLocale),
      type,
      options: options.length ? options : undefined,
      dataSource: field.dataSource,
    },
    value: sampleValue(type, options),
    required: false,
    readonly: true,
    group,
    options: options.length ? options : undefined,
  };
}

/**
 * Synthesizes a single-field `ResolvedViewField[]`/`values` pair for the
 * "How it will look" preview (design.md decision 5, task 1.9): everything
 * `form-ui`'s `FieldForm` needs to render one catalog field read-only, with
 * no step view and no instance behind it.
 *
 * `undefined` for a field carrying no `id` — the panel shows its ordinary
 * empty state instead, the same as an id-less field `flattenRailFields`
 * already skips.
 *
 * For a group field, `fields` carries the group's own entry (no `group` key)
 * plus one entry per descendant AT EVERY DEPTH, each carrying its parent's
 * SYNTHESIZED key (not the parent's raw `field.key`) as `group` — `FieldForm`
 * groups children by `def.key`, so an unnamed group's synthesized key
 * (falling back to its id) is what a child must match, or every child of an
 * unnamed group draws twice: once nested, once beside the group (`FieldForm`
 * reads an empty `group` string as "no parent" at all).
 *
 * `values` carries one entry per synthesized field id — `FieldForm` reads
 * `values[def.id]`, never `ResolvedViewField.value`, so the second half is
 * load-bearing, not a convenience copy.
 */
export function previewViewFields(
  field: DraftField,
  contentLocale: string,
  baseLocale: string,
): { fields: ResolvedViewField[]; values: Record<string, unknown> } | undefined {
  if (field.id === undefined) return undefined;

  const fields: ResolvedViewField[] = [];
  const values: Record<string, unknown> = {};

  const walk = (f: DraftField, group: string | undefined) => {
    if (f.id === undefined) return;
    const entry = synthesizeEntry(f, group, contentLocale, baseLocale);
    fields.push(entry);
    values[f.id] = entry.value;
    for (const child of f.fields ?? []) walk(child, entry.field.key);
  };

  walk(field, undefined);
  return { fields, values };
}
