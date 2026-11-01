import { describe, expect, it } from "bun:test";
import {
  firstWorkedStepId,
  outcomePatch,
  performedByEdit,
  performedByFor,
  performedByPatch,
  performedByReach,
  performedByRemovals,
  pressDecision,
} from "../src/areas/studio/draft/performedBy.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

describe("performedByFor", () => {
  it("a task, non-terminal step reads as participant", () => {
    expect(performedByFor("task", undefined)).toBe("participant");
  });

  it("a subprocess, non-terminal step reads as subprocess", () => {
    expect(performedByFor("subprocess", undefined)).toBe("subprocess");
  });

  it("a terminal step reads as terminal regardless of type", () => {
    expect(performedByFor("task", true)).toBe("terminal");
    expect(performedByFor("subprocess", true)).toBe("terminal");
  });
});

describe("performedByPatch", () => {
  it("participant sets type task, clears terminal", () => {
    expect(performedByPatch("participant")).toEqual({ type: "task", terminal: undefined });
  });

  it("subprocess sets type subprocess, clears terminal", () => {
    expect(performedByPatch("subprocess")).toEqual({ type: "subprocess", terminal: undefined });
  });

  it("terminal pins type back to task and sets terminal true", () => {
    expect(performedByPatch("terminal")).toEqual({ type: "task", terminal: true });
  });
});

describe("performedByRemovals", () => {
  it("lists the keys each target kind cannot carry", () => {
    expect(performedByRemovals("participant")).toEqual(["subprocess", "outcome"]);
    expect(performedByRemovals("subprocess")).toEqual(["outcome"]);
    expect(performedByRemovals("terminal")).toEqual(["subprocess", "paths", "timers", "onExit", "onCancel", "cancellable"]);
  });
});

const ACTION = { id: "act_1", type: "x", config: {} } as never;
const PATH = { id: "path_1" } as never;
const TIMER = { id: "timer_1" } as never;

describe("performedByReach", () => {
  it("is empty when the step holds none of the removed keys", () => {
    expect(performedByReach({ type: "task" } as never, "terminal")).toEqual({});
    expect(performedByReach({ type: "task", paths: [], timers: [], onExit: [] } as never, "terminal")).toEqual({});
  });

  it("counts a subprocess spec as one when a subprocess step switches to a task step", () => {
    const step = { type: "subprocess", subprocess: { processId: "proc_1" } } as never;
    expect(performedByReach(step, "participant")).toEqual({ subprocess: 1 });
  });

  it("counts arrays by length when a task step with paths, a timer and an exit action becomes an end", () => {
    const step = { type: "task", paths: [PATH, PATH, PATH], timers: [TIMER], onExit: [ACTION] } as never;
    expect(performedByReach(step, "terminal")).toEqual({ paths: 3, timers: 1, onExit: 1 });
  });

  it("counts a cancellable key as one, whatever its value", () => {
    expect(performedByReach({ type: "task", cancellable: false } as never, "terminal")).toEqual({ cancellable: 1 });
  });

  it("counts an outcome as one when an end step becomes a task step", () => {
    const step = { type: "task", terminal: true, outcome: "approved" } as never;
    expect(performedByReach(step, "participant")).toEqual({ outcome: 1 });
  });

  it("counts a subprocess spec on a subprocess step that becomes an end", () => {
    const step = { type: "subprocess", subprocess: { processId: "proc_1" }, paths: [PATH], onCancel: [ACTION, ACTION] } as never;
    expect(performedByReach(step, "terminal")).toEqual({ subprocess: 1, paths: 1, onCancel: 2 });
  });

  it("ignores keys the target kind can carry", () => {
    const step = { type: "task", paths: [PATH], onExit: [ACTION] } as never;
    expect(performedByReach(step, "subprocess")).toEqual({});
  });
});

describe("performedByEdit", () => {
  it("is the old pair alone for a switch that removes nothing in its reach", () => {
    const edit = performedByEdit({ type: "task" } as never, "subprocess");
    expect(edit.type).toBe("subprocess");
    expect(edit.terminal).toBeUndefined();
  });

  it("writes undefined for every removed key, whether the step holds it or not", () => {
    const edit = performedByEdit({ type: "task" } as never, "terminal") as Record<string, unknown>;
    expect(edit.type).toBe("task");
    expect(edit.terminal).toBe(true);
    for (const key of performedByRemovals("terminal")) {
      expect(key in edit).toBe(true);
      expect(edit[key]).toBeUndefined();
    }
  });

  it("clears the outcome and the subprocess spec on a switch to a task step", () => {
    const edit = performedByEdit({ type: "subprocess" } as never, "participant") as Record<string, unknown>;
    expect(edit).toEqual({ type: "task", terminal: undefined, subprocess: undefined, outcome: undefined });
  });

  it("keeps performedByPatch's pair inside the edit", () => {
    for (const option of ["participant", "subprocess", "terminal"] as const) {
      expect(performedByEdit({ type: "task" } as never, option)).toMatchObject(performedByPatch(option));
    }
  });
});

describe("pressDecision", () => {
  it("applies at once when the reach is empty", () => {
    expect(pressDecision({ type: "task" } as never, "terminal")).toBe("apply");
  });

  it("asks for confirmation when the reach holds a key", () => {
    expect(pressDecision({ type: "task", paths: [PATH] } as never, "terminal")).toBe("confirm");
  });
});

describe("outcomePatch", () => {
  it("writes the typed text", () => {
    expect(outcomePatch("approved")).toEqual({ outcome: "approved" });
  });

  it("writes undefined when the author empties the field", () => {
    const patch = outcomePatch("");
    expect("outcome" in patch).toBe(true);
    expect(patch.outcome).toBeUndefined();
  });
});

describe("firstWorkedStepId", () => {
  const draftOf = (initialStep: string | undefined, steps: unknown[]): Draft =>
    ({ workflow: { initialStep, steps } }) as unknown as Draft;
  const task = (id: string) => ({ id, type: "task" });
  const end = (id: string) => ({ id, type: "task", terminal: true });
  const call = (id: string) => ({ id, type: "subprocess" });

  it("answers the initial step when a person works it", () => {
    expect(firstWorkedStepId(draftOf("step_b", [task("step_a"), task("step_b")]))).toBe("step_b");
  });

  it("answers the first worked step in draft order when the initial step is an end", () => {
    expect(firstWorkedStepId(draftOf("step_a", [end("step_a"), call("step_b"), task("step_c"), task("step_d")]))).toBe("step_c");
  });

  it("answers the first worked step when the initial step is a call to another process or names no step", () => {
    expect(firstWorkedStepId(draftOf("step_a", [call("step_a"), task("step_b")]))).toBe("step_b");
    expect(firstWorkedStepId(draftOf(undefined, [call("step_a"), task("step_b")]))).toBe("step_b");
  });

  it("answers undefined when no step is worked by a person", () => {
    expect(firstWorkedStepId(draftOf("step_a", [call("step_a"), end("step_b")]))).toBeUndefined();
    expect(firstWorkedStepId(draftOf(undefined, []))).toBeUndefined();
    expect(firstWorkedStepId({} as Draft)).toBeUndefined();
  });
});
