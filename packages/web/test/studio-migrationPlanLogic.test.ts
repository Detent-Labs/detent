import { describe, expect, it } from "bun:test";
import { migrationSpec, CANCEL_SINK_STEP_ID } from "workflow-engine/schema";
import {
  parseSpecText,
  formatSpecText,
  readCatalog,
  planToRows,
  rowsToPlan,
  checkPlan,
  isUnresolved,
  selectableSteps,
  nextRowId,
  EMPTY_ROWS,
  UNMAPPABLE_ROW_ID,
  type Catalogs,
} from "../src/areas/studio/screens/migrationPlanLogic.js";

const STEP_A = "step_00000000-0000-4000-8000-00000000000a";
const STEP_B = "step_00000000-0000-4000-8000-00000000000b";
const FIELD_A = "field_00000000-0000-4000-8000-00000000000a";
const FIELD_B = "field_00000000-0000-4000-8000-00000000000b";
const FIELD_C = "field_00000000-0000-4000-8000-00000000000c";

function body(fields: unknown[], steps: unknown[] = [{ id: STEP_A, key: "start", label: { en: "Start" } }]) {
  return { baseLocale: "en", fields, workflow: { steps } };
}

describe("parseSpecText", () => {
  it("treats empty input as an empty plan", () => {
    expect(parseSpecText("")).toEqual({ spec: {} });
    expect(parseSpecText("   ")).toEqual({ spec: {} });
  });

  it("parses valid JSON", () => {
    expect(parseSpecText('{"fieldMap": {"field_a": "field_b"}}')).toEqual({ spec: { fieldMap: { field_a: "field_b" } } });
  });

  it("reports an error for malformed JSON, never throws", () => {
    const result = parseSpecText("{not json");
    expect("error" in result).toBe(true);
  });
});

describe("formatSpecText", () => {
  it("pretty-prints a spec", () => {
    expect(formatSpecText({ fieldMap: { field_a: "field_b" } })).toBe('{\n  "fieldMap": {\n    "field_a": "field_b"\n  }\n}');
  });

  it("formats undefined as an empty object", () => {
    expect(formatSpecText(undefined)).toBe("{}");
  });
});

describe("readCatalog", () => {
  it("returns empty catalogs for a body that is not an object", () => {
    expect(readCatalog(undefined)).toEqual({ steps: [], fields: [] });
    expect(readCatalog("nonsense")).toEqual({ steps: [], fields: [] });
    expect(readCatalog(null)).toEqual({ steps: [], fields: [] });
  });

  it("returns a group's leaves and not the group itself", () => {
    const catalog = readCatalog(
      body([
        { id: FIELD_A, key: "amount", type: "number", label: { en: "Amount" } },
        {
          id: FIELD_C,
          key: "details",
          type: "group",
          label: { en: "Details" },
          fields: [{ id: FIELD_B, key: "note", type: "string", label: { en: "Note" } }],
        },
      ]),
    );
    expect(catalog.fields.map((f) => f.id)).toEqual([FIELD_A, FIELD_B]);
  });

  it("carries the CEL type, not the declared field type", () => {
    const catalog = readCatalog(
      body([
        { id: FIELD_A, key: "when", type: "date", label: { en: "When" } },
        { id: FIELD_B, key: "who", type: "string", label: { en: "Who" } },
        { id: FIELD_C, key: "count", type: "number", label: { en: "Count" } },
      ]),
    );
    expect(catalog.fields.map((f) => f.celType)).toEqual(["string", "string", "double"]);
  });

  it("resolves a label against the body's own baseLocale", () => {
    const catalog = readCatalog({
      baseLocale: "de",
      fields: [{ id: FIELD_A, key: "betrag", type: "number", label: { de: "Betrag", en: "Amount" } }],
      workflow: { steps: [] },
    });
    expect(catalog.fields[0]?.label).toBe("Betrag");
  });

  it("falls back to the key when no label entry resolves", () => {
    const catalog = readCatalog(body([{ id: FIELD_A, key: "amount", type: "number" }]));
    expect(catalog.fields[0]?.label).toBe("amount");
  });
});

describe("rowsToPlan", () => {
  it("produces a valid MigrationSpec", () => {
    const plan = rowsToPlan({
      ...EMPTY_ROWS,
      stepMap: [{ rowId: nextRowId(), from: STEP_A, to: STEP_B }],
      fieldMap: [{ rowId: nextRowId(), from: FIELD_A, to: FIELD_B }],
      transforms: [{ rowId: nextRowId(), target: FIELD_C, src: "data.amount" }],
      onUnmappable: "route-to-step",
      unmappableStep: STEP_B,
    });
    expect(migrationSpec.parse(plan)).toEqual(plan);
  });

  it("wraps a transform in its expression envelope", () => {
    const plan = rowsToPlan({ ...EMPTY_ROWS, transforms: [{ rowId: nextRowId(), target: FIELD_C, src: "1.0" }] });
    expect(plan.transforms).toEqual({ [FIELD_C]: { lang: "cel", src: "1.0" } });
  });

  it("converts an empty row set to an empty plan", () => {
    expect(rowsToPlan(EMPTY_ROWS)).toEqual({});
  });

  it("omits an unmappable step unless the policy is route-to-step", () => {
    const rejecting = rowsToPlan({ ...EMPTY_ROWS, onUnmappable: "reject-and-pin", unmappableStep: STEP_B });
    expect(rejecting).toEqual({ onUnmappable: "reject-and-pin" });
    expect(migrationSpec.parse(rejecting)).toEqual(rejecting);
  });

  it("writes neither key while route-to-step has no step", () => {
    expect(rowsToPlan({ ...EMPTY_ROWS, onUnmappable: "route-to-step", unmappableStep: "" })).toEqual({});
  });
});

describe("planToRows and rowsToPlan round-trip", () => {
  it("returns a stored plan unchanged", () => {
    const stored = {
      stepMap: { [STEP_A]: STEP_B },
      fieldMap: { [FIELD_A]: FIELD_B },
      transforms: { [FIELD_C]: { lang: "cel", src: "data.amount + 1.0" } },
      onUnmappable: "route-to-step",
      unmappableStep: STEP_B,
    };
    expect(rowsToPlan(planToRows(stored))).toEqual(stored);
  });

  it("keeps an id no catalog declares", () => {
    const stored = { fieldMap: { [FIELD_A]: "field_gone" } };
    expect(rowsToPlan(planToRows(stored))).toEqual(stored);
  });

  it("reads a plan that is not an object as no rows", () => {
    expect(planToRows(undefined)).toEqual({ ...EMPTY_ROWS });
    expect(rowsToPlan(planToRows("nonsense"))).toEqual({});
  });

  it("survives both unmappable policies", () => {
    for (const stored of [{ onUnmappable: "reject-and-pin" }, { onUnmappable: "route-to-step", unmappableStep: STEP_B }])
      expect(rowsToPlan(planToRows(stored))).toEqual(stored);
  });
});

describe("checkPlan", () => {
  const catalogs: Catalogs = {
    source: readCatalog(
      body(
        [
          { id: FIELD_A, key: "when", type: "date" },
          { id: FIELD_B, key: "count", type: "number" },
        ],
        [{ id: STEP_A, key: "start" }],
      ),
    ),
    target: readCatalog(
      body(
        [
          { id: FIELD_A, key: "who", type: "string" },
          { id: FIELD_B, key: "count", type: "number" },
          { id: FIELD_C, key: "note", type: "string" },
        ],
        [
          { id: STEP_B, key: "review" },
          { id: CANCEL_SINK_STEP_ID, key: "cancel_sink" },
        ],
      ),
    ),
  };

  it("reports a non-injective fieldMap on every offending row", () => {
    const first = nextRowId();
    const second = nextRowId();
    const issues = checkPlan(
      {
        ...EMPTY_ROWS,
        fieldMap: [
          { rowId: first, from: FIELD_A, to: FIELD_C },
          { rowId: second, from: FIELD_B, to: FIELD_C },
        ],
      },
      catalogs,
    );
    expect(issues.filter((i) => i.message.includes("injective")).map((i) => i.rowId).sort()).toEqual(
      [first, second].sort(),
    );
  });

  it("reports a CEL type mismatch on its row", () => {
    const rowId = nextRowId();
    const issues = checkPlan({ ...EMPTY_ROWS, fieldMap: [{ rowId, from: FIELD_B, to: FIELD_C }] }, catalogs);
    expect(issues).toEqual([{ rowId, message: "type double does not match target type string" }]);
  });

  it("passes two declared types that share one CEL type", () => {
    // A `date` source onto a `string` target: `celType` maps both to `string`,
    // which is what `validatePlan` compares.
    const rowId = nextRowId();
    expect(checkPlan({ ...EMPTY_ROWS, fieldMap: [{ rowId, from: FIELD_A, to: FIELD_A }] }, catalogs)).toEqual([]);
  });

  it("reports the reserved cancel-sink as a stepMap target", () => {
    const rowId = nextRowId();
    const issues = checkPlan({ ...EMPTY_ROWS, stepMap: [{ rowId, from: STEP_A, to: CANCEL_SINK_STEP_ID }] }, catalogs);
    expect(issues).toEqual([{ rowId, message: "the reserved cancel-sink step is not a valid target" }]);
  });

  it("reports the reserved cancel-sink as the unmappable step", () => {
    const issues = checkPlan(
      { ...EMPTY_ROWS, onUnmappable: "route-to-step", unmappableStep: CANCEL_SINK_STEP_ID },
      catalogs,
    );
    expect(issues.map((i) => i.rowId)).toEqual([UNMAPPABLE_ROW_ID]);
  });

  it("reports nothing for a valid plan", () => {
    const issues = checkPlan(
      {
        ...EMPTY_ROWS,
        stepMap: [{ rowId: nextRowId(), from: STEP_A, to: STEP_B }],
        fieldMap: [{ rowId: nextRowId(), from: FIELD_B, to: FIELD_B }],
        onUnmappable: "route-to-step",
        unmappableStep: STEP_B,
      },
      catalogs,
    );
    expect(issues).toEqual([]);
  });

  it("reports no type mismatch when an id resolves in neither catalog", () => {
    expect(checkPlan({ ...EMPTY_ROWS, fieldMap: [{ rowId: nextRowId(), from: "field_gone", to: FIELD_C }] }, catalogs)).toEqual(
      [],
    );
  });
});

describe("picker helpers", () => {
  const steps = [
    { id: STEP_A, key: "start", label: "Start" },
    { id: CANCEL_SINK_STEP_ID as string, key: "cancel_sink", label: "Cancelled" },
  ];

  it("never offers the reserved cancel-sink", () => {
    expect(selectableSteps({ steps, fields: [] }).map((s) => s.id)).toEqual([STEP_A]);
  });

  it("marks an id the catalog does not declare", () => {
    expect(isUnresolved("step_gone", steps)).toBe(true);
    expect(isUnresolved(STEP_A, steps)).toBe(false);
    expect(isUnresolved("", steps)).toBe(false);
  });
});
