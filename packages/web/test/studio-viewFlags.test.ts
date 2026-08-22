import { describe, expect, it } from "bun:test";
import {
  checkViewFlags,
  checkUnwrittenTechnicalFields,
  effectiveFlag,
  FLAG_DEFAULT,
  gatedKeys,
  setFlag,
  writtenFieldCounts,
} from "../src/areas/studio/draft/view-flags.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { DraftViewField } from "../src/areas/studio/draft/view-layout.js";

describe("effectiveFlag", () => {
  it("reads an absent visible as true", () => {
    expect(effectiveFlag(undefined, "visible")).toBe(true);
  });

  it("reads an absent required as false", () => {
    expect(effectiveFlag(undefined, "required")).toBe(false);
  });

  it("returns an expression unchanged", () => {
    const expr = { lang: "cel" as const, src: "true" };
    expect(effectiveFlag(expr, "visible")).toBe(expr);
  });

  it("returns a literal value unchanged", () => {
    expect(effectiveFlag(false, "visible")).toBe(false);
  });
});

/** Every literal `ref` below is a plain string, and `DraftViewField.ref` is
 * the branded `FieldId`. Runtime-shaped test data, cast once at the
 * boundary — the same escape hatch `baseBody` below takes for the same
 * reason. */
function vf(entry: Record<string, unknown>): DraftViewField {
  return entry as DraftViewField;
}

describe("setFlag", () => {
  it("writes a departure from the default", () => {
    const entry = vf({ ref: "field_a" });
    const next = setFlag(entry, "visible", false);
    expect(next.visible).toBe(false);
  });

  it("deletes the key on a return to the default", () => {
    const entry = vf({ ref: "field_a", visible: false });
    const next = setFlag(entry, "visible", true);
    expect("visible" in next).toBe(false);
  });

  it("deletes the key for an undefined next", () => {
    const entry = vf({ ref: "field_a", required: true, readonly: true });
    const next = setFlag(entry, "visible", { lang: "cel", src: "true" });
    const back = setFlag(next, "visible", FLAG_DEFAULT.visible);
    expect("visible" in back).toBe(false);
    expect(back.required).toBe(true);
    expect(back.readonly).toBe(true);
  });

  it("deletes required and readonly when visible goes to literal false", () => {
    const entry = vf({ ref: "field_a", required: true, readonly: true });
    const next = setFlag(entry, "visible", false);
    expect("required" in next).toBe(false);
    expect("readonly" in next).toBe(false);
  });
});

describe("gatedKeys", () => {
  const none = new Map<string, number>();
  const noTechnical = new Set<string>();

  it("returns required and readonly for a literal false visible", () => {
    expect(gatedKeys(vf({ ref: "field_a", visible: false }), none, noTechnical)).toEqual(["required", "readonly"]);
  });

  it("returns nothing for a CEL visible", () => {
    expect(gatedKeys(vf({ ref: "field_a", visible: { lang: "cel", src: "true" } }), none, noTechnical)).toEqual([]);
  });

  it("returns nothing for an absent visible", () => {
    expect(gatedKeys(vf({ ref: "field_a" }), none, noTechnical)).toEqual([]);
  });

  it("gates readonly once required is true, on a field with no OTHER writer", () => {
    // The entry itself is still visible and non-readonly, so it counts once
    // toward its own field in `written` — the exact count `writtenByOther`
    // must subtract back out, or this case could never gate (the bug task
    // 5.1's manual check caught: a solo view entry always "writes" its own
    // field until the very toggle being gated turns it readonly).
    const written = new Map([["field_a", 1]]);
    expect(gatedKeys(vf({ ref: "field_a", required: true }), written, noTechnical)).toEqual(["readonly"]);
  });

  it("gates required once readonly is true, on an unwritten field", () => {
    expect(gatedKeys(vf({ ref: "field_a", readonly: true }), none, noTechnical)).toEqual(["required"]);
  });

  it("gates neither key once both required and readonly are already true", () => {
    expect(gatedKeys(vf({ ref: "field_a", required: true, readonly: true }), none, noTechnical)).toEqual([]);
  });

  it("gates neither key when a structural source writes the field", () => {
    const written = new Map([["field_a", Infinity]]);
    expect(gatedKeys(vf({ ref: "field_a", required: true }), written, noTechnical)).toEqual([]);
  });

  it("gates neither key when another view entry, besides this one, also writes the field", () => {
    // count 2: this entry's own contribution, plus one other entry elsewhere.
    const written = new Map([["field_a", 2]]);
    expect(gatedKeys(vf({ ref: "field_a", required: true }), written, noTechnical)).toEqual([]);
  });

  it("derives the self-exclusion correctly from a real draft via writtenFieldCounts", () => {
    const body = withViewField(baseBody(), "step_a", { ref: "field_vendor", required: true });
    const written = writtenFieldCounts(body);
    expect(gatedKeys(body.workflow!.steps![0]!.view!.fields![0]!, written, noTechnical)).toEqual(["readonly"]);
  });

  it("gates both keys unconditionally for a technical field, even when both already read true", () => {
    const technical = new Set(["field_a"]);
    expect(gatedKeys(vf({ ref: "field_a", required: true, readonly: true }), none, technical)).toEqual(["required", "readonly"]);
  });
});

// --- checkViewFlags ---

const baseBody = (): Draft =>
  ({
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [
      { id: "field_vendor", key: "vendor", label: { en: "Vendor" }, type: "text" },
      {
        id: "field_group",
        key: "line_item",
        label: { en: "Line item" },
        type: "group",
        fields: [{ id: "field_nested", key: "qty", label: { en: "Qty" }, type: "number" }],
      },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { fields: [{ ref: "field_vendor" }] },
        },
        {
          id: "step_b",
          key: "b",
          label: { en: "B" },
          type: "task",
          terminal: true,
        },
      ],
    },
  }) as unknown as Draft;

function withViewField(body: Draft, stepId: string, entry: Record<string, unknown>): Draft {
  const b = structuredClone(body) as any;
  const step = b.workflow.steps.find((s: any) => s.id === stepId);
  step.view = { fields: [entry] };
  return b as Draft;
}

describe("checkViewFlags: hidden required field", () => {
  it("reports a view entry with visible: false and required: true", () => {
    const body = withViewField(baseBody(), "step_a", { ref: "field_vendor", visible: false, required: true });
    const issues = checkViewFlags(body);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ entityType: "step", entityId: "step_a", source: "view" });
    expect(issues[0].message).toContain("vendor");
  });

  it("raises nothing for a CEL visible", () => {
    const body = withViewField(baseBody(), "step_a", {
      ref: "field_vendor",
      visible: { lang: "cel", src: "true" },
      required: true,
    });
    expect(checkViewFlags(body)).toHaveLength(0);
  });

  it("raises nothing on a group-container ref", () => {
    const body = withViewField(baseBody(), "step_a", { ref: "field_group", visible: false, required: true });
    expect(checkViewFlags(body)).toHaveLength(0);
  });
});

describe("checkViewFlags: unwritable required field", () => {
  const readonlyRequired = { ref: "field_vendor", readonly: true, required: true } as const;

  it("reports a view entry with readonly: true and required: true, unwritten", () => {
    const body = withViewField(baseBody(), "step_a", readonlyRequired);
    const issues = checkViewFlags(body);
    expect(issues).toHaveLength(1);
    expect(issues[0].entityId).toBe("step_a");
  });

  it("suppresses it where another step's view makes the field editable", () => {
    const body = baseBody() as any;
    body.workflow.steps[0].view = { fields: [readonlyRequired] };
    body.workflow.steps[1].view = { fields: [{ ref: "field_vendor" }] };
    body.workflow.steps[1].terminal = false;
    body.workflow.steps.push({ id: "step_c", key: "c", label: { en: "C" }, type: "task", terminal: true });
    expect(checkViewFlags(body)).toHaveLength(0);
  });

  it("suppresses it where an action output targets the field", () => {
    const body = withViewField(baseBody(), "step_a", readonlyRequired) as any;
    body.workflow.steps[0].onEntry = [
      { id: "action_1", type: "core.noop", output: { field_vendor: { lang: "cel", src: "result" } } },
    ];
    expect(checkViewFlags(body)).toHaveLength(0);
  });

  it("suppresses it where a timer's onFire action output targets the field", () => {
    const body = withViewField(baseBody(), "step_a", readonlyRequired) as any;
    body.workflow.steps[0].timers = [
      {
        id: "timer_1",
        duration: "PT1H",
        onFire: {
          actions: [{ id: "action_1", type: "core.noop", output: { field_vendor: { lang: "cel", src: "result" } } }],
        },
      },
    ];
    expect(checkViewFlags(body)).toHaveLength(0);
  });

  it("suppresses it where an onExit action output targets the field", () => {
    const body = withViewField(baseBody(), "step_a", readonlyRequired) as any;
    body.workflow.steps[0].onExit = [
      { id: "action_1", type: "core.noop", output: { field_vendor: { lang: "cel", src: "result" } } },
    ];
    expect(checkViewFlags(body)).toHaveLength(0);
  });

  it("suppresses it where an onCancel action output targets the field", () => {
    const body = withViewField(baseBody(), "step_a", readonlyRequired) as any;
    body.workflow.steps[0].onCancel = [
      { id: "action_1", type: "core.noop", output: { field_vendor: { lang: "cel", src: "result" } } },
    ];
    expect(checkViewFlags(body)).toHaveLength(0);
  });

  it("suppresses it where a path's onPath action output targets the field", () => {
    const body = withViewField(baseBody(), "step_a", readonlyRequired) as any;
    body.workflow.steps[0].paths = [
      {
        id: "path_1",
        to: "step_b",
        trigger: "manual",
        onPath: [{ id: "action_1", type: "core.noop", output: { field_vendor: { lang: "cel", src: "result" } } }],
      },
    ];
    expect(checkViewFlags(body)).toHaveLength(0);
  });

  it("suppresses it where a subprocess outputMapping targets the field", () => {
    const body = withViewField(baseBody(), "step_a", readonlyRequired) as any;
    body.workflow.steps[0].type = "subprocess";
    body.workflow.steps[0].subprocess = {
      processId: "proc_child",
      versionBinding: "latest-at-spawn",
      inputMapping: {},
      outputMapping: { field_vendor: { lang: "cel", src: "child.data.x" } },
    };
    expect(checkViewFlags(body)).toHaveLength(0);
  });

  it("suppresses it where a columnMapping targets the field, including on a nested field", () => {
    const body = withViewField(baseBody(), "step_a", readonlyRequired) as any;
    body.fields[1].fields[0].columnMapping = { some_column: "field_vendor" };
    expect(checkViewFlags(body)).toHaveLength(0);
  });

  it("suppresses it where the process's own contract.inputFields names the field", () => {
    const body = withViewField(baseBody(), "step_a", readonlyRequired) as any;
    body.contract = { inputFields: ["field_vendor"] };
    expect(checkViewFlags(body)).toHaveLength(0);
  });

  it("raises nothing for a CEL readonly or required", () => {
    const body = withViewField(baseBody(), "step_a", {
      ref: "field_vendor",
      readonly: true,
      required: { lang: "cel", src: "true" },
    });
    expect(checkViewFlags(body)).toHaveLength(0);
  });

  it("raises nothing on a group-container ref", () => {
    const body = withViewField(baseBody(), "step_a", { ref: "field_group", readonly: true, required: true });
    expect(checkViewFlags(body)).toHaveLength(0);
  });
});

// technical-field-marker: the inverse finding. field_vendor is baseBody's
// plain top-level field, placed by default on step_a's view with no flags.
describe("checkUnwrittenTechnicalFields", () => {
  const withTechnical = (mutate?: (b: any) => void): Draft => {
    const b = structuredClone(baseBody()) as any;
    b.fields[0].technical = true; // field_vendor
    mutate?.(b);
    return b as Draft;
  };

  it("fires for a technical field no step's view places and no structural source writes", () => {
    const b = withTechnical((body) => {
      body.workflow.steps[0].view = undefined;
    });
    const issues = checkUnwrittenTechnicalFields(b);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ entityType: "field", entityId: "field_vendor", source: "view" });
  });

  it("fires for a technical field placed visibly on a step that no structural source writes", () => {
    // baseBody already places field_vendor visibly on step_a with no flags.
    const issues = checkUnwrittenTechnicalFields(withTechnical());
    expect(issues).toHaveLength(1);
    expect(issues[0].entityId).toBe("field_vendor");
  });

  it("a default does not exempt an unwritten technical field", () => {
    const b = withTechnical((body) => {
      body.workflow.steps[0].view = undefined;
      body.fields[0].default = "x";
    });
    expect(checkUnwrittenTechnicalFields(b)).toHaveLength(1);
  });

  it("does not fire for a technical field an action list targets", () => {
    const b = withTechnical((body) => {
      body.workflow.steps[0].view = undefined;
      body.workflow.steps[0].onEntry = [
        { id: "action_1", type: "core.noop", output: { field_vendor: { lang: "cel", src: "result" } } },
      ];
    });
    expect(checkUnwrittenTechnicalFields(b)).toHaveLength(0);
  });

  it("does not fire for a technical field a subprocess.outputMapping targets", () => {
    const b = withTechnical((body) => {
      body.workflow.steps[0].view = undefined;
      body.workflow.steps[0].type = "subprocess";
      body.workflow.steps[0].subprocess = {
        processId: "proc_child",
        versionBinding: "latest-at-spawn",
        inputMapping: {},
        outputMapping: { field_vendor: { lang: "cel", src: "child.data.x" } },
      };
    });
    expect(checkUnwrittenTechnicalFields(b)).toHaveLength(0);
  });

  it("does not fire for a technical field a columnMapping targets", () => {
    const b = withTechnical((body) => {
      body.workflow.steps[0].view = undefined;
      body.fields[1].fields[0].columnMapping = { some_column: "field_vendor" };
    });
    expect(checkUnwrittenTechnicalFields(b)).toHaveLength(0);
  });

  it("does not fire for a technical field contract.inputFields names", () => {
    const b = withTechnical((body) => {
      body.workflow.steps[0].view = undefined;
      body.contract = { inputFields: ["field_vendor"] };
    });
    expect(checkUnwrittenTechnicalFields(b)).toHaveLength(0);
  });

  it("does not fire for a non-technical field nothing writes", () => {
    const b = structuredClone(baseBody()) as any;
    b.workflow.steps[0].view = undefined;
    expect(checkUnwrittenTechnicalFields(b as Draft)).toHaveLength(0);
  });

  it("a field declaring technical: false with no structural writer raises no finding", () => {
    const b = structuredClone(baseBody()) as any;
    b.fields[0].technical = false;
    b.workflow.steps[0].view = undefined;
    expect(checkUnwrittenTechnicalFields(b as Draft)).toHaveLength(0);
  });
});
