import { describe, expect, it } from "bun:test";
import {
  matrixRows,
  cellState,
  cellEntry,
  filterInertSteps,
  matrixCounts,
  columnLiveTargets,
  rowLiveTargets,
  bulkBadgeOn,
  applyBulkToggle,
  eligibleTargetEntries,
  isCellFlagged,
} from "../src/areas/studio/panels/fieldMatrixLogic.js";
import { setFlag, gatedKeys, writtenFieldCounts, type WrittenAccessor } from "../src/areas/studio/draft/view-flags.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { DraftViewField } from "../src/areas/studio/draft/view-layout.js";
import type { Step } from "workflow-engine/schema";
import type { Draft, DraftOf } from "../src/areas/studio/draft/types.js";

type DraftStep = DraftOf<Step>;

function df(entry: Record<string, unknown>): DraftField {
  return entry as DraftField;
}

function ds(entry: Record<string, unknown>): DraftStep {
  return entry as DraftStep;
}

function vf(entry: Record<string, unknown>): DraftViewField {
  return entry as DraftViewField;
}

const FIELDS: DraftField[] = [
  df({
    id: "field_group",
    key: "line_item",
    type: "group",
    fields: [df({ id: "field_qty", key: "quantity", type: "number" })],
  }),
  df({ id: "field_vendor", key: "vendor", type: "text" }),
];

describe("matrixRows", () => {
  it("puts a group's own row immediately before its children, in catalog order", () => {
    const rows = matrixRows(FIELDS);
    expect(rows.map((r) => r.id)).toEqual(["field_group", "field_qty", "field_vendor"]);
  });

  it("marks the group row and no other", () => {
    const rows = matrixRows(FIELDS);
    expect(rows.map((r) => r.isGroup)).toEqual([true, false, false]);
  });

  it("indents the group's child one level, and the top-level field zero", () => {
    const rows = matrixRows(FIELDS);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 0]);
  });
});

describe("cellState", () => {
  it("reads hatched for a step with no view at all", () => {
    expect(cellState(ds({ id: "step_a" }), "field_vendor")).toBe("hatched");
  });

  it("reads blank for a view-bearing step with no matching entry", () => {
    const step = ds({ id: "step_a", view: { fields: [vf({ ref: "field_qty" })] } });
    expect(cellState(step, "field_vendor")).toBe("blank");
  });

  it("reads live for a matching entry", () => {
    const step = ds({ id: "step_a", view: { fields: [vf({ ref: "field_vendor" })] } });
    expect(cellState(step, "field_vendor")).toBe("live");
  });
});

describe("cellEntry", () => {
  it("resolves a live cell's entry and array index", () => {
    const entry = vf({ ref: "field_vendor", required: true });
    const step = ds({ id: "step_a", view: { fields: [vf({ ref: "field_qty" }), entry] } });
    expect(cellEntry(step, "field_vendor")).toEqual({ entry, index: 1 });
  });

  it("returns undefined for a blank or hatched cell", () => {
    expect(cellEntry(ds({ id: "step_a" }), "field_vendor")).toBeUndefined();
    expect(cellEntry(ds({ id: "step_a", view: { fields: [] } }), "field_vendor")).toBeUndefined();
  });
});

describe("the cell editor's writer", () => {
  it("writes through setFlag's delete-on-default behavior", () => {
    const entry = vf({ ref: "field_vendor", required: true });
    const next = setFlag(entry, "required", false);
    expect("required" in next).toBe(false);
  });

  const noneAccessor: WrittenAccessor = () => 0;

  it("gates required/readonly the same way the form editor's strip does", () => {
    const entry = vf({ ref: "field_vendor", visible: false });
    expect(gatedKeys(entry, noneAccessor, new Set(), 0)).toEqual(["required", "readonly"]);
  });

  it("gates required/readonly unconditionally for a technical field", () => {
    const entry = vf({ ref: "field_vendor" });
    expect(gatedKeys(entry, noneAccessor, new Set(["field_vendor"]), 0)).toEqual(["required", "readonly"]);
  });
});

describe("filterInertSteps", () => {
  const steps: DraftStep[] = [
    ds({ id: "step_a", view: { fields: [] } }),
    ds({ id: "step_b" }), // no view — inert
    ds({ id: "step_c", view: { fields: [] } }),
  ];

  it("draws every step, with its true index, when hideInert is off", () => {
    expect(filterInertSteps(steps, false)).toEqual([
      { step: steps[0], index: 0 },
      { step: steps[1], index: 1 },
      { step: steps[2], index: 2 },
    ]);
  });

  it("drops a step with no view, keeping every other step's true index", () => {
    expect(filterInertSteps(steps, true)).toEqual([
      { step: steps[0], index: 0 },
      { step: steps[2], index: 2 },
    ]);
  });
});

describe("matrixCounts", () => {
  it("reflects the currently drawn steps", () => {
    const rows = matrixRows(FIELDS); // 3 rows: field_group, field_qty, field_vendor
    const drawnSteps: DraftStep[] = [
      ds({ id: "step_a", view: { fields: [vf({ ref: "field_vendor" })] } }),
      ds({ id: "step_b", view: { fields: [vf({ ref: "field_vendor" }), vf({ ref: "field_qty" })] } }),
    ];
    const counts = matrixCounts(rows, drawnSteps);
    expect(counts).toEqual({ declaredEntries: 3, fieldCount: 3, stepCount: 2, undeclaredCells: 3 });
  });
});

describe("bulk targets", () => {
  const steps: DraftStep[] = [
    ds({ id: "step_a", view: { fields: [vf({ ref: "field_vendor" })] } }),
    ds({ id: "step_b" }), // inert — no view
    ds({ id: "step_c", view: { fields: [vf({ ref: "field_vendor" }), vf({ ref: "field_qty" })] } }),
  ];
  const rows = matrixRows(FIELDS);

  it("columnLiveTargets lists the live rows of one step, keyed by the step's own index", () => {
    expect(columnLiveTargets(rows, steps[2]!, 2)).toEqual([
      { stepIndex: 2, fieldId: "field_qty" },
      { stepIndex: 2, fieldId: "field_vendor" },
    ]);
  });

  it("rowLiveTargets lists the live steps for one field, across the full step list", () => {
    expect(rowLiveTargets(steps, "field_vendor")).toEqual([
      { stepIndex: 0, fieldId: "field_vendor" },
      { stepIndex: 2, fieldId: "field_vendor" },
    ]);
  });
});

describe("bulkBadgeOn / applyBulkToggle", () => {
  const none: WrittenAccessor = () => 0;
  const noTechnical = new Set<string>();

  it("reads not-pressed and turns every eligible cell on, when none carry the non-default value", () => {
    const steps: DraftStep[] = [
      ds({ id: "step_a", view: { fields: [vf({ ref: "field_vendor" })] } }),
      ds({ id: "step_b", view: { fields: [vf({ ref: "field_vendor" })] } }),
    ];
    const targets = [
      { stepIndex: 0, fieldId: "field_vendor" },
      { stepIndex: 1, fieldId: "field_vendor" },
    ];
    expect(bulkBadgeOn(steps, targets, "required", none, noTechnical)).toBe(false);
    applyBulkToggle(steps, targets, "required", none, noTechnical);
    expect(steps[0]!.view!.fields![0]!.required).toBe(true);
    expect(steps[1]!.view!.fields![0]!.required).toBe(true);
  });

  it("clears every eligible cell's key, when every one already carries the non-default value", () => {
    const steps: DraftStep[] = [
      ds({ id: "step_a", view: { fields: [vf({ ref: "field_vendor", required: true })] } }),
      ds({ id: "step_b", view: { fields: [vf({ ref: "field_vendor", required: true })] } }),
    ];
    const targets = [
      { stepIndex: 0, fieldId: "field_vendor" },
      { stepIndex: 1, fieldId: "field_vendor" },
    ];
    expect(bulkBadgeOn(steps, targets, "required", none, noTechnical)).toBe(true);
    applyBulkToggle(steps, targets, "required", none, noTechnical);
    expect("required" in steps[0]!.view!.fields![0]!).toBe(false);
    expect("required" in steps[1]!.view!.fields![0]!).toBe(false);
  });

  it("skips a CEL-carrying cell and a gated cell — both excluded from eligible and from the write", () => {
    const steps: DraftStep[] = [
      ds({ id: "step_cel", view: { fields: [vf({ ref: "field_vendor", required: { lang: "cel", src: "true" } })] } }),
      ds({ id: "step_gated", view: { fields: [vf({ ref: "field_vendor", visible: false })] } }),
      ds({ id: "step_plain", view: { fields: [vf({ ref: "field_vendor" })] } }),
    ];
    const targets = [
      { stepIndex: 0, fieldId: "field_vendor" },
      { stepIndex: 1, fieldId: "field_vendor" },
      { stepIndex: 2, fieldId: "field_vendor" },
    ];
    applyBulkToggle(steps, targets, "required", none, noTechnical);
    expect(steps[0]!.view!.fields![0]!.required).toEqual({ lang: "cel", src: "true" });
    expect("required" in steps[1]!.view!.fields![0]!).toBe(false);
    expect(steps[2]!.view!.fields![0]!.required).toBe(true);
  });

  it("is a no-op when no target is eligible", () => {
    const steps: DraftStep[] = [ds({ id: "step_a", view: { fields: [vf({ ref: "field_vendor", visible: false })] } })];
    const targets = [{ stepIndex: 0, fieldId: "field_vendor" }];
    expect(bulkBadgeOn(steps, targets, "required", none, noTechnical)).toBe(false);
    applyBulkToggle(steps, targets, "required", none, noTechnical);
    expect("required" in steps[0]!.view!.fields![0]!).toBe(false);
  });

  it("skips a cell already gated by the required/readonly mutual rule, on an unwritten field", () => {
    const steps: DraftStep[] = [
      ds({ id: "step_a", view: { fields: [vf({ ref: "field_vendor", required: true })] } }),
    ];
    const targets = [{ stepIndex: 0, fieldId: "field_vendor" }];
    expect(bulkBadgeOn(steps, targets, "readonly", none, noTechnical)).toBe(false);
    applyBulkToggle(steps, targets, "readonly", none, noTechnical);
    expect("readonly" in steps[0]!.view!.fields![0]!).toBe(false);
  });

  it("treats a mutually gated cell as eligible once something else writes the field", () => {
    const steps: DraftStep[] = [
      ds({ id: "step_a", view: { fields: [vf({ ref: "field_vendor", required: true })] } }),
    ];
    const targets = [{ stepIndex: 0, fieldId: "field_vendor" }];
    const written: WrittenAccessor = () => Infinity;
    expect(bulkBadgeOn(steps, targets, "readonly", written, noTechnical)).toBe(false);
    applyBulkToggle(steps, targets, "readonly", written, noTechnical);
    expect(steps[0]!.view!.fields![0]!.readonly).toBe(true);
  });

  it("derives the self-exclusion correctly from a real draft via writtenFieldCounts", () => {
    const steps: DraftStep[] = [ds({ id: "step_a", view: { fields: [vf({ ref: "field_vendor", required: true })] } })];
    const written = writtenFieldCounts({ fields: [df({ id: "field_vendor" })], workflow: { steps } } as Draft);
    const targets = [{ stepIndex: 0, fieldId: "field_vendor" }];
    expect(bulkBadgeOn(steps, targets, "readonly", written, noTechnical)).toBe(false);
    applyBulkToggle(steps, targets, "readonly", written, noTechnical);
    expect("readonly" in steps[0]!.view!.fields![0]!).toBe(false);
  });

  it("treats a technical field's cell as gated for required/readonly even when nothing else writes it", () => {
    const steps: DraftStep[] = [ds({ id: "step_a", view: { fields: [vf({ ref: "field_vendor" })] } })];
    const targets = [{ stepIndex: 0, fieldId: "field_vendor" }];
    const technical = new Set(["field_vendor"]);
    expect(bulkBadgeOn(steps, targets, "required", none, technical)).toBe(false);
    applyBulkToggle(steps, targets, "required", none, technical);
    expect("required" in steps[0]!.view!.fields![0]!).toBe(false);
    expect(bulkBadgeOn(steps, targets, "readonly", none, technical)).toBe(false);
    applyBulkToggle(steps, targets, "readonly", none, technical);
    expect("readonly" in steps[0]!.view!.fields![0]!).toBe(false);
  });

  it("still offers the visible badge for a technical field's row", () => {
    const steps: DraftStep[] = [ds({ id: "step_a", view: { fields: [vf({ ref: "field_vendor" })] } })];
    const targets = [{ stepIndex: 0, fieldId: "field_vendor" }];
    const technical = new Set(["field_vendor"]);
    expect(eligibleTargetEntries(steps, targets, "visible", none, technical)).toHaveLength(1);
    expect(eligibleTargetEntries(steps, targets, "required", none, technical)).toHaveLength(0);
    expect(eligibleTargetEntries(steps, targets, "readonly", none, technical)).toHaveLength(0);
  });
});

describe("writtenFieldCounts accessor", () => {
  it("collects a field written by an action output, a subprocess output mapping, a column mapping, and contract.inputFields, at that field's own step", () => {
    const body: Draft = {
      fields: [
        df({ id: "field_a" }),
        df({ id: "field_b" }),
        df({ id: "field_c", columnMapping: { col1: "field_c" } }),
        df({ id: "field_d" }),
      ],
      contract: { inputFields: ["field_d" as never] },
      workflow: {
        steps: [
          ds({
            id: "step_a",
            onEntry: [{ output: { field_a: { lang: "cel", src: "result" } } }],
            subprocess: { outputMapping: { field_b: { lang: "cel", src: "child.data.x" } } },
          }),
        ],
      },
    };
    const written = writtenFieldCounts(body);
    expect(written("field_a", 0)).toBeGreaterThan(0);
    expect(written("field_b", 0)).toBeGreaterThan(0);
    expect(written("field_c", 0)).toBeGreaterThan(0);
    expect(written("field_d", 0)).toBeGreaterThan(0);
  });
});

// gate-required-readonly-reachability, task 4.2: eligibleTargetEntries
// (which cellEligible/gatedKeys feed) reads the dominance-scoped written
// accessor at each target's own step index.
describe("bulk badge eligibility: dominance scoping", () => {
  it("makes a cell eligible once a dominating step's editable entry writes the field", () => {
    const steps: DraftStep[] = [
      ds({ id: "step_a", paths: [{ to: "step_b", trigger: "manual" }], view: { fields: [vf({ ref: "field_vendor" })] } }),
      ds({ id: "step_b", terminal: true, view: { fields: [vf({ ref: "field_vendor", required: true })] } }),
    ];
    const body = { fields: [df({ id: "field_vendor" })], workflow: { initialStep: "step_a", steps } } as Draft;
    const written = writtenFieldCounts(body);
    const targets = [{ stepIndex: 1, fieldId: "field_vendor" }];
    expect(eligibleTargetEntries(steps, targets, "readonly", written, new Set())).toHaveLength(1);
  });

  it("keeps a cell gated — the badge still skips it — when the only other writer is on a non-dominating step", () => {
    const steps: DraftStep[] = [
      ds({ id: "step_a", paths: [{ to: "step_b", trigger: "manual" }], view: { fields: [vf({ ref: "field_vendor", required: true })] } }),
      ds({ id: "step_b", terminal: true, view: { fields: [vf({ ref: "field_vendor" })] } }),
    ];
    const body = { fields: [df({ id: "field_vendor" })], workflow: { initialStep: "step_a", steps } } as Draft;
    const written = writtenFieldCounts(body);
    const targets = [{ stepIndex: 0, fieldId: "field_vendor" }];
    expect(eligibleTargetEntries(steps, targets, "readonly", written, new Set())).toHaveLength(0);
  });
});

describe("isCellFlagged", () => {
  const none: WrittenAccessor = () => 0;
  const written: WrittenAccessor = () => 1;

  it("flags a cell that is required while hidden", () => {
    const entry = vf({ ref: "field_vendor", visible: false, required: true });
    expect(isCellFlagged(entry, "field_vendor", false, none, 0)).toBe(true);
  });

  it("flags a required-and-readonly cell nothing else writes", () => {
    const entry = vf({ ref: "field_vendor", required: true, readonly: true });
    expect(isCellFlagged(entry, "field_vendor", false, none, 0)).toBe(true);
  });

  it("does not flag a required-and-readonly cell some other source already writes", () => {
    const entry = vf({ ref: "field_vendor", required: true, readonly: true });
    expect(isCellFlagged(entry, "field_vendor", false, written, 0)).toBe(false);
  });

  it("does not flag a group field's own cell, whatever its values", () => {
    const entry = vf({ ref: "field_group", visible: false, required: true });
    expect(isCellFlagged(entry, "field_group", true, none, 0)).toBe(false);
  });

  it("does not flag a cell carrying a CEL-driven flag", () => {
    const entry = vf({ ref: "field_vendor", visible: { lang: "cel", src: "true" }, required: true });
    expect(isCellFlagged(entry, "field_vendor", false, none, 0)).toBe(false);
  });

  it("does not flag a cell at its defaults", () => {
    const entry = vf({ ref: "field_vendor" });
    expect(isCellFlagged(entry, "field_vendor", false, none, 0)).toBe(false);
  });
});
