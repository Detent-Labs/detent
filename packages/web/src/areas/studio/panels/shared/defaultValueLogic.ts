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

/** design.md Decision 3: a group's own default is never read, and a
 * reference/file field has no author-typeable literal shape — both disable
 * the whole Default-value zone rather than accept a value that silently
 * never applies. */
export function defaultValueDisabledReason(type: FieldType): "group" | "type" | undefined {
  if (type === "group") return "group";
  if (type === "reference" || type === "file") return "type";
  return undefined;
}

export type LiteralControlKind = "string" | "number" | "boolean" | "date" | "datetime" | "select" | "multiselect" | "none";

/** Which literal control the zone offers, per design.md Decision 3's
 * per-type mapping. A `dataSource`-bound select/multiselect offers none: the
 * draft carries no resolved rows to build one from. */
export function literalControlKind(type: FieldType, dataSourceBound: boolean): LiteralControlKind {
  if (type === "select" || type === "multiselect") return dataSourceBound ? "none" : type;
  if (type === "number" || type === "boolean" || type === "date" || type === "datetime") return type;
  return "string"; // string, and the custom/plugin fallback
}

/** Parse `text` as CEL for the Default-value zone's raw-CEL arm. Empty text
 * clears the default (`ok: true, value: undefined`); unparseable text is
 * `ok: false` and leaves the draft untouched, the same "hold the text until
 * it parses" rule `PluginEnvelopeEditor`'s `configText` follows for JSON. */
export function parseCelDefault(text: string): { ok: true; value: DraftExpression | undefined } | { ok: false } {
  if (text.trim() === "") return { ok: true, value: undefined };
  return parseAst(text) === null ? { ok: false } : { ok: true, value: { lang: "cel", src: text } as DraftExpression };
}

/** A multiselect literal default's checkbox-group toggle. An emptied
 * selection clears the `default` key rather than writing `[]` — the schema
 * reads `default` as optional, and a body carrying `[]` says an author meant
 * something they did not (the same rule `columnMapping`'s own empty-object
 * write follows). */
export function toggleMultiselectValue(current: DraftDefault, option: string, on: boolean): string[] | undefined {
  const selected = Array.isArray(current) ? (current as string[]) : [];
  const next = on ? [...selected, option] : selected.filter((v) => v !== option);
  return next.length === 0 ? undefined : next;
}
