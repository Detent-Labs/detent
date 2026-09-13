import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  action,
  dataSourceDef,
  fieldDef,
  fieldOption,
  fieldValidation,
  path,
  plugin,
  processBody,
  processContract,
  retryPolicy,
  step,
  subprocessSpec,
  timer,
  timerAction,
  type ProcessBody,
  view,
  viewField,
  viewNote,
  viewTab,
  workflow,
} from "workflow-engine/schema";
import { compileProcessBody } from "workflow-engine/schema/compile";
import { stripCompiledContent } from "workflow-engine/schema/strip-compiled";
import {
  CHANGE_GROUPS,
  OWNED_LISTS,
  PROPERTY_WORDS,
  describeChanges,
  type ChangeRow,
} from "../src/areas/studio/draft/changeSet.js";
import { t } from "../src/areas/studio/catalog.js";

// Fixtures are plain JSON, mutated per case. `any` keeps the mutations short;
// `describeChanges` takes `unknown` on both sides.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

function base(): Body {
  return {
    key: "offboarding",
    label: { en: "Offboarding", de: "Austritt" },
    baseLocale: "en",
    fields: [
      {
        id: "field_details",
        key: "details",
        label: { en: "Details" },
        type: "group",
        fields: [
          { id: "field_name", key: "name", label: { en: "Name", de: "Name" }, type: "string" },
          { id: "field_email", key: "email", label: { en: "Email" }, type: "string", format: "email" },
        ],
      },
      {
        id: "field_backup",
        key: "backup",
        label: { en: "Backup" },
        type: "group",
        fields: [
          {
            id: "field_forwarding",
            key: "forwarding",
            label: { en: "Forwarding address", de: "Weiterleitungsadresse" },
            type: "string",
            format: "email",
          },
        ],
      },
      {
        id: "field_category",
        key: "category",
        label: { en: "Category" },
        type: "string",
        control: "radio",
        options: [
          { value: "employee", label: { en: "Employee" } },
          { value: "consultant", label: { en: "Consultant" } },
        ],
      },
    ],
    dataSources: [{ id: "ds_people", key: "people", type: "directory.people", config: { scope: "all" } }],
    allowedGroups: ["grp_it"],
    contract: { inputFields: ["field_name"], outputFields: ["field_email"], outcomes: ["done"] },
    workflow: {
      initialStep: "step_submit",
      steps: [
        {
          id: "step_submit",
          key: "submit",
          label: { en: "Submit" },
          type: "task",
          assignment: { strategy: { type: "org.group-members", config: { groupId: "grp_it" } } },
          onEntry: [{ id: "action_notify", type: "notification.email", config: { to: "it" } }],
          timers: [
            {
              id: "timer_remind",
              duration: "P3D",
              onFire: { actions: [{ id: "action_remind", type: "notification.email", config: {} }] },
            },
          ],
          view: {
            fields: [
              { ref: "field_name", required: true },
              { ref: "field_email" },
              { kind: "note", text: { en: "Check the details." } },
              { ref: "field_forwarding", required: false },
            ],
          },
          paths: [
            {
              id: "path_send",
              key: "send",
              label: "Send",
              to: "step_review",
              trigger: "manual",
              onPath: [{ id: "action_log", type: "audit.log", config: {} }],
            },
          ],
        },
        {
          id: "step_review",
          key: "review",
          label: { en: "Review" },
          type: "task",
          paths: [
            { id: "path_approve", key: "approve", label: "Approve", to: "step_done", trigger: "manual" },
            { id: "path_reject", key: "reject", label: "Reject", to: "step_done", trigger: "manual" },
          ],
        },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true, outcome: "done" },
      ],
    },
  };
}

/** A body holding one step and the fields a case hands in. */
function minimal(steps: Body[], fields: Body[] = []): Body {
  return {
    key: "minimal",
    label: { en: "Minimal" },
    baseLocale: "en",
    fields,
    workflow: { initialStep: steps[0]?.id ?? "step_a", steps },
  };
}

const keys = (rows: ChangeRow[]) => rows.map((r) => r.key);
const names = (row: ChangeRow | undefined) => (row?.properties ?? []).map((p) => p.name);
const only = (rows: ChangeRow[]): ChangeRow => {
  expect(rows).toHaveLength(1);
  return rows[0]!;
};
const none = { text: "none", mono: false };

function example(file: string): ProcessBody {
  const raw = JSON.parse(readFileSync(new URL(`../../../examples/${file}`, import.meta.url), "utf-8"));
  return (raw.definition ?? raw) as ProcessBody;
}

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverseKeys(v)]));
}

describe("describeChanges: anchors", () => {
  it("pairs a field at any depth by id", () => {
    const after = base();
    after.fields[0].fields[0].label.en = "Full name";

    const row = only(describeChanges(base(), after));

    expect(row).toMatchObject({ key: "fields:field_name", group: "fields", kind: "changed", label: "Full name", entityKey: "name" });
    expect(names(row)).toEqual(["Label"]);
  });

  it("reads one added field in a catalog of 51 fields as one added row", () => {
    const before = example("it-offboarding.json") as Body;
    const after = structuredClone(before);
    after.fields[0].fields.push({ id: "field_new", key: "new_field", label: { en: "New field" }, type: "string" });

    const row = only(describeChanges(before, after));

    expect(row).toMatchObject({ key: "fields:field_new", kind: "added", label: "New field" });
  });

  it("pairs a data source by id and names it by its key", () => {
    const after = base();
    after.dataSources[0].config.scope = "staff";

    const row = only(describeChanges(base(), after));

    expect(row).toMatchObject({ key: "dataSources:ds_people", group: "dataSources", kind: "changed", label: "people" });
    expect(row.entityKey).toBeUndefined();
    expect(names(row)).toEqual(["Config"]);
  });

  it("pairs a step by id", () => {
    const after = base();
    after.workflow.steps[1].label.en = "Check";

    const row = only(describeChanges(base(), after));

    expect(row).toMatchObject({ key: "steps:step_review", group: "steps", label: "Check", entityKey: "review" });
    expect(names(row)).toEqual(["Label"]);
  });

  it("pairs a path by id and names the step it leaves", () => {
    const after = base();
    after.workflow.steps[1].paths[0].label = "Accept";

    const row = only(describeChanges(base(), after));

    expect(row).toMatchObject({ key: "paths:path_approve", group: "paths", label: "Accept", entityKey: "approve", context: "Review" });
    expect(names(row)).toEqual(["Label"]);
  });

  it("pairs a path across every step, so a path moved to another step stays one row", () => {
    const after = base();
    const moved = after.workflow.steps[1].paths.splice(1, 1)[0];
    after.workflow.steps[0].paths.push(moved);

    const row = only(describeChanges(base(), after));

    expect(row).toMatchObject({ key: "paths:path_reject", kind: "changed", context: "Submit" });
    expect(row.properties).toEqual([
      { name: "From", kind: "changed", before: { text: "Review", mono: false }, after: { text: "Submit", mono: false } },
    ]);
  });

  it("pairs a step's actions by id, one property each, named by position and type", () => {
    const after = base();
    after.workflow.steps[0].onEntry[0].config.to = "hr";

    const row = only(describeChanges(base(), after));

    expect(row.key).toBe("steps:step_submit");
    expect(names(row)).toEqual(["On entry · notification.email"]);
  });

  it("pairs a path's actions by id", () => {
    const after = base();
    after.workflow.steps[0].paths[0].onPath[0].type = "audit.write";

    const row = only(describeChanges(base(), after));

    expect(row.key).toBe("paths:path_send");
    expect(names(row)).toEqual(["On path · audit.write"]);
  });

  it("pairs a timer by id and its fire actions by id", () => {
    const after = base();
    after.workflow.steps[0].timers[0].onFire.actions[0].config = { template: "reminder" };

    const row = only(describeChanges(base(), after));

    expect(row.key).toBe("steps:step_submit");
    expect(names(row)).toEqual(["On fire · notification.email"]);
  });

  it("pairs a form's field entries by ref", () => {
    const after = base();
    after.workflow.steps[0].view.fields[0].required = false;

    const row = only(describeChanges(base(), after));

    expect(row).toMatchObject({ key: "forms:step_submit", group: "forms", kind: "changed", label: "Submit", entityKey: "submit" });
    expect(names(row)).toEqual(["Name · Required"]);
  });

  it("pairs a form's notes by their position among the notes", () => {
    const edited = base();
    edited.workflow.steps[0].view.fields[2].text.en = "Check every detail.";
    expect(names(only(describeChanges(base(), edited)))).toEqual(["Note 1"]);

    const appended = base();
    appended.workflow.steps[0].view.fields.push({ kind: "note", text: { en: "Sign below." } });
    const row = only(describeChanges(base(), appended));
    expect(row.properties).toEqual([
      { name: "Note 2", kind: "added", before: none, after: { text: "Sign below.", mono: false } },
    ]);
  });

  it("pairs a form's tabs by key", () => {
    const before = base();
    before.workflow.steps[0].view.tabs = [
      { key: "who", label: { en: "Who" } },
      { key: "what", label: { en: "What" } },
    ];
    const after = structuredClone(before);
    after.workflow.steps[0].view.tabs[1].label.en = "Details";

    expect(names(only(describeChanges(before, after)))).toEqual(["Tab what"]);
  });

  it("pairs a field's options by value", () => {
    const relabeled = base();
    relabeled.fields[2].options[1].label.en = "Contractor";
    const row = only(describeChanges(base(), relabeled));
    expect(row.key).toBe("fields:field_category");
    expect(names(row)).toEqual(["Option consultant"]);

    const added = base();
    added.fields[2].options.push({ value: "trainee", label: { en: "Trainee" } });
    expect(only(describeChanges(base(), added)).properties).toMatchObject([{ name: "Option trainee", kind: "added" }]);
  });

  it("pairs allowed groups and the contract's lists by the member itself", () => {
    const groups = base();
    groups.allowedGroups.push("grp_hr");
    const processRow = only(describeChanges(base(), groups));
    expect(processRow).toMatchObject({ key: "process:process", group: "process" });
    expect(processRow.properties).toMatchObject([{ name: "Allowed groups", kind: "added" }]);

    const contract = base();
    contract.contract.inputFields.push("field_email");
    contract.contract.outcomes = [];
    const contractRow = only(describeChanges(base(), contract));
    expect(contractRow).toMatchObject({ key: "contract:contract", group: "contract", kind: "changed", label: "Contract" });
    expect(contractRow.properties).toMatchObject([
      { name: "Input fields", kind: "added" },
      { name: "Outcomes", kind: "removed" },
    ]);
  });
});

describe("describeChanges: row ownership", () => {
  it("brings an added step's paths and its form along as added rows", () => {
    const after = base();
    after.workflow.steps.push({
      id: "step_archive",
      key: "archive",
      label: { en: "Archive" },
      type: "task",
      view: { fields: [{ ref: "field_name" }] },
      paths: [
        { id: "path_keep", key: "keep", label: "Keep", to: "step_done", trigger: "manual" },
        { id: "path_purge", key: "purge", label: "Purge", to: "step_done", trigger: "manual" },
      ],
    });

    const rows = describeChanges(base(), after);

    expect(keys(rows)).toEqual(["steps:step_archive", "paths:path_keep", "paths:path_purge", "forms:step_archive"]);
    expect(rows.every((r) => r.kind === "added")).toBe(true);
    expect(rows[3]!.properties).toEqual([
      { name: "Name", kind: "added", after: { text: "Added to the form", mono: false } },
    ]);
  });

  it("brings a removed step's paths and its form along as removed rows", () => {
    const after = base();
    after.workflow.steps.splice(0, 1);

    const rows = describeChanges(base(), after);

    expect(keys(rows)).toEqual(["steps:step_submit", "paths:path_send", "forms:step_submit"]);
    expect(rows.every((r) => r.kind === "removed")).toBe(true);
  });

  it("stands rows in group order", () => {
    const after = base();
    after.label.en = "Exit";
    after.fields[0].fields[1].label.en = "Mail";
    after.dataSources[0].type = "directory.staff";
    after.workflow.steps[2].label.en = "Closed";
    after.workflow.steps[0].paths[0].label = "Dispatch";
    after.workflow.steps[0].view.fields[1].required = true;
    after.contract.outcomes.push("withdrawn");

    const rows = describeChanges(base(), after);

    expect(keys(rows)).toEqual([
      "process:process",
      "fields:field_email",
      "dataSources:ds_people",
      "steps:step_done",
      "paths:path_send",
      "forms:step_submit",
      "contract:contract",
    ]);
    expect(rows.map((r) => r.group)).toEqual([...CHANGE_GROUPS]);
  });

  it("folds a field's type, format and control into one Kind property", () => {
    const after = base();
    delete after.fields[0].fields[1].format;

    const row = only(describeChanges(base(), after));

    expect(row.key).toBe("fields:field_email");
    expect(row.properties).toEqual([
      { name: "Kind", kind: "changed", before: { text: "Email address", mono: false }, after: { text: "Text", mono: false } },
    ]);
  });

  it("gives the Process row the initial step", () => {
    const after = base();
    after.workflow.initialStep = "step_review";

    const row = only(describeChanges(base(), after));

    expect(row.key).toBe("process:process");
    expect(names(row)).toEqual(["Initial step"]);
  });

  it("lists a changed row's full JSON paths for the Developer view", () => {
    const after = base();
    after.fields[0].fields[0].label.en = "Full name";

    expect(only(describeChanges(base(), after)).raw).toEqual([
      { path: "fields[0].fields[0].label.en", kind: "changed", from: "Name", to: "Full name" },
    ]);
  });
});

describe("describeChanges: order", () => {
  it("reads two swapped form entries as the lone Form order property", () => {
    const after = base();
    const entries = after.workflow.steps[0].view.fields;
    [entries[0], entries[1]] = [entries[1], entries[0]];

    const row = only(describeChanges(base(), after));

    expect(row.key).toBe("forms:step_submit");
    expect(row.properties).toEqual([{ name: "Form order", kind: "order", after: { text: "Reordered", mono: false } }]);
  });

  it("reads reordered steps as one Step order property on the Process row, with no row for a moved step", () => {
    const after = base();
    after.workflow.steps.reverse();

    const row = only(describeChanges(base(), after));

    expect(row.key).toBe("process:process");
    expect(names(row)).toEqual(["Step order"]);
    expect(row.raw).toEqual([
      {
        path: "workflow.steps",
        kind: "changed",
        from: ["step_submit", "step_review", "step_done"],
        to: ["step_done", "step_review", "step_submit"],
      },
    ]);
  });

  it("keeps a field moved into another group as one row, with a Group property and no order property", () => {
    const after = base();
    const email = after.fields[0].fields.splice(1, 1)[0];
    after.fields[1].fields.push(email);

    const row = only(describeChanges(base(), after));

    expect(row).toMatchObject({ key: "fields:field_email", kind: "changed" });
    expect(row.properties).toEqual([
      { name: "Group", kind: "changed", before: { text: "Details", mono: false }, after: { text: "Backup", mono: false } },
    ]);
    expect(row.raw.some((e) => e.path.includes("fields[0].fields[1]") && e.path.includes("fields[1].fields[1]"))).toBe(true);
  });

  it("reads a field moved out of every group as a Group of none", () => {
    const after = base();
    const email = after.fields[0].fields.splice(1, 1)[0];
    after.fields.push(email);

    expect(only(describeChanges(base(), after)).properties).toEqual([
      { name: "Group", kind: "changed", before: { text: "Details", mono: false }, after: none },
    ]);
  });

  it("names each list's order property on the row owning the list", () => {
    const paths = base();
    paths.workflow.steps[1].paths.reverse();
    expect(names(only(describeChanges(base(), paths)))).toEqual(["Path order"]);

    const children = base();
    children.fields[0].fields.reverse();
    const group = only(describeChanges(base(), children));
    expect(group.key).toBe("fields:field_details");
    expect(names(group)).toEqual(["Field order"]);

    const options = base();
    options.fields[2].options.reverse();
    expect(names(only(describeChanges(base(), options)))).toEqual(["Option order"]);

    const tabs = base();
    tabs.workflow.steps[0].view.tabs = [
      { key: "who", label: { en: "Who" } },
      { key: "what", label: { en: "What" } },
    ];
    const swapped = structuredClone(tabs);
    swapped.workflow.steps[0].view.tabs.reverse();
    expect(names(only(describeChanges(tabs, swapped)))).toEqual(["Tab order"]);
  });
});

describe("describeChanges: values", () => {
  it("reads a label in the content locale", () => {
    const after = base();
    after.fields[1].fields[0].label.de = "Anschrift";

    const row = only(describeChanges(base(), after, "de"));

    expect(row.label).toBe("Anschrift");
    expect(row.properties).toEqual([
      {
        name: "Label",
        kind: "changed",
        before: { text: "Weiterleitungsadresse", mono: false },
        after: { text: "Anschrift", mono: false },
      },
    ]);
  });

  it("names a difference in another locale with that locale", () => {
    const after = base();
    after.fields[1].fields[0].label.de = "Anschrift";

    expect(only(describeChanges(base(), after)).properties).toEqual([
      {
        name: "Label (de)",
        kind: "changed",
        before: { text: "Weiterleitungsadresse", mono: false },
        after: { text: "Anschrift", mono: false },
      },
    ]);
  });

  it("prints a base-locale change once when neither side has a content-locale entry", () => {
    const after = base();
    after.fields[0].fields[1].label.en = "Mail";

    expect(only(describeChanges(base(), after, "de")).properties).toEqual([
      { name: "Label", kind: "changed", before: { text: "Email", mono: false }, after: { text: "Mail", mono: false } },
    ]);
  });

  it("reads a translation added or removed in the content locale as one property", () => {
    const translated = base();
    translated.fields[0].fields[1].label.de = "E-Mail";

    expect(only(describeChanges(base(), translated, "de")).properties).toEqual([
      { name: "Label", kind: "changed", before: { text: "Email", mono: false }, after: { text: "E-Mail", mono: false } },
    ]);
    expect(only(describeChanges(translated, base(), "de")).properties).toEqual([
      { name: "Label", kind: "changed", before: { text: "E-Mail", mono: false }, after: { text: "Email", mono: false } },
    ]);
  });

  it("still names a base-locale change the content locale does not read", () => {
    const after = base();
    after.fields[1].fields[0].label.en = "Forward to";

    expect(only(describeChanges(base(), after, "de")).properties).toEqual([
      {
        name: "Label (en)",
        kind: "changed",
        before: { text: "Forwarding address", mono: false },
        after: { text: "Forward to", mono: false },
      },
    ]);
  });

  it("names a content-locale translation added with the text the label already fell back to", () => {
    const untranslated = base();
    delete untranslated.fields[0].fields[0].label.de;

    expect(only(describeChanges(untranslated, base(), "de")).properties).toEqual([
      { name: "Label (de)", kind: "added", before: none, after: { text: "Name", mono: false } },
    ]);
  });

  it("names a content-locale translation removed that matched the text the label falls back to", () => {
    const untranslated = base();
    delete untranslated.fields[0].fields[0].label.de;

    expect(only(describeChanges(base(), untranslated, "de")).properties).toEqual([
      { name: "Label (de)", kind: "removed", before: { text: "Name", mono: false }, after: none },
    ]);
  });

  it("names a difference in a locale entry that holds no text", () => {
    const before = minimal([], [{ id: "field_a", key: "a", label: { en: 5 }, type: "string" }]);
    const after = structuredClone(before);
    after.fields[0].label.en = 6;

    expect(only(describeChanges(before, after)).properties).toEqual([
      { name: "Label (en)", kind: "changed", before: { text: "5", mono: true }, after: { text: "6", mono: true } },
    ]);
  });

  it("reads a yes-or-no value as yes or no, and an absent value as none", () => {
    const required = base();
    required.workflow.steps[0].view.fields[0].required = false;
    expect(only(describeChanges(base(), required)).properties).toEqual([
      { name: "Name · Required", kind: "changed", before: { text: "yes", mono: false }, after: { text: "no", mono: false } },
    ]);

    const technical = base();
    technical.fields[2].technical = true;
    expect(only(describeChanges(base(), technical)).properties).toEqual([
      { name: "Technical", kind: "added", before: none, after: { text: "yes", mono: false } },
    ]);
  });

  it("reads a reference as the label of the entity it names, on its own side", () => {
    const initial = base();
    initial.workflow.initialStep = "step_review";
    expect(only(describeChanges(base(), initial)).properties).toEqual([
      { name: "Initial step", kind: "changed", before: { text: "Submit", mono: false }, after: { text: "Review", mono: false } },
    ]);

    const ghost = base();
    ghost.workflow.steps[0].paths[0].to = "step_ghost";
    expect(only(describeChanges(base(), ghost)).properties).toEqual([
      { name: "Target", kind: "changed", before: { text: "Review", mono: false }, after: { text: "step_ghost", mono: true } },
    ]);
  });

  it("reads a CEL expression as its source text, in mono", () => {
    const after = base();
    after.workflow.steps[1].paths[0].guard = { lang: "cel", src: "data.amount > 10" };

    expect(only(describeChanges(base(), after)).properties).toEqual([
      { name: "Guard", kind: "added", before: none, after: { text: "data.amount > 10", mono: true } },
    ]);
  });

  it("reads a key with no word under its JSON key, with its value as JSON", () => {
    const after = base();
    after.workflow.steps[1].color = "blue";

    const row = only(describeChanges(base(), after));

    expect(row.key).toBe("steps:step_review");
    expect(row.properties).toEqual([
      { name: "color", nameMono: true, kind: "added", before: none, after: { text: '"blue"', mono: true } },
    ]);
  });

  it("reads a step turned into an end as its Kind", () => {
    const before = minimal([{ id: "step_a", key: "a", label: { en: "A" }, type: "task" }]);
    const after = structuredClone(before);
    after.workflow.steps[0].terminal = true;

    expect(only(describeChanges(before, after)).properties).toEqual([
      {
        name: "Kind",
        kind: "changed",
        before: { text: "A step someone works", mono: false },
        after: { text: "An end", mono: false },
      },
    ]);
  });

  it("reads an assignment through its strategy's plain name", () => {
    const after = base();
    after.workflow.steps[0].assignment = { strategy: { type: "static", config: { candidates: ["ada"] } } };

    expect(only(describeChanges(base(), after)).properties).toEqual([
      {
        name: "Assignment",
        kind: "changed",
        before: { text: "Everyone in a group", mono: false },
        after: { text: "A fixed list of people", mono: false },
      },
    ]);
  });

  it("reads an assignment whose config alone changed through its differing config entries", () => {
    const after = base();
    after.workflow.steps[0].assignment.strategy.config.groupId = "grp_hr";

    expect(only(describeChanges(base(), after)).properties).toEqual([
      { name: "groupId", nameMono: true, kind: "changed", before: { text: "grp_it", mono: true }, after: { text: "grp_hr", mono: true } },
    ]);
  });

  it("reads a timer whose duration alone changed as a time limit", () => {
    const weeks = base();
    weeks.workflow.steps[0].timers[0].duration = "P2W";
    expect(only(describeChanges(base(), weeks)).properties).toEqual([
      { name: "Timer 1", kind: "changed", before: { text: "3 days", mono: false }, after: { text: "2 weeks", mono: false } },
    ]);

    const written = base();
    written.workflow.steps[0].timers[0].duration = "P1DT4H30M";
    expect(only(describeChanges(base(), written)).properties[0]!.after).toEqual({ text: "P1DT4H30M", mono: true });
  });

  it("reads a subprocess step's version binding in plain words, and each mapping entry under the id its record keys by", () => {
    const spec = { processId: "proc_child", versionBinding: "pinned", pinnedVersion: 2, inputMapping: {}, outputMapping: {} };
    const before = minimal(
      [{ id: "step_call", key: "call", label: { en: "Call" }, type: "subprocess", subprocess: spec, paths: [] }],
      [{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
    );
    const after = structuredClone(before);
    // `inputMapping` keys by the child contract's field ids, which the parent
    // declares none of; `outputMapping` keys by the parent's own fields.
    after.workflow.steps[0].subprocess = {
      processId: "proc_child",
      versionBinding: "latest-at-spawn",
      contractRef: "sig_1",
      inputMapping: { field_child_total: { lang: "cel", src: "data.amount" } },
      outputMapping: { field_amount: { lang: "cel", src: "child.data.total" } },
    };

    const row = only(describeChanges(before, after));

    expect(row.properties.find((p) => p.name === "Subprocess · Version binding")).toEqual({
      name: "Subprocess · Version binding",
      kind: "changed",
      before: { text: t("subprocess.bindingPinned"), mono: false },
      after: { text: t("subprocess.bindingLatest"), mono: false },
    });
    expect(row.properties.find((p) => p.name === "Input mapping · field_child_total")).toEqual({
      name: "Input mapping · field_child_total",
      nameMono: true,
      kind: "added",
      before: none,
      after: { text: "data.amount", mono: true },
    });
    expect(row.properties.find((p) => p.name === "Output mapping · Amount")).toEqual({
      name: "Output mapping · Amount",
      kind: "added",
      before: none,
      after: { text: "child.data.total", mono: true },
    });
  });

  it("finds no row naming the cancel sink between two stripped compiled bodies", () => {
    const body = example("subprocess-credit-check-child.json");
    const relabeled = { ...body, label: { en: "Credit review" } };

    const rows = describeChanges(
      stripCompiledContent(compileProcessBody(body)),
      stripCompiledContent(compileProcessBody(relabeled)),
    );

    expect(keys(rows)).toEqual(["process:process"]);
    expect(names(rows[0])).toEqual(["Label"]);
    expect(JSON.stringify(rows)).not.toContain("cancel_sink");
    expect(JSON.stringify(rows)).not.toContain("cancelled");
  });

  it("finds no row for a seeded draft, whatever its key order, and one row for a real change", () => {
    const compiled = compileProcessBody(example("it-offboarding.json"));
    const seeded = reverseKeys(stripCompiledContent(compiled)) as Body;

    expect(describeChanges(stripCompiledContent(compiled), seeded)).toEqual([]);

    seeded.fields[0].fields[0].label.en = "Name";
    expect(keys(describeChanges(stripCompiledContent(compiled), seeded))).toHaveLength(1);
  });
});

describe("describeChanges: totality", () => {
  it("anchors a member with no id at its own JSON path", () => {
    const before = minimal([], [{ key: "a", label: { en: "A" }, type: "string" }]);
    const relabeled = structuredClone(before);
    relabeled.fields[0].label.en = "B";
    const row = only(describeChanges(before, relabeled));
    expect(row.key).toBe("fields:#fields[0]");
    expect(names(row)).toEqual(["Label"]);

    const shifted = structuredClone(before);
    shifted.fields.unshift({ id: "field_new", key: "new", label: { en: "New" }, type: "string" });
    const rows = describeChanges(before, shifted);
    expect(rows.map((r) => `${r.key} ${r.kind}`).sort()).toEqual([
      "fields:#fields[0] removed",
      "fields:#fields[1] added",
      "fields:field_new added",
    ]);
  });

  it("pairs a duplicate anchor with the same occurrence on the other side", () => {
    const fields = minimal([], [
      { id: "field_dup", key: "a", label: { en: "A" }, type: "string" },
      { id: "field_dup", key: "b", label: { en: "B" }, type: "string" },
    ]);
    const relabeled = structuredClone(fields);
    relabeled.fields[1].label.en = "C";
    const fieldRow = only(describeChanges(fields, relabeled));
    expect(fieldRow.key).toBe("fields:field_dup#2");
    expect(fieldRow.properties).toEqual([
      { name: "Label", kind: "changed", before: { text: "B", mono: false }, after: { text: "C", mono: false } },
    ]);

    const paths = minimal([
      { id: "step_one", key: "one", label: { en: "One" }, type: "task", paths: [{ id: "path_dup", key: "p", label: "First", to: "step_two", trigger: "manual" }] },
      { id: "step_two", key: "two", label: { en: "Two" }, type: "task", paths: [{ id: "path_dup", key: "p", label: "Second", to: "step_one", trigger: "manual" }] },
    ]);
    const relabeledPath = structuredClone(paths);
    relabeledPath.workflow.steps[1].paths[0].label = "Third";
    expect(only(describeChanges(paths, relabeledPath))).toMatchObject({ key: "paths:path_dup#2", context: "Two" });
  });

  it("reads a list that is no array as JSON on the Process row, and throws nothing", () => {
    const after = base();
    after.workflow.steps = "oops";

    let rows: ChangeRow[] = [];
    expect(() => {
      rows = describeChanges(base(), after);
    }).not.toThrow();

    const processRow = rows.find((r) => r.key === "process:process");
    expect(processRow?.properties.find((p) => p.name === "workflow.steps")).toEqual({
      name: "workflow.steps",
      nameMono: true,
      kind: "added",
      before: none,
      after: { text: '"oops"', mono: true },
    });
  });

  it("reads a body with no workflow, and a string for a whole body, without throwing", () => {
    const noWorkflow = base();
    delete noWorkflow.workflow;
    let rows: ChangeRow[] = [];
    expect(() => {
      rows = describeChanges(base(), noWorkflow);
    }).not.toThrow();
    expect(names(rows.find((r) => r.key === "process:process"))).toContain("Initial step");

    expect(() => {
      rows = describeChanges("draft", base());
    }).not.toThrow();
    expect(keys(rows)).toEqual(["process:process"]);
  });

  it("reads every unexpected shape below the top level as JSON on the Process row", () => {
    const after = base();
    after.fields.push(42);
    after.fields[0].fields = "none";
    after.fields[2].options = {};
    after.fields[1].label = "Backup";
    after.dataSources = "x";
    after.allowedGroups = 7;
    after.contract = "c";
    after.workflow.steps[0].onEntry = {};
    after.workflow.steps[0].timers = "t";
    after.workflow.steps[0].view = [];
    after.workflow.steps[1].paths = null;

    let rows: ChangeRow[] = [];
    expect(() => {
      rows = describeChanges(base(), after);
    }).not.toThrow();

    expect(names(rows.find((r) => r.key === "process:process"))).toEqual(
      expect.arrayContaining([
        "fields[3]",
        "fields[0].fields",
        "fields[2].options",
        "dataSources",
        "allowedGroups",
        "contract",
        "workflow.steps[0].onEntry",
        "workflow.steps[0].timers",
        "workflow.steps[0].view",
        "workflow.steps[1].paths",
      ]),
    );
  });
});

describe("describeChanges: word coverage", () => {
  // The Zod shapes the engine exports. A record such as `plugin.config` is one
  // value, so the walk reads each object's own declared keys and never a
  // record's keys.
  const shapes = {
    processBody,
    workflow,
    step,
    path,
    timer,
    timerAction,
    action,
    retryPolicy,
    plugin,
    dataSourceDef,
    subprocessSpec,
    viewField,
    viewNote,
    view,
    viewTab,
    processContract,
    fieldDef,
    fieldOption,
    fieldValidation,
  };

  /** `fieldDef` is a `z.lazy`; its getter hands back the object schema. Zod 4
   * keeps `.shape` on a refined object, so no other unwrap is needed. */
  function declaredKeys(schema: unknown): string[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let s: any = schema;
    while (s?._zod?.def?.type === "lazy") s = s._zod.def.getter();
    return Object.keys(s?.shape ?? {});
  }

  it("has a word or an owning list for every declared key", () => {
    const missing: string[] = [];
    for (const [name, schema] of Object.entries(shapes)) {
      const declared = declaredKeys(schema);
      expect(declared.length).toBeGreaterThan(0);
      for (const key of declared) {
        const word = PROPERTY_WORDS[key];
        if (word !== undefined) expect(t(word).length).toBeGreaterThan(0);
        else if (!OWNED_LISTS[name]?.includes(key)) missing.push(`${name}.${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
