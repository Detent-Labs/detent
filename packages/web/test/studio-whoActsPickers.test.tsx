import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AddFieldEditor,
  AddPersonField,
  FixedListEditor,
  GroupPickerBody,
  PersonFieldPicker,
} from "../src/areas/studio/panels/WhoActsPickers.js";
import { canAddField, groupPickerState, mintPersonField, personPickerState } from "../src/areas/studio/panels/whoActsLogic.js";
import { PluginEnvelopeEditor } from "../src/areas/studio/panels/shared/PluginEnvelopeEditor.js";
import { addPersonField, pickGroup, pickPersonField } from "../src/areas/studio/draft/assignmentWrites.js";
import type { AssignableGroups } from "../src/areas/studio/panels/shared/useAssignableGroups.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/** `studio-step-page`: the controls a process author meets under Who acts. */

const noop = () => {};
const LIST_CAPTION = "People or roles, one per line";
const NOT_A_LIST = "Enter one value per line.";

describe("FixedListEditor", () => {
  const markup = (config: Record<string, unknown>) => renderToStaticMarkup(<FixedListEditor config={config} onChange={noop} />);

  it("reads the caption and prints no config key", () => {
    const html = markup({ candidates: ["alice"] });
    expect(html).toContain(LIST_CAPTION);
    expect(html).toContain("alice");
    expect(html).not.toContain("candidates");
  });

  it("stands the caption as the label above the control, printed once", () => {
    const html = markup({ candidates: ["alice"] });
    expect(html.split(LIST_CAPTION)).toHaveLength(2);
    expect(html).toContain(`>${LIST_CAPTION}</label>`);
    expect(html.indexOf("</label>")).toBeLessThan(html.indexOf("<textarea"));
  });

  it("repeats no legend and adds no second hint", () => {
    const html = markup({ candidates: ["alice"] });
    expect(html).not.toContain("Who can act on this step");
    expect(html).not.toContain("<small");
  });

  it("names the label as the control's description", () => {
    const html = markup({ candidates: ["alice"] });
    const labelId = new RegExp(`<label id="([^"]+)"[^>]*>${LIST_CAPTION}</label>`).exec(html)?.[1];
    expect(labelId).toBeDefined();
    expect(/aria-describedby="([^"]+)"/.exec(html)?.[1]).toBe(labelId!);
  });

  it("shows the wrong-kind error beside the control", () => {
    const html = markup({ candidates: "alice" });
    expect(html).toContain(`class="error">${NOT_A_LIST}</span>`);
    expect(html.indexOf("</label>")).toBeLessThan(html.indexOf(NOT_A_LIST));
    expect(html.indexOf(NOT_A_LIST)).toBeLessThan(html.indexOf("<textarea"));
  });

  it("names the key only in Edit as JSON's text", () => {
    const value = { type: "static", config: { candidates: ["alice"] } };
    const editors = { static: (config: Record<string, unknown>) => <FixedListEditor config={config} onChange={noop} /> };
    const html = renderToStaticMarkup(
      <PluginEnvelopeEditor label="L" value={value} onChange={noop} customConfigEditors={editors} />,
    );
    expect(html).not.toContain("candidates");
    expect(html).toContain("Edit as JSON");
  });
});

describe("the generated string list", () => {
  it("shows the wrong-kind error beside a plugin strategy's control", () => {
    const html = renderToStaticMarkup(
      <PluginEnvelopeEditor
        label="L"
        value={{ type: "acme.list", config: { names: "alice" } }}
        onChange={noop}
        registryTypes={["acme.list"]}
        registrySchemas={{ "acme.list": [{ key: "names", kind: "string-array", required: false }] }}
      />,
    );
    expect(html).toContain(`class="error">${NOT_A_LIST}</span>`);
    expect(html.indexOf(NOT_A_LIST)).toBeLessThan(html.indexOf("<textarea"));
  });
});

const ready = (groups: { groupId: string; name: string }[]): AssignableGroups => ({ status: "ready", groups, message: "" });
const IT = { groupId: "group_it_ops", name: "IT Ops" };
const HR = { groupId: "group_hr", name: "HR" };

describe("groupPickerState", () => {
  it("reads loading and failed with no picker", () => {
    const loading: AssignableGroups = { status: "loading", groups: [], message: "" };
    expect(groupPickerState(loading, "group_it_ops", ["group_it_ops"], false)).toEqual({ kind: "loading" });
    const failed: AssignableGroups = { status: "failed", groups: [], message: "boom" };
    expect(groupPickerState(failed, "group_it_ops", ["group_it_ops"], true)).toEqual({ kind: "failed", message: "boom" });
  });

  it("reads empty with no held group", () => {
    expect(groupPickerState(ready([]), undefined, undefined, true)).toEqual({ kind: "empty" });
  });

  it("reads empty when a held id stands off the list", () => {
    expect(groupPickerState(ready([]), "group_gone", ["other"], false)).toEqual({ kind: "empty" });
  });

  it("keeps the picker on an empty route with a held group", () => {
    const s = groupPickerState(ready([]), "group_x", ["group_x"], false);
    expect(s).toEqual({
      kind: "picker",
      value: "group_x",
      options: [{ value: "group_x", text: "group_x (not offered to this process)" }],
      emptyUnder: true,
      peopleNote: false,
    });
  });

  it("offers each group by name and shows the held one chosen", () => {
    const s = groupPickerState(ready([IT, HR]), "group_hr", ["group_hr"], false);
    expect(s).toEqual({
      kind: "picker",
      value: "group_hr",
      options: [
        { value: "group_it_ops", text: "IT Ops" },
        { value: "group_hr", text: "HR" },
      ],
      emptyUnder: false,
      peopleNote: false,
    });
  });

  it("marks a held group the route no longer returns", () => {
    const s = groupPickerState(ready([IT]), "group_x", ["group_x"], false);
    if (s.kind !== "picker") throw new Error(s.kind);
    expect(s.value).toBe("group_x");
    expect(s.options).toContainEqual({ value: "group_x", text: "group_x (not offered to this process)" });
    expect(s.options).toContainEqual({ value: "group_it_ops", text: "IT Ops" });
  });

  it("reads a held id missing from the process's list as unchosen", () => {
    const s = groupPickerState(ready([IT]), "group_it_ops", undefined, true);
    if (s.kind !== "picker") throw new Error(s.kind);
    expect(s.value).toBe("");
    expect(s.peopleNote).toBe(false);
  });

  it("reads a non-string held id as unchosen", () => {
    const s = groupPickerState(ready([IT]), 7, ["7"], false);
    if (s.kind !== "picker") throw new Error(s.kind);
    expect(s.value).toBe("");
  });

  it("numbers two groups sharing a name", () => {
    const s = groupPickerState(ready([IT, { groupId: "group_it_2", name: "IT Ops" }]), undefined, undefined, false);
    if (s.kind !== "picker") throw new Error(s.kind);
    expect(s.options.map((o) => o.text)).toEqual(["IT Ops", "IT Ops (2)"]);
    expect(s.options.map((o) => o.value)).toEqual(["group_it_ops", "group_it_2"]);
  });

  it("raises the people note only for a chosen group and a bare person field", () => {
    const chosen = groupPickerState(ready([IT]), "group_it_ops", ["group_it_ops"], true);
    expect(chosen.kind === "picker" && chosen.peopleNote).toBe(true);
    const noField = groupPickerState(ready([IT]), "group_it_ops", ["group_it_ops"], false);
    expect(noField.kind === "picker" && noField.peopleNote).toBe(false);
    const unchosen = groupPickerState(ready([IT]), undefined, undefined, true);
    expect(unchosen.kind === "picker" && unchosen.peopleNote).toBe(false);
  });
});

describe("GroupPickerBody", () => {
  const markup = (read: AssignableGroups, held?: unknown, allowed?: string[], barePerson = false) =>
    renderToStaticMarkup(
      <GroupPickerBody state={groupPickerState(read, held, allowed, barePerson)} onPick={noop} />,
    );
  const EMPTY = "No group is open to this process yet. An operator adds one on the admin Groups screen.";

  it("prints one line while the groups load", () => {
    const html = markup({ status: "loading", groups: [], message: "" });
    expect(html).toContain("Loading groups…");
    expect(html).not.toContain("<select");
  });

  it("prints a failed read's message in the picker's place", () => {
    const html = markup({ status: "failed", groups: [], message: "the read failed" });
    expect(html).toContain("the read failed");
    expect(html).not.toContain("<select");
  });

  it("keeps Edit as JSON beside a failed read", () => {
    const state = { kind: "failed", message: "the read failed" } as const;
    const html = renderToStaticMarkup(
      <PluginEnvelopeEditor
        label="L"
        value={{ type: "org.group-members", config: { groupId: "g" } }}
        onChange={noop}
        customConfigEditors={{ "org.group-members": () => <GroupPickerBody state={state} onPick={noop} /> }}
      />,
    );
    expect(html).toContain("the read failed");
    expect(html).toContain("Edit as JSON");
  });

  it("says no group is open, and offers no empty picker", () => {
    const html = markup(ready([]));
    expect(html).toContain(EMPTY);
    expect(html).not.toContain("<select");
  });

  it("keeps the picker over the empty sentence for a held group", () => {
    const html = markup(ready([]), "group_x", ["group_x"]);
    expect(html).toContain("group_x (not offered to this process)");
    expect(html.indexOf("<select")).toBeLessThan(html.indexOf(EMPTY));
    expect(html).not.toContain("Choose a group");
  });

  it("labels the picker above it and prints a name, not an id", () => {
    const html = markup(ready([IT]));
    expect(html).toContain("Group</label>");
    expect(html.indexOf("</label>")).toBeLessThan(html.indexOf("<select"));
    expect(html).toContain(">IT Ops</option>");
    expect(html).not.toContain(">group_it_ops");
    expect(html).toContain("Choose a group");
  });

  it("holds the placeholder only while unchosen", () => {
    expect(markup(ready([IT]), "group_it_ops", ["group_it_ops"])).not.toContain("Choose a group");
    expect(markup(ready([IT]), "group_it_ops", [])).toContain("Choose a group");
  });

  it("stands the note under the picker only with a bare person field", () => {
    const note = "This process&#x27;s people pickers offer this group too.";
    const withField = markup(ready([IT]), "group_it_ops", ["group_it_ops"], true);
    expect(withField).toContain(note);
    expect(withField.indexOf("<select")).toBeLessThan(withField.indexOf(note));
    expect(markup(ready([IT]), "group_it_ops", ["group_it_ops"], false)).not.toContain(note);
  });

  it("writes the picked id through pickGroup", () => {
    const d = { workflow: { steps: [{ id: "step_a", assignment: { strategy: { type: "org.group-members", config: {} } } }] } } as unknown as Draft;
    const s = groupPickerState(ready([IT]), undefined, undefined, false);
    if (s.kind !== "picker") throw new Error(s.kind);
    pickGroup(d, "step_a", s.options[0]!.value);
    expect(d.workflow!.steps![0]!.assignment?.strategy?.config).toEqual({ groupId: "group_it_ops" });
    expect(d.allowedGroups).toEqual(["group_it_ops"]);
  });
});

const PERSON = { id: "field_approver", key: "approver", label: { en: "Approver" }, type: "string", format: "person" };
const PEOPLE = { id: "field_team", key: "team", label: { en: "Team" }, type: "list", format: "person" };
const TEXT = { id: "field_note", key: "note", label: { en: "Note" }, type: "string" };
const NESTED = {
  id: "field_group",
  key: "group",
  label: { en: "Group" },
  type: "group",
  fields: [{ id: "field_deep", key: "deep", label: { en: "Deep" }, type: "string", format: "person" }],
};

const strategy = { type: "org.actor-from-field", config: {} };
const draftWith = (fields: object[], steps?: object[]): Draft =>
  ({ baseLocale: "en", fields, workflow: { steps: steps ?? [{ id: "step_a", assignment: { strategy } }, { id: "step_b" }] } }) as unknown as Draft;
const stateOf = (d: Draft, held?: unknown, locale = "en") => personPickerState(d, held, "step_a", locale, "en");

describe("personPickerState", () => {
  it("lists single-person fields by label, nested ones included", () => {
    const s = stateOf(draftWith([PERSON, PEOPLE, TEXT, NESTED]));
    expect(s.options).toEqual([
      { value: "field_approver", text: "Approver" },
      { value: "field_deep", text: "Deep" },
    ]);
    expect(s.value).toBe("");
  });

  it("does not list a list field the step does not hold", () => {
    const held = stateOf(draftWith([PERSON, PEOPLE]), "field_approver");
    expect(held.options.map((o) => o.value)).toEqual(["field_approver"]);
  });

  it("marks a held list field and raises its note, not the unwritten one", () => {
    const s = stateOf(draftWith([PERSON, PEOPLE]), "field_team");
    expect(s.value).toBe("field_team");
    expect(s.options).toContainEqual({ value: "field_team", text: "Team (holds several people)" });
    expect(s.severalNote).toBe(true);
    expect(s.unwrittenNote).toBe(false);
  });

  it("reads a removed field as unchosen, with no note", () => {
    const s = stateOf(draftWith([PERSON]), "field_gone");
    expect(s.value).toBe("");
    expect(s.severalNote).toBe(false);
    expect(s.unwrittenNote).toBe(false);
    expect(JSON.stringify(s)).not.toContain("field_gone");
  });

  it("reads a non-person field as unchosen, with no note", () => {
    const s = stateOf(draftWith([PERSON, TEXT]), "field_note");
    expect(s.value).toBe("");
    expect(s.unwrittenNote).toBe(false);
    expect(s.options.map((o) => o.value)).toEqual(["field_approver"]);
  });

  it("numbers repeated labels, the marked list field too", () => {
    const twin = { ...PERSON, id: "field_twin", key: "twin" };
    const list = { ...PEOPLE, label: { en: "Approver" } };
    const s = stateOf(draftWith([PERSON, twin, list]), "field_team");
    expect(s.options.map((o) => o.text)).toEqual(["Approver", "Approver (2)", "Approver (3) (holds several people)"]);
  });

  it("reads a label in the content locale, then the base locale", () => {
    const both = { ...PERSON, label: { en: "Approver", de: "Prüfer" } };
    expect(stateOf(draftWith([both]), undefined, "de").options[0]!.text).toBe("Prüfer");
    expect(stateOf(draftWith([PERSON]), undefined, "de").options[0]!.text).toBe("Approver");
  });

  it("raises the unwritten note for a chosen field nothing writes", () => {
    expect(stateOf(draftWith([PERSON]), "field_approver").unwrittenNote).toBe(true);
    const steps = [{ id: "step_a" }, { id: "step_b", view: { fields: [{ ref: "field_approver" }] } }];
    expect(stateOf(draftWith([PERSON], steps), "field_approver").unwrittenNote).toBe(false);
  });

  it("raises no unwritten note on the placeholder", () => {
    expect(stateOf(draftWith([PERSON])).unwrittenNote).toBe(false);
  });
});

describe("PersonFieldPicker", () => {
  const markup = (d: Draft, held?: unknown) =>
    renderToStaticMarkup(
      <PersonFieldPicker state={stateOf(d, held)} onPick={noop} onAdd={noop} />,
    );
  const UNWRITTEN = "Nothing in this process writes this field before this step";
  const SEVERAL = "A field holding several people reaches nobody.";

  it("labels the picker above it, and prints no id", () => {
    const html = markup(draftWith([PERSON]));
    expect(html).toContain("Field that names the person</label>");
    expect(html.indexOf("</label>")).toBeLessThan(html.indexOf("<select"));
    expect(html).toContain(">Approver</option>");
    expect(html).toContain("Choose a field");
    expect(html).not.toContain(">field_approver");
  });

  it("shows the placeholder and no id for a removed field", () => {
    const html = markup(draftWith([PERSON]), "field_gone");
    expect(html).toContain("Choose a field");
    expect(html).not.toContain("field_gone");
    expect(html).not.toContain(UNWRITTEN);
  });

  it("stands the several-people note under the picker for a held list field", () => {
    const html = markup(draftWith([PEOPLE]), "field_team");
    expect(html).toContain("Team (holds several people)");
    expect(html.indexOf("<select")).toBeLessThan(html.indexOf(SEVERAL));
    expect(html).not.toContain(UNWRITTEN);
  });

  it("stands the unwritten note under the picker for a chosen field", () => {
    const html = markup(draftWith([PERSON]), "field_approver");
    expect(html.indexOf("<select")).toBeLessThan(html.indexOf(UNWRITTEN));
    expect(html).not.toContain(SEVERAL);
    expect(html).not.toContain("Choose a field");
  });

  it("offers Add a person field with no person field to pick", () => {
    expect(markup(draftWith([]))).toContain("Add a person field");
  });

  it("writes the picked id through pickPersonField", () => {
    const d = draftWith([PERSON]);
    pickPersonField(d, "step_a", stateOf(d).options[0]!.value);
    expect(d.workflow!.steps![0]!.assignment?.strategy?.config).toEqual({ fieldId: "field_approver" });
  });
});

describe("Add a person field", () => {
  it("enables Add only for a name with a character in it", () => {
    expect(canAddField("")).toBe(false);
    expect(canAddField("   ")).toBe(false);
    expect(canAddField(" \t ")).toBe(false);
    expect(canAddField(" Approver ")).toBe(true);
  });

  it("mints a person field with the trimmed name in the content locale", () => {
    const f = mintPersonField(draftWith([]), "  Approver ", "en", "en");
    expect(f.label).toEqual({ en: "Approver" });
    expect(f.key).toBe("approver");
    expect(f.type).toBe("string");
    expect(f.format).toBe("person");
    expect(f.id).toMatch(/^field_/);
  });

  it("keeps a base-locale label when the content locale differs", () => {
    const f = mintPersonField(draftWith([]), "Prüfer", "de", "en");
    expect(f.label?.de).toBe("Prüfer");
    expect(f.label?.en).toBeTruthy();
  });

  it("steps past a taken key", () => {
    expect(mintPersonField(draftWith([PERSON]), "Approver", "en", "en").key).toBe("approver_2");
  });

  it("writes the field and its fieldId, and adds no form entry", () => {
    const steps = [
      { id: "step_a", assignment: { strategy } },
      { id: "step_b", view: { fields: [{ ref: "field_note" }] } },
    ];
    const d = draftWith([TEXT], steps);
    const before = structuredClone(d.workflow!.steps![1]);
    const f = mintPersonField(d, "Approver", "en", "en");
    addPersonField(d, "step_a", f);
    expect(d.fields!.at(-1)?.id).toBe(f.id);
    const stepA = d.workflow!.steps![0]!;
    expect(stepA.assignment?.strategy?.config).toEqual({ fieldId: f.id });
    expect(stepA.view).toBeUndefined();
    expect(d.workflow!.steps![1]).toEqual(before!);
  });

  it("shows the new field chosen, under the unwritten note", () => {
    const d = draftWith([]);
    const f = mintPersonField(d, "Approver", "en", "en");
    addPersonField(d, "step_a", f);
    const s = stateOf(d, f.id);
    expect(s.value).toBe(f.id as string);
    expect(s.unwrittenNote).toBe(true);
  });

  it("draws the closed control as one button", () => {
    const html = renderToStaticMarkup(<AddPersonField onAdd={noop} />);
    expect(html).toContain("Add a person field");
    expect(html).toContain('class="btn btn-secondary');
    expect(html).not.toContain("<input");
  });

  it("draws the open control with its name label and a disabled Add over spaces", () => {
    const html = renderToStaticMarkup(<AddFieldEditor name="   " onName={noop} onConfirm={noop} onCancel={noop} />);
    expect(html).toContain("Name of the new field</label>");
    expect(html.indexOf("</label>")).toBeLessThan(html.indexOf("<input"));
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Add<\/button>/);
    expect(html).toContain(">Cancel</button>");
    expect(html.indexOf(">Add</button>")).toBeLessThan(html.indexOf(">Cancel</button>"));
  });

  it("enables Add over a typed name", () => {
    const html = renderToStaticMarkup(<AddFieldEditor name="Approver" onName={noop} onConfirm={noop} onCancel={noop} />);
    expect(html).not.toMatch(/<button[^>]*disabled/);
  });
});

describe("catalog", () => {
  const SRC = new URL("../src/areas/studio/panels/WhoActsPickers.tsx", import.meta.url).pathname;
  const source = readFileSync(SRC, "utf8");

  it("holds no JSX literal of the copy table", () => {
    for (const text of [
      LIST_CAPTION,
      "Choose a group",
      "Loading groups",
      "No group is open",
      "not offered to this process",
      "people pickers offer",
      "Field that names the person",
      "Choose a field",
      "holds several people",
      "reaches nobody",
      "Add a person field",
      "Name of the new field",
    ]) {
      expect(source).not.toContain(text);
    }
  });
});
