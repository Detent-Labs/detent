import { describe, expect, it } from "bun:test";
import { appendOutcome } from "../src/areas/studio/draft/contractOutcomes.js";

describe("appendOutcome", () => {
  it("stores an outcome typed with surrounding spaces trimmed", () => {
    expect(appendOutcome([], " approved ")).toEqual(["approved"]);
  });

  it("keeps one entry when the trimmed text already exists", () => {
    expect(appendOutcome(["approved"], " approved ")).toEqual(["approved"]);
  });

  it("adds nothing for a whitespace-only text", () => {
    expect(appendOutcome(["approved"], "   ")).toEqual(["approved"]);
    expect(appendOutcome([], "")).toEqual([]);
  });

  it("appends a distinct outcome after the existing ones", () => {
    expect(appendOutcome(["approved"], " rejected ")).toEqual(["approved", "rejected"]);
  });

  it("returns the same list object when nothing is added", () => {
    const list = ["approved"];
    expect(appendOutcome(list, "approved")).toBe(list);
    expect(appendOutcome(list, " ")).toBe(list);
  });
});
