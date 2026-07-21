import { readFileSync } from "node:fs";
import { describe, it, expect } from "bun:test";
import {
  processBody,
  authoredProcessBody,
  publishedProcessBody,
  historyEntry,
  CANCEL_SINK_STEP_ID,
  RESERVED_CANCEL_OUTCOME,
} from "../src/schema/definition.js";
import { compileProcessBody } from "../src/schema/compile.js";

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

describe("compile: unknown keys are stripped before the hash", () => {
  // definitionHash is taken over compile's output, and every read re-parses
  // (strip mode). Compile must therefore return the parse output on BOTH exits,
  // or the hash covers content no read can reproduce and pinned instances
  // never rehydrate.
  it("strips unknown keys on the authored path", () => {
    const b: any = contractedBody();
    b.uiMeta = { editor: "v1" };
    b.workflow.steps[0].editorNote = "note";
    const out: any = compileProcessBody(b);
    expect(out.uiMeta).toBeUndefined();
    expect(out.workflow.steps.find((s: any) => s.id === b.workflow.steps[0].id).editorNote).toBeUndefined();
  });

  it("strips unknown keys on the already-compiled early return", () => {
    const compiled: any = compileProcessBody(contractedBody());
    compiled.uiMeta = { editor: "v1" };
    compiled.workflow.steps[0].editorNote = "note";
    const out: any = compileProcessBody(compiled); // published-valid: takes the early return
    expect(out.uiMeta).toBeUndefined();
    expect(out.workflow.steps.find((s: any) => s.id === compiled.workflow.steps[0].id).editorNote).toBeUndefined();
  });

  it("an authored body and its unknown-key variant compile to the same body", () => {
    const clean = compileProcessBody(contractedBody());
    const dirty: any = contractedBody();
    dirty.uiMeta = { editor: "v1" };
    expect(compileProcessBody(dirty)).toEqual(clean);
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
