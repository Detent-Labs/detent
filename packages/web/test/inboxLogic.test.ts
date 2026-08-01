import { describe, expect, it } from "bun:test";
import {
  waitingSince,
  waitingLabel,
  processLabelOf,
  stepLabelOf,
  processOptions,
  filterByProcess,
  sortItems,
  groupItems,
  isClaimedByCurrentUser,
  isUnclaimed,
} from "../src/areas/app/screens/inboxLogic.js";
import type { InstanceSummary } from "../src/areas/app/api/types.js";

const item = (overrides: Partial<InstanceSummary> = {}): InstanceSummary => ({
  instanceId: "inst_1",
  processId: "proc_a",
  version: 1,
  status: "running",
  currentStepId: "step_a",
  transitionSeq: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  currentStepEnteredAt: "2026-01-01T00:00:00.000Z",
  processLabel: { en: "Process A" },
  stepLabel: { en: "Step A" },
  processBaseLocale: "en",
  ...overrides,
});

describe("waitingSince", () => {
  it("uses currentStepEnteredAt when present", () => {
    expect(waitingSince(item({ currentStepEnteredAt: "2026-01-02T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" }))).toBe(
      "2026-01-02T00:00:00.000Z",
    );
  });

  it("falls back to createdAt when currentStepEnteredAt is absent", () => {
    expect(waitingSince(item({ currentStepEnteredAt: undefined, createdAt: "2026-01-01T00:00:00.000Z" }))).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("processLabelOf / stepLabelOf", () => {
  it("resolves in the active locale", () => {
    const i = item({ processLabel: { en: "Process A", de: "Prozess A" }, stepLabel: { en: "Step A", de: "Schritt A" } });
    expect(processLabelOf(i, "de")).toBe("Prozess A");
    expect(stepLabelOf(i, "de")).toBe("Schritt A");
  });

  it("falls back to the process's baseLocale", () => {
    const i = item({ processLabel: { en: "Process A" }, processBaseLocale: "en" });
    expect(processLabelOf(i, "de")).toBe("Process A");
  });
});

describe("processOptions", () => {
  it("returns distinct process/label pairs in first-seen order", () => {
    const items = [item({ processId: "proc_a", processLabel: { en: "A" } }), item({ processId: "proc_b", processLabel: { en: "B" } }), item({ processId: "proc_a" })];
    expect(processOptions(items, "en")).toEqual([
      { processId: "proc_a", label: "A" },
      { processId: "proc_b", label: "B" },
    ]);
  });
});

describe("filterByProcess", () => {
  it("returns everything for 'all'", () => {
    const items = [item({ processId: "proc_a" }), item({ processId: "proc_b" })];
    expect(filterByProcess(items, "all")).toHaveLength(2);
  });

  it("narrows to one process id", () => {
    const items = [item({ instanceId: "i1", processId: "proc_a" }), item({ instanceId: "i2", processId: "proc_b" })];
    expect(filterByProcess(items, "proc_a").map((i) => i.instanceId)).toEqual(["i1"]);
  });
});

describe("sortItems", () => {
  it("sorts by waiting time, longest-waiting first", () => {
    const items = [
      item({ instanceId: "newer", currentStepEnteredAt: "2026-01-03T00:00:00.000Z" }),
      item({ instanceId: "older", currentStepEnteredAt: "2026-01-01T00:00:00.000Z" }),
    ];
    expect(sortItems(items, "waiting", "en").map((i) => i.instanceId)).toEqual(["older", "newer"]);
  });

  it("sorts by most recent (createdAt descending)", () => {
    const items = [
      item({ instanceId: "older", createdAt: "2026-01-01T00:00:00.000Z" }),
      item({ instanceId: "newer", createdAt: "2026-01-03T00:00:00.000Z" }),
    ];
    expect(sortItems(items, "recent", "en").map((i) => i.instanceId)).toEqual(["newer", "older"]);
  });

  it("sorts by process label alphabetically", () => {
    const items = [item({ instanceId: "b", processLabel: { en: "Bravo" } }), item({ instanceId: "a", processLabel: { en: "Alpha" } })];
    expect(sortItems(items, "process", "en").map((i) => i.instanceId)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const items = [item({ instanceId: "a" }), item({ instanceId: "b" })];
    sortItems(items, "recent", "en");
    expect(items.map((i) => i.instanceId)).toEqual(["a", "b"]);
  });
});

describe("groupItems", () => {
  it("returns one ungrouped group for 'none'", () => {
    const items = [item({ processId: "proc_a" }), item({ processId: "proc_b" })];
    const groups = groupItems(items, "none", "en");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items).toHaveLength(2);
    expect(groups[0]!.processId).toBeUndefined();
  });

  it("clusters by process in first-appearance order", () => {
    const items = [
      item({ instanceId: "a1", processId: "proc_a", processLabel: { en: "A" } }),
      item({ instanceId: "b1", processId: "proc_b", processLabel: { en: "B" } }),
      item({ instanceId: "a2", processId: "proc_a" }),
    ];
    const groups = groupItems(items, "process", "en");
    expect(groups.map((g) => g.processId)).toEqual(["proc_a", "proc_b"]);
    expect(groups[0]!.items.map((i) => i.instanceId)).toEqual(["a1", "a2"]);
    expect(groups[0]!.label).toBe("A");
  });
});

describe("claim-state predicates", () => {
  it("isClaimedByCurrentUser matches only the claimant", () => {
    const claimed = item({ assignment: { candidates: ["u1"], claimedBy: "u1" } });
    expect(isClaimedByCurrentUser(claimed, "u1")).toBe(true);
    expect(isClaimedByCurrentUser(claimed, "u2")).toBe(false);
  });

  it("isUnclaimed is true only when nothing has claimed it", () => {
    expect(isUnclaimed(item({ assignment: { candidates: ["u1"] } }))).toBe(true);
    expect(isUnclaimed(item({ assignment: { candidates: ["u1"], claimedBy: "u1" } }))).toBe(false);
  });
});

describe("waitingLabel", () => {
  const start = new Date("2026-01-01T00:00:00.000Z").getTime();

  it("is localized, not hardcoded English, for a locale other than en", () => {
    expect(waitingLabel(new Date(start).toISOString(), "de", start + 30_000)).toBe("gerade eben");
    expect(waitingLabel(new Date(start).toISOString(), "en", start + 30_000)).toBe("just now");
  });

  it("shows minutes under an hour", () => {
    expect(waitingLabel(new Date(start).toISOString(), "en", start + 5 * 60_000)).toBe("5m");
  });

  it("shows hours under a day", () => {
    expect(waitingLabel(new Date(start).toISOString(), "en", start + 3 * 60 * 60_000)).toBe("3h");
  });

  it("shows days at or beyond 24 hours", () => {
    expect(waitingLabel(new Date(start).toISOString(), "en", start + 2 * 24 * 60 * 60_000)).toBe("2d");
  });
});
