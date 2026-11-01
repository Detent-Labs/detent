import { removeFieldIn } from "../panels/fieldCatalogLogic";
import type { DraftStep } from "./createStep";
import { draftFields, flattenDraftFields, type DraftField } from "./fields";
import { keyReader } from "./key-readers";
import type { Draft } from "./types";
import { isDraftViewField, type DraftViewEntry } from "./view-layout";

/**
 * What removing one field on the Fields tab reaches past the field catalog,
 * and the removal itself. A removed field is the field the author removes, or
 * any field below it. `fieldRemovalReach` measures a removal on the draft
 * before any write, and `hasReach` tells a removal with reach from one
 * without. `removeFieldAndReferences` makes the removal, and takes every id
 * reference to a removed field outside a plugin `config` along.
 */

/** One action position a writer sits in, or the subprocess `outputMapping`. */
export type WriterPosition = "onEntry" | "onExit" | "onCancel" | "onPath" | "onFire" | "outputMapping";

type DraftPathOf = NonNullable<DraftStep["paths"]>[number];

/** One `output` or `outputMapping` entry that names a removed id. */
export interface WriterSite {
  step: DraftStep;
  position: WriterPosition;
  /** The way out an `onPath` action sits on. */
  path?: DraftPathOf;
}

/** The places a removal reaches, one list per kind, in draft order. A list
 * holds one entry per reference, so a place can appear twice. */
export interface RemovalSites {
  /** The fields below the removed field, at every depth. */
  fieldsInside: DraftField[];
  /** The steps whose view carries an entry the removal takes out. */
  steps: DraftStep[];
  writers: WriterSite[];
  contract: ("input" | "output")[];
  /** The field that stays and carries the `columnMapping` entry. */
  columnMappings: DraftField[];
  /** The JSON path, from the draft root, of each kept expression that reads a removed key. */
  celReads: (string | number)[][];
  /** The JSON path of each string in a plugin `config` that equals a removed id. */
  pluginSettings: (string | number)[][];
}

/** A removal's reach: the removed field, one count per kind of reference, and
 * the places behind the counts. */
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
  /** The places the counts above count. */
  sites: RemovalSites;
}

/**
 * What one removal takes from the catalog, and what the catalog keeps,
 * collected from the catalog as it stands. A removed group key is the
 * non-empty key of a removed group that no remaining group holds.
 * `view-group-sync.ts::writeGroupKey` treats a key another group holds the
 * same way: that key still names a group.
 */
interface Removal {
  /** The field the author removes. */
  field: DraftField;
  /** The removed field and every field below it. */
  fields: Set<DraftField>;
  /** Every other field of the catalog, at every depth. */
  staying: DraftField[];
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
  const staying = catalog.filter((f) => !fields.has(f));
  const heldKeys = new Set(staying.filter((f) => f.type === "group").map((f) => f.key));
  const ids = new Set<string>();
  const groupKeys = new Set<string>();
  for (const f of fields) {
    if (f.id !== undefined) ids.add(f.id);
    if (f.type === "group" && f.key && !heldKeys.has(f.key)) groupKeys.add(f.key);
  }
  return { field, fields, staying, ids, groupKeys };
}

/** True for a view entry the removal takes out: its `ref` names a removed id,
 * or its `group` names a removed group key. A note follows the same rule. */
function takesEntry(removal: Removal, entry: DraftViewEntry): boolean {
  if (entry.group !== undefined && removal.groupKeys.has(entry.group)) return true;
  return isDraftViewField(entry) && entry.ref !== undefined && removal.ids.has(entry.ref);
}

/** A step's actions in all five positions: `onEntry`, `onExit`, `onCancel`,
 * each path's `onPath` and each timer's `onFire.actions`, each with its position. */
function positionedActions(step: DraftStep) {
  type Action = NonNullable<DraftStep["onEntry"]>[number];
  const at = (position: WriterPosition, actions: readonly Action[], path?: DraftPathOf) =>
    actions.map((action) => ({ action, position, path }));
  return [
    ...at("onEntry", step.onEntry ?? []),
    ...at("onExit", step.onExit ?? []),
    ...at("onCancel", step.onCancel ?? []),
    ...(step.paths ?? []).flatMap((path) => at("onPath", path.onPath ?? [], path)),
    ...(step.timers ?? []).flatMap((timer) => at("onFire", timer.onFire?.actions ?? [])),
  ];
}

/** A step's actions in all five positions. */
function stepActions(step: DraftStep) {
  return positionedActions(step).map(({ action }) => action);
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
  const { field, fields, staying, ids } = removal;
  const namesRemoved = (value: unknown) => typeof value === "string" && ids.has(value);

  // The walk below skips each object the removal takes along whole, and the
  // entries keyed by a removed id in each `output` and `outputMapping` map.
  const takenAlong = new Set<object>(fields);
  const idKeyedMaps = new Set<object>();

  const sites: RemovalSites = {
    fieldsInside: [...fields].filter((f) => f !== field),
    steps: [],
    writers: [],
    contract: [],
    columnMappings: [],
    celReads: [],
    pluginSettings: [],
  };
  for (const step of draft.workflow?.steps ?? []) {
    const taken = (step.view?.fields ?? []).filter((entry) => takesEntry(removal, entry));
    if (taken.length > 0) sites.steps.push(step);
    for (const entry of taken) takenAlong.add(entry);
    const maps = [
      ...positionedActions(step).map(({ action, position, path }) => ({ map: action.output, position, path })),
      { map: step.subprocess?.outputMapping, position: "outputMapping" as const, path: undefined },
    ];
    for (const { map, position, path } of maps) {
      if (map == null) continue;
      idKeyedMaps.add(map);
      const site: WriterSite = path === undefined ? { step, position } : { step, position, path };
      for (let hits = Object.keys(map).filter(namesRemoved).length; hits > 0; hits--) sites.writers.push(site);
    }
  }

  const contract = draft.contract;
  for (const entry of contract?.inputFields ?? []) if (namesRemoved(entry)) sites.contract.push("input");
  for (const entry of contract?.outputFields ?? []) if (namesRemoved(entry)) sites.contract.push("output");

  for (const f of staying) {
    for (const target of Object.values(f.columnMapping ?? {})) if (namesRemoved(target)) sites.columnMappings.push(f);
  }

  const keptKeys = new Set(staying.map((f) => f.key));
  const reads = keyReader([...fields].flatMap((f) => (f.key && !keptKeys.has(f.key) ? [f.key] : [])));
  const visit = (value: unknown, path: (string | number)[], inConfig: boolean): void => {
    if (typeof value === "string") {
      if (inConfig && ids.has(value)) sites.pluginSettings.push(path);
      return;
    }
    if (typeof value !== "object" || value === null || takenAlong.has(value)) return;
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, [...path, index], inConfig));
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.lang === "cel" && typeof record.src === "string") {
      if (reads(record.src)) sites.celReads.push(path);
      return;
    }
    for (const [key, child] of Object.entries(record)) {
      if (idKeyedMaps.has(record) && ids.has(key)) continue;
      visit(child, [...path, key], inConfig || (key === "config" && typeof child === "object" && child !== null));
    }
  };
  visit(draft, [], false);

  return {
    field,
    fieldsInside: sites.fieldsInside.length,
    steps: sites.steps.length,
    writers: sites.writers.length,
    contractEntries: sites.contract.length,
    columnMappings: sites.columnMappings.length,
    celReads: sites.celReads.length,
    pluginSettings: sites.pluginSettings.length,
    sites,
  };
}

/** True when any count of `reach` sits above zero. */
export function hasReach(reach: Omit<FieldRemovalReach, "sites">): boolean {
  const { fieldsInside, steps, writers, contractEntries, columnMappings, celReads, pluginSettings } = reach;
  return [fieldsInside, steps, writers, contractEntries, columnMappings, celReads, pluginSettings].some((count) => count > 0);
}

/** Deletes each entry of `map` that `named` picks. True when that left the map
 * empty: a map that lost no entry answers false, even an empty one. */
function dropEntries(map: object, named: (key: string, value: unknown) => boolean): boolean {
  const record = map as Record<string, unknown>;
  const dropped = Object.keys(record).filter((key) => named(key, record[key]));
  for (const key of dropped) delete record[key];
  return dropped.length > 0 && Object.keys(record).length === 0;
}

/**
 * Removes `fieldId` from the catalog, with every id reference to a removed
 * field outside a plugin `config`, as a `mutate` recipe: it writes the draft
 * it receives. An id no field carries leaves the draft unchanged.
 *
 * The removed ids and group keys come from the catalog as it stands, before
 * any write, since the prune changes what the catalog answers. The writes then
 * run in this order:
 *
 * 1. Every step's view loses each entry whose `ref` names a removed id, or
 *    whose `group` names a removed group key. A note follows the same rule.
 * 2. Each `output` in the five action positions loses its keys naming a
 *    removed id. An `output` this empties leaves its action.
 * 3. Each `subprocess.outputMapping` loses the same keys. It stays when it
 *    empties, since the definition contract requires the key.
 * 4. `contract.inputFields` and `contract.outputFields` lose each removed id.
 * 5. Each field that stays loses the `columnMapping` entries whose target is a
 *    removed id. A `columnMapping` this empties leaves its field.
 * 6. `removeFieldIn` prunes the field, with every field below it.
 *
 * The removed group keys cover every nesting level of a card's members, so
 * one pass over each view matches what `view-tree.ts::removeViewEntry` does
 * for a card. A CEL expression and a plugin `config` keep their text where
 * they name a removed key or id: each needs the author's decision, and
 * `fieldRemovalReach` counts them.
 */
export function removeFieldAndReferences(draft: Draft, fieldId: string): void {
  const removal = collectRemoval(draft, fieldId);
  if (removal === undefined) return;
  const { staying, ids } = removal;
  const keyedByRemoved = (key: string) => ids.has(key);
  const targetsRemoved = (_column: string, target: unknown) => typeof target === "string" && ids.has(target);
  const steps = draft.workflow?.steps ?? [];

  for (const step of steps) {
    if (step.view?.fields != null) step.view.fields = step.view.fields.filter((entry) => !takesEntry(removal, entry));
  }

  for (const action of steps.flatMap(stepActions)) {
    if (action.output != null && dropEntries(action.output, keyedByRemoved)) delete action.output;
  }

  for (const step of steps) {
    if (step.subprocess?.outputMapping != null) dropEntries(step.subprocess.outputMapping, keyedByRemoved);
  }

  const contract = draft.contract;
  if (contract?.inputFields != null) contract.inputFields = contract.inputFields.filter((entry) => !ids.has(entry));
  if (contract?.outputFields != null) contract.outputFields = contract.outputFields.filter((entry) => !ids.has(entry));

  for (const f of staying) {
    if (f.columnMapping != null && dropEntries(f.columnMapping, targetsRemoved)) delete f.columnMapping;
  }

  draft.fields = removeFieldIn(draft.fields ?? [], fieldId);
}
