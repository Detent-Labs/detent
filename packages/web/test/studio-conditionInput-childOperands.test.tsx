/**
 * fix-subprocess-wait-state task 7.3 (`studio-condition-builder`: "A subprocess
 * step's path guards offer the child's contract as operands").
 *
 * `examples/subprocess-loan-parent.json`'s step `check` is a subprocess step
 * whose child resolved, so `loadedChildren` holds the credit-check child under
 * its id. A path guard on that step offers `child.outcome` and
 * `child.data.amount`. The step's view overrides offer neither: the runtime
 * resolves a view flag with no child in scope, so the authoring check rejects
 * `child` there.
 *
 * `child` operands reach a condition builder through `ConditionInput`'s
 * `stepId` prop alone. The override components forward none. A stale caller
 * that still hands one over must change nothing, which `staleCaller` below
 * simulates; a strip that forwarded it would list the child operands.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProcessBody } from "workflow-engine/schema";
import { PathsPanel } from "../src/areas/studio/panels/PathsPanel.js";
import { FormEditorStrip, NoteEditorStrip } from "../src/areas/studio/screens/FormEditorScreen.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";

const example = (name: string): ProcessBody => {
  const raw = JSON.parse(readFileSync(new URL(`../../../examples/${name}`, import.meta.url), "utf-8"));
  return (raw.definition ?? raw) as ProcessBody;
};

const PARENT = example("subprocess-loan-parent.json");
const CHILD = example("subprocess-credit-check-child.json");
const SUBPROCESS_STEP = "step_l_check";
const SUBPROCESS = PARENT.workflow.steps.find((s) => s.id === SUBPROCESS_STEP)!;

const validation: ValidationResult = {
  zodValid: true,
  issues: [],
  dimensions: {
    zod: "ran",
    duration: "ran",
    structural: "ran",
    actionType: "ran",
    assignmentType: "ran",
    dataSourceType: "ran",
    registryConfig: "not-run",
    cel: "ran",
  },
  subprocessStepStatus: {},
  chainingSiteStatus: {},
};

const contextValue: DraftContextValue = {
  draft: PARENT as unknown as Draft,
  mutate: () => {},
  replace: () => {},
  validation,
  loadedChildren: { [SUBPROCESS_STEP]: CHILD },
  setChildForStep: () => {},
  registry: undefined,
  loadedChainingTargets: {},
  contentLocale: "en",
  setContentLocale: () => {},
  usedLocales: ["en"],
  loadGeneration: 0,
};

const inContext = (node: React.ReactNode) =>
  renderToStaticMarkup(<DraftContext.Provider value={contextValue}>{node}</DraftContext.Provider>);

/** A caller written before the override components dropped `stepId`. */
const staleCaller = { stepId: SUBPROCESS_STEP };

/** A `data.amount` comparison, so each condition input draws a builder row
 * whose operand picker lists the operands on offer. */
const condition = { lang: "cel" as const, src: "data.amount > 1.0" };

const offeredOperands = (html: string) => [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]!);
const offersChild = (html: string) => offeredOperands(html).some((v) => v.startsWith("child."));
const pickers = (html: string) => offeredOperands(html).filter((v) => v === "data.amount").length;

describe("a subprocess step's path guard", () => {
  const html = inContext(
    <PathsPanel
      paths={SUBPROCESS.paths as never}
      steps={PARENT.workflow.steps as never}
      fields={PARENT.fields as DraftField[]}
      stepId={SUBPROCESS_STEP}
      onChange={() => {}}
      contentLocale="en"
      baseLocale="en"
    />,
  );

  it("offers the child's outcome and its output field as operands", () => {
    const operands = offeredOperands(html);
    expect(operands).toContain("child.outcome");
    expect(operands).toContain("child.data.amount");
  });
});

describe("a subprocess step's view overrides", () => {
  const stripProps = {
    row: { ref: "field_l_amount" as never, visible: condition, required: condition, readonly: condition },
    label: "Requested amount",
    ownStepIndex: 1,
    written: () => 1,
    technicalFieldIds: new Set<string>(),
    isGroup: false,
    tabOptions: [],
    tabValue: undefined,
    onChangeFlag: () => {},
    onChangeSpan: () => {},
    onChangeTab: () => {},
  };

  it("offer no child operand on a field entry's visible, required and readonly", () => {
    const html = inContext(<FormEditorStrip {...stripProps} {...staleCaller} />);

    // Three builders drew, so an absent `child.*` is not an empty render.
    expect(pickers(html)).toBe(3);
    expect(offersChild(html)).toBe(false);
  });

  it("offer no child operand on a note's visible", () => {
    const html = inContext(
      <NoteEditorStrip
        row={{ kind: "note", text: { en: "Heads up" }, visible: condition }}
        {...staleCaller}
        baseLocale="en"
        groupKeys={[]}
        tabOptions={[]}
        tabValue={undefined}
        onChangeText={() => {}}
        onChangeVisible={() => {}}
        onChangeSpan={() => {}}
        onChangeGroup={() => {}}
        onChangeTab={() => {}}
      />,
    );

    expect(pickers(html)).toBe(1);
    expect(offersChild(html)).toBe(false);
  });
});
