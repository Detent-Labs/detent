/**
 * The condition builder's pure half: read CEL into a flat row model, write it
 * back out, and build the operand list the picker offers.
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
import type { ProcessBody } from "workflow-engine/schema";
import type { DraftField } from "../../draft/fields";
import { flattenDraftFields } from "../../draft/fields";
import { resolveDraftLocalizedText } from "../../draft/localized-text";

/** The CEL types the builder knows how to offer operators and an editor for. */
export type OperandCelType = "double" | "bool" | "string" | "list<string>" | "dyn";

export interface OperandOption {
  value: string;
  label: string;
}

export interface Operand {
  /** The CEL path a row writes, e.g. `data.amount` or `actor.roles`. */
  path: string;
  label: string;
  /** Governs the operators and the written literal. */
  celType: string;
  /**
   * The catalog's own field type, which the value editor needs and `celType`
   * cannot supply: `date` and `datetime` both type as CEL `string`, but they
   * take different native inputs.
   */
  declaredType?: string;
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
  if (celTypeName === "double") return CMP_OPS;
  return ["==", "!="];
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

/** The engine's instance statuses, for `instance.status`'s value editor. */
const INSTANCE_STATUSES = ["running", "completed", "cancelled", "faulted"];

function fieldLabel(f: DraftField, locale: string, baseLocale: string): string {
  const label = f.label ? resolveDraftLocalizedText(f.label, locale, baseLocale) : undefined;
  return label ? `${label} (${f.key ?? ""})` : (f.key ?? "");
}

/** Exported for `ruleLogic.ts`'s reuse (design.md: the rule-row builder
 * "reuses ConditionBuilder's parse-back approach"), which builds its own
 * operand list over a different prefix (`data`) and set of fields. */
export function fieldOperand(f: DraftField, prefix: string, locale: string, baseLocale: string): Operand | undefined {
  if (!f.key) return undefined;
  const operand: Operand = {
    path: `${prefix}.${f.key}`,
    label: fieldLabel(f, locale, baseLocale),
    celType: celType(f.type as never),
    declaredType: typeof f.type === "string" ? f.type : undefined,
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
  return flattenDraftFields(fields)
    .filter((f) => f.type !== "group")
    .flatMap((f) => {
      const o = fieldOperand(f, "data", locale, baseLocale);
      return o ? [o] : [];
    });
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
      const operand: Operand = { path, label: path, celType: type };
      if (path === "instance.status") operand.options = INSTANCE_STATUSES.map((v) => ({ value: v, label: v }));
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
 */
function childOperands(child: ProcessBody | undefined, locale: string): Operand[] {
  if (!child) return [];
  const out: Operand[] = [
    {
      path: "child.outcome",
      label: "child.outcome",
      celType: "string",
      options: (child.contract?.outcomes ?? []).map((v) => ({ value: v, label: v })),
    },
  ];
  const outputs = new Set(child.contract?.outputFields ?? []);
  if (outputs.size) {
    for (const f of flattenDraftFields(child.fields as DraftField[])) {
      if (f.type === "group" || !f.id || !outputs.has(f.id)) continue;
      const o = fieldOperand(f, "child.data", locale, child.baseLocale);
      if (o) out.push(o);
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
  return [
    ...catalogOperands(opts.fields, opts.locale, opts.baseLocale),
    ...contextOperands(),
    ...childOperands(opts.child, opts.locale),
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

/** The AST shape this file walks. Narrower than the library's full union.
 * Exported for `ruleLogic.ts`'s reuse. */
export interface Node {
  op: string;
  args: unknown;
}

export const isNode = (v: unknown): v is Node =>
  typeof v === "object" && v !== null && typeof (v as Node).op === "string";

/** `{op:".", args:[{op:"id",args:"data"}, "amount"]}` -> `"data.amount"`, else undefined.
 * Exported for `ruleLogic.ts`'s reuse. */
export function memberPath(node: Node): string | undefined {
  if (node.op === "id") return typeof node.args === "string" ? node.args : undefined;
  if (node.op !== ".") return undefined;
  const [target, name] = node.args as [unknown, unknown];
  if (!isNode(target) || typeof name !== "string") return undefined;
  const base = memberPath(target);
  return base === undefined ? undefined : `${base}.${name}`;
}

/** Exported for `ruleLogic.ts`'s reuse. */
export function literalOf(node: Node): string | number | boolean | undefined {
  if (node.op !== "value") return undefined;
  const v = node.args;
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : undefined;
}

/**
 * A raw row prints the node back through `serializeAst`, never a slice of
 * the original source by `node.range`: that range excludes a parenthesized
 * sub-expression's own wrapping parens (see `serializeAst`'s doc), which
 * would otherwise truncate a fragment like `!(data.amount > 1000.0)`.
 */
function rawRow(node: Node): Row {
  return { kind: "raw", src: serializeAst(node as never) };
}

function readRow(node: Node, byPath: Map<string, Operand>): Row {
  // A bare boolean operand reads as an explicit `== true`.
  const bare = memberPath(node);
  if (bare !== undefined && byPath.get(bare)?.celType === "bool") {
    return { kind: "cmp", operand: bare, op: "==", value: true };
  }

  if (!Array.isArray(node.args) || node.args.length !== 2) return rawRow(node);
  const [left, right] = node.args as [unknown, unknown];
  if (!isNode(left) || !isNode(right)) return rawRow(node);

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
export function conjuncts(node: Node, joiner: string): Node[] {
  if (node.op !== joiner || !Array.isArray(node.args) || node.args.length !== 2) return [node];
  const [left, right] = node.args as [unknown, unknown];
  if (!isNode(left) || !isNode(right)) return [node];
  return [...conjuncts(left, joiner), right];
}

/**
 * Read stored CEL into rows. `null` means the source does not parse, which is
 * the builder's one closed state: the site opens in CEL mode instead.
 */
export function fromCel(src: string | undefined, operands: Operand[]): Condition | null {
  if (!src?.trim()) return { joiner: "&&", rows: [] };
  const ast = parseAst(src);
  if (!ast || !isNode(ast)) return null;

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
 */
export function celLiteral(value: string | number | boolean, celTypeName: string): string | undefined {
  if (celTypeName === "bool") return value === true || value === "true" ? "true" : "false";
  if (celTypeName === "double") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return undefined;
    return Number.isInteger(n) ? `${n}.0` : String(n);
  }
  return celString(String(value));
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
 * keystroke. `undefined` is the same "no condition" state an empty text input
 * produces today.
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

// --- plain-English summary (studio-condition-builder) ---------------------

/** One comparison operator's plain-English phrasing. `in` reads as
 * "includes": the literal is the list operand's own member, and "includes"
 * reads the same direction as the operand-first sentence every other row
 * takes, unlike the CEL text (`"manager" in actor.roles`), which puts the
 * literal first. */
const OP_WORDS: Record<CmpOp, string> = {
  "==": "is",
  "!=": "is not",
  "<": "is less than",
  "<=": "is at most",
  ">": "is greater than",
  ">=": "is at least",
  in: "includes",
};

/** The value half of a row's sentence: an option's own label when the
 * operand offers a closed list (so a coded value like `"approved"` reads as
 * whatever label the option carries), the raw value otherwise. */
function summarizeValue(row: Extract<Row, { kind: "cmp" }>, operand: Operand | undefined): string {
  const option = operand?.options?.find((o) => o.value === row.value);
  if (option) return option.label;
  return String(row.value ?? "");
}

/** One row's sentence fragment. A `raw` row falls back to its own CEL text —
 * the same "unbuildable fragment" fallback `toCel` and the builder itself
 * already apply per row, so a mixed condition (some rows readable, one not)
 * degrades gracefully instead of losing the whole summary. */
function summarizeRow(row: Row, byPath: Map<string, Operand>): string {
  if (row.kind === "raw") return row.src;
  const operand = byPath.get(row.operand);
  const label = operand?.label ?? row.operand;
  // A bare boolean reads as `== true`/`== false` (see `readRow`); the
  // sentence drops the redundant "is yes"/"is no" and states the fact
  // directly, negated for false.
  if (operand?.celType === "bool" && row.op === "==") {
    return row.value === true ? label : `not ${label}`;
  }
  return `${label} ${OP_WORDS[row.op]} ${summarizeValue(row, operand)}`;
}

/**
 * A plain-English summary of a guard, for the canvas edge label
 * (`studio-condition-builder` spec). Walks the same `Condition`/`Row` model
 * `ConditionBuilder` already holds — never `celReadout`, which is CEL syntax,
 * not a sentence.
 *
 * Returns `""` for a condition with no complete row (an empty guard, or one
 * still mid-edit); the caller decides what an empty summary means for its
 * placement.
 */
export function summarizeCondition(condition: Condition, operands: Operand[]): string {
  const byPath = new Map(operands.map((o) => [o.path, o]));
  const usable = condition.rows.filter((r) => isComplete(r, byPath));
  if (!usable.length) return "";
  const joinerWord = condition.joiner === "&&" ? "and" : "or";
  return usable.map((r) => summarizeRow(r, byPath)).join(` ${joinerWord} `);
}

/**
 * The canvas edge label for an automatic path's guard: a plain-English
 * summary when the guard parses into rows, the raw CEL text otherwise (a
 * fragment the builder cannot represent at all — see "A fragment the builder
 * cannot represent survives as a raw row").
 */
export function guardEdgeLabel(src: string, operands: Operand[]): string {
  const condition = fromCel(src, operands);
  if (!condition) return src;
  const summary = summarizeCondition(condition, operands);
  return summary || src;
}
