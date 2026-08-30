import type { Expression, FieldDef } from "workflow-engine/schema";
import { parseAst } from "workflow-engine/cel/check";
import type { DraftOf } from "../../draft/types";
import type { DraftField } from "../../draft/fields";

type DraftDefault = DraftOf<FieldDef>["default"];
type DraftExpression = DraftOf<Expression>;
type FieldType = DraftField["type"];

/** `FieldDef.default` is `Literal | Expression`; this is the same `.lang ===
 * "cel"` test `src/cel/check.ts::asExpr` runs engine-side, kept local since a
 * `Literal` record can otherwise share the same `typeof v === "object"` shape. */
export function asExpression(v: DraftDefault): DraftExpression | undefined {
  return v !== undefined && v !== null && typeof v === "object" && !Array.isArray(v) && (v as { lang?: unknown }).lang === "cel"
    ? (v as DraftExpression)
    : undefined;
}

/** design.md Decision 3: a group's own default is never read, and a `file`
 * field has no author-typeable literal shape — both disable the whole
 * Default-value zone rather than accept a value that silently never applies.
 *
 * `reference` is gone from the type enum, and with it the one line that
 * separated it from a `string`: it now takes a default like any other string
 * field. */
export function defaultValueDisabledReason(type: FieldType): "group" | "type" | undefined {
  if (type === "group") return "group";
  if (type === "file") return "type";
  return undefined;
}

export type LiteralControlKind = "string" | "number" | "boolean" | "date" | "datetime" | "email" | "options" | "options-multi" | "none";

/** Which literal control the zone offers. It reads the same three keys the
 * renderer does, in the same order — the options first, then the format, then
 * the type — so an author types a default into the input a participant will
 * fill, and the publish-time literal-`default` check verdicts what they typed
 * against the same domain.
 *
 * A `dataSource`-bound picker offers none: the draft carries no resolved rows
 * to build one from. A bare person field offers none for the identical reason
 * (design.md Decision 8): its people list resolves from the body's
 * `allowedGroups` through a live database read the draft editor cannot make.
 * `control` is deliberately absent. It changes how a participant picks, never
 * what an author may type here. */
export function literalControlKind(field: Pick<DraftField, "type" | "format" | "options" | "dataSource">): LiteralControlKind {
  const { type } = field;
  if (type === "boolean" || type === "number") return type;
  // A person field declaring its own static options resolves rows like any
  // other, so the options keep winning over the carve-out.
  const noResolvedRows = field.dataSource !== undefined || (field.format === "person" && (field.options ?? []).length === 0);
  if (type === "list") return noResolvedRows ? "none" : "options-multi";
  if (type === "string") {
    if (noResolvedRows) return "none";
    if ((field.options ?? []).length > 0) return "options";
    if (field.format === "date" || field.format === "datetime" || field.format === "email") return field.format;
  }
  return "string"; // a plain string, and the custom/plugin fallback
}

/** Parse `text` as CEL for the Default-value zone's raw-CEL arm. Empty text
 * clears the default (`ok: true, value: undefined`); unparseable text is
 * `ok: false` and leaves the draft untouched, the same "hold the text until
 * it parses" rule `PluginEnvelopeEditor`'s `configText` follows for JSON. */
export function parseCelDefault(text: string): { ok: true; value: DraftExpression | undefined } | { ok: false } {
  if (text.trim() === "") return { ok: true, value: undefined };
  return parseAst(text) === null ? { ok: false } : { ok: true, value: { lang: "cel", src: text } as DraftExpression };
}

/** A `list` field's literal-default checkbox-group toggle. An emptied
 * selection clears the `default` key rather than writing `[]` — the schema
 * reads `default` as optional, and a body carrying `[]` says an author meant
 * something they did not (the same rule `columnMapping`'s own empty-object
 * write follows). */
export function toggleMultiselectValue(current: DraftDefault, option: string, on: boolean): string[] | undefined {
  const selected = Array.isArray(current) ? (current as string[]) : [];
  const next = on ? [...selected, option] : selected.filter((v) => v !== option);
  return next.length === 0 ? undefined : next;
}
