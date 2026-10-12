import { describe, expect, it } from "bun:test";
import { claimantOf } from "../src/areas/admin/screens/instanceHeaderLogic.js";
import type { InstanceView } from "../src/areas/admin/api/types.js";

function view(assignment?: InstanceView["assignment"]): InstanceView {
  return {
    instanceId: "inst_1",
    processId: "proc_1",
    version: 1,
    status: "running",
    step: { id: "step_1", key: "review", label: { en: "Review" }, type: "task" },
    transitionSeq: 3,
    baseLocale: "en",
    ...(assignment === undefined ? {} : { assignment }),
  };
}

describe("claimantOf", () => {
  it("returns the claimant of a claimed view", () => {
    expect(claimantOf(view({ candidates: ["alice", "bob"], claimedBy: "alice", claimedAt: "2026-01-01T00:00:00.000Z" }))).toBe("alice");
  });

  it("returns null for an unclaimed view", () => {
    expect(claimantOf(view({ candidates: ["alice", "bob"] }))).toBeNull();
  });

  it("returns null when assignment is null", () => {
    expect(claimantOf(view(null))).toBeNull();
  });

  it("returns null when assignment is absent", () => {
    expect(claimantOf(view())).toBeNull();
  });
});
