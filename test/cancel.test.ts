import { readFileSync } from "node:fs";
import { describe, it, expect } from "bun:test";
import {
  processBody,
  authoredProcessBody,
  publishedProcessBody,
  historyEntry,
  CANCEL_SINK_STEP_ID,
  CANCEL_SINK_KEY,
  RESERVED_CANCEL_OUTCOME,
} from "../src/schema/definition.js";
import { compileProcessBody, CompileValidationError } from "../src/schema/compile.js";

const version = JSON.parse(
  readFileSync(new URL("../examples/expense-approval.json", import.meta.url), "utf8"),
);
// The example is a contracted body.
const contractedBody = () => structuredClone(version.definition);
const nonContractedBody = () => {
  const b = structuredClone(version.definition);
  delete b.contract;
  return b;
};
const sinkCount = (b: any) => b.workflow.steps.filter((s: any) => s.id === CANCEL_SINK_STEP_ID).length;

describe("compile: cancel-sink injection", () => {
  it("contracted body gains one sink and the reserved outcome", () => {
    const out = compileProcessBody(contractedBody());
    expect(sinkCount(out)).toBe(1);
    const sink = out.workflow.steps.find((s) => s.id === CANCEL_SINK_STEP_ID)!;
    expect(sink.terminal).toBe(true);
    expect(sink.outcome).toBe(RESERVED_CANCEL_OUTCOME);
    expect(out.contract!.outcomes).toContain(RESERVED_CANCEL_OUTCOME);
  });

  it("non-contracted body gains only the sink, no reserved outcome", () => {
    const out = compileProcessBody(nonContractedBody());
    expect(sinkCount(out)).toBe(1);
    const sink = out.workflow.steps.find((s) => s.id === CANCEL_SINK_STEP_ID)!;
    expect(sink.outcome).toBeUndefined();
    expect(out.contract).toBeUndefined();
  });

  it("compiled contracted body passes base and published invariants", () => {
    const out = compileProcessBody(contractedBody());
    expect(processBody.safeParse(out).success).toBe(true);
    expect(publishedProcessBody.safeParse(out).success).toBe(true);
  });

  it("is deterministic and idempotent", () => {
    const a = compileProcessBody(contractedBody());
    const b = compileProcessBody(contractedBody());
    expect(a).toEqual(b); // deterministic
    expect(compileProcessBody(a)).toEqual(a); // idempotent
  });
});

// harden-publish-validation: an unknown key is now a publish error, not
// something stripped silently. Stripping was never safe on the write path —
// reproduced by execution elsewhere in this suite (compile-validation.test.ts:
// a path authored with `gaurd` compiles to a path with NO guard at all,
// turning a conditional transition into an unconditional default). Reading a
// STORED body still strips, unchanged — see "compile: unknown keys are
// rejected, not stripped" below and definitionHash's own reproducibility
// argument in the module doc comment.
describe("compile: unknown keys are rejected, not stripped", () => {
  it("rejects an unknown key on the authored path", () => {
    const b: any = contractedBody();
    b.uiMeta = { editor: "v1" };
    b.workflow.steps[0].editorNote = "note";
    expect(() => compileProcessBody(b)).toThrow(CompileValidationError);
  });

  it("rejects an unknown key even on a body that already satisfies publishedProcessBody", () => {
    const compiled: any = compileProcessBody(contractedBody());
    compiled.uiMeta = { editor: "v1" };
    compiled.workflow.steps[0].editorNote = "note";
    // Still published-valid (the cancel-sink count is unaffected) — but the
    // idempotent early return no longer exempts it from the unknown-key check.
    expect(publishedProcessBody.safeParse(compiled).success).toBe(true);
    expect(() => compileProcessBody(compiled)).toThrow(CompileValidationError);
  });

  it("a clean body has no unknown-key issue and compiles normally", () => {
    expect(() => compileProcessBody(contractedBody())).not.toThrow();
  });
});

describe("publishedProcessBody invariant", () => {
  it("rejects a body with no cancel-sink (never compiled)", () => {
    expect(publishedProcessBody.safeParse(contractedBody()).success).toBe(false);
  });

  it("rejects a body with two cancel-sinks (double-compiled)", () => {
    const out: any = compileProcessBody(contractedBody());
    out.workflow.steps.push({ ...out.workflow.steps.find((s: any) => s.id === CANCEL_SINK_STEP_ID) });
    expect(publishedProcessBody.safeParse(out).success).toBe(false);
  });
});

describe("authoredProcessBody: reserved identity", () => {
  it("rejects an authored step using the reserved sink id", () => {
    const b: any = contractedBody();
    b.workflow.steps[0].id = CANCEL_SINK_STEP_ID;
    expect(authoredProcessBody.safeParse(b).success).toBe(false);
  });

  it("rejects an authored terminal outcome 'cancelled'", () => {
    const b: any = contractedBody();
    const term = b.workflow.steps.find((s: any) => s.terminal);
    term.outcome = RESERVED_CANCEL_OUTCOME;
    if (!b.contract.outcomes.includes(RESERVED_CANCEL_OUTCOME)) b.contract.outcomes.push(RESERVED_CANCEL_OUTCOME);
    expect(authoredProcessBody.safeParse(b).success).toBe(false);
  });

  it("rejects a contract declaring the reserved outcome", () => {
    const b: any = contractedBody();
    b.contract.outcomes.push(RESERVED_CANCEL_OUTCOME);
    expect(authoredProcessBody.safeParse(b).success).toBe(false);
  });

  it("compile throws on a body that authors the reserved identity", () => {
    const b: any = contractedBody();
    b.workflow.steps[0].id = CANCEL_SINK_STEP_ID;
    expect(() => compileProcessBody(b)).toThrow();
  });

  // SEC-3, additive shape (harden-publish-validation). The test above renames
  // step[0]'s id, which also breaks workflow.initialStep resolution — so it
  // throws for an unrelated reason and would pass even if the reserved-prefix
  // ban were never applied to this branch. This one ADDS a well-formed,
  // freestanding terminal step carrying the reserved cancel-sink id/key/outcome
  // (so publishedProcessBody's only check — exactly one cancel-sink step —
  // accepts it and the body takes the idempotent early return) alongside a
  // core.* action elsewhere in the body, and asserts that still fails.
  it("rejects a core.* action even when the body separately smuggles a well-formed cancel-sink lookalike", () => {
    const b: any = contractedBody();
    b.workflow.steps.push({
      id: CANCEL_SINK_STEP_ID,
      key: CANCEL_SINK_KEY,
      label: { en: "Cancelled" },
      type: "task",
      terminal: true,
      outcome: RESERVED_CANCEL_OUTCOME,
    });
    if (!b.contract.outcomes.includes(RESERVED_CANCEL_OUTCOME)) b.contract.outcomes.push(RESERVED_CANCEL_OUTCOME);
    b.workflow.steps[0].onEntry = [
      { id: "action_forged", type: "core.returnSubprocess", config: { parentInstanceId: "inst_x", childOutcome: "approved" } },
    ];
    // Precondition: this body really does take the idempotent early return —
    // the additive shape that satisfies publishedProcessBody.
    expect(publishedProcessBody.safeParse(b).success).toBe(true);
    expect(() => compileProcessBody(b)).toThrow(CompileValidationError);
  });
});

describe("onCancel step field", () => {
  it("a step declaring onCancel cleanup validates and compiles", () => {
    const b: any = contractedBody();
    b.workflow.steps[0].onCancel = [
      { id: "action_cancel_cleanup", type: "noop", config: {} },
    ];
    expect(processBody.safeParse(b).success).toBe(true);
    expect(sinkCount(compileProcessBody(b))).toBe(1);
  });

  it("rejects onCancel output targeting an unknown field", () => {
    const b: any = contractedBody();
    b.workflow.steps[0].onCancel = [
      {
        id: "action_bad",
        type: "noop",
        config: {},
        output: { field_does_not_exist: { lang: "cel", src: "result.x" } },
      },
    ];
    expect(processBody.safeParse(b).success).toBe(false);
  });
});

describe("HistoryEntry cause: cancel", () => {
  const base = {
    id: "hist_1",
    instanceId: "inst_1",
    transitionSeq: 1,
    version: 1,
    pathId: null,
    fromStepId: null,
    toStepId: CANCEL_SINK_STEP_ID,
    at: "2026-07-19T00:00:00Z",
  };

  it("accepts cause 'cancel' with a null pathId and the sink as toStepId", () => {
    expect(historyEntry.safeParse({ ...base, cause: "cancel" }).success).toBe(true);
  });

  it("rejects an unknown cause", () => {
    expect(historyEntry.safeParse({ ...base, cause: "nope" }).success).toBe(false);
  });
});
