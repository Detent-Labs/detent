/**
 * The change list both the Changes tab and the Versions screen show: two
 * process bodies turned into grouped, worded entity rows (`studio-app`'s
 * Changes-view requirement, `process-version-inspection`).
 *
 * A walker over the definition contract. It knows the collections a body
 * declares, pairs their members by anchor, and hands each pair to `diffJson`
 * with the sub-lists the row does not own taken out. Those sub-lists become
 * rows or properties of their own.
 *
 * The walker returns finished words. Like `guided-labels.ts`, it reads the
 * catalog through `t()` on every call, so a UI-string override reaches them.
 */
import { fieldKindOf } from "workflow-engine/schema";
import { canonicalize } from "workflow-engine/schema/canonical-json";
import { t, type CatalogKey } from "../catalog.js";
import { diffJson, type DiffEntry } from "../screens/versionDiffLogic.js";
import { fieldKindWord } from "./field-type-labels.js";
import { assignmentWord, stepKindPhrase } from "./guided-labels.js";
import { resolveDraftLocalizedText, type DraftLocalizedText } from "./localized-text.js";
import { performedByFor } from "./performedBy.js";
import { timeLimitParts, type TimeLimitUnit } from "./time-limit.js";

export type ChangeGroup = "process" | "fields" | "dataSources" | "steps" | "paths" | "forms" | "contract";
export type ChangeKind = "added" | "removed" | "changed";

/** The seven groups in the order the change list stands them in. */
export const CHANGE_GROUPS: readonly ChangeGroup[] = ["process", "fields", "dataSources", "steps", "paths", "forms", "contract"];

export interface ChangeValue {
  text: string;
  mono: boolean;
}

export interface ChangeProperty {
  name: string;
  /** A key the word table has no word for reads under its own JSON name, in mono. */
  nameMono?: boolean;
  kind: ChangeKind | "order";
  before?: ChangeValue;
  after?: ChangeValue;
}

export interface ChangeRow {
  /** `${group}:${anchor}`. The React key and the open-state key. */
  key: string;
  group: ChangeGroup;
  kind: ChangeKind;
  label: string;
  entityKey?: string;
  /** Paths only: the label of the step the path leaves. */
  context?: string;
  properties: ChangeProperty[];
  /** Full-path entries for the Developer view. */
  raw: DiffEntry[];
}

/**
 * The word each declared key of the definition contract reads under. A key
 * missing here reads under its own JSON name, in mono. The word coverage case
 * in `studio-changeSet.test.ts` walks the engine's Zod shapes against this
 * table and `OWNED_LISTS`.
 */
export const PROPERTY_WORDS: { readonly [key: string]: CatalogKey | undefined } = {
  // Shared by several shapes.
  id: "changeList.prop.id",
  key: "changeList.prop.key",
  label: "changeList.prop.label",
  description: "changeList.prop.description",
  type: "changeList.prop.type",
  config: "changeList.prop.config",
  validation: "changeList.prop.validation",
  cancellable: "changeList.prop.cancellable",
  // processBody, workflow, processContract
  baseLocale: "changeList.prop.baseLocale",
  allowedGroups: "changeList.prop.allowedGroups",
  initialStep: "changeList.prop.initialStep",
  inputFields: "changeList.prop.inputFields",
  outputFields: "changeList.prop.outputFields",
  outcomes: "changeList.prop.outcomes",
  // step, subprocessSpec
  terminal: "changeList.prop.terminal",
  outcome: "changeList.prop.outcome",
  assignment: "changeList.prop.assignment",
  subprocess: "changeList.prop.subprocess",
  collaboration: "changeList.prop.collaboration",
  processId: "changeList.prop.processId",
  versionBinding: "changeList.prop.versionBinding",
  pinnedVersion: "changeList.prop.pinnedVersion",
  contractRef: "changeList.prop.contractRef",
  inputMapping: "changeList.prop.inputMapping",
  outputMapping: "changeList.prop.outputMapping",
  // path, timer, timerAction
  to: "changeList.prop.to",
  trigger: "changeList.prop.trigger",
  guard: "changeList.prop.guard",
  priority: "changeList.prop.priority",
  duration: "changeList.prop.duration",
  deadline: "changeList.prop.deadline",
  onFire: "changeList.prop.onFire",
  targetPath: "changeList.prop.targetPath",
  // action, retryPolicy
  idempotencyKey: "changeList.prop.idempotencyKey",
  output: "changeList.prop.output",
  execution: "changeList.prop.execution",
  retry: "changeList.prop.retry",
  timeout: "changeList.prop.timeout",
  maxAttempts: "changeList.prop.maxAttempts",
  backoff: "changeList.prop.backoff",
  baseDelay: "changeList.prop.baseDelay",
  // view, viewField, viewNote
  columns: "changeList.prop.columns",
  ref: "changeList.prop.ref",
  kind: "changeList.prop.kind",
  text: "changeList.prop.text",
  visible: "changeList.prop.visible",
  required: "changeList.prop.required",
  readonly: "changeList.prop.readonly",
  group: "changeList.prop.group",
  tab: "changeList.prop.tab",
  span: "changeList.prop.span",
  validationMode: "changeList.prop.validationMode",
  // fieldDef, fieldOption, fieldValidation
  format: "changeList.prop.format",
  control: "changeList.prop.control",
  dataSource: "changeList.prop.dataSource",
  columnMapping: "changeList.prop.columnMapping",
  default: "changeList.prop.default",
  technical: "changeList.prop.technical",
  redactable: "changeList.prop.redactable",
  value: "changeList.prop.value",
  attributes: "changeList.prop.attributes",
  min: "changeList.prop.min",
  max: "changeList.prop.max",
  minLength: "changeList.prop.minLength",
  maxLength: "changeList.prop.maxLength",
  pattern: "changeList.prop.pattern",
  rule: "changeList.prop.rule",
};

const PROCESS_LISTS = ["fields", "dataSources", "workflow", "contract"] as const;
const WORKFLOW_LISTS = ["steps"] as const;
const STEP_LISTS = ["paths", "view", "onEntry", "onExit", "onCancel", "timers"] as const;
const PATH_LISTS = ["onPath"] as const;
const TIMER_ACTION_LISTS = ["actions"] as const;
const VIEW_LISTS = ["fields", "tabs"] as const;
const CONTRACT_LISTS = ["inputFields", "outputFields", "outcomes"] as const;
const FIELD_LISTS = ["fields", "options"] as const;

/** The keys the walker takes out of a pair before `diffJson` sees it, per
 * Zod shape: each becomes rows or properties of its own. */
export const OWNED_LISTS: { readonly [shape: string]: readonly string[] | undefined } = {
  processBody: PROCESS_LISTS,
  workflow: WORKFLOW_LISTS,
  step: STEP_LISTS,
  path: PATH_LISTS,
  timerAction: TIMER_ACTION_LISTS,
  view: VIEW_LISTS,
  processContract: CONTRACT_LISTS,
  fieldDef: FIELD_LISTS,
};

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
const kindOf = (before: unknown, after: unknown): ChangeKind =>
  before === undefined ? "added" : after === undefined ? "removed" : "changed";

function fill(key: CatalogKey, slots: Record<string, string>): string {
  let text = t(key);
  for (const [slot, value] of Object.entries(slots)) text = text.replace(`{${slot}}`, () => value);
  return text;
}

const plain = (text: string): ChangeValue => ({ text, mono: false });
const none = (): ChangeValue => plain(t("changeList.value.none"));
const json = (v: unknown): ChangeValue => (v === undefined ? none() : { text: JSON.stringify(v), mono: true });

interface Name {
  name: string;
  nameMono?: true;
}

function wordFor(key: string): CatalogKey | undefined {
  return Object.hasOwn(PROPERTY_WORDS, key) ? PROPERTY_WORDS[key] : undefined;
}

function propName(key: string): Name {
  const word = wordFor(key);
  return word === undefined ? { name: key, nameMono: true } : { name: t(word) };
}

// ---- One side of the comparison ----

interface Member {
  anchor: string;
  path: string;
  value: Obj;
  index: number;
}
interface FieldMember extends Member {
  parent: FieldMember | undefined;
}
interface PathMember extends Member {
  step: Member;
}

interface Side {
  body: Obj;
  /** The locale a `LocalizedText` reads in, and the one it falls back to. */
  locale: string;
  baseLocale: string;
  fields: FieldMember[];
  /** A group field's anchor, or "" for the catalog root, to its children's anchors in order. */
  fieldChildren: Map<string, string[]>;
  dataSources: Member[];
  steps: Member[];
  paths: PathMember[];
  fieldById: Map<string, Obj>;
  stepById: Map<string, Obj>;
  dataSourceById: Map<string, Obj>;
  /** JSON path to value, for every shape the walker does not expect. Each
   * reads as JSON on the Process row. */
  unexpected: Map<string, unknown>;
}

/**
 * Hands out the anchors of one collection on one side (D2). A member with no
 * anchor takes `#<path>`, its JSON path, which is unique per side. A member
 * whose anchor an earlier member already holds takes `<anchor>#<n>`, so it
 * pairs with the n-th occurrence on the other side.
 */
function anchorer(): (base: unknown, path: string) => string {
  const seen = new Map<string, number>();
  return (base, path) => {
    const anchor = typeof base === "string" && base !== "" ? base : `#${path}`;
    const n = (seen.get(anchor) ?? 0) + 1;
    seen.set(anchor, n);
    return n === 1 ? anchor : `${anchor}#${n}`;
  };
}

/** A list's object members with their JSON paths. A list that is no array,
 * and a member that is no object, land on `side.unexpected`. */
function membersOf(list: unknown, listPath: string, side: Side): { value: Obj; path: string; index: number }[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    side.unexpected.set(listPath, list);
    return [];
  }
  const members: { value: Obj; path: string; index: number }[] = [];
  list.forEach((value, index) => {
    const path = `${listPath}[${index}]`;
    if (isObj(value)) members.push({ value, path, index });
    else side.unexpected.set(path, value);
  });
  return members;
}

/** A list's members anchored on one key of each member. */
function anchoredMembers(list: unknown, listPath: string, key: string, side: Side): Member[] {
  const take = anchorer();
  return membersOf(list, listPath, side).map((m) => ({ ...m, anchor: take(m.value[key], m.path) }));
}

function readSide(body: Obj, locale: string | undefined): Side {
  const baseLocale = str(body.baseLocale) ?? "en";
  const side: Side = {
    body,
    baseLocale,
    locale: locale ?? baseLocale,
    fields: [],
    fieldChildren: new Map(),
    dataSources: [],
    steps: [],
    paths: [],
    fieldById: new Map(),
    stepById: new Map(),
    dataSourceById: new Map(),
    unexpected: new Map(),
  };
  for (const key of ["workflow", "contract"]) {
    if (body[key] !== undefined && !isObj(body[key])) side.unexpected.set(key, body[key]);
  }

  // Fields pair across the whole catalog, in depth-first order.
  const takeField = anchorer();
  const visit = (list: unknown, listPath: string, parent: FieldMember | undefined) => {
    const anchors: string[] = [];
    for (const m of membersOf(list, listPath, side)) {
      const anchor = takeField(m.value.id, m.path);
      const member: FieldMember = { ...m, anchor, parent };
      side.fields.push(member);
      anchors.push(anchor);
      if (typeof m.value.id === "string" && !side.fieldById.has(m.value.id)) side.fieldById.set(m.value.id, m.value);
      if (m.value.fields !== undefined) visit(m.value.fields, `${m.path}.fields`, member);
    }
    side.fieldChildren.set(parent?.anchor ?? "", anchors);
  };
  visit(body.fields, "fields", undefined);

  side.dataSources = anchoredMembers(body.dataSources, "dataSources", "id", side);
  for (const { value } of side.dataSources) {
    if (typeof value.id === "string" && !side.dataSourceById.has(value.id)) side.dataSourceById.set(value.id, value);
  }

  // Paths pair across every step, in step order.
  const workflow = isObj(body.workflow) ? body.workflow : undefined;
  const takeStep = anchorer();
  const takePath = anchorer();
  for (const m of membersOf(workflow?.steps, "workflow.steps", side)) {
    const step: Member = { ...m, anchor: takeStep(m.value.id, m.path) };
    side.steps.push(step);
    if (typeof m.value.id === "string" && !side.stepById.has(m.value.id)) side.stepById.set(m.value.id, m.value);
    if (m.value.view !== undefined && !isObj(m.value.view)) side.unexpected.set(`${m.path}.view`, m.value.view);
    for (const p of membersOf(m.value.paths, `${m.path}.paths`, side)) {
      side.paths.push({ ...p, anchor: takePath(p.value.id, p.path), step });
    }
  }
  return side;
}

interface Pair<M> {
  anchor: string;
  b?: M;
  a?: M;
}

/** The after side's order first, then what the before side alone holds. */
function pair<M extends { anchor: string }>(before: M[], after: M[]): Pair<M>[] {
  const byAnchor = new Map(before.map((m) => [m.anchor, m]));
  const afterAnchors = new Set(after.map((m) => m.anchor));
  return [
    ...after.map((a) => ({ anchor: a.anchor, b: byAnchor.get(a.anchor), a })),
    ...before.filter((b) => !afterAnchors.has(b.anchor)).map((b) => ({ anchor: b.anchor, b })),
  ];
}

// ---- Words for one entity ----

function localized(value: unknown, side: Side): string | undefined {
  if (!isObj(value)) return undefined;
  return str(resolveDraftLocalizedText(value as DraftLocalizedText, side.locale, side.baseLocale));
}

function labelOf(entity: Obj, side: Side): string {
  const label = typeof entity.label === "string" ? entity.label : localized(entity.label, side);
  return label || str(entity.key) || str(entity.id) || "";
}

function fieldLabel(ref: unknown, side: Side): string {
  if (typeof ref !== "string") return JSON.stringify(ref) ?? "";
  const field = side.fieldById.get(ref);
  return field ? labelOf(field, side) : ref;
}

/** Keys holding a `LocalizedText`, and the prose a string there carries. */
const TEXT_KEYS = new Set(["label", "description", "text"]);
/** Keys that stay one property, printed as JSON, whatever they hold (D5). */
const JSON_KEYS = new Set(["config", "attributes", "columnMapping", "default"]);
/** Declared nested objects: each leaf reads as `{property} · {leaf}`. */
const NESTED_KEYS = new Set(["validation", "subprocess"]);
/** Records keyed by field id: each entry reads as a property of its own. */
const FIELD_RECORD_KEYS = new Set(["inputMapping", "outputMapping"]);
/** Keys holding another entity's id, and the kind of entity it names. */
const REFERENCES = new Map<string, "step" | "field" | "dataSource">([
  ["initialStep", "step"],
  ["to", "step"],
  ["dataSource", "dataSource"],
  ["fieldId", "field"],
]);

const isExpression = (v: unknown): v is { lang: "cel"; src: string } => isObj(v) && v.lang === "cel" && typeof v.src === "string";

/** An id reads as the label of the entity it names, on its own side. A data
 * source has no label, so its key names it. An id naming nothing prints raw. */
function reference(kind: "step" | "field" | "dataSource", id: string, side: Side): ChangeValue {
  const entity = (kind === "step" ? side.stepById : kind === "field" ? side.fieldById : side.dataSourceById).get(id);
  if (entity === undefined) return { text: id, mono: true };
  return kind === "dataSource" ? { text: str(entity.key) || id, mono: true } : plain(labelOf(entity, side));
}

/** One value, by the D5 rule for its shape. A string outside the prose keys
 * is a machine value, so it prints in mono. */
function valueOf(key: string, v: unknown, side: Side): ChangeValue {
  if (v === undefined) return none();
  if (JSON_KEYS.has(key)) return json(v);
  if (typeof v === "boolean") return plain(t(v ? "changeList.value.yes" : "changeList.value.no"));
  const kind = REFERENCES.get(key);
  if (kind !== undefined && typeof v === "string") return reference(kind, v, side);
  if (key === "versionBinding" && v === "pinned") return plain(t("subprocess.bindingPinned"));
  if (key === "versionBinding" && v === "latest-at-spawn") return plain(t("subprocess.bindingLatest"));
  if (isExpression(v)) return { text: v.src, mono: true };
  if (TEXT_KEYS.has(key) && isObj(v)) {
    const text = localized(v, side);
    return text === undefined ? none() : plain(text);
  }
  if (typeof v === "string") return { text: v, mono: !TEXT_KEYS.has(key) };
  return json(v);
}

/** The pair being read, and each side's JSON path to it. */
interface Ctx {
  b: Side;
  a: Side;
  bPath: string | undefined;
  aPath: string | undefined;
}

const objectOrAbsent = (v: unknown): v is Obj | undefined => v === undefined || isObj(v);

/** The properties one differing key reads as. A key with no word reads as
 * JSON under its own name. */
function valueProperties(key: string, name: Name, bv: unknown, av: unknown, ctx: Ctx): ChangeProperty[] {
  const kind = kindOf(bv, av);
  if (name.nameMono) return [{ ...name, kind, before: json(bv), after: json(av) }];
  if (objectOrAbsent(bv) && objectOrAbsent(av)) {
    if (TEXT_KEYS.has(key)) return localizedProperties(name, bv, av, ctx);
    if (NESTED_KEYS.has(key)) return keyProperties(bv, av, [], ctx, (leaf) => (FIELD_RECORD_KEYS.has(leaf) ? propName(leaf) : leafName(name, leaf)));
    if (FIELD_RECORD_KEYS.has(key)) return fieldRecordProperties(key, name, bv, av, ctx);
  }
  return [{ ...name, kind, before: valueOf(key, bv, ctx.b), after: valueOf(key, av, ctx.a) }];
}

/**
 * A `LocalizedText` reads in each side's reading locale. A difference in any
 * other locale adds a property named with that locale. A locale stays out only
 * when the plain property prints and each side either reads that locale or has
 * no entry for it: the plain property then already shows that difference, so a
 * translation added or removed in the content locale prints once. When both
 * sides read the same text, a differing entry still prints under its locale: a
 * translation equal to its fallback, or an entry that holds no text.
 */
function localizedProperties(name: Name, b: Obj | undefined, a: Obj | undefined, ctx: Ctx): ChangeProperty[] {
  const properties: ChangeProperty[] = [];
  const bText = b && localized(b, ctx.b);
  const aText = a && localized(a, ctx.a);
  const plainPrints = bText !== aText;
  if (plainPrints) {
    properties.push({ ...name, kind: kindOf(b, a), before: bText === undefined ? none() : plain(bText), after: aText === undefined ? none() : plain(aText) });
  }
  const reads = (value: Obj, side: Side) => (typeof value[side.locale] === "string" ? side.locale : side.baseLocale);
  const shownPlainly = (value: Obj | undefined, side: Side, locale: string) =>
    value === undefined || value[locale] === undefined || reads(value, side) === locale;
  const entry = (v: unknown) => (typeof v === "string" ? plain(v) : json(v));
  for (const locale of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    if (same(b?.[locale], a?.[locale])) continue;
    if (plainPrints && shownPlainly(b, ctx.b, locale) && shownPlainly(a, ctx.a, locale)) continue;
    properties.push({
      name: fill("changeList.name.locale", { property: name.name, locale }),
      ...(name.nameMono && { nameMono: true }),
      kind: kindOf(b?.[locale], a?.[locale]),
      before: entry(b?.[locale]),
      after: entry(a?.[locale]),
    });
  }
  return properties;
}

/**
 * A record keyed by field id. `outputMapping` keys by the process's own
 * fields, so each entry reads under that field's label on its own side.
 * `inputMapping` keys by the child contract's field ids, which this body
 * declares none of, so each entry reads under the raw id, in mono.
 */
function fieldRecordProperties(key: string, name: Name, b: Obj | undefined, a: Obj | undefined, ctx: Ctx): ChangeProperty[] {
  const properties: ChangeProperty[] = [];
  const childIds = key === "inputMapping";
  for (const id of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    if (same(b?.[id], a?.[id])) continue;
    const leaf = childIds ? id : fieldLabel(id, a?.[id] !== undefined ? ctx.a : ctx.b);
    properties.push({
      name: fill("changeList.name.leaf", { property: name.name, leaf }),
      ...(childIds && { nameMono: true }),
      kind: kindOf(b?.[id], a?.[id]),
      before: valueOf("", b?.[id], ctx.b),
      after: valueOf("", a?.[id], ctx.a),
    });
  }
  return properties;
}

/**
 * The differing entries under an envelope, each under its JSON key with a D5
 * value. A guided word that matches on both sides reads these instead: the
 * word reads only part of the value. `strategy` and `config` open onto their
 * own entries.
 */
function envelopeEntries(b: unknown, a: unknown, ctx: Ctx): ChangeProperty[] {
  const bo = isObj(b) ? b : undefined;
  const ao = isObj(a) ? a : undefined;
  const properties: ChangeProperty[] = [];
  for (const key of new Set([...Object.keys(ao ?? {}), ...Object.keys(bo ?? {})])) {
    const bv = bo?.[key];
    const av = ao?.[key];
    if (same(bv, av)) continue;
    if ((key === "strategy" || key === "config") && objectOrAbsent(bv) && objectOrAbsent(av)) {
      properties.push(...envelopeEntries(bv, av, ctx));
      continue;
    }
    properties.push({ name: key, nameMono: true, kind: kindOf(bv, av), before: valueOf(key, bv, ctx.b), after: valueOf(key, av, ctx.a) });
  }
  return properties;
}

/** One property run per differing key of a pair, skipping the keys the row
 * reads some other way. */
function keyProperties(
  b: Obj | undefined,
  a: Obj | undefined,
  skip: readonly string[],
  ctx: Ctx,
  nameOf: (key: string) => Name = propName,
): ChangeProperty[] {
  const properties: ChangeProperty[] = [];
  for (const key of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    if (skip.includes(key) || same(b?.[key], a?.[key])) continue;
    properties.push(...valueProperties(key, nameOf(key), b?.[key], a?.[key], ctx));
  }
  return properties;
}

/** `diffJson`'s entries at their full paths. A member whose path differs
 * between the sides prints both. */
function rawOf(b: unknown, a: unknown, ctx: Ctx): DiffEntry[] {
  const at = (base: string, rel: string) => (rel === "(root)" ? base || rel : base ? `${base}.${rel}` : rel);
  const { bPath, aPath } = ctx;
  return diffJson(b ?? {}, a ?? {}).map((entry) => {
    const path =
      aPath === undefined
        ? at(bPath ?? "", entry.path)
        : bPath === undefined || bPath === aPath
          ? at(aPath, entry.path)
          : `${at(bPath, entry.path)} → ${at(aPath, entry.path)}`;
    return { ...entry, path };
  });
}

function omit(value: Obj | undefined, keys: readonly string[]): Obj | undefined {
  if (value === undefined) return undefined;
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

function pick(value: Obj | undefined, keys: readonly string[]): Obj {
  const picked: Obj = {};
  for (const key of keys) if (value?.[key] !== undefined) picked[key] = value[key];
  return picked;
}

interface Out {
  properties: ChangeProperty[];
  raw: DiffEntry[];
}

const newOut = (): Out => ({ properties: [], raw: [] });

const anchorsOf = (members: readonly { anchor: string }[]): string[] => members.map((m) => m.anchor);

/**
 * One order property for a list whose shared members stand in a different
 * sequence (D4). Only the anchors both sides hold count: a member added,
 * removed or moved to another container never makes an order property alone.
 */
function orderProperty(key: CatalogKey, before: readonly string[], after: readonly string[], path: string | undefined, out: Out): void {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const from = before.filter((anchor) => afterSet.has(anchor));
  const to = after.filter((anchor) => beforeSet.has(anchor));
  if (same(from, to)) return;
  out.properties.push({ name: t(key), kind: "order", after: plain(t("changeList.value.reordered")) });
  out.raw.push({ path: path ?? "", kind: "changed", from, to });
}

function row(group: ChangeGroup, anchor: string, kind: ChangeKind, label: string, out: Out, extra: Partial<ChangeRow> = {}): ChangeRow {
  return { key: `${group}:${anchor}`, group, kind, label, ...extra, properties: out.properties, raw: out.raw };
}

// ---- Fields ----

const FIELD_KIND_KEYS = ["type", "format", "control"] as const;

function fieldKindValue(field: Obj): ChangeValue {
  const text = fieldKindWord(field);
  if (text === "") return none();
  return { text, mono: !isObj(field.type) && fieldKindOf(field) === undefined };
}

function fieldKindProperties(b: Obj | undefined, a: Obj | undefined, ctx: Ctx): ChangeProperty[] {
  const bKind = pick(b, FIELD_KIND_KEYS);
  const aKind = pick(a, FIELD_KIND_KEYS);
  if (same(bKind, aKind)) return [];
  const bWord = b && fieldKindValue(b);
  const aWord = a && fieldKindValue(a);
  const name = { name: t("changeList.name.kind") };
  if (!b || !a || !same(bWord, aWord)) return [{ ...name, kind: kindOf(b, a), before: bWord ?? none(), after: aWord ?? none() }];
  // `fieldKindWord` answers one word for every plugin type.
  if (isObj(bKind.type) && isObj(aKind.type)) {
    return [...envelopeEntries(bKind.type, aKind.type, ctx), ...keyProperties(bKind, aKind, ["type"], ctx)];
  }
  return keyProperties(bKind, aKind, [], ctx);
}

function optionProperties(b: FieldMember | undefined, a: FieldMember | undefined, ctx: Ctx, out: Out): void {
  const before = b ? anchoredMembers(b.value.options, `${b.path}.options`, "value", ctx.b) : [];
  const after = a ? anchoredMembers(a.value.options, `${a.path}.options`, "value", ctx.a) : [];
  for (const { anchor, b: bo, a: ao } of pair(before, after)) {
    if (same(bo?.value, ao?.value)) continue;
    const octx: Ctx = { ...ctx, bPath: bo?.path, aPath: ao?.path };
    const name = { name: fill("changeList.name.option", { value: str((ao ?? bo)!.value.value) ?? anchor }) };
    if (!bo || !ao) {
      out.properties.push({
        ...name,
        kind: kindOf(bo, ao),
        before: bo ? valueOf("label", bo.value.label, ctx.b) : none(),
        after: ao ? valueOf("label", ao.value.label, ctx.a) : none(),
      });
    } else {
      out.properties.push(
        ...labelledProperties(name, bo.value, ao.value, "label", ["value"], (key) => leafName(name, key), octx),
      );
    }
    out.raw.push(...rawOf(bo?.value, ao?.value, octx));
  }
  orderProperty("changeList.order.options", anchorsOf(before), anchorsOf(after), a && `${a.path}.options`, out);
}

function leafName(parent: Name, key: string): Name {
  const leaf = propName(key);
  return { name: fill("changeList.name.leaf", { property: parent.name, leaf: leaf.name }), ...(leaf.nameMono && { nameMono: true }) };
}

function formEntryName(field: string, key: string): Name {
  const property = propName(key);
  return { name: fill("changeList.name.formEntry", { field, property: property.name }), ...(property.nameMono && { nameMono: true }) };
}

/** A member named by the walker (an option, a note, a tab): its display text
 * reads under the member's own name, and every other key under a sub-name. */
function labelledProperties(
  name: Name,
  b: Obj,
  a: Obj,
  textKey: string,
  skip: readonly string[],
  subName: (key: string) => Name,
  ctx: Ctx,
): ChangeProperty[] {
  const properties: ChangeProperty[] = [];
  if (!same(b[textKey], a[textKey])) properties.push(...valueProperties(textKey, name, b[textKey], a[textKey], ctx));
  properties.push(...keyProperties(b, a, [textKey, ...skip], ctx, subName));
  return properties;
}

function fieldRows(sb: Side, sa: Side): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const { anchor, b, a } of pair(sb.fields, sa.fields)) {
    const ctx: Ctx = { b: sb, a: sa, bPath: b?.path, aPath: a?.path };
    const out = newOut();
    out.properties.push(...fieldKindProperties(b?.value, a?.value, ctx));
    if (b && a && b.parent?.anchor !== a.parent?.anchor) {
      out.properties.push({
        name: t("changeList.name.group"),
        kind: "changed",
        before: b.parent ? plain(labelOf(b.parent.value, sb)) : none(),
        after: a.parent ? plain(labelOf(a.parent.value, sa)) : none(),
      });
      out.raw.push({ path: `${b.path} → ${a.path}`, kind: "changed", from: b.parent?.anchor ?? null, to: a.parent?.anchor ?? null });
    }
    out.properties.push(...keyProperties(b?.value, a?.value, ["id", ...FIELD_LISTS, ...FIELD_KIND_KEYS], ctx));
    out.raw.push(...rawOf(omit(b?.value, FIELD_LISTS), omit(a?.value, FIELD_LISTS), ctx));
    optionProperties(b, a, ctx, out);
    orderProperty(
      "changeList.order.fields",
      (b && sb.fieldChildren.get(b.anchor)) ?? [],
      (a && sa.fieldChildren.get(a.anchor)) ?? [],
      a && `${a.path}.fields`,
      out,
    );
    if (b && a && out.properties.length === 0) continue;
    const entity = (a ?? b)!;
    rows.push(
      row("fields", anchor, kindOf(b, a), labelOf(entity.value, a ? sa : sb), out, { entityKey: str(entity.value.key) }),
    );
  }
  return rows;
}

// ---- Data sources ----

function dataSourceRows(sb: Side, sa: Side): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const { anchor, b, a } of pair(sb.dataSources, sa.dataSources)) {
    const ctx: Ctx = { b: sb, a: sa, bPath: b?.path, aPath: a?.path };
    const out = newOut();
    out.properties.push(...keyProperties(b?.value, a?.value, ["id"], ctx));
    out.raw.push(...rawOf(b?.value, a?.value, ctx));
    if (b && a && out.properties.length === 0) continue;
    // A data source has no label, so its row names it by its key.
    const entity = (a ?? b)!.value;
    rows.push(row("dataSources", anchor, kindOf(b, a), str(entity.key) || str(entity.id) || anchor, out));
  }
  return rows;
}

// ---- Steps, paths and forms ----

type ActionList = "onEntry" | "onExit" | "onCancel" | "onPath" | "onFire";

function actionProperties(
  list: ActionList,
  bList: unknown,
  aList: unknown,
  bListPath: string | undefined,
  aListPath: string | undefined,
  ctx: Ctx,
  out: Out,
): void {
  const before = bListPath === undefined ? [] : anchoredMembers(bList, bListPath, "id", ctx.b);
  const after = aListPath === undefined ? [] : anchoredMembers(aList, aListPath, "id", ctx.a);
  for (const { b, a } of pair(before, after)) {
    if (same(b?.value, a?.value)) continue;
    const type = (a ?? b)!.value.type;
    out.properties.push({
      name: fill(`changeList.name.${list}`, { type: str(type) ?? JSON.stringify(type) ?? "" }),
      kind: kindOf(b, a),
      before: b ? json(b.value) : none(),
      after: a ? json(a.value) : none(),
    });
    out.raw.push(...rawOf(b?.value, a?.value, { ...ctx, bPath: b?.path, aPath: a?.path }));
  }
  orderProperty(`changeList.order.${list}`, anchorsOf(before), anchorsOf(after), aListPath, out);
}

const differingKeys = (b: Obj, a: Obj): string[] =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !same(b[key], a[key]));

const TIME_LIMIT_UNITS: Record<TimeLimitUnit, CatalogKey> = {
  hours: "timeLimit.unitHours",
  days: "timeLimit.unitDays",
  weeks: "timeLimit.unitWeeks",
};

/** A duration a number and a unit can state reads as both; any other prints
 * in mono, exactly as it stands. */
function timeLimitValue(duration: unknown): ChangeValue {
  if (typeof duration !== "string") return json(duration);
  const parts = timeLimitParts(duration);
  if (parts === undefined) return { text: duration, mono: true };
  return plain(fill("changeList.value.timeLimit", { count: String(parts.count), unit: t(TIME_LIMIT_UNITS[parts.unit]) }));
}

const withoutFireActions = (timer: Obj): Obj =>
  isObj(timer.onFire) ? { ...timer, onFire: omit(timer.onFire, TIMER_ACTION_LISTS) } : timer;

function timerProperties(b: Member | undefined, a: Member | undefined, ctx: Ctx, out: Out): void {
  const before = b ? anchoredMembers(b.value.timers, `${b.path}.timers`, "id", ctx.b) : [];
  const after = a ? anchoredMembers(a.value.timers, `${a.path}.timers`, "id", ctx.a) : [];
  for (const { b: bt, a: at } of pair(before, after)) {
    const tctx: Ctx = { ...ctx, bPath: bt?.path, aPath: at?.path };
    const bCopy = bt && withoutFireActions(bt.value);
    const aCopy = at && withoutFireActions(at.value);
    if (!same(bCopy, aCopy)) {
      // A timer whose duration alone differs reads the time limit.
      const durationAlone = bCopy !== undefined && aCopy !== undefined && differingKeys(bCopy, aCopy).join() === "duration";
      const read = (copy: Obj | undefined) => (copy === undefined ? none() : durationAlone ? timeLimitValue(copy.duration) : json(copy));
      out.properties.push({
        name: fill("changeList.name.timer", { n: String((at ?? bt)!.index + 1) }),
        kind: kindOf(bt, at),
        before: read(bCopy),
        after: read(aCopy),
      });
      out.raw.push(...rawOf(bCopy, aCopy, tctx));
    }
    const fire = (timer: Member | undefined) => (timer && isObj(timer.value.onFire) ? timer.value.onFire : undefined);
    actionProperties(
      "onFire",
      fire(bt)?.actions,
      fire(at)?.actions,
      bt && `${bt.path}.onFire.actions`,
      at && `${at.path}.onFire.actions`,
      ctx,
      out,
    );
  }
  orderProperty("changeList.order.timers", anchorsOf(before), anchorsOf(after), a && `${a.path}.timers`, out);
}

const STEP_ACTION_LISTS = ["onEntry", "onExit", "onCancel"] as const;
const STEP_KIND_KEYS = ["type", "terminal"] as const;

/** `type` and `terminal` fold into one Kind, in the guided vocabulary's phrase. */
function stepKindProperties(b: Obj | undefined, a: Obj | undefined, ctx: Ctx): ChangeProperty[] {
  const bKind = pick(b, STEP_KIND_KEYS);
  const aKind = pick(a, STEP_KIND_KEYS);
  if (same(bKind, aKind)) return [];
  const phrase = (step: Obj) =>
    plain(stepKindPhrase(performedByFor(step.type === "subprocess" ? "subprocess" : undefined, step.terminal === true)));
  const bWord = b && phrase(b);
  const aWord = a && phrase(a);
  if (!b || !a || !same(bWord, aWord)) {
    return [{ name: t("changeList.name.kind"), kind: kindOf(b, a), before: bWord ?? none(), after: aWord ?? none() }];
  }
  return keyProperties(bKind, aKind, [], ctx);
}

/** An assignment reads as its strategy's plain name. When that name matches
 * on both sides, the differing entries under the strategy read instead. */
function assignmentProperties(b: Obj | undefined, a: Obj | undefined, ctx: Ctx): ChangeProperty[] {
  const bv = b?.assignment;
  const av = a?.assignment;
  if (same(bv, av)) return [];
  const word = (step: Obj | undefined, v: unknown): ChangeValue | undefined => {
    if (step === undefined) return undefined;
    const { text, mono } = assignmentWord(isObj(v) && isObj(v.strategy) ? v.strategy : undefined);
    return { text, mono };
  };
  const bWord = word(b, bv);
  const aWord = word(a, av);
  const name = propName("assignment");
  if (!bWord || !aWord || !same(bWord, aWord)) {
    return [{ ...name, kind: kindOf(bv, av), before: bWord ?? none(), after: aWord ?? none() }];
  }
  const entries = envelopeEntries(bv, av, ctx);
  return entries.length > 0 ? entries : [{ ...name, kind: kindOf(bv, av), before: json(bv), after: json(av) }];
}

function stepRows(sb: Side, sa: Side): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const { anchor, b, a } of pair(sb.steps, sa.steps)) {
    const ctx: Ctx = { b: sb, a: sa, bPath: b?.path, aPath: a?.path };
    const out = newOut();
    out.properties.push(...stepKindProperties(b?.value, a?.value, ctx));
    out.properties.push(...assignmentProperties(b?.value, a?.value, ctx));
    out.properties.push(...keyProperties(b?.value, a?.value, ["id", ...STEP_LISTS, ...STEP_KIND_KEYS, "assignment"], ctx));
    out.raw.push(...rawOf(omit(b?.value, STEP_LISTS), omit(a?.value, STEP_LISTS), ctx));
    for (const list of STEP_ACTION_LISTS) {
      actionProperties(list, b?.value[list], a?.value[list], b && `${b.path}.${list}`, a && `${a.path}.${list}`, ctx, out);
    }
    timerProperties(b, a, ctx, out);
    const ownPaths = (side: Side, step: Member | undefined) => anchorsOf(side.paths.filter((p) => p.step === step));
    orderProperty("changeList.order.paths", ownPaths(sb, b), ownPaths(sa, a), a && `${a.path}.paths`, out);
    if (b && a && out.properties.length === 0) continue;
    const entity = (a ?? b)!;
    rows.push(row("steps", anchor, kindOf(b, a), labelOf(entity.value, a ? sa : sb), out, { entityKey: str(entity.value.key) }));
  }
  return rows;
}

function pathRows(sb: Side, sa: Side): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const { anchor, b, a } of pair(sb.paths, sa.paths)) {
    const ctx: Ctx = { b: sb, a: sa, bPath: b?.path, aPath: a?.path };
    const out = newOut();
    if (b && a && b.step.anchor !== a.step.anchor) {
      out.properties.push({
        name: t("changeList.name.from"),
        kind: "changed",
        before: plain(labelOf(b.step.value, sb)),
        after: plain(labelOf(a.step.value, sa)),
      });
      out.raw.push({ path: `${b.path} → ${a.path}`, kind: "changed", from: b.step.anchor, to: a.step.anchor });
    }
    out.properties.push(...keyProperties(b?.value, a?.value, ["id", ...PATH_LISTS], ctx));
    out.raw.push(...rawOf(omit(b?.value, PATH_LISTS), omit(a?.value, PATH_LISTS), ctx));
    actionProperties("onPath", b?.value.onPath, a?.value.onPath, b && `${b.path}.onPath`, a && `${a.path}.onPath`, ctx, out);
    if (b && a && out.properties.length === 0) continue;
    const entity = (a ?? b)!;
    const side = a ? sa : sb;
    rows.push(
      row("paths", anchor, kindOf(b, a), labelOf(entity.value, side), out, {
        entityKey: str(entity.value.key),
        context: labelOf(entity.step.value, side),
      }),
    );
  }
  return rows;
}

interface EntryMember extends Member {
  /** A note's position among its view's notes; `undefined` for a field entry. */
  note: number | undefined;
}

/** A field entry anchors on its `ref`; a note has none, so it anchors on its
 * position among the view's notes. */
function viewEntries(view: Obj | undefined, viewPath: string | undefined, side: Side): EntryMember[] {
  if (view === undefined || viewPath === undefined) return [];
  const take = anchorer();
  let notes = 0;
  return membersOf(view.fields, `${viewPath}.fields`, side).map((m) => {
    if (m.value.kind === undefined) return { ...m, anchor: take(m.value.ref, m.path), note: undefined };
    notes += 1;
    return { ...m, anchor: `#note${notes - 1}`, note: notes - 1 };
  });
}

function entryProperties(b: EntryMember | undefined, a: EntryMember | undefined, ctx: Ctx, out: Out): void {
  const entry = (a ?? b)!;
  if (entry.note !== undefined) {
    const name = { name: fill("changeList.name.note", { n: String(entry.note + 1) }) };
    if (!b || !a) {
      out.properties.push({
        ...name,
        kind: kindOf(b, a),
        before: b ? valueOf("text", b.value.text, ctx.b) : none(),
        after: a ? valueOf("text", a.value.text, ctx.a) : none(),
      });
    } else {
      out.properties.push(
        ...labelledProperties(name, b.value, a.value, "text", [], (key) => formEntryName(name.name, key), ctx),
      );
    }
    return;
  }
  const field = fieldLabel(entry.value.ref, a ? ctx.a : ctx.b);
  if (!b) out.properties.push({ name: field, kind: "added", after: plain(t("changeList.value.addedToForm")) });
  else if (!a) out.properties.push({ name: field, kind: "removed", after: plain(t("changeList.value.removedFromForm")) });
  else out.properties.push(...keyProperties(b.value, a.value, ["ref"], ctx, (key) => formEntryName(field, key)));
}

function tabProperties(bView: Obj | undefined, aView: Obj | undefined, bPath: string | undefined, aPath: string | undefined, ctx: Ctx, out: Out): void {
  const before = bView && bPath !== undefined ? anchoredMembers(bView.tabs, `${bPath}.tabs`, "key", ctx.b) : [];
  const after = aView && aPath !== undefined ? anchoredMembers(aView.tabs, `${aPath}.tabs`, "key", ctx.a) : [];
  for (const { anchor, b, a } of pair(before, after)) {
    if (same(b?.value, a?.value)) continue;
    const tctx: Ctx = { ...ctx, bPath: b?.path, aPath: a?.path };
    const name = { name: fill("changeList.name.tab", { key: anchor }) };
    if (!b || !a) {
      out.properties.push({
        ...name,
        kind: kindOf(b, a),
        before: b ? valueOf("label", b.value.label, ctx.b) : none(),
        after: a ? valueOf("label", a.value.label, ctx.a) : none(),
      });
    } else {
      out.properties.push(
        ...labelledProperties(name, b.value, a.value, "label", ["key"], (key) => formEntryName(name.name, key), tctx),
      );
    }
    out.raw.push(...rawOf(b?.value, a?.value, tctx));
  }
  orderProperty("changeList.order.tabs", anchorsOf(before), anchorsOf(after), aPath && `${aPath}.tabs`, out);
}

function formRows(sb: Side, sa: Side): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const { anchor, b, a } of pair(sb.steps, sa.steps)) {
    const bView = b && isObj(b.value.view) ? b.value.view : undefined;
    const aView = a && isObj(a.value.view) ? a.value.view : undefined;
    if (same(bView, aView)) continue;
    const bPath = bView && `${b!.path}.view`;
    const aPath = aView && `${a!.path}.view`;
    const ctx: Ctx = { b: sb, a: sa, bPath, aPath };
    const out = newOut();
    const before = viewEntries(bView, bPath, sb);
    const after = viewEntries(aView, aPath, sa);
    for (const { b: be, a: ae } of pair(before, after)) {
      if (same(be?.value, ae?.value)) continue;
      const ectx: Ctx = { ...ctx, bPath: be?.path, aPath: ae?.path };
      entryProperties(be, ae, ectx, out);
      out.raw.push(...rawOf(be?.value, ae?.value, ectx));
    }
    orderProperty("changeList.order.form", anchorsOf(before), anchorsOf(after), aPath && `${aPath}.fields`, out);
    tabProperties(bView, aView, bPath, aPath, ctx, out);
    out.properties.push(...keyProperties(bView, aView, VIEW_LISTS, ctx));
    out.raw.push(...rawOf(omit(bView, VIEW_LISTS), omit(aView, VIEW_LISTS), ctx));
    if (bView && aView && out.properties.length === 0) continue;
    const step = aView ? a! : b!;
    rows.push(
      row("forms", anchor, kindOf(bView, aView), labelOf(step.value, aView ? sa : sb), out, { entityKey: str(step.value.key) }),
    );
  }
  return rows;
}

// ---- Contract and process ----

type MemberList = "allowedGroups" | (typeof CONTRACT_LISTS)[number];

/** A list whose members are their own anchors. A member on both sides has
 * not changed, so only an added or removed member reads. */
function memberListProperties(list: MemberList, bList: unknown, aList: unknown, listPath: string, ctx: Ctx, out: Out): void {
  const members = (value: unknown, side: Side) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      side.unexpected.set(listPath, value);
      return [];
    }
    const take = anchorer();
    return value.map((member, index) => {
      const path = `${listPath}[${index}]`;
      return { anchor: take(typeof member === "string" ? member : canonicalize(member), path), path, value: member as unknown };
    });
  };
  const read = (member: unknown, side: Side): ChangeValue => {
    if (list === "inputFields" || list === "outputFields") return typeof member === "string" ? plain(fieldLabel(member, side)) : json(member);
    return typeof member === "string" ? { text: member, mono: true } : json(member);
  };
  const before = members(bList, ctx.b);
  const after = members(aList, ctx.a);
  for (const { b, a } of pair(before, after)) {
    if (b && a) continue;
    out.properties.push({
      ...propName(list),
      kind: kindOf(b, a),
      before: b ? read(b.value, ctx.b) : none(),
      after: a ? read(a.value, ctx.a) : none(),
    });
    out.raw.push(a ? { path: a.path, kind: "added", to: a.value } : { path: b!.path, kind: "removed", from: b!.value });
  }
  orderProperty(`changeList.order.${list}`, anchorsOf(before), anchorsOf(after), listPath, out);
}

function contractRows(sb: Side, sa: Side): ChangeRow[] {
  const b = isObj(sb.body.contract) ? sb.body.contract : undefined;
  const a = isObj(sa.body.contract) ? sa.body.contract : undefined;
  if (same(b, a)) return [];
  const ctx: Ctx = { b: sb, a: sa, bPath: b && "contract", aPath: a && "contract" };
  const out = newOut();
  for (const list of CONTRACT_LISTS) memberListProperties(list, b?.[list], a?.[list], `contract.${list}`, ctx, out);
  out.properties.push(...keyProperties(b, a, CONTRACT_LISTS, ctx));
  out.raw.push(...rawOf(omit(b, CONTRACT_LISTS), omit(a, CONTRACT_LISTS), ctx));
  if (b && a && out.properties.length === 0) return [];
  return [row("contract", "contract", kindOf(b, a), t("tabs.contract"), out)];
}

function processRows(sb: Side, sa: Side): ChangeRow[] {
  const b = sb.body;
  const a = sa.body;
  const ctx: Ctx = { b: sb, a: sa, bPath: "", aPath: "" };
  const out = newOut();
  const skip = [...PROCESS_LISTS, "allowedGroups"];
  out.properties.push(...keyProperties(b, a, skip, ctx));
  out.raw.push(...rawOf(omit(b, skip), omit(a, skip), ctx));

  const bWorkflow = isObj(b.workflow) ? b.workflow : undefined;
  const aWorkflow = isObj(a.workflow) ? a.workflow : undefined;
  const wctx: Ctx = { ...ctx, bPath: "workflow", aPath: "workflow" };
  const workflowName = (key: string): Name => (wordFor(key) === undefined ? { name: `workflow.${key}`, nameMono: true } : propName(key));
  out.properties.push(...keyProperties(bWorkflow, aWorkflow, WORKFLOW_LISTS, wctx, workflowName));
  out.raw.push(...rawOf(omit(bWorkflow, WORKFLOW_LISTS), omit(aWorkflow, WORKFLOW_LISTS), wctx));

  memberListProperties("allowedGroups", b.allowedGroups, a.allowedGroups, "allowedGroups", ctx, out);
  orderProperty("changeList.order.fields", sb.fieldChildren.get("") ?? [], sa.fieldChildren.get("") ?? [], "fields", out);
  orderProperty("changeList.order.dataSources", anchorsOf(sb.dataSources), anchorsOf(sa.dataSources), "dataSources", out);
  orderProperty("changeList.order.steps", anchorsOf(sb.steps), anchorsOf(sa.steps), "workflow.steps", out);

  // Every walk has recorded its unexpected shapes by now.
  for (const path of new Set([...sb.unexpected.keys(), ...sa.unexpected.keys()])) {
    const bv = sb.unexpected.get(path);
    const av = sa.unexpected.get(path);
    if (same(bv, av)) continue;
    const kind = kindOf(bv, av);
    out.properties.push({ name: path, nameMono: true, kind, before: json(bv), after: json(av) });
    out.raw.push({ path, kind, from: bv, to: av });
  }

  if (out.properties.length === 0) return [];
  return [row("process", "process", "changed", labelOf(a, sa), out, { entityKey: str(a.key) ?? str(b.key) })];
}

/** A body that is no object reads as one JSON property on the Process row. */
function rootRows(before: unknown, after: unknown, locale: string | undefined): ChangeRow[] {
  if (same(before, after)) return [];
  const named = isObj(after) ? after : isObj(before) ? before : undefined;
  const out: Out = {
    properties: [{ name: "(root)", nameMono: true, kind: kindOf(before, after), before: json(before), after: json(after) }],
    raw: diffJson(before, after),
  };
  return [row("process", "process", "changed", named ? labelOf(named, readSide(named, locale)) : "", out)];
}

/** A JSON copy: a draft object can carry `undefined`, which no JSON body holds. */
function toJson(value: unknown): unknown {
  const text = JSON.stringify(value);
  return text === undefined ? undefined : JSON.parse(text);
}

/**
 * The rows that separate `before` from `after`, in group order. `locale` is
 * the content locale a `LocalizedText` reads in; without it each side reads
 * its own base locale.
 *
 * Total over any JSON value. The editor's load guard checks only the top
 * level, so a shape the walker does not expect reads as JSON on the Process
 * row, and nothing throws.
 */
export function describeChanges(before: unknown, after: unknown, locale?: string): ChangeRow[] {
  const b = toJson(before);
  const a = toJson(after);
  if (!isObj(b) || !isObj(a)) return rootRows(b, a, locale);
  const sb = readSide(b, locale);
  const sa = readSide(a, locale);
  const rows = [
    ...fieldRows(sb, sa),
    ...dataSourceRows(sb, sa),
    ...stepRows(sb, sa),
    ...pathRows(sb, sa),
    ...formRows(sb, sa),
    ...contractRows(sb, sa),
  ];
  return [...processRows(sb, sa), ...rows];
}
