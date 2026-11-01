/**
 * The rule-row builder's pure half — a field's `validation.rule`, read and
 * written as rows. A new component, not a `ConditionBuilder` instance
 * (design.md's decision: its default operand and its field-against-field
 * comparison have no counterpart on the guard sites `ConditionBuilder`
 * drives). It reuses `conditionLogic`'s AST walk, its literal formatting and
 * its comparator list directly rather than re-deriving them.
 *
 * Rows join by "and" only — no "or" toggle, per the mockup. A row compares
 * "this answer" (the field's own key, `data.<key>`) or another catalog
 * field, against a literal or another catalog field.
 */

import { parseAst, serializeAst } from "workflow-engine/cel/check";
import type { DraftField } from "../../draft/fields";
import { flattenDraftFields } from "../../draft/fields";
import { t } from "../../catalog.js";
import { fill, numberRepeats } from "./optionText";
import {
  capitalize,
  celLiteral,
  CMP_OPS,
  conjuncts,
  fieldOperand,
  isCelNode,
  joinClauses,
  literalOf,
  memberPath,
  OP_NAMES,
  operatorsFor,
  summarizeValue,
  type CelNode,
  type CmpOp,
  type Operand,
} from "./conditionLogic";

export type RuleOperand = Operand;

export type RuleValue = { kind: "literal"; value: string | number | boolean | undefined } | { kind: "field"; path: string };

export type RuleRow = { kind: "cmp"; operand: string; op: CmpOp; value: RuleValue } | { kind: "raw"; src: string };

export interface RuleCondition {
  rows: RuleRow[];
}

/** `celType` reads a `list` field as `list<string>`, which
 * `operatorsFor` offers `in` alone for — a comparator this builder never
 * writes. Excluding it here, once, keeps every call site (the operand
 * picker, `addRow`'s default comparator) from needing its own guard. */
function isSupportedCelType(t: string): boolean {
  return t !== "list<string>";
}

/**
 * The row builder's operand list for one field's `rule`: "this answer" first
 * (the field being edited, so it needs no own entry twice), then every other
 * leaf catalog field. `field.key` empty yields no "this answer" entry — an
 * unnamed field authors no CEL identifier yet (`compile.ts::checkFieldKeyFormat`).
 * A second and later other field sharing a label takes a count, in catalog
 * order ("Name (2)"), the way the condition picker numbers its fields;
 * "this answer" takes none.
 */
export function buildRuleOperands(opts: {
  field: DraftField;
  fields: DraftField[] | undefined;
  locale: string;
  baseLocale: string;
  thisAnswerLabel: string;
}): RuleOperand[] {
  const ownKey = opts.field.key;
  const thisAnswer: RuleOperand[] = [];
  if (ownKey) {
    const own = fieldOperand(opts.field, "data", opts.locale, opts.baseLocale);
    if (own && isSupportedCelType(own.celType)) thisAnswer.push({ ...own, label: opts.thisAnswerLabel });
  }
  const others = flattenDraftFields(opts.fields)
    .filter((f) => f.type !== "group" && f.key && f.key !== ownKey)
    .flatMap((f) => {
      const o = fieldOperand(f, "data", opts.locale, opts.baseLocale);
      return o && isSupportedCelType(o.celType) ? [o] : [];
    });
  const labels = numberRepeats(others, (o) => o.label);
  return [...thisAnswer, ...others.map((o, i) => ({ ...o, label: labels[i]! }))];
}

/** The "another field" picker for a row's value side (task 4.7): every
 * operand but the row's own left operand, filtered to a matching `celType`.
 * An unfiltered picker would let an author compare a `number` against a
 * `string`, a guaranteed publish-time type-check failure. */
export function fieldValueOperandsFor(leftPath: string, operands: RuleOperand[]): RuleOperand[] {
  const left = operands.find((o) => o.path === leftPath);
  if (!left) return [];
  return operands.filter((o) => o.path !== leftPath && o.celType === left.celType);
}

// --- reading ----------------------------------------------------------------

function rawRuleRow(node: CelNode): RuleRow {
  return { kind: "raw", src: serializeAst(node as never) };
}

function readRuleRow(node: CelNode, byPath: Map<string, RuleOperand>): RuleRow {
  // A bare boolean operand reads as an explicit `== true`, the same
  // normalisation `conditionLogic.readRow` applies.
  const bare = memberPath(node);
  if (bare !== undefined && byPath.get(bare)?.celType === "bool") {
    return { kind: "cmp", operand: bare, op: "==", value: { kind: "literal", value: true } };
  }

  if (!Array.isArray(node.args) || node.args.length !== 2) return rawRuleRow(node);
  const [left, right] = node.args as [unknown, unknown];
  if (!isCelNode(left) || !isCelNode(right)) return rawRuleRow(node);
  if (!CMP_OPS.includes(node.op as CmpOp)) return rawRuleRow(node);

  const leftPath = memberPath(left);
  if (leftPath === undefined || !byPath.has(leftPath)) return rawRuleRow(node);

  const literal = literalOf(right);
  if (literal !== undefined) {
    return { kind: "cmp", operand: leftPath, op: node.op as CmpOp, value: { kind: "literal", value: literal } };
  }
  const rightPath = memberPath(right);
  if (rightPath !== undefined && byPath.has(rightPath)) {
    return { kind: "cmp", operand: leftPath, op: node.op as CmpOp, value: { kind: "field", path: rightPath } };
  }
  return rawRuleRow(node);
}

/** Read a stored `rule` into rows. `null` means the source does not parse at
 * all, the builder's one closed state (the site opens in "Developer view"
 * instead, mirroring `ConditionInput`'s `unparseable` handling). A source
 * that parses but whose top operator is `||` (the rule builder writes no
 * "or") reads as one whole raw row, never split. */
export function fromRuleCel(src: string | undefined, operands: RuleOperand[]): RuleCondition | null {
  if (!src?.trim()) return { rows: [] };
  const ast = parseAst(src);
  if (!ast || !isCelNode(ast)) return null;
  const byPath = new Map(operands.map((o) => [o.path, o]));
  const nodes = ast.op === "&&" ? conjuncts(ast, "&&") : [ast];
  return { rows: nodes.map((n) => readRuleRow(n, byPath)) };
}

// --- writing ------------------------------------------------------------

/** The CEL text a row's value side writes: a field reference written
 * literally (its own `data.<key>` path), or a literal formatted for the
 * operand's declared CEL type. `undefined` for a row not yet fit to write —
 * an empty literal, or no field chosen. */
export function ruleValueOf(value: RuleValue, celTypeName: string): string | undefined {
  if (value.kind === "field") return value.path === "" ? undefined : value.path;
  if (value.value === undefined || value.value === "") return undefined;
  return celLiteral(value.value, celTypeName);
}

/** True when a row carries everything `toRuleCel` needs to write it. */
export function isRuleRowComplete(row: RuleRow, byPath: Map<string, RuleOperand>): boolean {
  if (row.kind === "raw") return row.src.trim().length > 0;
  const operand = byPath.get(row.operand);
  if (!operand) return false;
  return ruleValueOf(row.value, operand.celType) !== undefined;
}

/** Write the rows back to `rule`'s CEL, joined by `&&` only. An incomplete
 * row is skipped, the same "never emit half-written CEL" rule
 * `conditionLogic.toCel` applies. */
export function toRuleCel(condition: RuleCondition, operands: RuleOperand[]): string | undefined {
  const byPath = new Map(operands.map((o) => [o.path, o]));
  const usable = condition.rows.filter((r) => isRuleRowComplete(r, byPath));
  const parenthesise = usable.length > 1;

  const parts = usable.flatMap((row) => {
    if (row.kind === "raw") return [parenthesise ? `(${row.src})` : row.src];
    const operand = byPath.get(row.operand)!;
    const rhs = ruleValueOf(row.value, operand.celType)!;
    return [`${operand.path} ${row.op} ${rhs}`];
  });

  return parts.length ? parts.join(" && ") : undefined;
}

/** A fresh row: "this answer" (or the first operand, if none) and that
 * operand's first comparator, per design.md's default. */
export function newRuleRow(operands: RuleOperand[]): RuleRow {
  const first = operands[0];
  return { kind: "cmp", operand: first?.path ?? "", op: operatorsFor(first?.celType ?? "string")[0]!, value: { kind: "literal", value: undefined } };
}

/** What a read of `rule` depended on, so a holder of builder state knows
 * when to re-read — the same signature shape `conditionLogic.operandSignature`
 * builds, over this builder's own operand list. */
export function ruleOperandSignature(operands: RuleOperand[]): string {
  return operands.map((o) => `${o.path}:${o.celType}`).join("|");
}

// --- the rule in words (studio-field-validation-form) ----------------------

/** One complete row's clause. A field value prints the other field's label. A
 * raw row reads as the catalog's phrase, never its CEL text. */
function ruleClause(row: RuleRow, byPath: Map<string, RuleOperand>): string {
  if (row.kind === "raw") return t("condition.clause.raw");
  const operand = byPath.get(row.operand);
  const value =
    row.value.kind === "field"
      ? (byPath.get(row.value.path)?.label ?? row.value.path)
      : summarizeValue({ kind: "cmp", operand: row.operand, op: row.op, value: row.value.value }, operand);
  return fill(t(`condition.clause.${OP_NAMES[row.op]}`), { field: operand?.clauseLabel ?? operand?.label ?? row.operand, value });
}

/** The complete rows' clauses joined by "and", `""` for none. */
function summarizeRule(condition: RuleCondition, operands: RuleOperand[]): string {
  const byPath = new Map(operands.map((o) => [o.path, o]));
  return joinClauses(
    condition.rows.filter((r) => isRuleRowComplete(r, byPath)).map((r) => ruleClause(r, byPath)),
    "&&",
  );
}

/**
 * The rule builder's sentence under its rows, `conditionLogic.conditionSentence`'s
 * twin over a `RuleCondition`, in the same four states. `stored` is the source
 * the draft holds.
 *
 * - A complete row: the clauses, joined by "and", ending in a period.
 * - No row and nothing stored: every answer passes (`ruleBuilder.empty`).
 * - No complete row over a stored source: the stored rule holds until the
 *   author finishes the row.
 * - No complete row over nothing, or over a stored source with no clause to
 *   read: the author finishes a row first.
 */
export function ruleSentence(condition: RuleCondition, operands: RuleOperand[], stored: string | undefined): string {
  const clauses = summarizeRule(condition, operands);
  if (clauses) return capitalize(fill(t("condition.sentence"), { condition: clauses }));
  const hasStored = Boolean(stored?.trim());
  if (!condition.rows.length && !hasStored) return t("ruleBuilder.empty");
  const held = hasStored ? fromRuleCel(stored, operands) : null;
  const heldClauses = held ? summarizeRule(held, operands) : "";
  if (heldClauses) return capitalize(fill(t("condition.sentence.held"), { condition: heldClauses }));
  return t("condition.sentence.none");
}
