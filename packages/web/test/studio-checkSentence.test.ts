import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSync } from "vite";
import { en } from "../src/i18n/catalogs/studio.js";
import { t, type CatalogKey } from "../src/areas/studio/catalog.js";
import { checkAnswer, checkPlace, checkSentence, literalRuleFor, type CheckPlace } from "../src/areas/studio/draft/checkSentence.js";
import { issueText, resolveLoc } from "../src/areas/studio/draft/issues.js";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import { checkUnwrittenTechnicalFields, checkViewFlags } from "../src/areas/studio/draft/view-flags.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { PerformedBy } from "../src/areas/studio/draft/performedBy.js";
import { sectionOfOutputTarget } from "../src/areas/studio/panels/sectionIssues.js";
import { sectionLabel, sectionsFor, type SectionName } from "../src/areas/studio/panels/sectionsFor.js";

const GRAMMAR = "unsupported ISO 8601 duration (W/D/H/M/S only, no calendar units, at least one component)";
const OUT_OF_RANGE = "timer duration exceeds the 1000 ms bound (a fireAt past it leaves the four-digit-year range)";
const MISSING = "missing baseLocale ('en') entry";
const BAD_STRING = "Invalid input: expected string, received object";
const TOO_SMALL = "Too small: expected string to have >=1 characters";
const BAD_OPTION = 'Invalid option: expected one of "manual"|"automatic"';

const KINDS: readonly PerformedBy[] = ["participant", "subprocess", "terminal"];
const STEP_NAMES = ["Review", "Credit check", "Done"];

/** One step of each kind, all with the same parts, so a location reads alike on each. */
function makeStep(index: number): Record<string, unknown> {
  const kind = KINDS[index]!;
  return {
    id: `step_${index}`,
    key: `s${index}`,
    label: { en: STEP_NAMES[index] },
    type: kind === "subprocess" ? "subprocess" : "task",
    ...(kind === "terminal" ? { terminal: true } : {}),
    assignment: { strategy: { type: "org.any", config: {} } },
    view: {
      tabs: [{ key: "t", label: { en: "Tab" } }],
      fields: [{ ref: "field_amount" }, { kind: "note", text: { en: "Read" } }, { ref: "field_gone" }],
    },
    subprocess: { processId: "proc_x", versionBinding: "pinned", pinnedVersion: 1, inputMapping: {}, outputMapping: {} },
    paths: [{ id: `path_${index}`, key: `way${index}`, label: "Approve", to: "step_0", trigger: "manual", onPath: [{ id: `action_p${index}`, type: "x" }] }],
    timers: [
      { id: `timer_${index}`, duration: "P1D", onFire: { actions: [{ id: `action_t${index}`, type: "x" }] } },
      { id: `timer_b${index}`, duration: "P1DT4H30M", onFire: {} },
    ],
    onEntry: [{ id: `action_e${index}`, type: "x" }],
    onExit: [{ id: `action_x${index}`, type: "x" }],
    onCancel: [{ id: `action_c${index}`, type: "x" }],
  };
}

function makeDraft(over: Record<string, unknown> = {}): Draft {
  return {
    key: "invoice",
    label: { en: "Invoice" },
    baseLocale: "en",
    contract: { outcomes: ["approved"] },
    fields: [
      { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "string" },
      { id: "field_choice", key: "choice", label: { en: "Choice" }, type: "string", options: [{ value: "a", label: { en: "A" } }] },
      { id: "field_group", key: "group_key", label: { en: "Group" }, type: "group", fields: [{ id: "field_inner", key: "inner", label: { en: "Inner" }, type: "string" }] },
    ],
    dataSources: [{ id: "ds_list", key: "customers", type: "db.list", config: {} }],
    workflow: { initialStep: "step_0", steps: [makeStep(0), makeStep(1), makeStep(2)] },
    ...over,
  } as unknown as Draft;
}

const answerFor = (body: Draft, loc: string, message: string) => checkAnswer(body, { ...resolveLoc(body, loc), loc, message });
const sentenceFor = (body: Draft, loc: string, message: string) => answerFor(body, loc, message).sentence;

/** A sentence holds none of these. "key" and "pattern" stay: both are the author's words. */
const ENGINE_WORDS =
  /invalid input|invalid option|too small|baseLocale|\bzod\b|\bcel\b|regexp|\bguard\b|\btrigger\b|\bpriority\b|onEntry|onExit|onCancel|onPath|\bterminal\b|\boutcome\b|dataSource|columnMapping|inputMapping|outputMapping|allowedGroups|cancel-sink|versionBinding|contractRef|pinnedVersion|\bstep_|\bpath_|\bfield_|\bds_|\baction_|\btimer_/i;

interface Row {
  key: CatalogKey;
  /** "S" stands for `workflow.steps[<on>]`. */
  loc: string;
  message: string;
  /** Which step of `KINDS`, the participant step unless a row says. */
  on?: number;
  section?: SectionName;
  place?: CheckPlace;
  /** Text the sentence must hold besides the step and the section. */
  holds?: string;
  draft?: Draft;
}

const NO_ENDINGS = makeDraft({ contract: { outcomes: [] } });

const ROWS: readonly Row[] = [
  { key: "checks.process.firstStep", loc: "workflow.initialStep", message: "initialStep does not resolve: step_x", place: "steps" },
  { key: "checks.process.description", loc: "description", message: MISSING, place: "json" },
  { key: "checks.process.key", loc: "key", message: "Invalid input: expected string, received undefined", place: "settings" },
  { key: "checks.process.baseLocale", loc: "baseLocale", message: "Invalid string: must match pattern /^[a-z]{2}/", place: "settings" },
  { key: "checks.process.duplicateId", loc: "workflow.steps", message: "duplicate step ids", place: "json" },
  { key: "checks.process.badId", loc: "S.paths[0].id", message: "Invalid string: must match pattern /^path_/", place: "json" },
  { key: "checks.process.duplicateFieldKey", loc: "fields", message: "duplicate field keys", place: "fields" },
  { key: "checks.process.duplicateSourceKey", loc: "dataSources", message: "duplicate data source keys", place: "sources" },
  { key: "checks.process.cancelSink", loc: "steps[0]", message: "the cancel-sink differs from the one publish injects; remove it and let publish inject it", place: "json" },
  { key: "checks.process.unknownEntry", loc: "steps[0].zzz", message: "unknown key 'zzz'", place: "json" },

  { key: "checks.step.name", loc: "S.label", message: MISSING, place: "page" },
  { key: "checks.step.description", loc: "S.description", message: MISSING, place: "page" },
  { key: "checks.step.key", loc: "S.key", message: TOO_SMALL, section: "more", place: "more" },
  { key: "checks.step.kind", loc: "S.type", message: BAD_OPTION, place: "page" },
  { key: "checks.step.noWayOut", loc: "S.paths", message: "a non-terminal step needs at least one outgoing path", section: "paths" },
  { key: "checks.step.endHasWayOut", loc: "S.paths", message: "a terminal step has no outgoing paths", on: 2, place: "page" },
  { key: "checks.step.outcomeNotEnd", loc: "S.outcome", message: "outcome may only be set on a terminal step", place: "page" },
  { key: "checks.step.noProcess", loc: "S.subprocess", message: "a subprocess step needs a subprocess spec", on: 1, section: "subprocess" },
  { key: "checks.step.strayCall", loc: "S.subprocess", message: "only a subprocess step may declare a subprocess spec", place: "page" },
  { key: "checks.step.callNeedsAutomatic", loc: "S.paths", message: "a subprocess step is a wait-state: its paths must be all-automatic", on: 1, section: "paths" },
  { key: "checks.step.reservedKey", loc: "S.key", message: "reserved cancel-sink step key may not be authored", section: "more", place: "more" },
  { key: "checks.step.reservedId", loc: "S.id", message: "reserved cancel-sink step id may not be authored", place: "json" },

  { key: "checks.paths.mixed", loc: "S.paths", message: "a step's paths must be all-manual or all-automatic, not mixed", section: "paths" },
  { key: "checks.paths.noOrder", loc: "S.paths", message: "automatic paths need a priority when a step has two or more", section: "paths" },
  { key: "checks.paths.sameOrder", loc: "S.paths", message: "automatic path priorities must be unique", section: "paths" },
  { key: "checks.paths.twoDefaults", loc: "S.paths", message: "at most one default (guardless) automatic path per step", section: "paths" },
  { key: "checks.paths.defaultNotLast", loc: "S.paths", message: "the default (guardless) automatic path must have the highest priority", section: "paths" },

  { key: "checks.way.name", loc: "S.paths[0].label", message: BAD_STRING, section: "paths" },
  { key: "checks.way.key", loc: "S.paths[0].key", message: TOO_SMALL, section: "paths", holds: "Approve" },
  { key: "checks.way.noTarget", loc: "S.paths[0].to", message: "Invalid string: must match pattern /^step_/", section: "paths", holds: "Approve" },
  { key: "checks.way.targetGone", loc: "S.paths[0].to", message: "path target does not resolve: step_gone", section: "paths", holds: "Approve" },
  { key: "checks.way.trigger", loc: "S.paths[0].trigger", message: BAD_OPTION, section: "paths", holds: "Approve" },
  { key: "checks.way.guard", loc: "S.paths[0].guard", message: "Unexpected token at 3", section: "paths", holds: "Approve" },

  { key: "checks.timer.durationOrDeadline", loc: "S.timers[0].duration", message: "exactly one of duration or deadline", section: "timers" },
  { key: "checks.timer.duration", loc: "steps[0].timers[0].duration", message: GRAMMAR, section: "timers" },
  { key: "checks.timer.tooLong", loc: "steps[0].timers[0].duration", message: OUT_OF_RANGE, section: "timers" },
  { key: "checks.timer.deadline", loc: "steps[0].timers[0].deadline", message: "expected string, got int", section: "timers" },
  { key: "checks.timer.wayGone", loc: "S.timers[0]", message: "timer targetPath is not an outgoing path of this step: path_gone", section: "timers" },
  { key: "checks.timer.general", loc: "S.timers[0].onFire", message: "Invalid input: expected object, received undefined", section: "timers" },

  { key: "checks.action.unknownType", loc: "steps[0].onEntry[0]", message: "action type 'x' is not registered", section: "lifecycle" },
  { key: "checks.action.reservedType", loc: "steps[0].onEntry[0].type", message: "action type uses the reserved 'core.' prefix", section: "lifecycle" },
  { key: "checks.action.config", loc: "steps[0].onEntry[0].config.to", message: "Plugin says no", section: "lifecycle" },
  { key: "checks.action.duration", loc: "steps[0].onEntry[0].timeout", message: GRAMMAR, place: "json" },
  { key: "checks.action.sameOutput", loc: "S.onCancel", message: "two actions on one transition write the same output field: field_amount", section: "lifecycle" },
  { key: "checks.action.sameOutputOnWay", loc: "S.paths[0]", message: "two actions on one transition write the same output field: field_amount", place: "paths", holds: "Approve" },
  {
    key: "checks.action.fieldGone",
    loc: "S",
    message: "action output targets unknown field: field_gone",
    section: "lifecycle",
    draft: makeDraft({ workflow: { initialStep: "step_0", steps: [{ ...makeStep(0), onExit: [{ id: "action_o", type: "x", output: { field_gone: { lang: "cel", src: "1" } } }] }] } }),
  },
  { key: "checks.action.output", loc: "steps[0].onEntry.actions[0].output.field_amount", message: "no such key", section: "lifecycle" },
  { key: "checks.action.mapping", loc: "steps[0].onEntry[0].config.inputMapping.field_amount", message: "no such key", section: "lifecycle" },
  { key: "checks.action.chainField", loc: "steps[0].onEntry[0].config.inputMapping.x", message: "maps into field 'x', not declared on process 'proc_y'", section: "lifecycle" },
  { key: "checks.action.general", loc: "S.onEntry[0].retry.maxAttempts", message: "Too big: expected number to be <=20", section: "lifecycle" },

  { key: "checks.assignment.unknownType", loc: "steps[0].assignment", message: "assignment strategy type 'x' is not registered", section: "assignment" },
  { key: "checks.assignment.config", loc: "steps[0].assignment.config.groupId", message: "Plugin says no", section: "assignment" },
  { key: "checks.assignment.group", loc: "S.assignment.strategy.config.groupId", message: "step 's0' references group 'g' via org.group-members, but it is not in allowedGroups", place: "json" },
  { key: "checks.assignment.personField", loc: "S.assignment.strategy.config.fieldId", message: "step 's0' references field 'f' via org.actor-from-field, but it does not declare format: \"person\"", section: "assignment" },
  { key: "checks.assignment.general", loc: "S.assignment.strategy", message: "Invalid input: expected object, received undefined", section: "assignment" },

  { key: "checks.call.version", loc: "S.subprocess.pinnedVersion", message: "pinnedVersion is present iff versionBinding is 'pinned'", on: 1, section: "subprocess" },
  { key: "checks.call.outputGone", loc: "steps[1].subprocess.outputMapping", message: "outputMapping key does not resolve to a field in this process: field_x", on: 1, section: "subprocess" },
  { key: "checks.call.mapping", loc: "steps[1].subprocess.inputMapping.field_x", message: "no such key", on: 1, section: "subprocess" },
  { key: "checks.call.general", loc: "S.subprocess", message: "Invalid input: expected object, received string", on: 1, section: "subprocess" },

  { key: "checks.end.noOutcome", loc: "S.outcome", message: "contracted process: terminal step 's2' needs an outcome", on: 2, section: "howItEnds" },
  { key: "checks.end.noEndings", loc: "S.outcome", message: "contracted process: terminal step 's2' needs an outcome", on: 2, place: "contract", draft: NO_ENDINGS },
  { key: "checks.end.unknownOutcome", loc: "S.outcome", message: "terminal outcome 'x' is not in contract.outcomes", on: 2, section: "howItEnds", holds: "“x”" },
  { key: "checks.end.reservedOutcome", loc: "S.outcome", message: "outcome 'cancelled' is reserved for cancellation", on: 2, section: "howItEnds" },

  { key: "checks.form.fieldGone", loc: "S.view.fields[2].ref", message: "view ref does not resolve: field_gone", section: "form" },
  { key: "checks.form.tabs", loc: "S.view.fields[0].tab", message: "tab does not name a declared tab: x", section: "form" },
  { key: "checks.form.tabsDeclared", loc: "S.view.fields[0].tab", message: "an entry inside a group must not declare tab", place: "json" },
  { key: "checks.form.tabDuplicate", loc: "S.view.tabs[0].key", message: "duplicate tab key: t", place: "json" },
  { key: "checks.form.tabName", loc: "S.view.tabs[0].label", message: MISSING, section: "form" },
  { key: "checks.form.noteText", loc: "S.view.fields[1].text", message: MISSING, section: "form" },
  { key: "checks.form.group", loc: "steps[0].view.fields[0].group", message: "a view entry's group must name a group field's key", place: "json" },
  { key: "checks.form.noteGroup", loc: "steps[0].view.fields[1].group", message: "a view entry's group must name a group field's key", section: "form" },
  { key: "checks.form.flag", loc: "steps[0].view.fields[0].visible", message: "expected bool, got string", section: "form", holds: "Amount" },
  { key: "checks.form.rule", loc: "steps[0].view.fields[0].validation.rule", message: "expected bool, got string", place: "json", holds: "Amount" },
  { key: "checks.form.validation", loc: "S.view.fields[0].validationMode", message: "validationMode requires validation", place: "json" },
  { key: "checks.form.pattern", loc: "steps[0].view.fields[0].validation.pattern", message: "pattern does not compile as a JavaScript RegExp", place: "json" },
  { key: "checks.form.technicalFlag", loc: "steps[0].view.fields[0].required", message: "a technical field's view entry must not declare required", place: "json" },
  { key: "checks.form.unwritable", loc: "S.view.fields[0].readonly", message: 'Field "amount" is required and read-only here, and nothing writes it: every submission will fail.', section: "form", holds: "Amount" },
  { key: "checks.form.hiddenRequired", loc: "S.view.fields[0].required", message: 'Field "amount" is required but hidden (visible: false), so its requirement is never enforced.', section: "form", holds: "Amount" },
  { key: "checks.form.general", loc: "S.view.fields[1]", message: "Invalid input", section: "form" },

  { key: "checks.field.name", loc: "fields.field_amount.label", message: MISSING, place: "fields" },
  { key: "checks.field.description", loc: "fields.field_amount.description", message: MISSING, place: "fields", holds: "Amount" },
  { key: "checks.field.choiceName", loc: "fields.field_choice.options[0].label", message: MISSING, place: "fields", holds: "Choice" },
  { key: "checks.field.key", loc: "fields[0].key", message: "field key must match /^[a-z_][a-z0-9_]*$/ to be a valid CEL identifier", place: "fields", holds: "Amount" },
  { key: "checks.field.kind", loc: "fields[0].format", message: "field type 'string' does not allow format 'x'", place: "fields", holds: "Amount" },
  { key: "checks.field.optionsAndSource", loc: "fields[1].options", message: "options and dataSource are mutually exclusive", place: "json", holds: "Choice" },
  { key: "checks.field.sourceGone", loc: "fields.field_amount.dataSource", message: "field dataSource does not resolve: ds_x", place: "fields", holds: "Amount" },
  { key: "checks.field.pattern", loc: "fields[0].validation.pattern", message: "pattern exceeds the 4000-character bound", place: "fields", holds: "Amount" },
  { key: "checks.field.rule", loc: "fields[0].validation.rule", message: "expected bool, got string", place: "fields", holds: "Amount" },
  { key: "checks.field.default", loc: "fields[0].default", message: "default value does not match format 'x'", place: "fields", holds: "Amount" },
  { key: "checks.field.columnSource", loc: "fields[0].columnMapping", message: "columnMapping needs a dataSource: an inline options array declares no columns", place: "fields", holds: "Amount" },
  { key: "checks.field.columnMapping", loc: "fields[0].columnMapping.x", message: "columnMapping target is the mapping field itself", place: "fields", holds: "Amount" },
  { key: "checks.field.columnNotString", loc: "fields[0].columnMapping", message: "columnMapping needs a string field: a list picks several rows for one target", place: "fields", holds: "Amount" },
  { key: "checks.field.columnOnChoices", loc: "fields[1].columnMapping", message: "columnMapping needs a dataSource: an inline options array declares no columns", place: "json", holds: "Choice" },
  { key: "checks.field.groupFlag", loc: "fields.field_group.technical", message: "a group field must not declare technical: true", place: "json", holds: "Group" },
  { key: "checks.field.technicalUnwritten", loc: "fields.field_amount.technical", message: 'Field "amount" is technical, and no structural source writes it: it can never hold a value.', place: "fields", holds: "Amount" },

  { key: "checks.source.key", loc: "dataSources[0].key", message: BAD_STRING, place: "sources" },
  { key: "checks.source.reservedName", loc: "dataSources[0].key", message: "data source key 'data' collides with a reserved CEL namespace", place: "sources", holds: "customers" },
  { key: "checks.source.unknownType", loc: "dataSources[0]", message: "data source type 'x' is not registered", place: "sources", holds: "customers" },
  { key: "checks.source.config", loc: "dataSources[0].config.table", message: "Plugin says no", place: "sources", holds: "customers" },

  { key: "checks.contract.fieldGone", loc: "contract.inputFields[0]", message: "contract.inputFields entry does not resolve to a field: field_x", place: "json" },
  { key: "checks.contract.unusedOutcome", loc: "contract.outcomes", message: "declared outcome 'paid' has no terminal step", place: "contract", holds: "paid" },
  { key: "checks.contract.reservedOutcome", loc: "contract.outcomes", message: "outcome 'cancelled' is reserved for cancellation", place: "contract", holds: "cancelled" },
  { key: "checks.contract.general", loc: "contract.outcomes[0]", message: BAD_STRING, place: "contract" },

  { key: "checks.fallback.section", loc: "S.collaboration.comments", message: "A brand new message", section: "more" },
  { key: "checks.fallback.step", loc: "S.zzz", message: "A brand new message", place: "page" },
  { key: "checks.fallback.field", loc: "fields[0].zzz", message: "A brand new message", place: "fields", holds: "Amount" },
  { key: "checks.fallback.source", loc: "dataSources[0].zzz", message: "A brand new message", place: "sources", holds: "customers" },
  { key: "checks.fallback.process", loc: "zzz", message: "A brand new message" },
  { key: "checks.fallback.contract", loc: "contract.zzz", message: "A brand new message", place: "contract" },
];

const locOf = (row: Row) => row.loc.replace(/^S(?=\.|$)/, `workflow.steps[${row.on ?? 0}]`);

/** The key families of design D3, the sentences `checkSentence` answers with. */
const D3_FAMILIES = /^checks\.(process|step|paths|way|timer|action|assignment|call|end|form|field|source|contract|fallback)\./;

describe("one sentence per key", () => {
  it("covers every sentence key in the catalog", () => {
    const sentenceKeys = Object.keys(en).filter((key) => D3_FAMILIES.test(key));
    expect(ROWS.map((row): string => row.key).sort()).toEqual(sentenceKeys.sort());
  });

  for (const row of ROWS) {
    it(`${row.key} names its step and section, and says no engine word`, () => {
      const body = row.draft ?? makeDraft();
      const answer = answerFor(body, locOf(row), row.message);
      const stepIndex = row.on ?? 0;
      expect(answer.key).toBe(row.key);
      expect(answer.sentence).not.toContain("{");
      expect(answer.sentence).not.toMatch(ENGINE_WORDS);
      if (t(row.key).includes("{step}")) expect(answer.sentence).toContain(`“${STEP_NAMES[stepIndex]}”`);
      if (row.section) expect(answer.sentence).toContain(t(sectionLabel(row.section, KINDS[stepIndex]!)));
      if (row.holds) expect(answer.sentence).toContain(row.holds);
      expect(answer.place).toBe(row.place ?? row.section);
    });
  }

  it("copies the design's texts through the catalog", () => {
    expect(t("checks.step.name")).toBe("“{step}” needs a name. Type it in the Name box at the top of its page.");
    expect(t("checks.way.name")).toBe("A way out of “{step}” has no name. Under {section}, type one.");
    expect(t("checks.severity.blocker")).toBe("Must fix");
    expect(t("checks.severity.advisory")).toBe("Worth a look");
    expect(t("checksRail.fix")).toBe("Fix");
    expect(t("checksRail.subject.publishing")).toBe("Before publishing");
    expect(t("checks.process.key")).toBe("The process needs an internal name. On Settings, set it in the Developer view.");
    expect(t("checks.process.duplicateFieldKey")).toBe("Two fields share one internal name. On the Fields tab, change one in its Developer view.");
    expect(t("checks.step.key")).toBe("The internal name of “{step}” cannot be used. Under {section}, change it in the Developer view.");
    expect(t("checks.step.reservedKey")).toBe("“{step}” uses an internal name kept for cancelled cases. Under {section}, change it in the Developer view.");
    expect(t("checks.way.key")).toBe("The way out “{way}” of “{step}” has no internal name. Under {section}, type one in its Developer view.");
    expect(t("checks.form.tabDuplicate")).toBe("Two tabs on the form of “{step}” share one internal name. Correct it in the JSON surface.");
    expect(t("checks.field.key")).toBe("The internal name of “{field}” cannot be used. Under More, change it in the Developer view.");
    expect(t("checks.timer.duration")).toBe("The length of a time limit on “{step}” cannot be read. Under {section}, remove it and add a new one.");
    expect(t("checks.end.unknownOutcome")).toBe("“{step}” ends with “{value}”, which the process does not list. On Settings, add it under How it can end, or choose another under {section}.");
    expect(t("checks.fallback.contract")).toBe("Something in what this process takes in or gives back does not pass a check. On the Checks tab, this check's Developer view names it.");
    expect(t("checksRail.heldBackLine")).toBe("More checks run once you fix the rows above. Publishing also checks a few things this list cannot, and tells you if one fails.");
    expect(t("checksRail.publishLine")).toBe("Publishing also checks a few things this list cannot, and tells you if one fails.");
    expect(t("app.draftIncomplete")).toBe("Some checks cannot run yet. Open Checks and fix what it lists.");
  });
});

describe("checkPlace", () => {
  it("sends every sentence naming the JSON surface to the JSON surface", () => {
    const jsonKeys = ROWS.filter((row) => t(row.key).includes("JSON surface")).map((row) => row.key);
    expect(jsonKeys.sort()).toEqual(
      [
        "checks.process.description",
        "checks.process.duplicateId",
        "checks.process.badId",
        "checks.process.cancelSink",
        "checks.process.unknownEntry",
        "checks.step.reservedId",
        "checks.action.duration",
        "checks.assignment.group",
        "checks.form.tabsDeclared",
        "checks.form.tabDuplicate",
        "checks.form.group",
        "checks.form.rule",
        "checks.form.validation",
        "checks.form.pattern",
        "checks.form.technicalFlag",
        "checks.field.optionsAndSource",
        "checks.field.columnOnChoices",
        "checks.field.groupFlag",
        "checks.contract.fieldGone",
      ].sort() as CatalogKey[],
    );
    for (const row of ROWS.filter((r) => t(r.key).includes("JSON surface"))) {
      const body = row.draft ?? makeDraft();
      const loc = locOf(row);
      expect(`${row.key}: ${checkPlace(body, { ...resolveLoc(body, loc), loc, message: row.message })}`).toBe(`${row.key}: json`);
    }
  });

  it("reads a `.id` location on any entity as a malformed id", () => {
    const body = makeDraft();
    for (const loc of ["workflow.steps[0].id", "workflow.steps[0].paths[0].id", "workflow.steps[0].timers[0].id", "workflow.steps[0].onEntry[0].id", "fields[0].id", "fields.field_amount.id", "dataSources[0].id"]) {
      const answer = answerFor(body, loc, "Invalid string: must match pattern /^x_/");
      expect(`${loc}: ${answer.key} ${answer.place}`).toBe(`${loc}: checks.process.badId json`);
    }
  });

  it("keeps a column named id out of the malformed-id rule", () => {
    expect(answerFor(makeDraft(), "fields[0].columnMapping.id", "Invalid string: must match pattern /^field_/").key).toBe("checks.field.columnMapping");
  });

  it("answers no place for a check on the process with no rule", () => {
    const body = makeDraft();
    expect(checkPlace(body, { ...resolveLoc(body, "zzz"), loc: "zzz", message: "A brand new message" })).toBeUndefined();
  });

  it("separates two checks at one location by their rule", () => {
    const body = makeDraft();
    expect(answerFor(body, "fields", "duplicate field ids").place).toBe("json");
    expect(answerFor(body, "fields", "duplicate field keys").place).toBe("fields");
  });
});

describe("checks.action.fieldGone's section", () => {
  const output = { output: { field_gone: { lang: "cel", src: "1" } } };
  const message = "action output targets unknown field: field_gone";
  const on = (step: Record<string, unknown>) => makeDraft({ workflow: { initialStep: "step_0", steps: [{ id: "step_0", key: "s", label: { en: "Review" }, type: "task", ...step }] } });
  const cases: readonly [string, Record<string, unknown>, SectionName][] = [
    ["onEntry", { onEntry: [{ id: "action_a", type: "x", ...output }] }, "lifecycle"],
    ["onExit", { onExit: [{ id: "action_a", type: "x", ...output }] }, "lifecycle"],
    ["onCancel", { onCancel: [{ id: "action_a", type: "x", ...output }] }, "lifecycle"],
    ["a path's onPath", { paths: [{ id: "path_a", onPath: [{ id: "action_a", type: "x", ...output }] }] }, "paths"],
    ["a timer's onFire", { timers: [{ id: "timer_a", onFire: { actions: [{ id: "action_a", type: "x", ...output }] } }] }, "timers"],
  ];

  for (const [position, step, section] of cases) {
    it(`finds the action in ${position}`, () => {
      const body = on(step);
      const answer = answerFor(body, "workflow.steps[0]", message);
      expect(answer.key).toBe("checks.action.fieldGone");
      expect(answer.place).toBe(section);
      expect(answer.sentence).toContain(t(sectionLabel(section, "participant")));
    });
  }

  it("answers no section for another message or an id no action holds", () => {
    const step = { onEntry: [{ id: "action_a", type: "x", ...output }] } as unknown as Parameters<typeof sectionOfOutputTarget>[0];
    expect(sectionOfOutputTarget(step, "duplicate step ids")).toBeUndefined();
    expect(sectionOfOutputTarget(step, "action output targets unknown field: field_other")).toBeUndefined();
  });

  it("falls to the step form where no action holds the id", () => {
    const answer = answerFor(makeDraft(), "workflow.steps[0]", message);
    expect(answer.key).toBe("checks.fallback.step");
    expect(answer.tier).toBe(4);
  });
});

describe("a section the step's kind leaves out", () => {
  const rows = ROWS.filter((row): row is Row & { section: SectionName } => row.section !== undefined && row.key !== "checks.action.fieldGone" && row.key !== "checks.action.sameOutput" && row.loc.startsWith("S"));

  it("has rows to walk", () => {
    expect(rows.length).toBeGreaterThan(30);
  });

  KINDS.forEach((kind, index) => {
    it(`${kind} prints only its own sections`, () => {
      const body = makeDraft();
      for (const row of rows) {
        const answer = answerFor(body, row.loc.replace(/^S(?=\.|$)/, `workflow.steps[${index}]`), row.message);
        const stands = sectionsFor(kind).includes(row.section);
        if (stands) {
          expect(`${row.key}: ${answer.sentence}`).toContain(t(sectionLabel(row.section, kind)));
        } else {
          expect(`${row.key}: ${answer.key}`).toBe(`${row.key}: checks.fallback.step`);
          expect(answer.tier).toBe(4);
          expect(answer.place).toBe("page");
          expect(answer.sentence).toContain(`“${STEP_NAMES[index]}”`);
          for (const section of new Set([...sectionsFor("participant"), ...sectionsFor("subprocess"), ...sectionsFor("terminal")])) {
            expect(answer.sentence).not.toContain(t(sectionLabel(section, kind)));
          }
        }
      }
    });
  });

  it("reads When entered on an end step", () => {
    const sentence = sentenceFor(makeDraft(), "workflow.steps[2].onEntry[0].type", "action type uses the reserved 'core.' prefix");
    expect(sentence).toContain("Under When entered,");
  });

  it("names no section for an action in a left list an end step does not draw", () => {
    const answer = answerFor(makeDraft(), "workflow.steps[2].onExit[0]", "action type 'x' is not registered");
    expect(answer.key).toBe("checks.fallback.step");
  });

  it("names no section for a time limit on an end step", () => {
    const answer = answerFor(makeDraft(), "workflow.steps[2].timers[0].duration", "exactly one of duration or deadline");
    expect(answer.sentence).toBe(t("checks.fallback.step").replace("{step}", "Done"));
  });
});

describe("a message no rule knows", () => {
  const MESSAGE = "A brand new engine message";

  it("names the step and the section, and sends the reader to the Developer view", () => {
    const body = makeDraft();
    for (const [loc, word] of [
      ["workflow.steps[0].assignment.strategy.config2", "Who acts"],
      ["workflow.steps[0].paths[0].label", "Ways out"],
      ["workflow.steps[0].timers[0].onFire", "Time limit"],
      ["workflow.steps[0].onEntry[0].retry", "When entered or left"],
      ["workflow.steps[0].view.fields[0].span", "Form"],
    ] as const) {
      const answer = answerFor(body, loc, MESSAGE);
      expect(`${loc}: ${answer.key} ${answer.tier}`).toBe(`${loc}: checks.fallback.section 4`);
      expect(answer.sentence).toContain("“Review”");
      expect(answer.sentence).toContain(word);
      expect(answer.sentence).toContain("Developer view");
      expect(answer.sentence).not.toContain(MESSAGE);
    }
  });

  it("names a field, a source, and the process where no step owns it", () => {
    const body = makeDraft();
    expect(sentenceFor(body, "fields[0].label", MESSAGE)).toBe(t("checks.fallback.field").replace("{field}", "Amount"));
    expect(sentenceFor(body, "dataSources[0].key", MESSAGE)).toBe(t("checks.fallback.source").replace("{source}", "customers"));
    expect(sentenceFor(body, "allowedGroups", MESSAGE)).toBe(t("checks.fallback.process"));
  });

  it("falls to the process form when the location points past the steps", () => {
    const answer = answerFor(makeDraft(), "workflow.steps[9].label", MISSING);
    expect(answer.key).toBe("checks.fallback.process");
    expect(answer.sentence).not.toContain("{step}");
  });

  it("reads a location's entity when the location names nothing", () => {
    const body = makeDraft();
    const check = (entityType: "step" | "path" | "field" | "dataSource" | "contract", entityId: string) => checkAnswer(body, { entityType, entityId, loc: "", message: MESSAGE });
    expect(check("step", "step_1").sentence).toContain("“Credit check”");
    expect(check("path", "path_1").sentence).toContain("“Credit check”");
    expect(check("field", "field_inner").sentence).toContain("“Inner”");
    expect(check("dataSource", "ds_list").sentence).toContain("“customers”");
    expect(check("contract", "contract").key).toBe("checks.fallback.contract");
  });
});

describe("rules that read the draft", () => {
  it("reads a missing or unknown ending as no endings while the contract lists none", () => {
    for (const message of ["contracted process: terminal step 's' needs an outcome", "terminal outcome 'x' is not in contract.outcomes"]) {
      const empty = answerFor(NO_ENDINGS, "workflow.steps[2].outcome", message);
      expect(empty.key).toBe("checks.end.noEndings");
      expect(empty.place).toBe("contract");
      expect(answerFor(makeDraft(), "workflow.steps[2].outcome", message).place).toBe("howItEnds");
    }
  });

  it("lands a too-long limit the panel draws no input for on Time limit", () => {
    const answer = answerFor(makeDraft(), "steps[0].timers[1].duration", OUT_OF_RANGE);
    expect(answer.key).toBe("checks.timer.duration");
    expect(answer.place).toBe("timers");
    expect(answer.sentence).toBe("The length of a time limit on “Review” cannot be read. Under Time limit, remove it and add a new one.");
  });

  it("names the step's unlisted ending, and both places that repair it", () => {
    const steps = [makeStep(0), makeStep(1), { ...makeStep(2), outcome: "archived" }];
    const body = makeDraft({ workflow: { initialStep: "step_0", steps } });
    expect(sentenceFor(body, "workflow.steps[2].outcome", "terminal outcome 'archived' is not in contract.outcomes")).toBe(
      `“${STEP_NAMES[2]}” ends with “archived”, which the process does not list. On Settings, add it under How it can end, or choose another under How the case ends.`,
    );
  });

  it("reads an empty target as one that leads nowhere yet, never as a removed step", () => {
    expect(answerFor(makeDraft(), "workflow.steps[0].paths[0].to", "path target does not resolve: ").key).toBe("checks.way.noTarget");
    expect(answerFor(makeDraft(), "workflow.steps[0].paths[0].to", "path target does not resolve: step_gone").key).toBe("checks.way.targetGone");
  });

  it("reads a column key named `fields` as a column mapping, not as a nested field", () => {
    const answer = answerFor(makeDraft(), "fields[0].columnMapping.fields", "columnMapping key exceeds the 64-character bound");
    expect(answer.key).toBe("checks.field.columnMapping");
    expect(answerFor(makeDraft(), "fields[0].columnMapping.fields", "Invalid input: expected string, received number").key).toBe("checks.field.columnMapping");
  });

  it("reads a group's child by the whole chain", () => {
    expect(sentenceFor(makeDraft(), "fields[2].fields[0].key", TOO_SMALL)).toContain("“Inner”");
    expect(answerFor(makeDraft(), "fields[2].fields[0].key", TOO_SMALL).key).toBe("checks.field.key");
  });

  it("reads a two-way transition's sentence with its way out and no section", () => {
    const sentence = sentenceFor(makeDraft(), "workflow.steps[0].paths[0]", "two actions on one transition write the same output field: f");
    expect(sentence).toBe("Two actions on the way out “Approve” of “Review” write the same field. Check that way out, this step's When left list and the next step's When entered list.");
  });

  it("names no section for a cancel transition on an end step", () => {
    expect(answerFor(makeDraft(), "workflow.steps[2].onCancel", "two actions on one transition write the same output field: f").key).toBe("checks.fallback.step");
  });

  it("reads each group literal on a note as the note's, and on a field as the JSON surface's", () => {
    const body = makeDraft();
    for (const message of [
      "a view entry's group must name a group field's key",
      "a view entry's group names a group field this view does not carry",
      "a view entry's group must be empty; the catalog holds this field at the top level",
      'a view entry\'s group must name this field\'s catalog parent, "g"',
    ]) {
      expect(answerFor(body, "steps[0].view.fields[1].group", message).key).toBe("checks.form.noteGroup");
      expect(answerFor(body, "steps[0].view.fields[0].group", message).key).toBe("checks.form.group");
    }
  });

  it("reads both tab literals the picker cannot repair as declared", () => {
    const body = makeDraft();
    expect(answerFor(body, "workflow.steps[0].view.fields[0].tab", "tab is set, but this view declares no tabs").key).toBe("checks.form.tabsDeclared");
    expect(answerFor(body, "workflow.steps[0].view.fields[0].tab", "an entry inside a group must not declare tab").key).toBe("checks.form.tabsDeclared");
    expect(answerFor(body, "workflow.steps[0].view.fields[0].tab", "entry outside a group must declare tab once the view declares tabs").key).toBe("checks.form.tabs");
  });

  it("answers a note's flag check with the form's general sentence", () => {
    expect(answerFor(makeDraft(), "steps[0].view.fields[1].visible", "expected bool, got string").key).toBe("checks.form.general");
  });

  it("picks a plugin type's length check by its place", () => {
    const body = makeDraft();
    const message = "type exceeds the 200-character bound";
    expect(answerFor(body, "steps[0].onEntry[0].type", message).key).toBe("checks.action.unknownType");
    expect(answerFor(body, "steps[0].assignment.strategy.type", message).key).toBe("checks.assignment.unknownType");
    expect(answerFor(body, "dataSources[0].type", message).key).toBe("checks.source.unknownType");
    expect(answerFor(body, "fields[0].type.type", message).key).toBe("checks.field.kind");
  });

  it("picks an expression's length check by its site", () => {
    const body = makeDraft();
    const message = "expression source exceeds the 4000-character bound";
    expect(answerFor(body, "steps[0].paths[0].guard", message).key).toBe("checks.way.guard");
    expect(answerFor(body, "steps[0].timers[0].deadline", message).key).toBe("checks.timer.deadline");
    expect(answerFor(body, "fields[0].default", message).key).toBe("checks.field.default");
    expect(answerFor(body, "steps[0].onEntry[0].output.field_amount", message).key).toBe("checks.action.output");
    expect(answerFor(body, "steps[1].subprocess.inputMapping.field_amount", message).key).toBe("checks.call.mapping");
  });
});

describe("the four tiers", () => {
  it("lets an expression site decide over a parser's varying text", () => {
    const body = makeDraft();
    const first = answerFor(body, "steps[0].paths[0].guard", "Unexpected token at 3");
    const second = answerFor(body, "steps[0].paths[0].guard", "Unknown variable: data.x");
    expect(first.tier).toBe(2);
    expect(first.sentence).toBe(second.sentence);
    expect(first.sentence).not.toContain("Unexpected");
  });

  it("answers Zod's built-ins from the property", () => {
    const body = makeDraft();
    expect(answerFor(body, "workflow.steps[0].paths[0].label", BAD_STRING)).toMatchObject({ key: "checks.way.name", tier: 3 });
    expect(answerFor(body, "workflow.steps[0].paths[0].trigger", BAD_OPTION)).toMatchObject({ key: "checks.way.trigger", tier: 3 });
    expect(answerFor(body, "workflow.steps[0].paths[0].key", TOO_SMALL)).toMatchObject({ key: "checks.way.key", tier: 3 });
  });

  it("reads a plugin's own config message whatever it says", () => {
    expect(answerFor(makeDraft(), "steps[0].onEntry[0].config.to", "Required").tier).toBe(3);
  });

  it("never reads the source", () => {
    const body = makeDraft();
    const site = { ...resolveLoc(body, "workflow.steps[0].key"), loc: "workflow.steps[0].key", message: TOO_SMALL };
    expect(checkSentence(body, { ...site, source: "zod" } as typeof site)).toBe(checkSentence(body, site));
  });
});

describe("the slots", () => {
  const unnamed = (over: Record<string, unknown>) => ({ ...makeStep(0), label: {}, ...over });

  it("prints the unnamed way out", () => {
    const body = makeDraft({ workflow: { initialStep: "step_0", steps: [{ ...makeStep(0), paths: [{ id: "path_a", label: " " }] }] } });
    expect(sentenceFor(body, "workflow.steps[0].paths[0].trigger", BAD_OPTION)).toContain("“(unnamed way out)”");
  });

  it("prints the unnamed field", () => {
    const body = makeDraft({ fields: [{ id: "field_amount", key: "amount", label: {} }] });
    const sentence = sentenceFor(body, "fields[0].label", MISSING);
    expect(sentence).toContain("“(unnamed field)”");
    expect(sentence).not.toContain("amount");
  });

  it("prints a view entry's unnamed field and a ref the catalog lost", () => {
    const body = makeDraft();
    expect(sentenceFor(body, "steps[0].view.fields[2].visible", "expected bool, got string")).toContain("“(unnamed field)”");
  });

  it("prints the unnamed source, and a source's key as its name", () => {
    const body = makeDraft({ dataSources: [{ id: "ds_a", key: "", type: "x" }] });
    expect(sentenceFor(body, "dataSources[0].zzz", "A brand new message")).toContain("“(unnamed source)”");
    expect(sentenceFor(makeDraft(), "dataSources[0].zzz", "A brand new message")).toContain("“customers”");
  });

  it("reads two unnamed steps by their numbers", () => {
    const steps = [makeStep(0), unnamed({ id: "step_a" }), unnamed({ id: "step_b" })];
    const body = makeDraft({ workflow: { initialStep: "step_0", steps } });
    expect(sentenceFor(body, "workflow.steps[1].label", MISSING)).toContain("“Step 2”");
    expect(sentenceFor(body, "workflow.steps[2].label", MISSING)).toContain("“Step 3”");
  });

  it("reads one unnamed step by its number, and a step with no id too", () => {
    const one = makeDraft({ workflow: { initialStep: "step_0", steps: [makeStep(0), unnamed({ id: "step_a" })] } });
    expect(sentenceFor(one, "workflow.steps[1].label", MISSING)).toContain("“Step 2”");
    const noId = makeDraft({ workflow: { initialStep: "step_0", steps: [unnamed({ id: undefined })] } });
    expect(sentenceFor(noId, "workflow.steps[0].label", MISSING)).toContain("“Step 1”");
  });

  it("keeps the step text map's form for a repeated label", () => {
    const steps = [makeStep(0), { ...makeStep(1), label: { en: STEP_NAMES[0] } }];
    const body = makeDraft({ workflow: { initialStep: "step_0", steps } });
    expect(sentenceFor(body, "workflow.steps[1].label", MISSING)).toContain(`“${STEP_NAMES[0]} (step 2)”`);
  });

  it("reads a new draft afresh, since a mutation clones the draft", () => {
    const first = makeDraft({ workflow: { initialStep: "step_0", steps: [unnamed({ id: "step_a" })] } });
    expect(sentenceFor(first, "workflow.steps[0].label", MISSING)).toContain("“Step 1”");
    const next = structuredClone(first);
    next.workflow!.steps![0]!.label = { en: "Renamed" };
    expect(sentenceFor(next, "workflow.steps[0].key", TOO_SMALL)).toContain("“Renamed”");
  });

  it("reads names in the base locale", () => {
    const body = makeDraft({ baseLocale: "de", fields: [{ id: "field_amount", key: "amount", label: { de: "Betrag", en: "Amount" } }] });
    expect(sentenceFor(body, "fields[0].key", TOO_SMALL)).toContain("“Betrag”");
  });

  it("prints a name as written, slot marks included", () => {
    const body = makeDraft({ fields: [{ id: "field_amount", key: "amount", label: { en: "{step} $&" } }] });
    expect(sentenceFor(body, "fields[0].key", TOO_SMALL)).toContain("“{step} $&”");
  });

  it("survives a label that holds no string", () => {
    const body = makeDraft({
      fields: [{ id: "field_amount", key: 5, label: { en: 7 } }],
      dataSources: [{ id: "ds_a", key: 5 }],
      workflow: { initialStep: "step_0", steps: [{ id: "step_0", label: { en: 7 }, paths: [{ id: "path_a", label: 5 }] }] },
    });
    expect(sentenceFor(body, "workflow.steps[0].label", BAD_STRING)).toContain("“Step 1”");
    expect(sentenceFor(body, "workflow.steps[0].paths[0].trigger", BAD_OPTION)).toContain("“(unnamed way out)”");
    expect(sentenceFor(body, "fields[0].key", BAD_STRING)).toContain("“(unnamed field)”");
    expect(sentenceFor(body, "dataSources[0].zzz", "x")).toContain("“(unnamed source)”");
  });
});

describe("the process's name", () => {
  it("answers the raw message and the swapped one with one sentence", () => {
    const body = makeDraft({ label: {} });
    const raw = answerFor(body, "label", MISSING);
    const swapped = answerFor(body, "label", t("issues.processNeedsName"));
    expect(raw.sentence).toBe(t("issues.processNeedsName"));
    expect(swapped.sentence).toBe(t("issues.processNeedsName"));
    expect(raw.place).toBe("name");
    expect(swapped.place).toBe("name");
  });
});

describe("runValidation fills the sentence", () => {
  const STEP_A = "step_00000000-0000-4000-8000-000000000001";
  const STEP_B = "step_00000000-0000-4000-8000-000000000002";
  const PATH_A = "path_00000000-0000-4000-8000-000000000001";
  const end = { id: STEP_B, key: "b", label: { en: "End" }, type: "task", terminal: true };
  const way = { id: PATH_A, key: "go", label: "Go", to: STEP_B, trigger: "manual" };
  const review = { id: STEP_A, key: "a", label: { en: "Review" }, type: "task", paths: [way] };
  const draft = (steps: unknown[], over: Record<string, unknown> = {}) =>
    ({ key: "k", label: { en: "Process" }, baseLocale: "en", fields: [], workflow: { initialStep: STEP_A, steps }, ...over }) as unknown as Draft;
  const run = (body: Draft) => runValidation(body, undefined, {}, {});

  it("leaves a clean draft with no issue", () => {
    expect(run(draft([review, end])).issues).toEqual([]);
  });

  it("reads a way out with no name, and keeps the raw message", () => {
    const { issues } = run(draft([{ ...review, paths: [{ ...way, label: { en: "x" } }] }, end]));
    const issue = issues.find((i) => i.loc === "workflow.steps[0].paths[0].label")!;
    expect(issue.sentence).toBe("A way out of “Review” has no name. Under Ways out, type one.");
    expect(issue.message).toContain("Invalid input");
    expect(issueText(issue)).toBe(issue.sentence!);
    expect(issue.sentence).not.toContain("Invalid input");
  });

  it("reads a step with no name", () => {
    const { issues } = run(draft([{ ...review, label: {} }, end]));
    const issue = issues.find((i) => i.loc === "workflow.steps[0].label")!;
    expect(issue.message).toContain("missing baseLocale");
    expect(issue.sentence).toBe("“Step 1” needs a name. Type it in the Name box at the top of its page.");
  });

  it("reads a guard the parser rejects", () => {
    const body = draft([{ ...review, paths: [{ ...way, guard: { lang: "cel", src: "1 +" } }] }, end]);
    const issue = run(body).issues.find((i) => i.source === "cel")!;
    expect(issue.sentence).toBe("The “Only if” on the way out “Go” of “Review” cannot be read. Under Ways out, correct it.");
    expect(issue.sentence).not.toContain(issue.message);
  });

  it("gives every issue of a broken draft a sentence with no engine word", () => {
    const body = draft([{ ...review, key: 5, label: {}, paths: [{ ...way, label: 5, to: "nope", trigger: "x", id: "bad" }] }, { ...end, outcome: "x" }], { baseLocale: "en", fields: [{ id: "bad", label: {} }] });
    const { issues } = run(body);
    expect(issues.length).toBeGreaterThan(3);
    for (const issue of issues) {
      expect(issue.sentence).toBeString();
      expect(issue.sentence!).not.toMatch(ENGINE_WORDS);
      expect(issue.sentence).not.toContain("{");
      expect(answerFor(body, issue.loc, issue.message).sentence).toBe(issue.sentence!);
    }
  });

  it("reads the process's name gap in its plain sentence", () => {
    const { issues } = run(draft([review, end], { label: {} }));
    const issue = issues.find((i) => i.loc === "label")!;
    expect(issue.plain).toBe(true);
    expect(issue.message).toBe(t("issues.processNeedsName"));
    expect(issue.sentence).toBe(t("issues.processNeedsName"));
  });

  it("reads a real message from each of the studio's own findings", () => {
    const body = draft([{ ...review, view: { fields: [{ ref: "field_a", visible: false, required: true }, { ref: "field_a", readonly: true, required: true }] } }, end], {
      fields: [
        { id: "field_a", key: "a", label: { en: "Amount" }, type: "string" },
        { id: "field_t", key: "t", label: { en: "Tech" }, type: "string", technical: true },
      ],
    });
    const flags = checkViewFlags(body);
    const technical = checkUnwrittenTechnicalFields(body);
    expect(flags.map((i) => checkAnswer(body, i).key)).toEqual(["checks.form.hiddenRequired", "checks.form.unwritable"]);
    expect(checkSentence(body, flags[0]!)).toBe("“Amount” is required on “Review” but not asked, so nobody can fill it. Under Form, open the form and change it.");
    expect(checkSentence(body, flags[1]!)).toBe("“Amount” is required and read-only on “Review”, and nothing fills it, so every submission fails. Under Form, open the form and change it.");
    expect(technical.map((i) => checkAnswer(body, i).key)).toEqual(["checks.field.technicalUnwritten"]);
    expect(checkSentence(body, technical[0]!)).toBe("“Tech” is technical, and nothing fills it, so it never holds a value. Fill it from an action, or clear Technical under More.");
  });
});

describe("issueText", () => {
  it("falls back to the message", () => {
    expect(issueText({ message: "raw" })).toBe("raw");
    expect(issueText({ message: "raw", sentence: "A sentence." })).toBe("A sentence.");
  });
});

/**
 * `studio-checks-rail`: "A scan keeps the sentences complete". The scan parses
 * the validators and fails on a message literal no literal rule meets. It reads
 * five forms: a `message:` property, a bare `add(...)` call, `reasons.push(...)`,
 * the `GRAMMAR` and `OUT_OF_RANGE` constants, and the `${entityLabel}` template.
 */
// oxc's ESTree output is plain objects; the walk reads it structurally.
type Node = { type: string; [key: string]: any };

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}

const ROOT = join(import.meta.dir, "../../..");
const SCANNED = ["src/schema/definition.ts", "src/schema/compile.ts", "src/engine/registry-check.ts"];
const ENTITY_LABELS = ["action", "assignment strategy", "data source"];
const SAMPLE = "sample";
/** Fewer literals than this means the scan left a form unread. */
const LITERAL_FLOOR = 85;

/** A migration spec is no process body, so its refinements reach no sentence. */
const EXEMPT_DECLARATIONS = new Set(["migrationSpec"]);

/** The message texts an expression can hold, each hole filled with a sample. */
function textsOf(expr: unknown): string[] {
  if (!isNode(expr)) return [];
  switch (expr.type) {
    case "Literal":
      return typeof expr.value === "string" ? [expr.value] : [];
    case "TemplateLiteral": {
      const names = expr.expressions.map((hole: Node) => (hole.type === "Identifier" ? hole.name : undefined));
      const labels = names.includes("entityLabel") ? ENTITY_LABELS : [SAMPLE];
      return labels.map((label) =>
        expr.quasis
          .map((quasi: Node, i: number) => {
            const text = quasi.value.cooked ?? quasi.value.raw;
            if (i === expr.expressions.length) return text;
            return text + (names[i] === "entityLabel" ? label : SAMPLE);
          })
          .join(""),
      );
    }
    case "ConditionalExpression":
      return [...textsOf(expr.consequent), ...textsOf(expr.alternate)];
    case "ParenthesizedExpression":
      return textsOf(expr.expression);
    default:
      return [];
  }
}

interface Literal {
  form: "message" | "add" | "reasons.push" | "constant";
  text: string;
}

function scanLiterals(source: string, file = "inline.ts"): Literal[] {
  const parsed = parseSync(file, source, { lang: "ts" });
  const found: Literal[] = [];
  const collect = (form: Literal["form"], expr: unknown) => {
    for (const text of textsOf(expr)) found.push({ form, text });
  };

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!isNode(node)) return;

    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") {
      if (EXEMPT_DECLARATIONS.has(node.id.name)) return;
      if (node.id.name === "GRAMMAR" || node.id.name === "OUT_OF_RANGE") collect("constant", node.init);
    }
    if (node.type === "Property" && node.key?.type === "Identifier" && node.key.name === "message") collect("message", node.value);
    if (node.type === "CallExpression") {
      const callee = node.callee;
      if (callee?.type === "Identifier" && callee.name === "add") collect("add", node.arguments[0]);
      if (callee?.type === "MemberExpression" && callee.object?.type === "Identifier" && callee.object.name === "reasons" && callee.property?.name === "push") collect("reasons.push", node.arguments[0]);
    }

    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      visit(node[key]);
    }
  };

  visit(parsed.program);
  return found;
}

describe("the literal scan itself", () => {
  it("finds a planted literal in each form, and fails it", () => {
    const planted = scanLiterals(`
      const GRAMMAR = "brand new grammar";
      add("brand new add", ["paths"]);
      reasons.push(\`brand new reason \${x}\`);
      issues.push({ loc, message: cond ? "brand new left" : \`brand new right \${y}\` });
    `);
    expect(planted.map((literal) => literal.text)).toEqual(["brand new grammar", "brand new add", "brand new reason sample", "brand new left", "brand new right sample"]);
    for (const { text } of planted) expect(literalRuleFor(text)).toBeUndefined();
  });

  it("leaves out a member `add`, a passed identifier and a message read from elsewhere", () => {
    expect(scanLiterals(`written.add("a"); add(reason); issues.push({ message: GRAMMAR }); issues.push({ message: issue.message }); ctx.addIssue({ message, path });`)).toEqual([]);
  });

  it("expands the entity label's three values", () => {
    expect(scanLiterals("issues.push({ message: `${entityLabel} type '${type}' is gone` });").map((literal) => literal.text)).toEqual([
      "action type 'sample' is gone",
      "assignment strategy type 'sample' is gone",
      "data source type 'sample' is gone",
    ]);
  });

  it("skips an exempt declaration by name", () => {
    expect(scanLiterals(`export const migrationSpec = z.object({}).refine((m) => m, { message: "not a body" });`)).toEqual([]);
  });
});

describe("the validators' literals", () => {
  const literals = SCANNED.flatMap((file) => scanLiterals(readFileSync(join(ROOT, file), "utf8"), file));
  const texts = (form: Literal["form"]) => literals.filter((literal) => literal.form === form).map((literal) => literal.text);

  it("each meets a literal rule", () => {
    expect(literals.filter(({ text }) => literalRuleFor(text) === undefined).map(({ text }) => text)).toEqual([]);
  });

  it("holds as many as the validators state, one from each form by name", () => {
    expect(literals.length).toBeGreaterThanOrEqual(LITERAL_FLOOR);
    expect(texts("add")).toContain("duplicate step ids");
    expect(texts("reasons.push")).toContain("automatic path priorities must be unique");
    expect(texts("constant")).toContain(GRAMMAR);
    expect(texts("message")).toContain("exactly one of duration or deadline");
    expect(texts("message")).toContain("data source type 'sample' is not registered");
  });

  it("leaves the migration spec's refinements out", () => {
    expect(literals.map((literal) => literal.text)).not.toContain("fieldMap is injective: no two sources may target one field");
  });
});
