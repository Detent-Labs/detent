import { describe, expect, it } from "bun:test";
import { newStep } from "../src/areas/studio/draft/createStep.js";

describe("newStep", () => {
  it("a 'task' kind creates a participant step: type task, no terminal", () => {
    const step = newStep("task", { en: "" });
    expect(step.type).toBe("task");
    expect(step.terminal).toBeUndefined();
  });

  it("a 'subprocess' kind creates type subprocess, no terminal", () => {
    const step = newStep("subprocess", { en: "" });
    expect(step.type).toBe("subprocess");
    expect(step.terminal).toBeUndefined();
  });

  it("an 'end' kind creates a terminal task step", () => {
    const step = newStep("end", { en: "" });
    expect(step.type).toBe("task");
    expect(step.terminal).toBe(true);
  });

  it("mints a fresh, prefixed id on every call", () => {
    const a = newStep("task", { en: "" });
    const b = newStep("task", { en: "" });
    expect(a.id).not.toBe(b.id);
    expect(a.id?.startsWith("step_")).toBe(true);
  });

  it("seeds label and an empty key", () => {
    const step = newStep("task", { en: "hello" });
    expect(step.label).toEqual({ en: "hello" });
    expect(step.key).toBe("");
  });
});
