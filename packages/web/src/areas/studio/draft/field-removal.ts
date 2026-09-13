import { parseAst } from "workflow-engine/cel/check";
import { isCelNode, memberPath, type CelNode } from "../panels/shared/conditionLogic";
import type { DraftStep } from "./createStep";
import { draftFields, flattenDraftFields, type DraftField } from "./fields";
import type { Draft } from "./types";
import { isDraftViewField, type DraftViewEntry } from "./view-layout";

/**
 * What removing one field on the Fields tab reaches past the field catalog.
 * A removed field is the field the author removes, or any field below it.
 * `fieldRemovalReach` measures a removal on the draft before any write, and
 * `hasReach` tells a removal with reach from one without.
 */

/** A removal's reach: the removed field, and one count per kind of reference. */
export interface FieldRemovalReach {
  /** The field the author removes. */
  field: DraftField;
  /** The fields below the removed field, at every depth. */
  fieldsInside: number;
  /** The steps whose view carries an entry the removal takes out. */
  steps: number;
  /** The `output` keys in the five action positions, and the
   * `subprocess.outputMapping` keys, that name a removed id. */
  writers: number;
  /** The `contract.inputFields` and `contract.outputFields` entries that name
   * a removed id. */
  contractEntries: number;
  /** The `columnMapping` entries, on a field that stays, whose target names a
   * removed id. */
  columnMappings: number;
  /** The CEL expressions the removal keeps that read a removed field's key.
   * One expression counts once. */
  celReads: number;
  /** The string values inside a plugin `config` that equal a removed id. */
  pluginSettings: number;
}

/**
 * What one removal takes from the catalog, collected from the catalog as it
 * stands. A removed group key is the non-empty key of a removed group that no
 * remaining group holds. `view-group-sync.ts::writeGroupKey` treats a key
 * another group holds the same way: that key still names a group.
 */
interface Removal {
  /** The field the author removes. */
  field: DraftField;
  /** The removed field and every field below it. */
  fields: Set<DraftField>;
  /** The id of every removed field. */
  ids: Set<string>;
  /** The removed group keys. */
  groupKeys: Set<string>;
}

function collectRemoval(draft: Draft, fieldId: string): Removal | undefined {
  const catalog = draftFields(draft);
  const field = catalog.find((f) => f.id === fieldId);
  if (field === undefined) return undefined;
  const fields = new Set(flattenDraftFields([field]));
  const heldKeys = new Set(catalog.filter((f) => f.type === "group" && !fields.has(f)).map((f) => f.key));
  const ids = new Set<string>();
  const groupKeys = new Set<string>();
  for (const f of fields) {
    if (f.id !== undefined) ids.add(f.id);
    if (f.type === "group" && f.key && !heldKeys.has(f.key)) groupKeys.add(f.key);
  }
  return { field, fields, ids, groupKeys };
}

/** True for a view entry the removal takes out: its `ref` names a removed id,
 * or its `group` names a removed group key. A note follows the same rule. */
function takesEntry(removal: Removal, entry: DraftViewEntry): boolean {
  if (entry.group !== undefined && removal.groupKeys.has(entry.group)) return true;
  return isDraftViewField(entry) && entry.ref !== undefined && removal.ids.has(entry.ref);
}

/** A step's actions in all five positions: `onEntry`, `onExit`, `onCancel`,
 * each path's `onPath` and each timer's `onFire.actions`. */
function stepActions(step: DraftStep) {
  return [
    ...(step.onEntry ?? []),
    ...(step.onExit ?? []),
    ...(step.onCancel ?? []),
    ...(step.paths ?? []).flatMap((path) => path.onPath ?? []),
    ...(step.timers ?? []).flatMap((timer) => timer.onFire?.actions ?? []),
  ];
}

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
function keyReader(keys: readonly string[]): (src: string) => boolean {
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
 * Measures what removing `fieldId` reaches, on the draft as it stands.
 * Answers `undefined` for an id no field carries.
 *
 * An expression is any object in the draft that carries `lang: "cel"` and a
 * string `src`, so a `process.start` mapping value inside a plugin `config`
 * counts too. The walk skips every expression the removal takes along: each
 * one a removed field holds, such as its `validation.rule` and `default`; each
 * one a view entry the removal takes out holds, such as its flags and
 * `validation.rule`; and the value of an `output` or `outputMapping` entry
 * keyed by a removed id. It reads no key that is empty or that a remaining
 * field holds.
 *
 * The settings walk names no plugin type. A string equal to a removed id
 * counts inside any object under a `config` key: on an action, a data source,
 * an assignment strategy, or the `type` of a plugin-typed field that stays. A
 * record entry keyed `config` whose value is no object, such as a column
 * mapping's target, is no plugin config.
 */
// ponytail: parses every CEL expression the draft holds on each call, so a
// caller runs it once per press of Remove field, never per render. Cache the
// answer per draft value if a process grows large enough for a press to lag.
export function fieldRemovalReach(draft: Draft, fieldId: string): FieldRemovalReach | undefined {
  const removal = collectRemoval(draft, fieldId);
  if (removal === undefined) return undefined;
  const { field, fields, ids } = removal;
  const namesRemoved = (value: unknown) => typeof value === "string" && ids.has(value);

  // The walk below skips each object the removal takes along whole, and the
  // entries keyed by a removed id in each `output` and `outputMapping` map.
  const takenAlong = new Set<object>(fields);
  const idKeyedMaps = new Set<object>();

  let steps = 0;
  let writers = 0;
  for (const step of draft.workflow?.steps ?? []) {
    const taken = (step.view?.fields ?? []).filter((entry) => takesEntry(removal, entry));
    if (taken.length > 0) steps++;
    for (const entry of taken) takenAlong.add(entry);
    for (const map of [...stepActions(step).map((action) => action.output), step.subprocess?.outputMapping]) {
      if (map === undefined) continue;
      idKeyedMaps.add(map);
      writers += Object.keys(map).filter(namesRemoved).length;
    }
  }

  const contract = draft.contract;
  const contractEntries = [...(contract?.inputFields ?? []), ...(contract?.outputFields ?? [])].filter(namesRemoved).length;

  const staying = draftFields(draft).filter((f) => !fields.has(f));
  let columnMappings = 0;
  for (const f of staying) columnMappings += Object.values(f.columnMapping ?? {}).filter(namesRemoved).length;

  const keptKeys = new Set(staying.map((f) => f.key));
  const reads = keyReader([...fields].flatMap((f) => (f.key && !keptKeys.has(f.key) ? [f.key] : [])));
  let celReads = 0;
  let pluginSettings = 0;
  const visit = (value: unknown, inConfig: boolean): void => {
    if (typeof value === "string") {
      if (inConfig && ids.has(value)) pluginSettings++;
      return;
    }
    if (typeof value !== "object" || value === null || takenAlong.has(value)) return;
    const record = value as Record<string, unknown>;
    if (record.lang === "cel" && typeof record.src === "string") {
      if (reads(record.src)) celReads++;
      return;
    }
    for (const [key, child] of Object.entries(record)) {
      if (idKeyedMaps.has(record) && ids.has(key)) continue;
      visit(child, inConfig || (key === "config" && typeof child === "object" && child !== null));
    }
  };
  visit(draft, false);

  return { field, fieldsInside: fields.size - 1, steps, writers, contractEntries, columnMappings, celReads, pluginSettings };
}

/** True when any count of `reach` sits above zero. */
export function hasReach(reach: FieldRemovalReach): boolean {
  const { fieldsInside, steps, writers, contractEntries, columnMappings, celReads, pluginSettings } = reach;
  return [fieldsInside, steps, writers, contractEntries, columnMappings, celReads, pluginSettings].some((count) => count > 0);
}
