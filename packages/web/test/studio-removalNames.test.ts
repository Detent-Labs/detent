import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import type { FieldId } from "workflow-engine/schema";
import { fieldRemovalReach } from "../src/areas/studio/draft/field-removal";
import { draftFields, type DraftField } from "../src/areas/studio/draft/fields";
import type { Draft } from "../src/areas/studio/draft/types";
import { removalNames } from "../src/areas/studio/panels/removalNames";
import { readByPlaces } from "../src/areas/studio/panels/readByRows";

/** `removalNames` turns the sites of a removal's reach into the dialog's
 * fact rows. Each case builds only the parts of a draft it reads. */

const id = (s: string) => s as FieldId;
const cel = (src: string) => ({ lang: "cel" as const, src });
const leaf = (fieldId: string, label: string, extra: DraftField = {}): DraftField => ({
  id: id(fieldId),
  key: fieldId.replace("fld_", ""),
  label: { en: label },
  type: "string",
  ...extra,
});
const step = (stepId: string, label: string, parts: Record<string, unknown> = {}) => ({
  id: stepId,
  key: stepId,
  label: { en: label },
  type: "task",
  ...parts,
});
const draftOf = (body: Record<string, unknown>): Draft => ({ baseLocale: "en", ...body }) as unknown as Draft;
const stepsOf = (...steps: ReturnType<typeof step>[]) => ({ workflow: { initialStep: steps[0]?.id, steps } });
const view = (...refs: string[]) => ({ view: { fields: refs.map((ref) => ({ ref: id(ref) })) } });
const writes = (actionId: string, fieldId = "fld_status") => ({
  id: actionId,
  type: "http.request",
  config: {},
  output: { [fieldId]: cel("result.status") },
});
const guarded = (pathId: string, label: string, to: string, src: string) => ({
  id: pathId,
  key: pathId,
  label,
  to,
  trigger: "automatic",
  guard: cel(src),
});

/** The rows `removalNames` answers for removing `fieldId`, as term to names. */
function rowsOf(draft: Draft, fieldId: string, locale = "en"): Record<string, readonly string[]> {
  const reach = fieldRemovalReach(draft, fieldId);
  if (reach === undefined) throw new Error(`no field ${fieldId}`);
  return Object.fromEntries(removalNames(draft, reach, locale).map((row) => [row.term, row.names]));
}

describe("removalNames, one case per term", () => {
  it("names the fields inside by their label", () => {
    const draft = draftOf({
      fields: [{ id: id("fld_group"), key: "grp", label: { en: "Group" }, type: "group", fields: [leaf("fld_a", "Amount"), leaf("fld_b", "")] }],
    });

    expect(rowsOf(draft, "fld_group")).toStrictEqual({ "Fields inside it": ["Amount", "(unnamed field)"] });
  });

  it("names the label at the content locale, else the base locale", () => {
    const draft = draftOf({
      fields: [{ id: id("fld_group"), key: "grp", label: { en: "Group" }, type: "group", fields: [leaf("fld_a", "Amount", { label: { en: "Amount", de: "Betrag" } }), leaf("fld_b", "Note")] }],
    });

    expect(rowsOf(draft, "fld_group", "de")["Fields inside it"]).toStrictEqual(["Betrag", "Note"]);
  });

  it("names the steps asking for the field by their text", () => {
    const draft = draftOf({
      fields: [leaf("fld_a", "Amount")],
      ...stepsOf(step("step_review", "Review", view("fld_a")), step("step_book", "Book", view("fld_a")), step("step_end", "End")),
    });

    expect(rowsOf(draft, "fld_a")).toStrictEqual({ "Asked on": ["Review", "Book"] });
  });

  it("names a step that shares its label with another by its steps-rail number", () => {
    const draft = draftOf({
      fields: [leaf("fld_a", "Amount")],
      ...stepsOf(step("step_1", "Review", view("fld_a")), step("step_2", "Review", view("fld_a"))),
    });

    expect(rowsOf(draft, "fld_a")["Asked on"]).toStrictEqual(["Review (step 1)", "Review (step 2)"]);
  });

  it("names the process's inputs and outputs, input first", () => {
    const draft = draftOf({
      fields: [leaf("fld_a", "Amount")],
      contract: { inputFields: [id("fld_a")], outputFields: [id("fld_a")], outcomes: ["done"] },
    });
    const outputOnly = draftOf({ fields: [leaf("fld_a", "Amount")], contract: { inputFields: [], outputFields: [id("fld_a")], outcomes: ["done"] } });

    expect(rowsOf(draft, "fld_a")).toStrictEqual({ "Part of": ["What this process takes in", "What this process gives back"] });
    expect(rowsOf(outputOnly, "fld_a")).toStrictEqual({ "Part of": ["What this process gives back"] });
  });

  it("names the staying field a column mapping fills in", () => {
    const draft = draftOf({
      fields: [leaf("fld_name", "Name"), leaf("fld_person", "Person", { columnMapping: { name: id("fld_name"), alias: id("fld_name") } })],
    });

    expect(rowsOf(draft, "fld_name")).toStrictEqual({ "Filled in from": ["Person"] });
  });

  it("names a place that reads the field in the Read by words, with no CEL", () => {
    const draft = draftOf({
      fields: [leaf("fld_amount", "Amount")],
      ...stepsOf(
        step("step_review", "Review", { paths: [guarded("path_a", "Approve", "step_book", "data.amount > 1.0")] }),
        step("step_book", "Book"),
      ),
    });

    const rows = rowsOf(draft, "fld_amount");

    expect(rows["Read by"]).toStrictEqual(["On Review: way out Approve → Book"]);
    expect(JSON.stringify(rows)).not.toContain("data.amount");
  });

  it("names a setting by its step, its data source key, else This process", () => {
    const draft = draftOf({
      fields: [leaf("fld_owner", "Owner")],
      dataSources: [{ id: "ds_a", key: "people", type: "people.directory", config: { valueFromField: "fld_owner" } }],
      allowedGroups: [],
      ...stepsOf(step("step_a", "Review", { assignment: { strategy: { type: "org.actor-from-field", config: { fieldId: "fld_owner" } } } })),
    });
    const onProcess = draftOf({ fields: [leaf("fld_owner", "Owner")], config: { fieldId: "fld_owner" } });

    expect(rowsOf(draft, "fld_owner")).toStrictEqual({ "Named in a setting on": ["people", "Review"] });
    expect(rowsOf(onProcess, "fld_owner")).toStrictEqual({ "Named in a setting on": ["This process"] });
  });

  it("prints no row for a kind the removal does not carry", () => {
    const draft = draftOf({ fields: [leaf("fld_a", "Amount")], ...stepsOf(step("step_a", "Review", view("fld_a"))) });

    expect(Object.keys(rowsOf(draft, "fld_a"))).toStrictEqual(["Asked on"]);
  });
});

describe("removalNames, one case per writer position", () => {
  const writerDraft = (stepParts: Record<string, unknown>) =>
    draftOf({ fields: [leaf("fld_status", "Status")], ...stepsOf(step("step_a", "Review", stepParts), step("step_b", "Book")) });
  const writtenBy = (stepParts: Record<string, unknown>) => rowsOf(writerDraft(stepParts), "fld_status")["Written by"];

  it("onEntry", () => {
    expect(writtenBy({ onEntry: [writes("act")] })).toStrictEqual(["What happens when Review is entered"]);
  });

  it("onExit", () => {
    expect(writtenBy({ onExit: [writes("act")] })).toStrictEqual(["What happens when Review is left"]);
  });

  it("onCancel", () => {
    expect(writtenBy({ onCancel: [writes("act")] })).toStrictEqual(["What happens when Review is cancelled"]);
  });

  it("onPath names the way out the way the step page does", () => {
    const path = { id: "path_a", key: "a", label: "Approve", to: "step_b", trigger: "manual", onPath: [writes("act")] };

    expect(writtenBy({ paths: [path] })).toStrictEqual(["What happens on Review's way out Approve → Book"]);
  });

  it("onFire", () => {
    const timer = { id: "timer_a", duration: "PT1H", onFire: { actions: [writes("act")] } };

    expect(writtenBy({ timers: [timer] })).toStrictEqual(["What happens when the time limit on Review runs out"]);
  });

  it("outputMapping reads the called process's words", () => {
    const subprocess = {
      processId: "proc_child",
      versionBinding: "pinned",
      pinnedVersion: 1,
      inputMapping: {},
      outputMapping: { fld_status: cel("child.data.status") },
    };

    expect(writtenBy({ type: "subprocess", subprocess })).toStrictEqual(["Values copied back from the called process on Review"]);
  });
});

describe("removalNames drops repeats", () => {
  it("names a place once where two rules on it read the field", () => {
    const draft = draftOf({
      fields: [leaf("fld_amount", "Amount")],
      ...stepsOf(
        step("step_a", "Review", {
          paths: [
            guarded("path_a", "Approve", "step_b", "data.amount > 1.0"),
            { ...guarded("path_b", "Approve", "step_b", "data.amount < 0.0"), priority: 2 },
          ],
          onEntry: [writes("act_1", "fld_amount"), writes("act_2", "fld_amount")],
        }),
        step("step_b", "Book"),
      ),
    });

    const rows = rowsOf(draft, "fld_amount");

    expect(rows["Read by"]).toStrictEqual(["On Review: way out Approve → Book"]);
    expect(rows["Written by"]).toStrictEqual(["What happens when Review is entered"]);
  });

  it("keeps two fields inside a group that share a label as two lines", () => {
    const draft = draftOf({
      fields: [
        {
          id: id("fld_group"),
          key: "grp",
          label: { en: "Group" },
          type: "group",
          fields: [leaf("fld_a", "Amount"), leaf("fld_b", "Amount"), leaf("fld_c", ""), leaf("fld_d", "")],
        },
      ],
    });

    expect(rowsOf(draft, "fld_group")["Fields inside it"]).toStrictEqual(["Amount", "Amount (2)", "(unnamed field)", "(unnamed field) (2)"]);
  });

  it("keeps two staying fields that share a label as two lines", () => {
    const draft = draftOf({
      fields: [
        leaf("fld_name", "Name"),
        leaf("fld_one", "Person", { columnMapping: { a: id("fld_name") } }),
        leaf("fld_two", "Person", { columnMapping: { a: id("fld_name") } }),
      ],
    });

    expect(rowsOf(draft, "fld_name")["Filled in from"]).toStrictEqual(["Person", "Person (2)"]);
  });

  it("names a staying field once however many of its mappings target the removed field", () => {
    const draft = draftOf({
      fields: [leaf("fld_name", "Name"), leaf("fld_person", "Person", { columnMapping: { a: id("fld_name"), b: id("fld_name") } })],
    });

    expect(rowsOf(draft, "fld_name")["Filled in from"]).toStrictEqual(["Person"]);
  });
});

describe("readByPlaces", () => {
  it("answers the place words of each path and falls to the other-rule words for a path that does not resolve", () => {
    const draft = draftOf({
      fields: [leaf("fld_amount", "Amount", { default: cel("data.amount") })],
      ...stepsOf(step("step_a", "Review", { timers: [{ id: "timer_a", deadline: cel("data.amount"), onFire: {} }] })),
    });

    expect(readByPlaces(draft, [["fields", 0, "default"], ["workflow", "steps", 0, "timers", 0, "deadline"], ["workflow", "steps", 9, "x"]], "en")).toStrictEqual([
      "The default value of Amount",
      "The time limit on Review",
      "Another rule in this process",
    ]);
  });
});

/** An example file wraps its body under `definition`. */
function loadExample(name: string): Draft {
  const raw = JSON.parse(readFileSync(new URL(`../../../examples/${name}`, import.meta.url), "utf-8"));
  return (raw.definition ?? raw) as Draft;
}

function idByLabel(draft: Draft, label: string): string {
  const field = draftFields(draft).find((f) => f.label?.en === label);
  if (field?.id === undefined) throw new Error(`no field labelled "${label}"`);
  return field.id;
}

describe("removalNames over the shipped examples", () => {
  it("names the reach the delta spec states for Booking Status in Expense Approval", () => {
    const draft = loadExample("expense-approval.json");

    const rows = rowsOf(draft, idByLabel(draft, "Booking Status"));

    expect(Object.keys(rows)).toStrictEqual(["Asked on", "Written by", "Part of", "Read by"]);
    expect(rows["Asked on"]).toHaveLength(2);
    expect(rows["Written by"]).toHaveLength(1);
    expect(rows["Part of"]).toHaveLength(1);
    expect(rows["Read by"]).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain("data.");
  });

  it("names the 18 fields inside and the 10 steps for the group Processing (Fabrikam) in IT Offboarding", () => {
    const draft = loadExample("it-offboarding.json");

    const rows = rowsOf(draft, idByLabel(draft, "Processing (Fabrikam)"));

    expect(Object.keys(rows)).toStrictEqual(["Fields inside it", "Asked on"]);
    expect(rows["Fields inside it"]).toHaveLength(18);
    expect(rows["Asked on"]).toHaveLength(10);
  });
});
