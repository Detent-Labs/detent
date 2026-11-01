import type { Draft } from "./types";
import type { DraftStep } from "./createStep";
import type { DraftField } from "./fields";
import { flattenDraftFields } from "./fields";
import { performedByFor, type PerformedBy } from "./performedBy";
import { timeLimitParts } from "./time-limit";
import { isDraftViewField, type DraftViewEntry } from "./view-layout";
import { tailAfterField, tokenize, type EditorIssue, type Token } from "./issues";
import { t, type CatalogKey } from "../catalog.js";
import { sectionByEntityId, sectionOfIssue, sectionOfOutputTarget } from "../panels/sectionIssues.js";
import { sectionLabel, sectionsFor, type SectionName } from "../panels/sectionsFor.js";
import { fill, stepText, stepTextMap } from "../panels/shared/optionText.js";

/**
 * Where a check's sentence sends the author. `json` is the JSON surface,
 * `fields`, `sources`, `settings` and `contract` are a tab or a view, `steps` is
 * the Steps tab with no step, `name` is the process's name in the header bar and
 * `page` is the step alone. A section's name is that section on the step's page.
 */
export type CheckPlace = "json" | "fields" | "sources" | "settings" | "contract" | "steps" | "name" | "page" | SectionName;

/** What the module reads of an issue. It never reads `source`, so a refused
 * publish, whose issues carry none, gets the same sentences. */
export type CheckSite = Pick<EditorIssue, "loc" | "message" | "entityType" | "entityId">;

export interface CheckAnswer {
  key: CatalogKey;
  /** 1 literal rule, 2 expression site, 3 property rule, 4 entity fallback. */
  tier: 1 | 2 | 3 | 4;
  /** `undefined` for a check with no place of its own. */
  place: CheckPlace | undefined;
  sentence: string;
}

/** What a rule picks. `section` names the section the sentence expects; `null`
 * says it expects one and the draft answers none. Either way a step whose kind
 * lacks the section falls to tier 4's step form. */
interface Aim {
  key: CatalogKey;
  place?: CheckPlace;
  section?: SectionName | null;
  value?: string;
}

/** One issue, read against the draft. */
interface Site extends CheckSite {
  body: Draft;
  subject: "step" | "field" | "source" | "contract" | "process";
  step?: DraftStep;
  /** The location's tokens after the step, or all of them outside a step. */
  rest: Token[];
  /** The key names of `rest`. */
  names: string[];
  /** The key names after the action the location passes through. */
  actionTail?: string[];
  /** The key names after the field the location names. */
  fieldTail: string[];
  field?: DraftField;
}

export interface LiteralRule {
  match: RegExp;
  aim: Aim | ((site: Site, match: RegExpExecArray) => Aim | undefined);
}

const inJson = (key: CatalogKey): Aim => ({ key, place: "json" });
const onPage = (key: CatalogKey): Aim => ({ key, place: "page" });
const onField = (key: CatalogKey): Aim => ({ key, place: "fields" });
const onSource = (key: CatalogKey): Aim => ({ key, place: "sources" });
const onContract = (key: CatalogKey, value?: string): Aim => ({ key, place: "contract", ...(value === undefined ? {} : { value }) });
const inSection = (key: CatalogKey, section: SectionName | null | undefined): Aim => ({ key, section: section ?? null });

const ACTION_LISTS = new Set(["onEntry", "onExit", "onCancel", "onPath", "onFire", "actions"]);
const VIEW_FLAGS = new Set(["visible", "required", "readonly"]);
/** Containers whose own keys are data: a column, a field id, a plugin's setting. */
const RECORDS = new Set(["columnMapping", "inputMapping", "outputMapping", "config", "output", "attributes"]);
/** The start of each message Zod's built-in checks print. */
const ZOD_BUILT_IN = /^(Invalid|Too (small|big)|Unrecognized)\b/;

function stepsOf(body: Draft): DraftStep[] {
  const steps = body.workflow?.steps;
  return Array.isArray(steps) ? steps : [];
}

function baseLocaleOf(body: Draft): string {
  return body.baseLocale ?? "en";
}

/** The step a non-step entity hangs off, for a location that names no step. */
function stepHolding(steps: readonly DraftStep[], { entityType, entityId }: CheckSite): DraftStep | undefined {
  if (entityType === "step") return steps.find((step) => step.id === entityId);
  if (entityType !== "path" && entityType !== "timer" && entityType !== "action") return undefined;
  return steps.find((step) => sectionByEntityId(step).has(entityId));
}

function allFields(body: Draft): DraftField[] {
  return Array.isArray(body.fields) ? flattenDraftFields(body.fields) : [];
}

function fieldAt(body: Draft, tokens: readonly Token[], entityId: string): DraftField | undefined {
  const all = allFields(body);
  const [first] = tokens;
  if (first?.key === "fields" && first.idx === undefined) return all.find((field) => field.id === tokens[1]?.key);
  if (first?.key !== "fields") return all.find((field) => field.id === entityId);
  let list = body.fields;
  let found: DraftField | undefined;
  for (const token of tokens) {
    if (token.key !== "fields" || token.idx === undefined) break;
    found = list?.[token.idx];
    list = found?.fields;
  }
  return found ?? all.find((field) => field.id === entityId);
}

function readSite(body: Draft, check: CheckSite): Site {
  const tokens = tokenize(check.loc);
  const steps = stepsOf(body);
  const anchor = tokens.findIndex((token) => token.key === "steps");
  const stepIndex = anchor === -1 ? undefined : tokens[anchor]!.idx;
  const located = stepIndex === undefined ? undefined : steps[stepIndex];
  const first = tokens[0];

  const base = { ...check, body, fieldTail: [] as string[] };
  const stepSite = (step: DraftStep, rest: Token[]): Site => {
    const names = rest.map((token) => token.key);
    const actionAt = rest.findIndex((token) => ACTION_LISTS.has(token.key) && token.idx !== undefined);
    return { ...base, subject: "step", step, rest, names, ...(actionAt === -1 ? {} : { actionTail: names.slice(actionAt + 1) }) };
  };
  const plainSite = (subject: Site["subject"]): Site => ({ ...base, subject, rest: tokens, names: tokens.map((token) => token.key) });
  const fieldSite = (): Site => {
    const field = fieldAt(body, tokens, check.entityId);
    return { ...plainSite("field"), fieldTail: tailAfterField(tokens), ...(field ? { field } : {}) };
  };

  if (located) return stepSite(located, tokens.slice(anchor + 1));
  if (first?.key === "fields" && (first.idx !== undefined || tokens.length > 1)) return fieldSite();
  if (first?.key === "dataSources" && first.idx !== undefined) return plainSite("source");
  if (first?.key === "contract") return plainSite("contract");

  const holding = stepHolding(steps, check);
  if (holding) return stepSite(holding, []);
  if (check.entityType === "field") return fieldSite();
  if (check.entityType === "dataSource") return plainSite("source");
  if (check.entityType === "contract") return plainSite("contract");
  return plainSite("process");
}

function kindOf(step: DraftStep): PerformedBy {
  return performedByFor(step.type, step.terminal);
}

/** The section that owns the action or the entity at this site, the same
 * answer the step page's header counts. */
function ownedSection(site: Site): SectionName | undefined {
  if (!site.step) return undefined;
  return sectionOfIssue(site.step, site, sectionsFor(kindOf(site.step)), sectionByEntityId(site.step));
}

function tokenIndex(site: Site, key: string): number | undefined {
  return site.rest.find((token) => token.key === key)?.idx;
}

/** The view entry a `view.fields[j]` location names. */
function viewEntry(site: Site): DraftViewEntry | undefined {
  if (site.names[0] !== "view") return undefined;
  const index = site.rest[1]?.key === "fields" ? site.rest[1].idx : undefined;
  return index === undefined ? undefined : site.step?.view?.fields?.[index];
}

function entryRef(site: Site): string | undefined {
  const entry = viewEntry(site);
  return entry !== undefined && isDraftViewField(entry) ? entry.ref : undefined;
}

/** A check that prints a view entry's field. A note has no field, so it reads
 * the form's general sentence. */
function onEntryField(site: Site, aim: Aim): Aim {
  return entryRef(site) === undefined ? inSection("checks.form.general", "form") : aim;
}

/** The `LocalizedText` a "missing baseLocale" message names. */
function textSite(site: Site): Aim | undefined {
  const [first, second, third] = site.names;
  switch (site.subject) {
    case "process":
      if (first === "label") return { key: "issues.processNeedsName", place: "name" };
      if (first === "description") return inJson("checks.process.description");
      return undefined;
    case "step":
      if (first === "label") return onPage("checks.step.name");
      if (first === "description") return onPage("checks.step.description");
      if (first === "view" && second === "tabs" && third === "label") return inSection("checks.form.tabName", "form");
      if (first === "view" && second === "fields" && third === "text") return inSection("checks.form.noteText", "form");
      return undefined;
    case "field": {
      const [head] = site.fieldTail;
      if (head === "label") return onField("checks.field.name");
      if (head === "description") return onField("checks.field.description");
      if (head === "options" && site.fieldTail.includes("label")) return onField("checks.field.choiceName");
      return undefined;
    }
    default:
      return undefined;
  }
}

/** Tier 2: the location names a CEL site. A parser's text varies, so the site decides. */
function expressionSite(site: Site): Aim | undefined {
  if (site.subject === "field") {
    const [head, next] = site.fieldTail;
    if (head === "default") return onField("checks.field.default");
    if (head === "validation" && next === "rule") return onField("checks.field.rule");
    return undefined;
  }
  if (site.subject !== "step") return undefined;

  if (site.actionTail) {
    const [head, next] = site.actionTail;
    if (head === "output") return inSection("checks.action.output", ownedSection(site));
    if (head === "config" && next === "inputMapping") return inSection("checks.action.mapping", ownedSection(site));
    return undefined;
  }

  const [first, second, third, fourth] = site.names;
  if (first === "paths" && second === "guard") return inSection("checks.way.guard", "paths");
  if (first === "timers" && second === "deadline") return inSection("checks.timer.deadline", "timers");
  if (first === "subprocess" && (second === "inputMapping" || second === "outputMapping")) return inSection("checks.call.mapping", "subprocess");
  if (first === "view" && second === "fields" && third !== undefined) {
    if (VIEW_FLAGS.has(third)) return onEntryField(site, inSection("checks.form.flag", "form"));
    if (third === "validation" && fourth === "rule") return onEntryField(site, inJson("checks.form.rule"));
  }
  return undefined;
}

function endingAim(site: Site, key: CatalogKey, named?: string): Aim {
  if ((site.body.contract?.outcomes ?? []).length === 0) return onContract("checks.end.noEndings");
  const outcome = typeof site.step?.outcome === "string" ? site.step.outcome : named;
  return { ...inSection(key, "howItEnds"), ...(outcome === undefined ? {} : { value: outcome }) };
}

function pluginTypeAim(site: Site): Aim | undefined {
  if (site.subject === "source") return onSource("checks.source.unknownType");
  if (site.subject === "field") return onField("checks.field.kind");
  if (site.actionTail) return inSection("checks.action.unknownType", ownedSection(site));
  if (site.names[0] === "assignment") return inSection("checks.assignment.unknownType", "assignment");
  return undefined;
}

function durationAim(site: Site): Aim {
  return !site.actionTail && site.names[0] === "timers" ? inSection("checks.timer.duration", "timers") : inJson("checks.action.duration");
}

function tooLongAim(site: Site): Aim {
  const index = tokenIndex(site, "timers");
  const timer = index === undefined ? undefined : site.step?.timers?.[index];
  const parts = typeof timer?.duration === "string" ? timeLimitParts(timer.duration) : undefined;
  return inSection(parts === undefined ? "checks.timer.duration" : "checks.timer.tooLong", "timers");
}

function patternAim(site: Site): Aim {
  return site.subject === "field" ? onField("checks.field.pattern") : inJson("checks.form.pattern");
}

function viewGroupAim(site: Site): Aim {
  return entryRef(site) === undefined ? inSection("checks.form.noteGroup", "form") : inJson("checks.form.group");
}

/**
 * Tier 1: the engine's literal messages. A scan in
 * `packages/web/test/studio-checkSentence.test.ts` fails a literal in
 * `definition.ts`, `compile.ts` or `registry-check.ts` that meets no rule here.
 * Each sentence's rule also carries its place, since a location does not separate
 * the sentences: "duplicate field ids" and "duplicate field keys" both sit at
 * `fields`.
 */
const LITERAL_RULES: readonly LiteralRule[] = [
  // src/schema/definition.ts
  { match: /^options and dataSource are mutually exclusive$/, aim: inJson("checks.field.optionsAndSource") },
  { match: /^exactly one of duration or deadline$/, aim: inSection("checks.timer.durationOrDeadline", "timers") },
  { match: /^validationMode requires validation$/, aim: inJson("checks.form.validation") },
  { match: /^validation must declare at least one key$/, aim: inJson("checks.form.validation") },
  { match: /^duplicate tab key: .*$/, aim: inJson("checks.form.tabDuplicate") },
  { match: /^tab is set, but this view declares no tabs$/, aim: inJson("checks.form.tabsDeclared") },
  { match: /^an entry inside a group must not declare tab$/, aim: inJson("checks.form.tabsDeclared") },
  { match: /^tab does not name a declared tab: .*$/, aim: inSection("checks.form.tabs", "form") },
  { match: /^entry outside a group must declare tab once the view declares tabs$/, aim: inSection("checks.form.tabs", "form") },
  { match: /^pinnedVersion is present iff versionBinding is 'pinned'$/, aim: inSection("checks.call.version", "subprocess") },
  { match: /^contractRef is required for latest-at-spawn$/, aim: inSection("checks.call.version", "subprocess") },
  { match: /^outcome may only be set on a terminal step$/, aim: onPage("checks.step.outcomeNotEnd") },
  { match: /^a terminal step has no outgoing paths$/, aim: onPage("checks.step.endHasWayOut") },
  { match: /^a non-terminal step needs at least one outgoing path$/, aim: inSection("checks.step.noWayOut", "paths") },
  { match: /^a subprocess step needs a subprocess spec$/, aim: inSection("checks.step.noProcess", "subprocess") },
  { match: /^only a subprocess step may declare a subprocess spec$/, aim: onPage("checks.step.strayCall") },
  { match: /^a subprocess step is a wait-state: its paths must be all-automatic$/, aim: inSection("checks.step.callNeedsAutomatic", "paths") },
  { match: /^a step's paths must be all-manual or all-automatic, not mixed$/, aim: inSection("checks.paths.mixed", "paths") },
  { match: /^automatic paths need a priority when a step has two or more$/, aim: inSection("checks.paths.noOrder", "paths") },
  { match: /^automatic path priorities must be unique$/, aim: inSection("checks.paths.sameOrder", "paths") },
  { match: /^at most one default \(guardless\) automatic path per step$/, aim: inSection("checks.paths.twoDefaults", "paths") },
  { match: /^the default \(guardless\) automatic path must have the highest priority$/, aim: inSection("checks.paths.defaultNotLast", "paths") },
  { match: /^missing baseLocale \('.*'\) entry$/, aim: textSite },
  {
    match: /^two actions on one transition write the same output field: .*$/,
    aim: (site) => (site.names[0] === "paths" ? { key: "checks.action.sameOutputOnWay", place: "paths" } : inSection("checks.action.sameOutput", site.step?.terminal === true ? null : "lifecycle")),
  },
  { match: /^initialStep does not resolve: .*$/, aim: { key: "checks.process.firstStep", place: "steps" } },
  { match: /^duplicate (step|field|path|timer|action|data source) ids$/, aim: inJson("checks.process.duplicateId") },
  { match: /^duplicate field keys$/, aim: { key: "checks.process.duplicateFieldKey", place: "fields" } },
  { match: /^duplicate data source keys$/, aim: { key: "checks.process.duplicateSourceKey", place: "sources" } },
  { match: /^data source key '.*' collides with a reserved CEL namespace$/, aim: onSource("checks.source.reservedName") },
  { match: /^field dataSource does not resolve: .*$/, aim: onField("checks.field.sourceGone") },
  { match: /^path target does not resolve: (.*)$/, aim: (_site, match) => inSection(match[1] === "" ? "checks.way.noTarget" : "checks.way.targetGone", "paths") },
  { match: /^view ref does not resolve: .*$/, aim: inSection("checks.form.fieldGone", "form") },
  { match: /^timer targetPath is not an outgoing path of this step: .*$/, aim: inSection("checks.timer.wayGone", "timers") },
  {
    match: /^action output targets unknown field: .*$/,
    aim: (site) => inSection("checks.action.fieldGone", site.step && sectionOfOutputTarget(site.step, site.message)),
  },
  { match: /^contracted process: terminal step '.*' needs an outcome$/, aim: (site) => endingAim(site, "checks.end.noOutcome") },
  { match: /^terminal outcome '(.*)' is not in contract\.outcomes$/, aim: (site, match) => endingAim(site, "checks.end.unknownOutcome", match[1]) },
  { match: /^declared outcome '(.*)' has no terminal step$/, aim: (_site, match) => onContract("checks.contract.unusedOutcome", match[1]) },
  { match: /^reserved cancel-sink step id may not be authored$/, aim: inJson("checks.step.reservedId") },
  { match: /^reserved cancel-sink step key may not be authored$/, aim: inSection("checks.step.reservedKey", "more") },
  {
    match: /^outcome '(.*)' is reserved for cancellation$/,
    aim: (site, match) => (site.subject === "contract" ? onContract("checks.contract.reservedOutcome", match[1]) : inSection("checks.end.reservedOutcome", "howItEnds")),
  },
  { match: /^a published body has exactly one cancel-sink \(found .*\)$/, aim: inJson("checks.process.cancelSink") },

  // src/schema/compile.ts
  { match: /^unsupported ISO 8601 duration \(W\/D\/H\/M\/S only, no calendar units, at least one component\)$/, aim: durationAim },
  { match: /^timer duration exceeds the .* ms bound \(a fireAt past it leaves the four-digit-year range\)$/, aim: tooLongAim },
  { match: /^duration exceeds the .*-character bound$/, aim: durationAim },
  { match: /^action type uses the reserved '.*' prefix$/, aim: (site) => inSection("checks.action.reservedType", ownedSection(site)) },
  { match: /^unknown key '.*'$/, aim: inJson("checks.process.unknownEntry") },
  { match: /^pattern exceeds the .*-character bound$/, aim: patternAim },
  { match: /^pattern does not compile as a JavaScript RegExp$/, aim: patternAim },
  { match: /^outputMapping key does not resolve to a field in this process: .*$/, aim: inSection("checks.call.outputGone", "subprocess") },
  { match: /^contract\.(inputFields|outputFields) entry does not resolve to a field: .*$/, aim: inJson("checks.contract.fieldGone") },
  { match: /^step '.*' references group '.*' via org\.group-members, but it is not in allowedGroups$/, aim: inJson("checks.assignment.group") },
  { match: /^step '.*' references field '.*' via org\.actor-from-field, but it does not declare format: "person"$/, aim: inSection("checks.assignment.personField", "assignment") },
  {
    match: /^columnMapping needs a dataSource: an inline options array declares no columns$/,
    aim: (site) => (Array.isArray(site.field?.options) ? inJson("checks.field.columnOnChoices") : onField("checks.field.columnSource")),
  },
  { match: /^columnMapping needs a string field: a list picks several rows for one target$/, aim: onField("checks.field.columnNotString") },
  { match: /^columnMapping key must match \/\^\[a-z_\]\[a-z0-9_\]\*\$\/$/, aim: onField("checks.field.columnMapping") },
  { match: /^columnMapping key exceeds the .*-character bound$/, aim: onField("checks.field.columnMapping") },
  { match: /^columnMapping target does not resolve to a field in this process: .*$/, aim: onField("checks.field.columnMapping") },
  { match: /^columnMapping target is a group field, which takes no value$/, aim: onField("checks.field.columnMapping") },
  { match: /^columnMapping target is the mapping field itself$/, aim: onField("checks.field.columnMapping") },
  { match: /^columnMapping targets one field twice: '.*' and '.*' both write .*$/, aim: onField("checks.field.columnMapping") },
  { match: /^field key must match \/\^\[a-z_\]\[a-z0-9_\]\*\$\/ to be a valid CEL identifier$/, aim: onField("checks.field.key") },
  { match: /^key exceeds the .*-character bound$/, aim: onField("checks.field.key") },
  { match: /^expression source exceeds the .*-character bound$/, aim: expressionSite },
  { match: /^field type '.*' does not allow (format|control) '.*'$/, aim: onField("checks.field.kind") },
  { match: /^default value does not match format '.*'$/, aim: onField("checks.field.default") },
  { match: /^type exceeds the .*-character bound$/, aim: pluginTypeAim },
  { match: /^a group field must not declare (technical|redactable): true$/, aim: inJson("checks.field.groupFlag") },
  { match: /^a technical field's view entry must not declare (required|readonly)$/, aim: inJson("checks.form.technicalFlag") },
  { match: /^a view entry's group must name a group field's key$/, aim: viewGroupAim },
  { match: /^a view entry's group names a group field this view does not carry$/, aim: viewGroupAim },
  { match: /^a view entry's group must be empty; the catalog holds this field at the top level$/, aim: viewGroupAim },
  { match: /^a view entry's group must name this field's catalog parent, ".*"$/, aim: viewGroupAim },
  { match: /^field '.*' is required and readonly here, and no source in the body writes it: every submission will fail$/, aim: inSection("checks.form.unwritable", "form") },
  { match: /^the cancel-sink differs from the one publish injects; remove it and let publish inject it$/, aim: inJson("checks.process.cancelSink") },

  // src/engine/registry-check.ts
  { match: /^action type '.*' is not registered$/, aim: (site) => inSection("checks.action.unknownType", ownedSection(site)) },
  { match: /^assignment strategy type '.*' is not registered$/, aim: inSection("checks.assignment.unknownType", "assignment") },
  { match: /^data source type '.*' is not registered$/, aim: onSource("checks.source.unknownType") },

  // src/cel/check.ts: a field-membership check, not a parser's text.
  { match: /^maps into field '.*', not declared on process '.*'$/, aim: (site) => inSection("checks.action.chainField", ownedSection(site)) },

  // draft/view-flags.ts
  { match: /^Field ".*" is required but hidden \(visible: false\), so its requirement is never enforced\.$/, aim: inSection("checks.form.hiddenRequired", "form") },
  { match: /^Field ".*" is required and read-only here, and nothing writes it: every submission will fail\.$/, aim: inSection("checks.form.unwritable", "form") },
  { match: /^Field ".*" is technical, and no structural source writes it: it can never hold a value\.$/, aim: onField("checks.field.technicalUnwritten") },
];

/** The literal rule a message meets, if any. */
export function literalRuleFor(message: string): LiteralRule | undefined {
  return LITERAL_RULES.find((rule) => rule.match.test(message));
}

function stepPropertyRule(site: Site): Aim | undefined {
  if (site.actionTail) {
    const [head, next] = site.actionTail;
    if (head === "type") return inSection("checks.action.unknownType", ownedSection(site));
    if (head === "timeout" || (head === "retry" && next === "baseDelay")) return inJson("checks.action.duration");
    return inSection("checks.action.general", ownedSection(site));
  }

  const [first, second] = site.names;
  switch (first) {
    case "key":
      return inSection("checks.step.key", "more");
    case "type":
      return onPage("checks.step.kind");
    case "outcome":
      return inSection("checks.end.noOutcome", "howItEnds");
    case "assignment":
      return inSection(site.names.includes("type") ? "checks.assignment.unknownType" : "checks.assignment.general", "assignment");
    case "subprocess":
      if (second === "processId") return inSection("checks.step.noProcess", "subprocess");
      if (second === "versionBinding" || second === "pinnedVersion" || second === "contractRef") return inSection("checks.call.version", "subprocess");
      return inSection("checks.call.general", "subprocess");
    case "view":
      return inSection("checks.form.general", "form");
    case "paths":
      if (site.rest[0]?.idx === undefined) return undefined;
      if (second === "label") return inSection("checks.way.name", "paths");
      if (second === "key") return inSection("checks.way.key", "paths");
      if (second === "to") return inSection("checks.way.noTarget", "paths");
      if (second === "trigger") return inSection("checks.way.trigger", "paths");
      if (second === "priority") return inSection("checks.paths.noOrder", "paths");
      return undefined;
    case "timers":
      if (site.rest[0]?.idx === undefined) return undefined;
      if (second === "duration") return inSection("checks.timer.duration", "timers");
      if (second === "onFire" && site.names[2] === "targetPath") return inSection("checks.timer.wayGone", "timers");
      return inSection("checks.timer.general", "timers");
    default:
      return undefined;
  }
}

function fieldPropertyRule(site: Site): Aim | undefined {
  const [head, next] = site.fieldTail;
  switch (head) {
    case "key":
      return onField("checks.field.key");
    case "type":
    case "format":
    case "control":
      return onField("checks.field.kind");
    case "dataSource":
      return onField("checks.field.sourceGone");
    case "validation":
      return onField(next === "pattern" ? "checks.field.pattern" : "checks.field.rule");
    case "columnMapping":
      return onField("checks.field.columnMapping");
    default:
      return undefined;
  }
}

function processPropertyRule(site: Site): Aim | undefined {
  const [first, second] = site.names;
  if (first === "key") return { key: "checks.process.key", place: "settings" };
  if (first === "baseLocale") return { key: "checks.process.baseLocale", place: "settings" };
  if (first === "workflow" && second === "initialStep") return { key: "checks.process.firstStep", place: "steps" };
  return undefined;
}

/** Tier 3: the location's entity and property pick a sentence. Three answers hold
 * for any message: a malformed id, a plugin's own config schema, and the process's
 * name, whose message `runValidation` has already swapped. The rest serve Zod's
 * built-in messages, so a message no rule knows reaches tier 4. */
function propertyRule(site: Site): Aim | undefined {
  const last = site.names.at(-1);
  if (site.names.includes("config")) {
    if (site.subject === "source") return onSource("checks.source.config");
    if (site.actionTail) return inSection("checks.action.config", ownedSection(site));
    if (site.names[0] === "assignment") return inSection("checks.assignment.config", "assignment");
  }
  if (last === "id" && !site.names.some((name) => RECORDS.has(name))) return inJson("checks.process.badId");
  if (site.subject === "process" && site.names[0] === "label") return textSite(site);
  if (!ZOD_BUILT_IN.test(site.message)) return undefined;

  const text = textSite(site);
  if (text) return text;
  switch (site.subject) {
    case "step":
      return stepPropertyRule(site);
    case "field":
      return fieldPropertyRule(site);
    case "source":
      if (site.names[1] === "key") return onSource("checks.source.key");
      if (site.names[1] === "type") return onSource("checks.source.unknownType");
      return undefined;
    case "contract":
      if (site.names[1] === "inputFields" || site.names[1] === "outputFields") return inJson("checks.contract.fieldGone");
      return onContract("checks.contract.general");
    case "process":
      return processPropertyRule(site);
  }
}

/** Tier 4: one sentence per entity, naming the step and the section where it can.
 * The caller passes `sectionLost` for a step whose kind lacks the rule's section,
 * so the step form prints no section. */
function fallback(site: Site, sectionLost = false): CheckAnswer {
  switch (site.subject) {
    case "step": {
      const section = sectionLost ? undefined : ownedSection(site);
      return section === undefined ? settle(site, onPage("checks.fallback.step"), 4) : settle(site, inSection("checks.fallback.section", section), 4);
    }
    case "field":
      return settle(site, onField("checks.fallback.field"), 4);
    case "source":
      return settle(site, onSource("checks.fallback.source"), 4);
    case "contract":
      return settle(site, onContract("checks.fallback.contract"), 4);
    case "process":
      return settle(site, { key: "checks.fallback.process" }, 4);
  }
}

/** Each draft's step slots. A mutation clones the draft (`store.tsx`), so one
 * draft's map stays true, and a pass over many issues builds it once. */
const STEP_SLOTS = new WeakMap<Draft, Map<DraftStep, string>>();

/** The text each step prints in a sentence: `stepTextMap`'s, except that an
 * unnamed step reads its rail number, whether or not another step is unnamed. */
function stepSlots(body: Draft): Map<DraftStep, string> {
  const cached = STEP_SLOTS.get(body);
  if (cached) return cached;
  const base = baseLocaleOf(body);
  const steps = stepsOf(body);
  // A label's entry is any JSON value until Zod has run over it.
  const readable = steps.map((s) => (typeof s.label?.[base] === "string" ? s : { ...s, label: {} }));
  const texts = stepTextMap(readable, base, base);
  const unnamed = t("steps.unnamedStep");
  const slots = new Map<DraftStep, string>();
  steps.forEach((step, i) => {
    const plain = stepText(readable[i]!, base, base);
    if (plain === unnamed) slots.set(step, fill(t("stepPage.stepNumber"), { number: String(i + 1) }));
    else slots.set(step, (step.id === undefined ? undefined : texts.get(step.id)) ?? plain);
  });
  STEP_SLOTS.set(body, slots);
  return slots;
}

function stepSlot(body: Draft, step: DraftStep): string {
  return stepSlots(body).get(step) ?? t("steps.unnamedStep");
}

function wayLabel(site: Site): string {
  const index = tokenIndex(site, "paths");
  const label = index === undefined ? undefined : site.step?.paths?.[index]?.label;
  return typeof label === "string" && label.trim() ? label : t("paths.unnamedPath");
}

function fieldLabel(site: Site): string {
  const ref = entryRef(site);
  const field = ref === undefined ? site.field : allFields(site.body).find((f) => f.id === ref);
  const label = field?.label?.[baseLocaleOf(site.body)];
  return typeof label === "string" && label.trim() ? label : t("panelsScreen.unnamedField");
}

function sourceName(site: Site): string {
  const index = site.rest[0]?.key === "dataSources" ? site.rest[0].idx : undefined;
  const sources = site.body.dataSources;
  const source = index === undefined ? sources?.find((s) => s.id === site.entityId) : sources?.[index];
  return typeof source?.key === "string" && source.key.trim() ? source.key : t("panelsScreen.unnamedDataSource");
}

function settle(site: Site, aim: Aim, tier: CheckAnswer["tier"]): CheckAnswer {
  const { step } = site;
  const section = aim.section;
  if (section !== undefined && (section === null || !step || !sectionsFor(kindOf(step)).includes(section))) return fallback(site, true);

  const text = t(aim.key);
  if (!step && text.includes("{step}")) return fallback(site);

  // A slot reads the draft only where the template holds it.
  const slots: Record<string, string> = {};
  const slot = (name: string, read: () => string) => {
    if (text.includes(`{${name}}`)) slots[name] = read();
  };
  if (step) slot("step", () => stepSlot(site.body, step));
  if (section && step) slot("section", () => t(sectionLabel(section, kindOf(step))));
  slot("way", () => wayLabel(site));
  slot("field", () => fieldLabel(site));
  slot("source", () => sourceName(site));
  slot("value", () => aim.value ?? "");

  return { key: aim.key, tier, place: aim.place ?? section ?? undefined, sentence: fill(text, slots) };
}

/** The four tiers, stopping at the first answer. */
export function checkAnswer(body: Draft, check: CheckSite): CheckAnswer {
  const site = readSite(body, check);

  const rule = literalRuleFor(check.message);
  if (rule) {
    const match = rule.match.exec(check.message)!;
    const aim = typeof rule.aim === "function" ? rule.aim(site, match) : rule.aim;
    if (aim) return settle(site, aim, 1);
  }

  const expression = expressionSite(site);
  if (expression) return settle(site, expression, 2);

  const property = propertyRule(site);
  if (property) return settle(site, property, 3);

  return fallback(site);
}

/** One sentence for a person. Names read the base locale. */
export function checkSentence(body: Draft, check: CheckSite): string {
  return checkAnswer(body, check).sentence;
}

/** The step a check stands on, by its location, else by the entity it names. */
export function checkStep(body: Draft, check: CheckSite): DraftStep | undefined {
  return readSite(body, check).step;
}

/** Where the sentence sends the author, so a sentence and its landing agree. */
export function checkPlace(body: Draft, check: CheckSite): CheckPlace | undefined {
  return checkAnswer(body, check).place;
}
