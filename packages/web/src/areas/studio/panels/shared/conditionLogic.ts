/**
 * The condition builder's pure half: read CEL into a flat row model, write it
 * back out, build the operand list the picker offers, and read the rows back
 * as a sentence.
 *
 * Read-back is by parse, never by a sidecar. A record of "how this condition
 * was built" cannot live in `ProcessBody` (it would move `definitionHash`) and
 * dies at publish if kept beside the draft, which would leave a published
 * version uneditable in the builder. So the stored artifact stays the CEL text
 * and this model lives only between `parseAst()` and the next keystroke.
 *
 * Nothing here is persisted, hashed or versioned. A later grouping level
 * therefore changes this file alone: every condition the flat model emits is a
 * subset of what a grouping reader would accept.
 */

import { parseAst, serializeAst, celType, INSTANCE_SCHEMA, ACTOR_SCHEMA } from "workflow-engine/cel/check";
import type { BaseFieldType, ProcessBody } from "workflow-engine/schema";
import type { DraftField } from "../../draft/fields";
import { flattenDraftFields } from "../../draft/fields";
import { resolveDraftLocalizedText } from "../../draft/localized-text";
import { t, type CatalogKey } from "../../catalog.js";
import { fill, numberRepeats } from "./optionText";

export interface OperandOption {
  value: string;
  label: string;
}

/** The picker heading an operand stands under. */
export type OperandGroup = "fields" | "child" | "case" | "person";

export interface Operand {
  /** The CEL path a row writes, e.g. `data.amount` or `actor.roles`. */
  path: string;
  label: string;
  /** The label's form inside a clause, where `label` reads as the head of a
   * sentence. Set on a context operand whose label is a phrase, never on a
   * field, whose label stays as the author typed it. */
  clauseLabel?: string;
  /** Set by `buildOperands`' builders. `fieldOperand` alone sets none, so the
   * rule builder's operands keep their shape. */
  group?: OperandGroup;
  /** Governs the operators and the written literal. */
  celType: string;
  /**
   * The catalog's own field type, which the value editor needs and `celType`
   * cannot supply on its own.
   */
  declaredType?: string;
  /**
   * The catalog's declared `format`. Three of the four members type as CEL
   * `string`, so the format is what decides which native input the value
   * editor draws — see `inputTypeFor`.
   */
  format?: string;
  /** Present when the value editor can offer a closed list. */
  options?: OperandOption[];
  /** A select bound to a data source: no studio route resolves its options. */
}

export type CmpOp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in";

export type Row =
  | { kind: "cmp"; operand: string; op: CmpOp; value: string | number | boolean | undefined }
  | { kind: "raw"; src: string };

export interface Condition {
  joiner: "&&" | "||";
  rows: Row[];
}

/** Exported for `ruleLogic.ts`'s reuse: the six plain comparators, the ones
 * the rule-row builder writes too (it never writes `in`). */
export const CMP_OPS: CmpOp[] = ["==", "!=", "<", "<=", ">", ">="];

/** Operators offered per CEL type. A list gets `in` alone; it is the only mirrored form. */
export function operatorsFor(celTypeName: string): CmpOp[] {
  if (celTypeName === "list<string>") return ["in"];
  if (celTypeName === "double" || celTypeName === "int") return CMP_OPS;
  return ["==", "!="];
}

/**
 * The native input a literal value editor draws for an operand. The format
 * decides it where the field declares one: `date`, `datetime` and `email` all
 * type as CEL `string`, so `celType` cannot tell the three apart. The type
 * decides it otherwise.
 *
 * One copy, read by both builders — the condition builder and the rule
 * builder each held their own before this.
 */
export function inputTypeFor(operand: Pick<Operand, "declaredType" | "format">): "number" | "date" | "datetime-local" | "email" | "text" {
  if (operand.format === "date") return "date";
  if (operand.format === "datetime") return "datetime-local";
  if (operand.format === "email") return "email";
  if (operand.declaredType === "number") return "number";
  return "text";
}

// --- operands -------------------------------------------------------------

/**
 * Instance/actor entries the picker hides. None can express a guard that means
 * anything at a condition site: `currentStepId` is a constant (a path leaves
 * exactly one step), `id` names one instance out of a frozen body's whole
 * population, `transitionSeq` is the OCC token, and a fixed `actor.id` in a
 * frozen body is what stage 25 removed.
 *
 * A deny-list, not an allow-list: a later widening of INSTANCE_SCHEMA or
 * ACTOR_SCHEMA reaches the picker with no second place to maintain.
 */
const DENIED = new Set(["instance.id", "instance.currentStepId", "instance.transitionSeq", "actor.id"]);

/** The engine's instance statuses, for `instance.status`'s value editor. The
 * values stay the engine's own; only the labels come from the catalog. */
const INSTANCE_STATUSES = ["running", "completed", "cancelled", "faulted"] as const;

/** A context entry's label, by path. A path with no entry prints itself. */
const CONTEXT_LABELS: Record<string, CatalogKey> = {
  "instance.status": "condition.operand.caseStatus",
  "actor.roles": "condition.operand.personRoles",
};

/** A context entry's label inside a clause, by path. */
const CONTEXT_CLAUSE_LABELS: Record<string, CatalogKey> = {
  "instance.status": "condition.clauseOperand.caseStatus",
  "actor.roles": "condition.clauseOperand.personRoles",
};

const CONTEXT_GROUPS = { instance: "case", actor: "person" } as const;

function fieldLabel(f: DraftField, locale: string, baseLocale: string): string {
  const label = f.label ? resolveDraftLocalizedText(f.label, locale, baseLocale) : undefined;
  return label || t("condition.unnamedField");
}

/** Exported for `ruleLogic.ts`'s reuse (design.md: the rule-row builder
 * "reuses ConditionBuilder's parse-back approach"), which builds its own
 * operand list over a different prefix (`data`) and set of fields. */
export function fieldOperand(f: DraftField, prefix: string, locale: string, baseLocale: string): Operand | undefined {
  if (!f.key) return undefined;
  const operand: Operand = {
    path: `${prefix}.${f.key}`,
    label: fieldLabel(f, locale, baseLocale),
    celType: celType({ type: f.type as BaseFieldType, format: f.format }),
    declaredType: typeof f.type === "string" ? f.type : undefined,
    format: f.format,
  };
  if (f.options?.length) {
    operand.options = f.options.flatMap((o) =>
      o?.value === undefined ? [] : [{ value: o.value, label: resolveDraftLocalizedText(o.label, locale, baseLocale) ?? o.value }],
    );
  } else if (f.dataSource) {
    // No studio route resolves a data source's options, so the editor takes text.
  }
  return operand;
}

/**
 * Leaf fields of a draft catalog as `data.<key>`.
 *
 * `flattenDraftFields` pushes the group node itself (so do its contract-side
 * counterpart `collectFieldsDeep` and every id-uniqueness check), so the group
 * drop here is not optional: an instance's `data` is flat and keyed by a leaf.
 * The draft-shaped helper is the right one — `collectFieldsDeep` types against
 * a fully-required `FieldDef[]`, not a mid-edit draft's partial catalog.
 */
function catalogOperands(fields: DraftField[] | undefined, locale: string, baseLocale: string): Operand[] {
  const operands = flattenDraftFields(fields)
    .filter((f) => f.type !== "group")
    .flatMap((f) => {
      const o = fieldOperand(f, "data", locale, baseLocale);
      return o ? [o] : [];
    });
  // A second and later field sharing a label takes a count, in catalog order.
  const labels = numberRepeats(operands, (o) => o.label);
  return operands.map((o, i) => ({ ...o, label: labels[i]!, group: "fields" as const }));
}

/** INSTANCE_SCHEMA + ACTOR_SCHEMA, read mechanically, minus the deny-list. */
function contextOperands(): Operand[] {
  const out: Operand[] = [];
  for (const [ns, schema] of [
    ["instance", INSTANCE_SCHEMA],
    ["actor", ACTOR_SCHEMA],
  ] as const) {
    for (const [key, type] of Object.entries<string>(schema)) {
      const path = `${ns}.${key}`;
      if (DENIED.has(path)) continue;
      const labelKey = CONTEXT_LABELS[path];
      const operand: Operand = { path, label: labelKey ? t(labelKey) : path, celType: type, group: CONTEXT_GROUPS[ns] };
      const clauseKey = CONTEXT_CLAUSE_LABELS[path];
      if (clauseKey) operand.clauseLabel = t(clauseKey);
      if (path === "instance.status") {
        operand.options = INSTANCE_STATUSES.map((v) => ({ value: v, label: t(`condition.status.${v}`) }));
      }
      out.push(operand);
    }
  }
  return out;
}

/**
 * `child.outcome` and `child.data.<key>` for a subprocess step whose child is
 * resolved.
 *
 * `child.data` covers `contract.outputFields` alone. `checkSubprocessChildRefs`
 * types it with `contractFieldSchema(childBody.fields, contract.outputFields)`,
 * so a key outside that set is a publish error — offering one would let the
 * builder author a guaranteed failure.
 *
 * Only a path guard on that step asks for them (`ConditionInput`'s `stepId`).
 * The step's view overrides ask for none, because the runtime resolves a view
 * flag with no child in scope and the authoring check rejects `child` there.
 */
function childOperands(child: ProcessBody | undefined, locale: string): Operand[] {
  if (!child) return [];
  const out: Operand[] = [
    {
      path: "child.outcome",
      label: t("condition.operand.childOutcome"),
      clauseLabel: t("condition.clauseOperand.childOutcome"),
      celType: "string",
      group: "child",
      // The child's author typed these names, and none of them is a key.
      options: (child.contract?.outcomes ?? []).map((v) => ({ value: v, label: v })),
    },
  ];
  const outputs = new Set(child.contract?.outputFields ?? []);
  if (outputs.size) {
    for (const f of flattenDraftFields(child.fields as DraftField[])) {
      if (f.type === "group" || !f.id || !outputs.has(f.id)) continue;
      const o = fieldOperand(f, "child.data", locale, child.baseLocale);
      if (o) out.push({ ...o, label: fill(t("condition.operand.childField"), { label: o.label }), group: "child" });
    }
  }
  return out;
}

export function buildOperands(opts: {
  fields: DraftField[] | undefined;
  locale: string;
  baseLocale: string;
  child?: ProcessBody;
}): Operand[] {
  // The picker's order: fields, the called process, the case, the person.
  return [
    ...catalogOperands(opts.fields, opts.locale, opts.baseLocale),
    ...childOperands(opts.child, opts.locale),
    ...contextOperands(),
  ];
}

/**
 * What a read of `src` actually depended on, so a holder of builder state knows
 * when to re-read.
 *
 * `src` alone is not enough. A child process resolving mid-session leaves every
 * guard's text untouched while turning `child.outcome == "approved"` from an
 * unreadable fragment into a comparison row. A field key or type changing does
 * the same in reverse. Only path and CEL type matter: a label change moves no
 * row, so it must not discard one the author is still filling in.
 */
export function operandSignature(operands: Operand[]): string {
  return operands.map((o) => `${o.path}:${o.celType}`).join("|");
}

// --- reading --------------------------------------------------------------

/** The CEL AST shape this file walks. Narrower than the library's full union.
 * Named `CelNode`, not `Node`: this package compiles with `"DOM"` in `lib`, so
 * the global `Node` is in scope in every consumer and a bare local `Node`
 * shadows it. Exported for `ruleLogic.ts`'s reuse. */
export interface CelNode {
  op: string;
  args: unknown;
}

export const isCelNode = (v: unknown): v is CelNode =>
  typeof v === "object" && v !== null && typeof (v as CelNode).op === "string";

/** `{op:".", args:[{op:"id",args:"data"}, "amount"]}` -> `"data.amount"`, else undefined.
 * Exported for `ruleLogic.ts`'s reuse. */
export function memberPath(node: CelNode): string | undefined {
  if (node.op === "id") return typeof node.args === "string" ? node.args : undefined;
  if (node.op !== ".") return undefined;
  const [target, name] = node.args as [unknown, unknown];
  if (!isCelNode(target) || typeof name !== "string") return undefined;
  const base = memberPath(target);
  return base === undefined ? undefined : `${base}.${name}`;
}

/**
 * The parser returns an integer literal as a `bigint` and a negative literal
 * as a `-_` node over the positive one. A `bigint` outside the safe range
 * stays unread, so the comparison falls to a raw row instead of rounding.
 * Exported for `ruleLogic.ts`'s reuse.
 */
export function literalOf(node: CelNode): string | number | boolean | undefined {
  if (node.op === "-_" && isCelNode(node.args)) {
    const inner = literalOf(node.args);
    // `0 - inner` keeps `-0.0` at 0, which `-inner` would turn into -0.
    return typeof inner === "number" ? 0 - inner : undefined;
  }
  if (node.op !== "value") return undefined;
  const v = node.args;
  if (typeof v === "bigint") return Number.isSafeInteger(Number(v)) ? Number(v) : undefined;
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : undefined;
}

/**
 * A raw row prints the node back through `serializeAst`, never a slice of
 * the original source by `node.range`: that range excludes a parenthesized
 * sub-expression's own wrapping parens (see `serializeAst`'s doc), which
 * would otherwise truncate a fragment like `!(data.amount > 1000.0)`.
 */
function rawRow(node: CelNode): Row {
  return { kind: "raw", src: serializeAst(node as never) };
}

function readRow(node: CelNode, byPath: Map<string, Operand>): Row {
  // A bare boolean operand reads as an explicit `== true`.
  const bare = memberPath(node);
  if (bare !== undefined && byPath.get(bare)?.celType === "bool") {
    return { kind: "cmp", operand: bare, op: "==", value: true };
  }

  if (!Array.isArray(node.args) || node.args.length !== 2) return rawRow(node);
  const [left, right] = node.args as [unknown, unknown];
  if (!isCelNode(left) || !isCelNode(right)) return rawRow(node);

  // `"manager" in actor.roles`: the literal sits left, mirroring the CEL text.
  if (node.op === "in") {
    const path = memberPath(right);
    const value = literalOf(left);
    if (path !== undefined && byPath.has(path) && value !== undefined) {
      return { kind: "cmp", operand: path, op: "in", value };
    }
    return rawRow(node);
  }

  if (!CMP_OPS.includes(node.op as CmpOp)) return rawRow(node);
  const path = memberPath(left);
  const value = literalOf(right);
  if (path === undefined || !byPath.has(path) || value === undefined) return rawRow(node);
  return { kind: "cmp", operand: path, op: node.op as CmpOp, value };
}

/** Flatten the left-associative chain of one operator; a nested other operator
 * survives whole. Exported for `ruleLogic.ts`'s reuse. */
export function conjuncts(node: CelNode, joiner: string): CelNode[] {
  if (node.op !== joiner || !Array.isArray(node.args) || node.args.length !== 2) return [node];
  const [left, right] = node.args as [unknown, unknown];
  if (!isCelNode(left) || !isCelNode(right)) return [node];
  return [...conjuncts(left, joiner), right];
}

/**
 * Read stored CEL into rows. `null` means the source does not parse, which is
 * the builder's one closed state: the site draws a notice in place of the rows
 * and opens its Developer view on the CEL text.
 */
export function fromCel(src: string | undefined, operands: Operand[]): Condition | null {
  if (!src?.trim()) return { joiner: "&&", rows: [] };
  const ast = parseAst(src);
  if (!ast || !isCelNode(ast)) return null;

  const byPath = new Map(operands.map((o) => [o.path, o]));
  const joiner = ast.op === "||" ? "||" : "&&";
  const nodes = ast.op === "&&" || ast.op === "||" ? conjuncts(ast, ast.op) : [ast];
  return { joiner, rows: nodes.map((n) => readRow(n, byPath)) };
}

// --- writing --------------------------------------------------------------

/** Double-quoted, with every character the CEL string grammar needs escaped. */
function celString(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}"`;
}

/**
 * A literal in the form the operand's declared type requires, not the form the
 * author typed. A `number` field is CEL `double`, so `data.count == 5` fails
 * and needs `5.0` — the builder writes it, and the papercut disappears for
 * everyone who authors here.
 *
 * A field carrying `format: "integer"` types as CEL `int` instead, and the
 * two do not mix: `data.anzahl > 3.0` fails the check against one. So an
 * `int` operand takes a bare integer, and a value with a decimal part is no
 * literal for it at all. The reader takes only a safe integer back, so the
 * writer offers no other.
 *
 * JavaScript prints a magnitude from 1e21 up with an exponent (`1e+21`), and
 * `1e+21.0` is no CEL. That text is already a `double`, so it stays as it is.
 */
export function celLiteral(value: string | number | boolean, celTypeName: string): string | undefined {
  if (celTypeName === "bool") return value === true || value === "true" ? "true" : "false";
  if (celTypeName === "int") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isSafeInteger(n) ? String(n) : undefined;
  }
  if (celTypeName === "double") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return undefined;
    const text = String(n);
    return Number.isInteger(n) && !text.includes("e") ? `${text}.0` : text;
  }
  return celString(String(value));
}

/** The boolean select's value for a row's literal: `""` stands for no choice yet. */
export function boolChoiceOf(value: string | number | boolean | undefined): "" | "true" | "false" {
  if (value === undefined || value === "") return "";
  return value === true || value === "true" ? "true" : "false";
}

/** The inverse of `boolChoiceOf`: the empty choice leaves the row unfinished. */
export function boolValueOf(choice: string): boolean | undefined {
  return choice === "" ? undefined : choice === "true";
}

/** True when a row carries everything `toCel` needs to write it. */
export function isComplete(row: Row, byPath: Map<string, Operand>): boolean {
  if (row.kind === "raw") return row.src.trim().length > 0;
  const operand = byPath.get(row.operand);
  if (!operand) return false;
  if (row.value === undefined || row.value === "") return false;
  return celLiteral(row.value, operand.celType) !== undefined;
}

/**
 * Write the rows back to CEL. An incomplete row is skipped rather than emitted
 * half-written: the draft saves continuously and `validateProcessBody` runs
 * live, so `data.amount > ` would put a parse error in the IssueList on every
 * keystroke. `undefined` means no row contributes. `commitDecision` decides
 * what the draft does with that.
 */
export function toCel(condition: Condition, operands: Operand[]): string | undefined {
  const byPath = new Map(operands.map((o) => [o.path, o]));
  const usable = condition.rows.filter((r) => isComplete(r, byPath));
  const parenthesise = usable.length > 1;

  const parts = usable.flatMap((row) => {
    if (row.kind === "raw") return [parenthesise ? `(${row.src})` : row.src];
    const operand = byPath.get(row.operand)!;
    const literal = celLiteral(row.value as string | number | boolean, operand.celType)!;
    // `in` is the one mirrored form: the literal sits left, as the CEL text reads.
    return [row.op === "in" ? `${literal} in ${operand.path}` : `${operand.path} ${row.op} ${literal}`];
  });

  return parts.length ? parts.join(` ${condition.joiner} `) : undefined;
}

/**
 * What an authoring action does to the draft. `written` is the text `toCel` or
 * `toRuleCel` produced for the new rows, `stored` the source the draft holds.
 *
 * - `write`: a row contributes, so the draft takes the new text.
 * - `clear`: a row was removed, no row contributes and a source is stored. The
 *   author took the condition out.
 * - `hold`: the draft stays as it is. An unfinished row is an edit in progress,
 *   so it never deletes a stored source. Removing a row from an empty site
 *   also lands here, which keeps the views of a divergent field intact.
 */
export function commitDecision(
  written: string | undefined,
  oldRowCount: number,
  newRowCount: number,
  stored: string | undefined,
): "write" | "clear" | "hold" {
  if (written !== undefined) return "write";
  return newRowCount < oldRowCount && stored !== undefined ? "clear" : "hold";
}

// --- the condition in words (studio-condition-builder) --------------------

/** Each operator's catalog name: `condition.op.<name>` is its select word and
 * `condition.clause.<name>` its clause. */
export const OP_NAMES = {
  "==": "eq",
  "!=": "ne",
  "<": "lt",
  "<=": "le",
  ">": "gt",
  ">=": "ge",
  in: "in",
} as const satisfies Record<CmpOp, string>;

/** No digit the author typed goes. */
const NUMBER = new Intl.NumberFormat("en", { maximumFractionDigits: 20 });

/**
 * The value half of a clause, in the author's form: an option's label for a
 * closed list, "yes" or "no" for a boolean, a formatted number, a date or a
 * date-time as its stored text, and free text in curly quotes.
 */
function summarizeValue(row: Extract<Row, { kind: "cmp" }>, operand: Operand | undefined): string {
  const option = operand?.options?.find((o) => o.value === row.value);
  if (option) return option.label;
  if (operand?.celType === "bool") return boolChoiceOf(row.value) === "true" ? t("condition.yes") : t("condition.no");
  if (operand?.celType === "double" || operand?.celType === "int") return NUMBER.format(Number(row.value));
  if (operand?.format === "date" || operand?.format === "datetime") return String(row.value ?? "");
  return `“${String(row.value ?? "")}”`;
}

/** What a raw row reads as: its own CEL text, or the catalog's phrase. */
export type RawRowReading = "source" | "phrase";

/** One row's clause. A boolean row takes the `eq` or `ne` clause with the
 * value "yes" or "no". */
function summarizeRow(row: Row, byPath: Map<string, Operand>, raw: RawRowReading): string {
  if (row.kind === "raw") return raw === "source" ? row.src : t("condition.clause.raw");
  const operand = byPath.get(row.operand);
  return fill(t(`condition.clause.${OP_NAMES[row.op]}`), {
    field: operand?.clauseLabel ?? operand?.label ?? row.operand,
    value: summarizeValue(row, operand),
  });
}

/**
 * The complete rows' clauses, joined by the condition's joiner: the words the
 * builder's sentence and the canvas edge label share. Walks the same
 * `Condition`/`Row` model `ConditionBuilder` holds, never the CEL text.
 *
 * `raw` picks what a raw row reads as. The canvas edge and the form preview's
 * path note keep the fragment's CEL text; the builder's sentence reads the
 * catalog's phrase.
 *
 * Returns `""` for a condition with no complete row (an empty guard, or one
 * still mid-edit); the caller decides what an empty summary means for its
 * placement.
 */
export function summarizeCondition(condition: Condition, operands: Operand[], raw: RawRowReading = "source"): string {
  const byPath = new Map(operands.map((o) => [o.path, o]));
  const clauses = condition.rows.filter((r) => isComplete(r, byPath)).map((r) => summarizeRow(r, byPath, raw));
  if (!clauses.length) return "";
  const join = t(condition.joiner === "&&" ? "condition.join.and" : "condition.join.or");
  return clauses.reduce((left, right) => fill(join, { left, right }));
}

const capitalize = (s: string): string => s.charAt(0).toLocaleUpperCase("en") + s.slice(1);

/**
 * The builder's sentence under its rows, in one of four states. `condition` is
 * the parsed rows; the caller handles source that does not parse. `stored` is
 * the source the draft holds.
 *
 * - A complete row: the clauses, ending in a period.
 * - No row and nothing stored: the condition always matches.
 * - No complete row over a stored source: the stored condition holds until
 *   the author finishes the row.
 * - No complete row over nothing (or over a stored source with no clause to
 *   read): the author finishes a row first.
 */
export function conditionSentence(condition: Condition, operands: Operand[], stored: string | undefined): string {
  const clauses = summarizeCondition(condition, operands, "phrase");
  if (clauses) return capitalize(fill(t("condition.sentence"), { condition: clauses }));
  const hasStored = Boolean(stored?.trim());
  if (!condition.rows.length && !hasStored) return t("condition.empty");
  const held = hasStored ? fromCel(stored, operands) : null;
  const heldClauses = held ? summarizeCondition(held, operands, "phrase") : "";
  if (heldClauses) return capitalize(fill(t("condition.sentence.held"), { condition: heldClauses }));
  return t("condition.sentence.none");
}

/**
 * The readable form of a guard's CEL text: a plain-English summary when the
 * guard parses into rows, the raw CEL text otherwise (a fragment the builder
 * cannot represent at all — see "A fragment the builder cannot represent
 * survives as a raw row").
 */
export function guardEdgeLabel(src: string, operands: Operand[]): string {
  const condition = fromCel(src, operands);
  if (!condition) return src;
  const summary = summarizeCondition(condition, operands, "source");
  if (!summary) return src;
  // The label reads as the head of a sentence, as the builder's does. A raw
  // row at the head prints its CEL text, which stays as written.
  const byPath = new Map(operands.map((o) => [o.path, o]));
  const head = condition.rows.find((r) => isComplete(r, byPath));
  return head?.kind === "cmp" ? capitalize(summary) : summary;
}

/**
 * The canvas edge label for a path, whatever its trigger: the guard's readable
 * form, or `undefined` for a path with no guard. A manual path's guard decides
 * whether the participant gets the button, so its edge names it too.
 */
export function edgeGuardLabel(path: { guard?: { src?: string } }, operands: Operand[]): string | undefined {
  const src = path.guard?.src;
  return src ? guardEdgeLabel(src, operands) : undefined;
}
