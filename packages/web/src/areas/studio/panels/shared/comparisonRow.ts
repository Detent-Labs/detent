import {
  literalText,
  literalType,
  parseLiteral,
  parseLiteralList,
  sameLiteral,
  type LiteralValue,
  type ParseFailure,
  type Parsed,
  type ValueType,
} from "../../../../shell/literalValue.js";
import type { CatalogKey } from "../../catalog.js";
import type { TargetRef } from "./useTargetProcessCatalog.js";

/**
 * The pure rules of one `instance.query` comparison row
 * (`studio-plugin-config-form`; design.md decisions 2 and 3). The form writes
 * a literal of the compared field's declared type, because the engine
 * compares `jsonb` by type and `"1"` never equals `1`.
 */

export type Operator = "eq" | "ne" | "in";

export interface WhereEntry {
  fieldId?: string;
  operator?: Operator;
  value?: unknown;
  valueFromField?: string;
}

export type RightSide = "literal" | "field";

/**
 * The value type the row's literal takes, or `undefined` while it is unknown:
 * no catalog yet, no picked field, or a field the catalog lacks. A found field
 * without a `type` is plugin-typed and takes text.
 */
export function comparisonType(fields: readonly TargetRef[] | undefined, fieldId: string | undefined): ValueType | undefined {
  if (!fields || !fieldId) return undefined;
  const field = fields.find((f) => f.id === fieldId);
  return field ? literalType(field.type) : undefined;
}

/** A list for `in`, one literal otherwise. An unknown type parses as text. */
export function parseComparisonText(text: string, type: ValueType | undefined, operator: Operator | undefined): Parsed<LiteralValue | LiteralValue[]> {
  return operator === "in" ? parseLiteralList(text, type ?? "string") : parseLiteral(text, type ?? "string");
}

/** The catalog key of the reason a row prints, or `undefined` for empty text, which only dashes the row. */
export function reasonKey(reason: ParseFailure): CatalogKey | undefined {
  if (reason === "not-number") return "instanceQuery.notNumber";
  if (reason === "not-boolean") return "instanceQuery.notBoolean";
  return undefined;
}

/** A literal right side: `value` set, or absent when `value` is `undefined`. Never a `valueFromField`. */
export function withValue(entry: WhereEntry, value: unknown): WhereEntry {
  const next = withoutValue(entry);
  delete next.valueFromField;
  if (value !== undefined) next.value = value;
  return next;
}

function withoutValue(entry: WhereEntry): WhereEntry {
  const next = { ...entry };
  delete next.value;
  return next;
}

/**
 * A switch into or out of `in` drops `value` and `valueFromField`: a list
 * never fits a scalar comparison, and `in` takes no own field. A switch
 * between `eq` and `ne` keeps both.
 */
export function switchOperator(entry: WhereEntry, operator: Operator): WhereEntry {
  const crossesList = (entry.operator === "in") !== (operator === "in");
  return crossesList ? withValue({ ...entry, operator }, undefined) : { ...entry, operator };
}

/** A new compared field keeps the literal when both fields take the same known value type, and clears it otherwise. */
export function switchField(entry: WhereEntry, fieldId: string, fields: readonly TargetRef[] | undefined): WhereEntry {
  const before = comparisonType(fields, entry.fieldId);
  const after = comparisonType(fields, fieldId);
  const next = { ...entry, fieldId };
  return before !== undefined && before === after ? next : withoutValue(next);
}

/** `in` compares against a literal list alone. */
export function rightSideOptions(operator: Operator | undefined): RightSide[] {
  return operator === "in" ? ["literal"] : ["literal", "field"];
}

/** The own-field side starts on the first own field. The literal side starts with no value. */
export function switchRightSide(entry: WhereEntry, side: RightSide, ownFields: readonly TargetRef[]): WhereEntry {
  if (side === "literal") return withValue(entry, undefined);
  return { ...withoutValue(entry), valueFromField: ownFields[0]?.id ?? "" };
}

/** A row the engine cannot run yet: no compared field, or no right side. */
export function rowIncomplete(entry: WhereEntry): boolean {
  if (!entry.fieldId) return true;
  return entry.valueFromField !== undefined ? entry.valueFromField === "" : entry.value === undefined;
}

/** The boolean select's choice for a stored value. Anything but a boolean shows the empty choice. */
export function booleanChoice(value: unknown): "true" | "false" | "" {
  return value === true ? "true" : value === false ? "false" : "";
}

export function valueFromChoice(choice: string): boolean | undefined {
  return choice === "true" ? true : choice === "false" ? false : undefined;
}

/** A row's own text, and the last `value` prop it drew with. */
export interface TextState {
  text: string;
  seen: unknown;
}

export function initialTextState(value: unknown): TextState {
  return { text: literalText(value), seen: value };
}

/**
 * The text a row draws for `value` (design.md decision 2). The row reacts
 * only when `value` differs from the prop it last saw: it remembers the new
 * prop and keeps its text when that text parses to it. Text that does not
 * parse stands for `undefined`. Otherwise the row adopts `literalText(value)`.
 * An unchanged prop returns `state` itself, so a render-time update cannot
 * loop, even on a stored value of the wrong type.
 */
export function reconcileText(state: TextState, value: unknown, type: ValueType | undefined, operator: Operator | undefined): TextState {
  if (sameLiteral(value, state.seen)) return state;
  const parsed = parseComparisonText(state.text, type, operator);
  const text = sameLiteral(parsed.ok ? parsed.value : undefined, value) ? state.text : literalText(value);
  return { text, seen: value };
}
