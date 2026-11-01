import { parseAst } from "workflow-engine/cel/check";
import { isCelNode, memberPath, type CelNode } from "../panels/shared/conditionLogic";
import { draftFields } from "./fields";
import type { Draft } from "./types";

// The CEL expressions that read a field's key. `keyReader` tests one source
// against a set of keys, `keyReaderSites` finds the expressions in a draft
// that read one key, and `rewriteKeyReaders` moves them onto a new key.

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

/** A node the parser placed: every node of `parseAst` carries its range. */
type PlacedNode = CelNode & { end: number };

/** Every `data.<name>` member node in the tree, at any depth. */
function dataReads(node: CelNode, out: { name: string; node: PlacedNode }[] = []): { name: string; node: PlacedNode }[] {
  if (node.op === "." && Array.isArray(node.args)) {
    const [target, name] = node.args as [unknown, unknown];
    if (isCelNode(target) && target.op === "id" && target.args === "data" && typeof name === "string") {
      out.push({ name, node: node as PlacedNode });
    }
  }
  for (const child of nodesIn(node.args)) dataReads(child, out);
  return out;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The text match for unparseable source: `data.<key>` on word boundaries,
 * with no identifier character or dot before `data`. */
const textReadSource = (key: string) => `(?<![\\w.])data\\.${escapeRegExp(key)}\\b`;

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
  const patterns = keys.map((key) => new RegExp(textReadSource(key)));
  return (src) => {
    const ast = parseAst(src);
    if (!ast || !isCelNode(ast)) return patterns.some((pattern) => pattern.test(src));
    return holdsPath(ast, paths);
  };
}

/**
 * `src` with every read of `data.<from>` reading `data.<to>`. The parsed tree
 * decides which reads count, as in `keyReader`. Only the name's own characters
 * change, the last `from.length` of the member node's range, so spacing and
 * parentheses stay as written. A range whose slice is not `from` stays.
 * Source that fails to parse changes by the text match `keyReader` uses. An
 * empty `from` or `to`, or a `to` equal to `from`, answers `src` as it is.
 */
export function rewriteFieldRead(src: string, from: string, to: string): string {
  if (from === "" || to === "" || from === to) return src;
  const ast = parseAst(src);
  if (!ast || !isCelNode(ast)) {
    return src.replace(new RegExp(textReadSource(from), "g"), () => `data.${to}`);
  }
  const ends = dataReads(ast)
    .filter((read) => read.name === from)
    .map((read) => read.node.end)
    .filter((end) => typeof end === "number" && src.slice(end - from.length, end) === from)
    .sort((a, b) => b - a);
  let out = src;
  for (const end of new Set(ends)) out = out.slice(0, end - from.length) + to + out.slice(end);
  return out;
}

/** One expression that reads a key: its JSON path from the draft root, and its source. */
export interface KeyReaderSite {
  path: (string | number)[];
  src: string;
}

/** Every expression in `draft`: any object that carries `lang: "cel"` and a string `src`. */
function expressionSites(draft: Draft, keep: (src: string) => boolean): KeyReaderSite[] {
  const sites: KeyReaderSite[] = [];
  const visit = (value: unknown, path: (string | number)[]): void => {
    if (typeof value !== "object" || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, [...path, index]));
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.lang === "cel" && typeof record.src === "string") {
      if (keep(record.src)) sites.push({ path, src: record.src });
      return;
    }
    for (const [name, child] of Object.entries(record)) visit(child, [...path, name]);
  };
  visit(draft, []);
  return sites;
}

/**
 * The CEL expressions in `draft` that read `data.<key>`, each with its JSON
 * path. The walk skips none, so the field's own `validation.rule` and a
 * `process.start` mapping value inside a plugin `config` count too. One
 * expression counts once, however often it reads the key. The empty key reads
 * nothing.
 */
export function keyReaderSites(draft: Draft, key: string): KeyReaderSite[] {
  if (key === "") return [];
  const reads = keyReader([key]);
  return expressionSites(draft, (src) => src.includes(key) && reads(src));
}

/** The number of expressions in `draft` that read `data.<key>`. */
// ponytail: walks the whole draft on each call, and parses only the sources
// whose text holds the key. The ceiling is a draft with thousands of
// expressions changing on every keystroke. Cache per draft value under
// `cut-studio-render-cost`.
export function countKeyReaders(draft: Draft, key: string): number {
  return keyReaderSites(draft, key).length;
}

/** The expressions a move of `fieldId`'s key from `from` to `to` rewrites,
 * each with its new source. Empty under `rewriteKeyReaders`'s refusals. */
function rewritePlan(draft: Draft, fieldId: string, from: string, to: string): { site: KeyReaderSite; next: string }[] {
  if (from === "" || to === "" || from === to) return [];
  if (draftFields(draft).some((field) => field.id !== fieldId && (field.key === from || field.key === to))) return [];
  return keyReaderSites(draft, from)
    .map((site) => ({ site, next: rewriteFieldRead(site.src, from, to) }))
    .filter(({ site, next }) => next !== site.src);
}

/**
 * Moves every expression in `draft` that reads `data.<from>` onto
 * `data.<to>`, in place, and answers how many changed. While a field other
 * than `fieldId` carries `from`, the readers may be that field's, so nothing
 * changes and the answer is 0. While a field other than `fieldId` carries
 * `to`, the move would merge two fields' readers, so nothing changes either.
 * An empty `from` or `to` changes nothing.
 */
export function rewriteKeyReaders(draft: Draft, fieldId: string, from: string, to: string): number {
  const plan = rewritePlan(draft, fieldId, from, to);
  for (const { site, next } of plan) {
    const expression = site.path.reduce<unknown>((node, step) => (node as Record<string | number, unknown>)[step], draft) as {
      src: string;
    };
    expression.src = next;
  }
  return plan.length;
}

/**
 * The answer `rewriteKeyReaders` would give for the same arguments, read
 * without a write. A `mutate` recipe's return never reaches its caller, so a
 * count the UI shows comes from the draft before the write.
 */
export function countKeyRewrites(draft: Draft, fieldId: string, from: string, to: string): number {
  return rewritePlan(draft, fieldId, from, to).length;
}

const TEXT_READ = /(?<![\w.])data\.([A-Za-z_]\w*)/g;

/**
 * Every name the draft reads as `data.<name>`, by the parsed tree, and by the
 * text match for source that fails to parse.
 */
// ponytail: parses every expression in the draft on each call, and a label
// keystroke calls it twice. The ceiling is a draft with thousands of
// expressions. Cache per draft value under `cut-studio-render-cost`.
export function readKeys(draft: Draft): Set<string> {
  const keys = new Set<string>();
  expressionSites(draft, () => true).forEach(({ src }) => {
    const ast = parseAst(src);
    if (ast && isCelNode(ast)) {
      for (const read of dataReads(ast)) keys.add(read.name);
      return;
    }
    for (const match of src.matchAll(TEXT_READ)) keys.add(match[1]!);
  });
  return keys;
}
