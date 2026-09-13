import { describe, expect, it } from "bun:test";
import type { FieldId } from "workflow-engine/schema";
import { fieldRemovalReach, hasReach, removeFieldAndReferences, type FieldRemovalReach } from "../src/areas/studio/draft/field-removal";
import type { DraftField } from "../src/areas/studio/draft/fields";
import type { Draft } from "../src/areas/studio/draft/types";
import type { DraftViewEntry, DraftViewField } from "../src/areas/studio/draft/view-layout";

/** A removal's reach, measured before any write: the fields inside a group,
 * the steps, writers, contract entries and column mappings naming a removed
 * id, the kept CEL reading a removed key, and the plugin settings naming a
 * removed id. Then the removal itself, which takes every id reference to a
 * removed field along and leaves CEL and plugin configs as they stand. Each
 * case builds only the parts of a draft it reads. */

const id = (s: string) => s as FieldId;

const cel = (src: string) => ({ lang: "cel" as const, src });

const leaf = (fieldId: string, key: string, extra: DraftField = {}): DraftField => ({
  id: id(fieldId),
  key,
  label: { en: key },
  type: "string",
  ...extra,
});

const group = (fieldId: string, key: string, fields: DraftField[]): DraftField => ({
  id: id(fieldId),
  key,
  label: { en: key },
  type: "group",
  fields,
});

const ref = (fieldId: string, extra: DraftViewField = {}): DraftViewEntry => ({ ref: id(fieldId), ...extra });

const note = (extra: Omit<DraftViewEntry, "kind"> = {}): DraftViewEntry => ({ kind: "note", text: { en: "Note" }, ...extra });

const step = (stepId: string, parts: Record<string, unknown> = {}) => ({
  id: stepId,
  key: stepId,
  label: { en: stepId },
  type: "task",
  ...parts,
});

const viewOf = (...fields: DraftViewEntry[]) => ({ view: { fields } });

const draftOf = (body: Record<string, unknown>): Draft => body as unknown as Draft;

const stepsOf = (...steps: ReturnType<typeof step>[]) => ({ workflow: { initialStep: steps[0]?.id, steps } });

/** An action at any of the five positions. */
const action = (actionId: string, parts: Record<string, unknown> = {}) => ({ id: actionId, type: "http.request", config: {}, ...parts });

/** An automatic path back to `step_a`, guarded by `src`. */
const guarded = (pathId: string, src: string) => ({ id: pathId, key: pathId, label: pathId, to: "step_a", trigger: "automatic", guard: cel(src) });

const NONE: Omit<FieldRemovalReach, "field"> = {
  fieldsInside: 0,
  steps: 0,
  writers: 0,
  contractEntries: 0,
  columnMappings: 0,
  celReads: 0,
  pluginSettings: 0,
};

describe("fieldRemovalReach", () => {
  it("answers undefined for an id no field carries", () => {
    const draft = draftOf({ fields: [leaf("fld_amount", "amount")] });

    expect(fieldRemovalReach(draft, "fld_missing")).toBeUndefined();
  });

  it("answers the removed field and no reach for a field nothing names", () => {
    const amount = leaf("fld_amount", "amount");
    const draft = draftOf({
      fields: [amount, leaf("fld_note", "note")],
      ...stepsOf(step("step_a", viewOf(ref("fld_note")))),
    });

    const reach = fieldRemovalReach(draft, "fld_amount");

    expect(reach?.field).toBe(amount);
    expect(reach).toMatchObject(NONE);
  });

  it("counts every field below a group, at every depth", () => {
    const draft = draftOf({
      fields: [
        group("fld_outer", "outer", [leaf("fld_a", "a"), group("fld_inner", "inner", [leaf("fld_b", "b"), leaf("fld_c", "c")])]),
        leaf("fld_d", "d"),
      ],
    });

    expect(fieldRemovalReach(draft, "fld_outer")).toMatchObject({ ...NONE, fieldsInside: 4 });
    expect(fieldRemovalReach(draft, "fld_inner")).toMatchObject({ ...NONE, fieldsInside: 2 });
    expect(fieldRemovalReach(draft, "fld_b")).toMatchObject(NONE);
  });

  it("counts each step once whose view carries an entry naming the field", () => {
    const draft = draftOf({
      fields: [leaf("fld_amount", "amount"), leaf("fld_note", "note")],
      ...stepsOf(
        step("step_a", viewOf(ref("fld_amount"))),
        step("step_b", viewOf(ref("fld_note"), ref("fld_amount"))),
        step("step_c", viewOf(ref("fld_note"), note())),
        step("step_d"),
      ),
    });

    expect(fieldRemovalReach(draft, "fld_amount")).toMatchObject({ ...NONE, steps: 2 });
  });

  it("counts a group's steps through its whole subtree and the group keys its entries name", () => {
    const draft = draftOf({
      fields: [
        group("fld_outer", "outer", [leaf("fld_a", "a"), group("fld_inner", "inner", [leaf("fld_b", "b")])]),
        leaf("fld_other", "other"),
      ],
      ...stepsOf(
        step("step_card", viewOf(ref("fld_outer"), ref("fld_a", { group: "outer" }), ref("fld_inner", { group: "outer" }))),
        step("step_grandchild", viewOf(ref("fld_b", { group: "inner" }))),
        step("step_note", viewOf(ref("fld_other"), note({ group: "inner" }))),
        step("step_untouched", viewOf(ref("fld_other"), note())),
      ),
    });

    expect(fieldRemovalReach(draft, "fld_outer")).toMatchObject({ ...NONE, fieldsInside: 3, steps: 3 });
  });

  it("counts every output key naming the field in the five action positions, and every output mapping key", () => {
    const writes = (actionId: string, ...fieldIds: string[]) =>
      action(actionId, { output: Object.fromEntries(fieldIds.map((fieldId) => [fieldId, cel("result.status")])) });
    const draft = draftOf({
      fields: [leaf("fld_status", "status"), leaf("fld_other", "other")],
      ...stepsOf(
        step("step_a", {
          type: "subprocess",
          onEntry: [writes("act_entry", "fld_status")],
          onExit: [writes("act_exit", "fld_status", "fld_other")],
          onCancel: [writes("act_cancel", "fld_status"), writes("act_cancel_other", "fld_other")],
          paths: [{ id: "path_a", key: "a", label: "A", to: "step_a", trigger: "automatic", onPath: [writes("act_path", "fld_status")] }],
          timers: [{ id: "timer_a", duration: "PT1H", onFire: { actions: [writes("act_timer", "fld_status")] } }],
          subprocess: {
            processId: "proc_child",
            versionBinding: "pinned",
            pinnedVersion: 1,
            inputMapping: {},
            outputMapping: { fld_status: cel("child.data.status"), fld_other: cel("child.data.other") },
          },
        }),
      ),
    });

    expect(fieldRemovalReach(draft, "fld_status")).toMatchObject({ ...NONE, writers: 6 });
  });

  it("counts one writer per output key naming a field inside a removed group", () => {
    const draft = draftOf({
      fields: [group("fld_group", "grp", [leaf("fld_a", "a"), leaf("fld_b", "b")])],
      ...stepsOf(step("step_a", { onEntry: [action("act_a", { output: { fld_a: cel("result.a"), fld_b: cel("result.b") } })] })),
    });

    expect(fieldRemovalReach(draft, "fld_group")).toMatchObject({ ...NONE, fieldsInside: 2, writers: 2 });
  });

  it("counts every contract input and output entry naming the field", () => {
    const draft = draftOf({
      fields: [leaf("fld_amount", "amount"), leaf("fld_note", "note")],
      contract: { inputFields: [id("fld_amount"), id("fld_note")], outputFields: [id("fld_amount")], outcomes: ["done"] },
    });

    expect(fieldRemovalReach(draft, "fld_amount")).toMatchObject({ ...NONE, contractEntries: 2 });
  });

  it("counts every column mapping entry targeting the field", () => {
    const draft = draftOf({
      fields: [
        leaf("fld_name", "name"),
        leaf("fld_city", "city"),
        leaf("fld_person", "person", { columnMapping: { name: id("fld_name"), city: id("fld_city") } }),
        leaf("fld_manager", "manager", { columnMapping: { display: id("fld_name") } }),
      ],
    });

    expect(fieldRemovalReach(draft, "fld_name")).toMatchObject({ ...NONE, columnMappings: 2 });
  });

  /** The removed field `amount`, a staying field `total` that `extra` extends,
   * and `steps`: a draft that holds one expression site. */
  const readSite = (extra: DraftField, ...steps: ReturnType<typeof step>[]) =>
    draftOf({ fields: [leaf("fld_amount", "amount"), leaf("fld_total", "total", extra)], ...stepsOf(...steps) });
  const readsAmount = () => cel("data.amount > 1.0");
  const keptReadSites: [site: string, siteDraft: Draft][] = [
    ["a staying field's default", readSite({ default: readsAmount() })],
    ["a staying field's validation rule", readSite({ validation: { rule: readsAmount() } })],
    ["a kept view entry's visible flag", readSite({}, step("step_a", viewOf(ref("fld_total", { visible: readsAmount() }))))],
    ["a kept view entry's required flag", readSite({}, step("step_a", viewOf(ref("fld_total", { required: readsAmount() }))))],
    ["a kept view entry's readonly flag", readSite({}, step("step_a", viewOf(ref("fld_total", { readonly: readsAmount() }))))],
    ["a kept view entry's validation rule", readSite({}, step("step_a", viewOf(ref("fld_total", { validation: { rule: readsAmount() } }))))],
    ["a kept note's visible flag", readSite({}, step("step_a", viewOf(note({ visible: readsAmount() }))))],
    ["a path guard", readSite({}, step("step_a", { paths: [guarded("path_a", "data.amount > 1.0")] }))],
    ["a timer deadline", readSite({}, step("step_a", { timers: [{ id: "timer_a", deadline: readsAmount(), onFire: {} }] }))],
    [
      "a process.start mapping value inside an action config",
      readSite({}, step("step_a", { onEntry: [action("act_start", { type: "process.start", config: { inputMapping: { fld_child: readsAmount() } } })] })),
    ],
    [
      "a subprocess input mapping value",
      readSite(
        {},
        step("step_a", {
          type: "subprocess",
          subprocess: { processId: "proc_child", versionBinding: "pinned", pinnedVersion: 1, inputMapping: { fld_child: readsAmount() }, outputMapping: {} },
        }),
      ),
    ],
  ];

  for (const [site, siteDraft] of keptReadSites) {
    it(`counts one read in ${site}`, () => {
      expect(fieldRemovalReach(siteDraft, "fld_amount")).toMatchObject({ ...NONE, celReads: 1 });
    });
  }

  it("counts an expression once however often it reads removed keys, and reads the parsed tree rather than the text", () => {
    const draft = draftOf({
      fields: [group("fld_group", "grp", [leaf("fld_amount", "amount"), leaf("fld_limit", "limit")]), leaf("fld_amounts", "amounts")],
      ...stepsOf(
        step("step_a", {
          paths: [
            guarded("path_twice", "data.amount > 1.0 && data.amount < data.limit"),
            guarded("path_literal", "'data.amount' == 'data.limit'"),
            guarded("path_longer_key", "data.amounts > 1.0"),
            guarded("path_child", "child.data.amount == 1.0"),
          ],
        }),
      ),
    });

    expect(fieldRemovalReach(draft, "fld_group")).toMatchObject({ ...NONE, fieldsInside: 2, celReads: 1 });
  });

  it("counts an expression that fails to parse when its text reads the key on word boundaries", () => {
    const draft = draftOf({
      fields: [leaf("fld_amount", "amount"), leaf("fld_amounts", "amounts")],
      ...stepsOf(
        step("step_a", {
          paths: [
            guarded("path_trailing", "data.amount >"),
            guarded("path_open", "(data.amount"),
            guarded("path_longer_key", "data.amounts >"),
            guarded("path_prefix", "metadata.amount >"),
          ],
        }),
      ),
    });

    expect(fieldRemovalReach(draft, "fld_amount")).toMatchObject({ ...NONE, celReads: 2 });
  });

  it("counts no unparseable text that reads child.data.<key>, as the parsed tree counts none", () => {
    const guardedBy = (src: string) => draftOf({ fields: [leaf("fld_amount", "amount")], ...stepsOf(step("step_a", { paths: [guarded("path_a", src)] })) });

    expect(fieldRemovalReach(guardedBy("child.data.amount >"), "fld_amount")).toMatchObject({ ...NONE, celReads: 0 });
    expect(fieldRemovalReach(guardedBy("data.amount >"), "fld_amount")).toMatchObject({ ...NONE, celReads: 1 });
  });

  it("counts every string value inside any plugin config that equals the id, and none outside a config", () => {
    const draft = draftOf({
      fields: [leaf("fld_owner", "owner"), leaf("fld_other", "other")],
      dataSources: [{ id: "ds_people", key: "people", type: "people.directory", config: { valueFromField: "fld_owner" } }],
      allowedGroups: ["fld_owner"],
      ...stepsOf(
        step("step_a", {
          description: { en: "fld_owner" },
          assignment: { strategy: { type: "org.actor-from-field", config: { fieldId: "fld_owner" } } },
          onEntry: [
            action("act_a", {
              config: { target: "fld_owner", nested: { ids: ["fld_owner", "fld_other"] }, text: "fld_owner and more" },
            }),
          ],
        }),
      ),
    });

    expect(fieldRemovalReach(draft, "fld_owner")).toMatchObject({ ...NONE, pluginSettings: 4 });
  });
});

describe("fieldRemovalReach leaves out what the removal takes along", () => {
  it("counts no read for a field whose own rule and default read its key, so the field has no reach", () => {
    const draft = draftOf({
      fields: [
        leaf("fld_amount", "amount", { default: cel("data.amount"), validation: { rule: cel("data.amount > 0.0") } }),
        leaf("fld_note", "note"),
      ],
      ...stepsOf(step("step_a", viewOf(ref("fld_note")))),
    });

    const reach = fieldRemovalReach(draft, "fld_amount");

    expect(reach).toMatchObject(NONE);
    expect(reach !== undefined && hasReach(reach)).toBe(false);
  });

  it("counts no read for the flags and rules of the view entries the removal takes out", () => {
    const draft = draftOf({
      fields: [group("fld_group", "grp", [leaf("fld_amount", "amount")]), leaf("fld_note", "note")],
      ...stepsOf(
        step(
          "step_a",
          viewOf(
            ref("fld_group", { visible: cel("data.amount > 0.0") }),
            ref("fld_amount", {
              group: "grp",
              visible: cel("data.amount > 1.0"),
              required: cel("data.amount > 2.0"),
              readonly: cel("data.amount > 3.0"),
              validation: { rule: cel("data.amount < 5.0") },
            }),
            note({ group: "grp", visible: cel("data.amount > 4.0") }),
            ref("fld_note", { visible: cel("data.amount > 6.0") }),
          ),
        ),
      ),
    });

    expect(fieldRemovalReach(draft, "fld_group")).toMatchObject({ ...NONE, fieldsInside: 1, steps: 1, celReads: 1 });
  });

  it("keeps the entries and the key of another group that holds the removed group's key", () => {
    const draft = draftOf({
      fields: [group("fld_first", "dup", [leaf("fld_a", "a")]), group("fld_second", "dup", [leaf("fld_b", "b")])],
      ...stepsOf(
        step("step_first", viewOf(ref("fld_first"), ref("fld_a", { group: "dup" }))),
        step("step_second", viewOf(ref("fld_second"), ref("fld_b", { group: "dup" }), note({ group: "dup", visible: cel("has(data.dup)") }))),
      ),
    });

    expect(fieldRemovalReach(draft, "fld_first")).toMatchObject({ ...NONE, fieldsInside: 1, steps: 1 });
  });

  it("names no group key and reads no key for a key-less group", () => {
    const draft = draftOf({
      fields: [group("fld_group", "", [leaf("fld_child", "child")]), leaf("fld_other", "other")],
      ...stepsOf(
        step("step_card", viewOf(ref("fld_group"), ref("fld_child"))),
        step("step_note", {
          ...viewOf(ref("fld_other"), note({ group: "" })),
          paths: [{ id: "path_a", key: "a", label: "A", to: "step_card", trigger: "automatic", guard: cel("data.other >") }],
        }),
      ),
    });

    expect(fieldRemovalReach(draft, "fld_group")).toMatchObject({ ...NONE, fieldsInside: 1, steps: 1 });
  });

  it("counts a plugin-typed field's config and a column mapping only on a field that stays", () => {
    const picker = (fieldId: string, key: string) => leaf(fieldId, key, { type: { type: "acme.picker", config: { sourceField: "fld_amount" } } });
    const lookup = (fieldId: string, key: string) => leaf(fieldId, key, { columnMapping: { amount: id("fld_amount") } });
    const draft = draftOf({
      fields: [
        group("fld_group", "grp", [leaf("fld_amount", "amount"), picker("fld_inner_picker", "inner_picker"), lookup("fld_inner_lookup", "inner_lookup")]),
        picker("fld_picker", "picker"),
        lookup("fld_lookup", "lookup"),
      ],
    });

    expect(fieldRemovalReach(draft, "fld_group")).toMatchObject({ ...NONE, fieldsInside: 3, columnMappings: 1, pluginSettings: 1 });
  });

  it("counts a column mapping keyed config as a column mapping, not as a plugin setting", () => {
    const draft = draftOf({
      fields: [leaf("fld_target", "target"), leaf("fld_lookup", "lookup", { columnMapping: { config: id("fld_target") } })],
    });

    expect(fieldRemovalReach(draft, "fld_target")).toMatchObject({ ...NONE, columnMappings: 1, pluginSettings: 0 });
  });

  it("counts no read for an output or output mapping entry the removal takes along", () => {
    const draft = draftOf({
      fields: [leaf("fld_status", "status"), leaf("fld_summary", "summary")],
      ...stepsOf(
        step("step_call", {
          type: "subprocess",
          onEntry: [action("act_a", { output: { fld_status: cel("data.status") } })],
          subprocess: {
            processId: "proc_child",
            versionBinding: "pinned",
            pinnedVersion: 1,
            inputMapping: {},
            outputMapping: {
              fld_status: cel("has(child.data.status) ? child.data.status : data.status"),
              fld_summary: cel("data.status + ' done'"),
            },
          },
        }),
      ),
    });

    expect(fieldRemovalReach(draft, "fld_status")).toMatchObject({ ...NONE, writers: 2, celReads: 1 });
  });
});

describe("hasReach", () => {
  const field = leaf("fld_amount", "amount");

  it("answers false when every count is zero", () => {
    expect(hasReach({ field, ...NONE })).toBe(false);
  });

  it("answers true when any one count sits above zero", () => {
    for (const kind of Object.keys(NONE) as (keyof typeof NONE)[]) {
      expect(hasReach({ field, ...NONE, [kind]: 1 })).toBe(true);
    }
  });
});

/** Each case compares the whole draft after the removal with one built fresh,
 * so the case fails when an entry the removal should keep moves or changes.
 * `toStrictEqual` tells a key that left from one set to `undefined`. */
describe("removeFieldAndReferences", () => {
  it("leaves the draft unchanged for an id no field carries", () => {
    const build = () =>
      draftOf({
        fields: [leaf("fld_amount", "amount")],
        contract: { inputFields: [id("fld_amount")] },
        ...stepsOf(step("step_a", viewOf(ref("fld_amount")))),
      });
    const draft = build();

    removeFieldAndReferences(draft, "fld_missing");

    expect(draft).toStrictEqual(build());
  });

  it("takes the field from the catalog and every view entry naming it, and keeps every other entry in its place", () => {
    const draft = draftOf({
      fields: [leaf("fld_amount", "amount"), leaf("fld_note", "note")],
      ...stepsOf(
        step("step_a", viewOf(ref("fld_note"), ref("fld_amount", { required: true }), note())),
        step("step_b", viewOf(ref("fld_amount"))),
        step("step_c", viewOf(ref("fld_note", { readonly: true }))),
      ),
    });

    removeFieldAndReferences(draft, "fld_amount");

    expect(draft).toStrictEqual(
      draftOf({
        fields: [leaf("fld_note", "note")],
        ...stepsOf(
          step("step_a", viewOf(ref("fld_note"), note())),
          step("step_b", viewOf()),
          step("step_c", viewOf(ref("fld_note", { readonly: true }))),
        ),
      }),
    );
  });

  it("removes each output key naming the field in the five action positions, and an emptied output leaves its action", () => {
    const writes = (actionId: string, ...fieldIds: string[]) =>
      action(actionId, { output: Object.fromEntries(fieldIds.map((fieldId) => [fieldId, cel("result.status")])) });
    const pathWith = (onPath: unknown[]) => ({ id: "path_a", key: "a", label: "A", to: "step_a", trigger: "automatic", onPath });
    const timerWith = (actions: unknown[]) => ({ id: "timer_a", duration: "PT1H", onFire: { actions } });
    const draft = draftOf({
      fields: [leaf("fld_status", "status"), leaf("fld_other", "other")],
      ...stepsOf(
        step("step_a", {
          onEntry: [writes("act_entry", "fld_status")],
          onExit: [writes("act_exit", "fld_status", "fld_other")],
          onCancel: [writes("act_cancel", "fld_status"), writes("act_cancel_other", "fld_other"), action("act_quiet", { output: {} })],
          paths: [pathWith([writes("act_path", "fld_status")])],
          timers: [timerWith([writes("act_timer", "fld_status")])],
        }),
      ),
    });

    removeFieldAndReferences(draft, "fld_status");

    expect(draft).toStrictEqual(
      draftOf({
        fields: [leaf("fld_other", "other")],
        ...stepsOf(
          step("step_a", {
            onEntry: [action("act_entry")],
            onExit: [writes("act_exit", "fld_other")],
            onCancel: [action("act_cancel"), writes("act_cancel_other", "fld_other"), action("act_quiet", { output: {} })],
            paths: [pathWith([action("act_path")])],
            timers: [timerWith([action("act_timer")])],
          }),
        ),
      }),
    );
  });

  it("removes each output mapping key naming the field, and keeps an emptied output mapping", () => {
    // The input mapping's key names a field of the child process, so it stays.
    const callStep = (stepId: string, outputMapping: Record<string, unknown>) =>
      step(stepId, {
        type: "subprocess",
        subprocess: { processId: "proc_child", versionBinding: "pinned", pinnedVersion: 1, inputMapping: { fld_status: cel("data.status") }, outputMapping },
      });
    const draft = draftOf({
      fields: [leaf("fld_status", "status"), leaf("fld_other", "other")],
      ...stepsOf(
        callStep("step_both", { fld_status: cel("child.data.status"), fld_other: cel("child.data.other") }),
        callStep("step_only", { fld_status: cel("child.data.status") }),
      ),
    });

    removeFieldAndReferences(draft, "fld_status");

    expect(draft).toStrictEqual(
      draftOf({
        fields: [leaf("fld_other", "other")],
        ...stepsOf(callStep("step_both", { fld_other: cel("child.data.other") }), callStep("step_only", {})),
      }),
    );
  });

  it("filters the field from the contract's input fields and output fields", () => {
    const contract = (inputFields: string[], outputFields: string[]) => ({
      inputFields: inputFields.map(id),
      outputFields: outputFields.map(id),
      outcomes: ["done"],
    });
    const draft = draftOf({
      fields: [leaf("fld_amount", "amount"), leaf("fld_note", "note")],
      contract: contract(["fld_amount", "fld_note"], ["fld_amount"]),
    });

    removeFieldAndReferences(draft, "fld_amount");

    expect(draft).toStrictEqual(draftOf({ fields: [leaf("fld_note", "note")], contract: contract(["fld_note"], []) }));
  });

  it("removes each column mapping entry targeting the field, and an emptied column mapping leaves its field", () => {
    const draft = draftOf({
      fields: [
        leaf("fld_name", "name"),
        leaf("fld_city", "city"),
        leaf("fld_person", "person", { columnMapping: { name: id("fld_name"), city: id("fld_city") } }),
        leaf("fld_manager", "manager", { columnMapping: { display: id("fld_name") } }),
      ],
    });

    removeFieldAndReferences(draft, "fld_name");

    expect(draft).toStrictEqual(
      draftOf({
        fields: [
          leaf("fld_city", "city"),
          leaf("fld_person", "person", { columnMapping: { city: id("fld_city") } }),
          leaf("fld_manager", "manager"),
        ],
      }),
    );
  });

  it("takes a group's card and the members and notes inside it at every depth, and keeps every other entry in its place", () => {
    const build = () =>
      draftOf({
        fields: [
          leaf("fld_before", "before"),
          group("fld_outer", "outer", [leaf("fld_a", "a"), group("fld_inner", "inner", [leaf("fld_b", "b"), leaf("fld_c", "c")])]),
          leaf("fld_after", "after"),
        ],
        ...stepsOf(
          step(
            "step_form",
            viewOf(
              ref("fld_before"),
              ref("fld_outer"),
              ref("fld_a", { group: "outer" }),
              note({ group: "outer" }),
              ref("fld_inner", { group: "outer" }),
              ref("fld_b", { group: "inner" }),
              note({ group: "inner" }),
              ref("fld_c", { group: "inner" }),
              ref("fld_after"),
              note(),
            ),
          ),
        ),
      });

    const withoutInner = build();
    removeFieldAndReferences(withoutInner, "fld_inner");
    expect(withoutInner).toStrictEqual(
      draftOf({
        fields: [leaf("fld_before", "before"), group("fld_outer", "outer", [leaf("fld_a", "a")]), leaf("fld_after", "after")],
        ...stepsOf(
          step("step_form", viewOf(ref("fld_before"), ref("fld_outer"), ref("fld_a", { group: "outer" }), note({ group: "outer" }), ref("fld_after"), note())),
        ),
      }),
    );

    const withoutOuter = build();
    removeFieldAndReferences(withoutOuter, "fld_outer");
    expect(withoutOuter).toStrictEqual(
      draftOf({
        fields: [leaf("fld_before", "before"), leaf("fld_after", "after")],
        ...stepsOf(step("step_form", viewOf(ref("fld_before"), ref("fld_after"), note()))),
      }),
    );
  });

  it("removes the id references of every field inside a removed group", () => {
    const callStep = (output: Record<string, unknown>, outputMapping: Record<string, unknown>) =>
      step("step_call", {
        type: "subprocess",
        onEntry: [action("act_a", { output })],
        subprocess: { processId: "proc_child", versionBinding: "pinned", pinnedVersion: 1, inputMapping: {}, outputMapping },
      });
    const draft = draftOf({
      fields: [
        group("fld_group", "grp", [leaf("fld_a", "a"), group("fld_inner", "inner", [leaf("fld_b", "b")])]),
        leaf("fld_lookup", "lookup", { columnMapping: { first: id("fld_b"), second: id("fld_other") } }),
        leaf("fld_other", "other"),
      ],
      contract: { inputFields: [id("fld_a"), id("fld_other")], outputFields: [id("fld_b")] },
      ...stepsOf(
        callStep(
          { fld_b: cel("result.b"), fld_other: cel("result.other") },
          { fld_a: cel("child.data.a"), fld_other: cel("child.data.other") },
        ),
      ),
    });

    removeFieldAndReferences(draft, "fld_group");

    expect(draft).toStrictEqual(
      draftOf({
        fields: [leaf("fld_lookup", "lookup", { columnMapping: { second: id("fld_other") } }), leaf("fld_other", "other")],
        contract: { inputFields: [id("fld_other")], outputFields: [] },
        ...stepsOf(callStep({ fld_other: cel("result.other") }, { fld_other: cel("child.data.other") })),
      }),
    );
  });

  it("keeps the other group's card, members and notes when one of two groups sharing a key leaves", () => {
    const second = () => group("fld_second", "dup", [leaf("fld_b", "b")]);
    const secondStep = () =>
      step("step_second", viewOf(ref("fld_second"), ref("fld_b", { group: "dup" }), note({ group: "dup", visible: cel("has(data.dup)") })));
    const draft = draftOf({
      fields: [group("fld_first", "dup", [leaf("fld_a", "a")]), second()],
      ...stepsOf(step("step_first", viewOf(ref("fld_first"), ref("fld_a", { group: "dup" }), note({ group: "dup" }))), secondStep()),
    });

    removeFieldAndReferences(draft, "fld_first");

    expect(draft).toStrictEqual(
      draftOf({
        fields: [second()],
        ...stepsOf(step("step_first", viewOf(note({ group: "dup" }))), secondStep()),
      }),
    );
  });

  it("leaves every CEL expression and plugin config as it stands, even where it names the removed key or id", () => {
    const total = () => leaf("fld_total", "total", { default: cel("data.status"), validation: { rule: cel("data.status != ''") } });
    const build = (fields: DraftField[]) =>
      draftOf({
        fields,
        dataSources: [{ id: "ds_people", key: "people", type: "people.directory", config: { valueFromField: "fld_status" } }],
        ...stepsOf(
          step("step_a", {
            ...viewOf(ref("fld_total", { visible: cel("data.status == 'open'") })),
            assignment: { strategy: { type: "org.actor-from-field", config: { fieldId: "fld_status" } } },
            onEntry: [
              action("act_start", {
                type: "process.start",
                config: { processId: "proc_child", instanceIdField: "fld_status", inputMapping: { fld_child: cel("data.status") } },
              }),
            ],
            paths: [guarded("path_a", "data.status == 'booked'")],
          }),
        ),
      });
    const draft = build([leaf("fld_status", "status"), total()]);
    // Five kept expressions read `data.status`, and three config values name its id.
    expect(fieldRemovalReach(draft, "fld_status")).toMatchObject({ ...NONE, celReads: 5, pluginSettings: 3 });

    removeFieldAndReferences(draft, "fld_status");

    expect(draft).toStrictEqual(build([total()]));
  });
});
