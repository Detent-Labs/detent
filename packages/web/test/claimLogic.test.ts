import { describe, expect, it } from "bun:test";
import { resolveClaimControls, isEligibleCandidate, maySubmit } from "../src/areas/app/screens/claimLogic.js";
import type { InstanceView } from "../src/areas/app/api/types.js";

type Assignment = InstanceView["assignment"];

const ME = "user_me";
const OTHER = "user_other";

const resolve = (assignment: Assignment, roles: string[] = [], status: InstanceView["status"] = "running") =>
  resolveClaimControls(status, assignment, ME, roles).state;

describe("resolveClaimControls", () => {
  it("renders no control when the step declares no assignment", () => {
    expect(resolve(undefined)).toBe("none");
  });

  it("treats a null assignment like an absent one", () => {
    expect(resolve(null)).toBe("none");
  });

  it("offers a claim to a candidate matched by actor id", () => {
    expect(resolve({ candidates: [ME] })).toBe("claimable");
  });

  it("offers a claim to a candidate matched by role", () => {
    expect(resolve({ candidates: ["approver"] }, ["approver"])).toBe("claimable");
  });

  it("blocks an actor who is neither id nor role candidate", () => {
    expect(resolve({ candidates: ["approver"] }, ["employee"])).toBe("blocked-not-candidate");
  });

  it("blocks everyone on an empty candidate list", () => {
    // Publishable and claimable by no one — the state is real, not defensive.
    expect(resolve({ candidates: [] })).toBe("blocked-not-candidate");
  });

  it("blocks a claim another actor holds", () => {
    expect(resolve({ candidates: [ME, OTHER], claimedBy: OTHER })).toBe("blocked-claimed-by-other");
  });

  it("reports the actor's own claim, so a reopened screen does not offer Claim again", () => {
    expect(resolve({ candidates: [ME], claimedBy: ME })).toBe("mine");
  });

  it("renders no control on a completed instance that still carries a claim", () => {
    expect(resolve({ candidates: [ME], claimedBy: ME }, [], "completed")).toBe("none");
  });

  it("renders no control on a cancelled instance", () => {
    expect(resolve({ candidates: [ME] }, [], "cancelled")).toBe("none");
  });
});

describe("isEligibleCandidate", () => {
  it("matches on actor id", () => {
    expect(isEligibleCandidate(ME, [], [ME])).toBe(true);
  });

  it("matches on any one of several roles", () => {
    expect(isEligibleCandidate(ME, ["a", "b"], ["b"])).toBe(true);
  });

  it("does not match an unrelated actor", () => {
    expect(isEligibleCandidate(ME, ["a"], ["b", OTHER])).toBe(false);
  });
});

describe("maySubmit", () => {
  it("allows submission on the actor's own claim", () => {
    expect(maySubmit({ state: "mine" })).toBe(true);
  });

  it("allows submission with no assignment, so the task stays finishable", () => {
    expect(maySubmit({ state: "none" })).toBe(true);
  });

  it("withholds submission while a claim is available but unheld", () => {
    expect(maySubmit({ state: "claimable" })).toBe(false);
  });

  it("withholds submission from a blocked actor", () => {
    expect(maySubmit({ state: "blocked-not-candidate" })).toBe(false);
    expect(maySubmit({ state: "blocked-claimed-by-other" })).toBe(false);
  });
});
