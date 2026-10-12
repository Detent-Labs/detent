import { describe, expect, it } from "bun:test";
import { deadlinePatch } from "../src/areas/studio/draft/timer-deadline.js";

describe("deadlinePatch", () => {
  it("writes an empty CEL expression for cleared text, so the timer keeps its deadline", () => {
    const patch = deadlinePatch(undefined);
    expect(patch).toEqual({ deadline: { lang: "cel", src: "" } });
    expect("duration" in patch).toBe(false);
  });

  it("passes a typed expression through", () => {
    const deadline = { lang: "cel" as const, src: "data.due_at" };
    expect(deadlinePatch(deadline)).toEqual({ deadline });
  });
});
