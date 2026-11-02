/**
 * The condition builder's pure half: read CEL into rows (with one grouping
 * level), write them back out, build the operand list the picker offers, and
 * read the rows back as a sentence.
 *
 * Read-back is by parse, never by a sidecar. A record of "how this condition
 * was built" cannot live in `ProcessBody` (it would move `definitionHash`) and
 * dies at publish if kept beside the draft, which would leave a published
 * version uneditable in the builder. So the stored artifact stays the CEL text
 * and this model lives only between `parseAst()` and the next keystroke.
 *
 * Nothing here is persisted, hashed or versioned. A change to the row model
 * therefore changes no stored text.
 */

import { parseAst, serializeAst, celType, INSTANCE_SCHEMA, ACTOR_SCHEMA } from "workflow-engine/cel/check";
import { formatMatches, type BaseFieldType, type ProcessBody } from "workflow-engine/schema";
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

/** `!in` is the negated membership, `!("x" in F)`: a comparator of its own. */
export type CmpOp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "!in";

export type Literal = string | number | boolean | undefined;

/** A comparison's right side: a typed literal, or another field's operand. */
export type RowValue = { kind: "literal"; value: Literal } | { kind: "field"; path: string };

export type Leaf = { kind: "cmp"; operand: string; op: CmpOp; value: RowValue } | { kind: "raw"; src: string };

/** A group holds leaves only: the one-level limit lives in the type. */
export interface GroupRow {
  kind: "group";
  joiner: "&&" | "||";
  rows: Leaf[];
}

export type Row = Leaf | GroupRow;

export interface Condition {
  joiner: "&&" | "||";
  rows: Row[];
}

/** Exported for `ruleLogic.ts`'s reuse: the six plain comparators, the ones
 * the rule-row builder writes too (it never writes `in`). */
export const CMP_OPS: CmpOp[] = ["==", "!=", "<", "<=", ">", ">="];

/**
 * Operators offered per CEL type and format. A list gets the membership pair,
 * the only mirrored form. A date orders, since its `YYYY-MM-DD` text orders as
 * the calendar does. A date-time does not: its text may carry seconds and a
 * zone, so it keeps equality alone. The rule builder passes the type alone.
 */
export function operatorsFor(celTypeName: string, format?: string): CmpOp[] {
  if (celTypeName === "list<string>") return ["in", "!in"];
  if (celTypeName === "double" || celTypeName === "int") return CMP_OPS;
  if (celTypeName === "string" && format === "date") return CMP_OPS;
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
export function literalOf(node: CelNode): Literal {
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
function rawRow(node: CelNode): Leaf {
  return { kind: "raw", src: serializeAst(node as never) };
}

/** The operand a bare boolean member path names, else undefined. */
function boolOperand(node: CelNode, byPath: Map<string, Operand>): string | undefined {
  const path = memberPath(node);
  return path !== undefined && byPath.get(path)?.celType === "bool" ? path : undefined;
}

/** `"manager" in actor.roles`: the literal sits left, mirroring the CEL text. */
function readMembership(node: CelNode, byPath: Map<string, Operand>, op: "in" | "!in"): Leaf | undefined {
  if (node.op !== "in" || !Array.isArray(node.args) || node.args.length !== 2) return undefined;
  const [left, right] = node.args as [unknown, unknown];
  if (!isCelNode(left) || !isCelNode(right)) return undefined;
  const path = memberPath(right);
  const value = literalOf(left);
  if (path === undefined || !byPath.has(path) || value === undefined) return undefined;
  return { kind: "cmp", operand: path, op, value: { kind: "literal", value } };
}

const comparesFields = (o: Operand) => o.group === "fields" || o.group === "child";

/**
 * The field and called-process operands a row on `operandPath` can compare
 * against: the same CEL type and the same `format` (an absent format matches
 * an absent one alone), the operand itself left out. A row on a context
 * operand takes none, and so does a list operand, since `in` takes a literal.
 */
export function fieldValueCandidates(operandPath: string, operands: Operand[]): Operand[] {
  const operand = operands.find((o) => o.path === operandPath);
  if (!operand || !comparesFields(operand) || operand.celType === "list<string>") return [];
  return operands.filter(
    (o) =>
      o.path !== operandPath &&
      comparesFields(o) &&
      o.celType === operand.celType &&
      o.format === operand.format,
  );
}

/** One leaf: a comparison the builder can show, else a raw row. A comparison
 * on an operator its operand does not offer stays raw, so a row's select never
 * holds an operator it cannot list. */
function readLeaf(node: CelNode, operands: Operand[], byPath: Map<string, Operand>): Leaf {
  const leaf = readComparison(node, operands, byPath);
  if (leaf.kind !== "cmp") return leaf;
  const operand = byPath.get(leaf.operand)!;
  return operatorsFor(operand.celType, operand.format).includes(leaf.op) ? leaf : rawRow(node);
}

function readComparison(node: CelNode, operands: Operand[], byPath: Map<string, Operand>): Leaf {
  // A bare boolean operand reads as an explicit `== true`.
  const bare = boolOperand(node, byPath);
  if (bare !== undefined) return { kind: "cmp", operand: bare, op: "==", value: { kind: "literal", value: true } };

  // `!` reads over a membership as `!in`, and over a bare boolean as `== false`.
  if (node.op === "!_" && isCelNode(node.args)) {
    const negated = boolOperand(node.args, byPath);
    if (negated !== undefined) return { kind: "cmp", operand: negated, op: "==", value: { kind: "literal", value: false } };
    return readMembership(node.args, byPath, "!in") ?? rawRow(node);
  }

  if (node.op === "in") return readMembership(node, byPath, "in") ?? rawRow(node);

  if (!CMP_OPS.includes(node.op as CmpOp) || !Array.isArray(node.args) || node.args.length !== 2) return rawRow(node);
  const [left, right] = node.args as [unknown, unknown];
  if (!isCelNode(left) || !isCelNode(right)) return rawRow(node);
  const path = memberPath(left);
  if (path === undefined || !byPath.has(path)) return rawRow(node);
  const op = node.op as CmpOp;

  const value = literalOf(right);
  if (value !== undefined) return { kind: "cmp", operand: path, op, value: { kind: "literal", value } };

  // A right side the field picker would offer reads as a field value.
  const other = memberPath(right);
  if (other !== undefined && fieldValueCandidates(path, operands).some((o) => o.path === other)) {
    return { kind: "cmp", operand: path, op, value: { kind: "field", path: other } };
  }
  return rawRow(node);
}

const isJoin = (node: CelNode): node is CelNode & { op: "&&" | "||" } => node.op === "&&" || node.op === "||";

/** Flatten a chain of one operator on both sides: `a && (b && c)` is three
 * members, since a parenthesis around the same operator has no meaning. */
function chainOf(node: CelNode, joiner: string): CelNode[] {
  if (node.op !== joiner || !Array.isArray(node.args) || node.args.length !== 2) return [node];
  const [left, right] = node.args as [unknown, unknown];
  if (!isCelNode(left) || !isCelNode(right)) return [node];
  return [...chainOf(left, joiner), ...chainOf(right, joiner)];
}

/** One member of the condition's chain. A chain of the other operator reads as
 * a group, whose own `&&` or `||` members read as raw rows. */
function readRow(node: CelNode, operands: Operand[], byPath: Map<string, Operand>): Row {
  if (!isJoin(node)) return readLeaf(node, operands, byPath);
  const rows = chainOf(node, node.op).map((m) => (isJoin(m) ? rawRow(m) : readLeaf(m, operands, byPath)));
  return { kind: "group", joiner: node.op, rows };
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
 *
 * A comparison reads as a row only where the picker would offer it: a known
 * operand, an operator `operatorsFor` lists for its type and format, and a
 * literal or a field `fieldValueCandidates` lists. Anything else is a raw row
 * holding its own text. Nothing writes on read.
 */
export function fromCel(src: string | undefined, operands: Operand[]): Condition | null {
  if (!src?.trim()) return { joiner: "&&", rows: [] };
  const ast = parseAst(src);
  if (!ast || !isCelNode(ast)) return null;

  const byPath = new Map(operands.map((o) => [o.path, o]));
  if (!isJoin(ast)) return { joiner: "&&", rows: [readLeaf(ast, operands, byPath)] };
  return { joiner: ast.op, rows: chainOf(ast, ast.op).map((n) => readRow(n, operands, byPath)) };
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
export function boolChoiceOf(value: Literal): "" | "true" | "false" {
  if (value === undefined || value === "") return "";
  return value === true || value === "true" ? "true" : "false";
}

/** The inverse of `boolChoiceOf`: the empty choice leaves the row unfinished. */
export function boolValueOf(choice: string): boolean | undefined {
  return choice === "" ? undefined : choice === "true";
}

/** True when a row carries everything `toCel` needs to write it. A group is
 * complete when one of its leaves is. */
export function isComplete(row: Row, byPath: Map<string, Operand>): boolean {
  if (row.kind === "group") return row.rows.some((r) => isComplete(r, byPath));
  if (row.kind === "raw") return row.src.trim().length > 0;
  const operand = byPath.get(row.operand);
  if (!operand) return false;
  // `in` takes a literal: a field value has no membership form.
  if (row.value.kind === "field") return byPath.has(row.value.path) && row.op !== "in" && row.op !== "!in";
  const value = row.value.value;
  if (value === undefined || value === "") return false;
  return celLiteral(value, operand.celType) !== undefined;
}

/** The leaves plus the groups: the count `commitDecision` compares, so a
 * removal inside a group counts as a removal. */
export function rowCount(condition: Condition): number {
  return condition.rows.reduce((n, r) => n + (r.kind === "group" ? 1 + r.rows.length : 1), 0);
}

/** A fresh comparison row on the first operand, with no value yet. */
export function newLeaf(operands: Operand[]): Leaf {
  const first = operands[0];
  return {
    kind: "cmp",
    operand: first?.path ?? "",
    op: operatorsFor(first?.celType ?? "string", first?.format)[0]!,
    value: { kind: "literal", value: undefined },
  };
}

/** A fresh group with one fresh row, on the joiner opposite to the one it
 * joins: a group on the same joiner reads back flat. */
export function newGroup(parentJoiner: Condition["joiner"], operands: Operand[]): GroupRow {
  return { kind: "group", joiner: parentJoiner === "&&" ? "||" : "&&", rows: [newLeaf(operands)] };
}

/** A row's place: a top-level row, or with `inner` a leaf of the group there. */
export interface RowAt {
  row: number;
  inner?: number;
}

/** The condition without the row at `at`. A group's last leaf takes the
 * group with it: the author never faces an empty group. */
export function withoutRow(condition: Condition, at: RowAt): Condition {
  const target = condition.rows[at.row];
  if (at.inner === undefined || target?.kind !== "group") {
    return { ...condition, rows: condition.rows.filter((_, i) => i !== at.row) };
  }
  const rows = target.rows.filter((_, i) => i !== at.inner);
  return {
    ...condition,
    rows: rows.length
      ? condition.rows.map((r, i) => (i === at.row ? { ...target, rows } : r))
      : condition.rows.filter((_, i) => i !== at.row),
  };
}

/** The condition with a fresh group after its rows. */
export function withGroup(condition: Condition, operands: Operand[]): Condition {
  return { ...condition, rows: [...condition.rows, newGroup(condition.joiner, operands)] };
}

/** One complete leaf as CEL, a raw row's text as it stands. */
function leafCel(leaf: Leaf, byPath: Map<string, Operand>): string {
  if (leaf.kind === "raw") return leaf.src;
  const operand = byPath.get(leaf.operand)!;
  const value = leaf.value.kind === "field" ? leaf.value.path : celLiteral(leaf.value.value as string | number | boolean, operand.celType)!;
  // `in` is the one mirrored form: the literal sits left, as the CEL text reads.
  if (leaf.op === "in") return `${value} in ${operand.path}`;
  if (leaf.op === "!in") return `!(${value} in ${operand.path})`;
  return `${operand.path} ${leaf.op} ${value}`;
}

/** Leaves joined at one level. A raw row takes parentheses beside a second part. */
function joinLeaves(leaves: Leaf[], joiner: Condition["joiner"], parenthesise: boolean, byPath: Map<string, Operand>): string {
  return leaves.map((l) => (l.kind === "raw" && parenthesise ? `(${l.src})` : leafCel(l, byPath))).join(` ${joiner} `);
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
  // A group of one usable leaf writes as that leaf at the condition's level.
  const parts = condition.rows.flatMap((row): (Leaf | GroupRow)[] => {
    if (row.kind !== "group") return isComplete(row, byPath) ? [row] : [];
    const leaves = row.rows.filter((r) => isComplete(r, byPath));
    if (leaves.length > 1) return [{ ...row, rows: leaves }];
    return leaves;
  });
  if (!parts.length) return undefined;
  const parenthesise = parts.length > 1;

  return parts
    .map((part) => {
      if (part.kind !== "group") return joinLeaves([part], condition.joiner, parenthesise, byPath);
      const text = joinLeaves(part.rows, part.joiner, true, byPath);
      return parenthesise ? `(${text})` : text;
    })
    .join(` ${condition.joiner} `);
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
 * `condition.clause.<name>` its clause. A date operand's ordering operators
 * take the names in `DATE_OP_NAMES` instead. */
export const OP_NAMES = {
  "==": "eq",
  "!=": "ne",
  "<": "lt",
  "<=": "le",
  ">": "gt",
  ">=": "ge",
  in: "in",
  "!in": "notIn",
} as const satisfies Record<CmpOp, string>;

const DATE_OP_NAMES = { "<": "before", "<=": "onOrBefore", ">": "after", ">=": "onOrAfter" } as const;

type OrderingOp = keyof typeof DATE_OP_NAMES;
type OpName = (typeof OP_NAMES)[CmpOp] | (typeof DATE_OP_NAMES)[OrderingOp];

/** An operator's catalog name, picked by the operand's format. */
function opName(op: CmpOp, operand: Pick<Operand, "format"> | undefined): OpName {
  if (operand?.format === "date" && op in DATE_OP_NAMES) return DATE_OP_NAMES[op as OrderingOp];
  return OP_NAMES[op];
}

/** The operator select's word for `op` on `operand`: "is on or before" for a
 * date, "is at most" for a number. */
export function operatorWord(op: CmpOp, operand: Pick<Operand, "format"> | undefined): string {
  return t(`condition.op.${opName(op, operand)}`);
}

/** No digit the author typed goes. */
const NUMBER = new Intl.NumberFormat("en", { maximumFractionDigits: 20 });

const DATE = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const DATE_TIME = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

/** A date or date-time literal as a formatted date. A zoneless value reads its
 * components as UTC and prints in UTC, so the printed date and time are the
 * ones stored, whatever the browser's zone. A date-time carrying a zone, a
 * literal outside the format's value domain, and one no `Date` can hold print
 * as their stored text. */
function formatDate(value: Literal, format: "date" | "datetime"): string {
  const text = String(value ?? "");
  if (!formatMatches({ type: "string", format }, text)) return text;
  if (format === "datetime" && /(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return text;
  const date = new Date(format === "date" ? `${text}T00:00:00Z` : `${text}Z`);
  if (Number.isNaN(date.getTime())) return text;
  return (format === "date" ? DATE : DATE_TIME).format(date);
}

/**
 * The value half of a clause, in the author's form: an option's label for a
 * closed list, "yes" or "no" for a boolean, a formatted number, a formatted
 * date or date-time, and free text in curly quotes.
 */
export function summarizeValue(value: Literal, operand: Operand | undefined): string {
  const option = operand?.options?.find((o) => o.value === value);
  if (option) return option.label;
  if (operand?.celType === "bool") return boolChoiceOf(value) === "true" ? t("condition.yes") : t("condition.no");
  if (operand?.celType === "double" || operand?.celType === "int") return NUMBER.format(Number(value));
  if (operand?.format === "date" || operand?.format === "datetime") return formatDate(value, operand.format);
  return `“${String(value ?? "")}”`;
}

/** One leaf's clause. A boolean row takes the `eq` or `ne` clause with the
 * value "yes" or "no". A field value prints the other field's label. A raw
 * row reads as the catalog's phrase, never its CEL text. */
function summarizeLeaf(leaf: Leaf, byPath: Map<string, Operand>): string {
  if (leaf.kind === "raw") return t("condition.clause.raw");
  const operand = byPath.get(leaf.operand);
  const value =
    leaf.value.kind === "field"
      ? (byPath.get(leaf.value.path)?.label ?? t("condition.unnamedField"))
      : summarizeValue(leaf.value.value, operand);
  return fill(t(`condition.clause.${opName(leaf.op, operand)}`), {
    field: operand?.clauseLabel ?? operand?.label ?? leaf.operand,
    value,
  });
}

/** A group's clause over its complete leaves: one reads as itself, two as
 * "either A or B" or "both A and B", three or more as "any of A, B or C" or
 * "all of A, B and C". */
function summarizeGroup(group: GroupRow, byPath: Map<string, Operand>): string {
  const clauses = group.rows.filter((r) => isComplete(r, byPath)).map((r) => summarizeLeaf(r, byPath));
  const or = group.joiner === "||";
  if (clauses.length < 2) return clauses[0] ?? "";
  if (clauses.length === 2) {
    return fill(t(or ? "condition.clause.either" : "condition.clause.both"), { left: clauses[0]!, right: clauses[1]! });
  }
  const head = clauses.slice(0, -1).reduce((left, right) => fill(t("condition.join.list"), { left, right }));
  const list = fill(t(or ? "condition.join.or" : "condition.join.and"), { left: head, right: clauses.at(-1)! });
  return fill(t(or ? "condition.clause.anyOf" : "condition.clause.allOf"), { clauses: list });
}

/**
 * The complete rows' clauses, joined by the condition's joiner: the words the
 * builder's sentence and `guardPhrase` share. Walks the same `Condition`/`Row`
 * model `ConditionBuilder` holds, never the CEL text.
 *
 * Returns `""` for a condition with no complete row (an empty guard, or one
 * still mid-edit); the caller decides what an empty summary means for its
 * placement.
 */
export function summarizeCondition(condition: Condition, operands: Operand[]): string {
  const byPath = new Map(operands.map((o) => [o.path, o]));
  const rows = condition.rows.filter((r) => isComplete(r, byPath));
  // A group of one complete leaf reads as that leaf, so it is no group here.
  const groups = rows.map((r) => r.kind === "group" && r.rows.filter((l) => isComplete(l, byPath)).length > 1);
  const clauses = rows.map((r) => (r.kind === "group" ? summarizeGroup(r, byPath) : summarizeLeaf(r, byPath)));
  return joinClauses(clauses, condition.joiner, groups);
}

/**
 * The clauses folded through the catalog's join phrase, `""` for none.
 * `groups[i]` marks clause `i` as a group's clause: a group clause with a
 * clause after it joins through the comma form, so "either A or B, and C"
 * never reads as "either A or (B and C)". Exported for `ruleLogic.ruleSentence`,
 * which reads the same phrases and passes no group.
 */
export function joinClauses(clauses: readonly string[], joiner: Condition["joiner"], groups: readonly boolean[] = []): string {
  if (!clauses.length) return "";
  const and = joiner === "&&";
  const join = t(and ? "condition.join.and" : "condition.join.or");
  const afterGroup = t(and ? "condition.join.andAfterGroup" : "condition.join.orAfterGroup");
  return clauses.reduce((left, right, i) => fill(groups[i - 1] ? afterGroup : join, { left, right }));
}

/** True when the condition's sentence opens on a value, a list clause's: the
 * sentence then keeps the value's case. */
function opensOnValue(condition: Condition, operands: Operand[]): boolean {
  const byPath = new Map(operands.map((o) => [o.path, o]));
  const first = condition.rows.find((r) => isComplete(r, byPath));
  const leaves = first?.kind === "group" ? first.rows.filter((l) => isComplete(l, byPath)) : first ? [first] : [];
  // A group of two or more opens on its group word.
  const lead = leaves.length === 1 ? leaves[0] : undefined;
  return lead?.kind === "cmp" && (lead.op === "in" || lead.op === "!in");
}

/** A condition's clauses as a sentence: a capital at the head, unless the
 * sentence opens on a value, and a period at the end. */
function sentenceOf(condition: Condition, operands: Operand[], clauses: string): string {
  const sentence = fill(t("condition.sentence"), { condition: clauses });
  return opensOnValue(condition, operands) ? sentence : capitalize(sentence);
}

/** Exported for `ruleLogic.ruleSentence`, which opens its sentence the same way. */
export const capitalize = (s: string): string => s.charAt(0).toLocaleUpperCase("en") + s.slice(1);

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
  const clauses = summarizeCondition(condition, operands);
  if (clauses) return sentenceOf(condition, operands, clauses);
  const hasStored = Boolean(stored?.trim());
  if (!condition.rows.length && !hasStored) return t("condition.empty");
  const held = hasStored ? fromCel(stored, operands) : null;
  const heldClauses = held ? summarizeCondition(held, operands) : "";
  if (heldClauses) return capitalize(fill(t("condition.sentence.held"), { condition: heldClauses }));
  return t("condition.sentence.none");
}

/**
 * A stored condition as one sentence, for a place that lists conditions
 * without a builder. The complete rows' clauses read as the builder's
 * sentence does, and a raw row reads as the catalog's phrase. Source that
 * does not parse, or holds no complete row, reads as a hand-written rule.
 */
export function readerSentence(src: string, operands: Operand[]): string {
  const condition = fromCel(src, operands);
  const clauses = condition ? summarizeCondition(condition, operands) : "";
  if (!condition || !clauses) return t("condition.readerRaw");
  return sentenceOf(condition, operands, clauses);
}

/**
 * A guard's condition as a phrase, the words the canvas way out's sentence and
 * the form preview's note read. The complete rows' clauses read as the
 * builder's sentence does, with no capital added: a field label keeps the
 * author's case, a context operand reads lowercase. A raw row beside a
 * readable row reads as the catalog's phrase. Source that does not parse, or
 * holds no complete comparison row at either level, reads as a hand-written
 * rule holding.
 * No CEL source prints, whatever the guard holds.
 */
export function guardPhrase(src: string, operands: Operand[]): string {
  const condition = fromCel(src, operands);
  if (!condition) return t("condition.handWrittenHolds");
  const byPath = new Map(operands.map((o) => [o.path, o]));
  // A raw row counts as complete, so the test reads the row kind. A
  // comparison inside a group counts as readable too.
  const readable = (r: Row): boolean => (r.kind === "group" ? r.rows.some(readable) : r.kind === "cmp" && isComplete(r, byPath));
  if (!condition.rows.some(readable)) return t("condition.handWrittenHolds");
  return summarizeCondition(condition, operands);
}
