import { parseAst } from "workflow-engine/cel/check";
import { isCelNode, memberPath, type CelNode } from "../panels/shared/conditionLogic";
import type { Draft } from "./types";

// The CEL expressions that read a field's key. `keyReader` tests one source
// against a set of keys, and `countKeyReaders` counts the expressions in a
// draft that read one key.

/** The CEL nodes an argument holds: an operand, an argument list or a map entry. */
function nodesIn(value: unknown): CelNode[] {
  if (isCelNode(value)) return [value];
  return Array.isArray(value) ? value.flatMap(nodesIn) : [];
}

function holdsPath(node: CelNode, paths: ReadonlySet<string>): boolean {
  const path = memberPath(node);
  if (path !== undefined && paths.has(path)) return true;
  return nodesIn(node.args).some((child) => holdsPath(child, paths));
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A test for whether CEL source reads `data.<key>` for one of `keys`. The
 * parsed tree decides, through `memberPath`, the way the condition builder
 * reads CEL: `'data.amount'` inside a string literal reads nothing, and an
 * index read such as `data["amount"]` goes uncounted. Source that fails to
 * parse reads a key when its text holds `data.<key>` on word boundaries, with
 * no identifier character or dot before `data`. So `child.data.<key>` reads
 * nothing there either, as in the tree.
 */
export function keyReader(keys: readonly string[]): (src: string) => boolean {
  if (keys.length === 0) return () => false;
  const paths = new Set(keys.map((key) => `data.${key}`));
  const patterns = keys.map((key) => new RegExp(`(?<![\\w.])data\\.${escapeRegExp(key)}\\b`));
  return (src) => {
    const ast = parseAst(src);
    if (!ast || !isCelNode(ast)) return patterns.some((pattern) => pattern.test(src));
    return holdsPath(ast, paths);
  };
}

/**
 * Counts the CEL expressions in `draft` that read `data.<key>`. An expression
 * is any object that carries `lang: "cel"` and a string `src`, so the field's
 * own `validation.rule` and a `process.start` mapping value inside a plugin
 * `config` count too. The walk skips none. One expression counts once,
 * however often it reads the key. The empty key counts 0.
 */
// ponytail: walks the whole draft on each call, and parses only the sources
// whose text holds the key. The ceiling is a draft with thousands of
// expressions changing on every keystroke. Cache per draft value under
// `cut-studio-render-cost`.
export function countKeyReaders(draft: Draft, key: string): number {
  if (key === "") return 0;
  const reads = keyReader([key]);
  let count = 0;
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    if (record.lang === "cel" && typeof record.src === "string") {
      if (record.src.includes(key) && reads(record.src)) count++;
      return;
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(draft);
  return count;
}
