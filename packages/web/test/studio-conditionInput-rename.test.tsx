/**
 * `studio-condition-builder`: "A rewritten guard re-reads on the new key".
 *
 * A key change moves the field's operand path and rewrites the guard's source
 * in one draft write. `ConditionInput` re-seeds its rows whenever the source
 * or the operand signature changes, and a re-seed reads the rows the way a
 * fresh mount does: `fromCel(src, operands)`. No DOM library runs here, so the
 * re-seed shows as a mount over the draft after the write, beside the two
 * facts that trigger it: the signature moved and the source moved.
 */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { FieldId } from "workflow-engine/schema";
import { rewriteKeyReaders } from "../src/areas/studio/draft/key-readers.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { ConditionInput } from "../src/areas/studio/panels/shared/ConditionInput.js";
import { buildOperands, fromCel, operandSignature } from "../src/areas/studio/panels/shared/conditionLogic.js";

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

const contextFor = (draft: Draft): DraftContextValue => ({
  draft,
  mutate: () => {},
  replace: () => {},
  validation,
  loadedChildren: {},
  setChildForStep: () => {},
  registry: undefined,
  loadedChainingTargets: {},
  contentLocale: "en",
  setContentLocale: () => {},
  usedLocales: ["en"],
  loadGeneration: 0,
});

interface Body {
  baseLocale: string;
  fields: { id: FieldId; key: string; label: { en: string }; type: string }[];
  workflow: { initialStep: string; steps: { id: string; paths: { guard: { lang: "cel"; src: string } }[] }[] };
}

const draftBefore = (): Body => ({
  baseLocale: "en",
  fields: [{ id: "fld_amount" as FieldId, key: "amount", label: { en: "Amount" }, type: "number" }],
  workflow: {
    initialStep: "step_a",
    steps: [{ id: "step_a", paths: [{ guard: { lang: "cel", src: "data.amount > 1000.0" } }] }],
  },
});

/** The key change: the field takes `total`, and its readers follow. */
const renamed = (): Body => {
  const body = draftBefore();
  body.fields[0]!.key = "total";
  rewriteKeyReaders(body as unknown as Draft, "fld_amount", "amount", "total");
  return body;
};

const operandsOf = (body: Body) => buildOperands({ fields: body.fields as never, locale: "en", baseLocale: "en" });

const render = (body: Body) =>
  renderToStaticMarkup(
    <DraftContext.Provider value={contextFor(body as unknown as Draft)}>
      <ConditionInput value={body.workflow.steps[0]!.paths[0]!.guard} onChange={() => {}} />
    </DraftContext.Provider>,
  );

describe("a rewritten guard re-reads on the new key", () => {
  it("stores the source on the new key", () => {
    expect(renamed().workflow.steps[0]!.paths[0]!.guard.src).toBe("data.total > 1000.0");
  });

  it("moves both seeds of the builder, so it re-reads", () => {
    const before = draftBefore();
    const after = renamed();
    expect(operandSignature(operandsOf(after))).not.toBe(operandSignature(operandsOf(before)));
    expect(after.workflow.steps[0]!.paths[0]!.guard.src).not.toBe(before.workflow.steps[0]!.paths[0]!.guard.src);
  });

  it("reads the rewritten source as a comparison row on the renamed field", () => {
    const after = renamed();
    const condition = fromCel(after.workflow.steps[0]!.paths[0]!.guard.src, operandsOf(after));
    expect(condition!.rows).toEqual([{ kind: "cmp", operand: "data.total", op: ">", value: 1000 }]);
  });

  it("draws a comparison row with the renamed field picked, and no raw row", () => {
    const html = render(renamed());
    expect(html).toMatch(/<option value="data\.total" selected="">/);
    expect(html).toContain("Amount is greater than 1,000.");
    expect(html).not.toContain("A hand-written rule.");
  });

  it("would read the old source as a raw row on the renamed field, without the rewrite", () => {
    const after = renamed();
    const stale = fromCel("data.amount > 1000.0", operandsOf(after));
    expect(stale!.rows[0]!.kind).toBe("raw");
  });
});
