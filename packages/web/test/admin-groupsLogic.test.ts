import { describe, expect, it } from "bun:test";
import {
  scopeText,
  groupMatchesFilter,
  prefillScope,
  resolveMemberTokens,
  memberDisplayText,
  blockingProcessLabels,
  scopeIsSavable,
} from "../src/areas/admin/screens/groupsLogic.js";
import type { GroupScope } from "../src/areas/admin/api/types.js";

describe("scopeText", () => {
  it("reads a global scope as 'Global' in English", () => {
    expect(scopeText({ type: "global" }, "en")).toBe("Global");
  });

  it("reads a global scope as its German translation", () => {
    expect(scopeText({ type: "global" }, "de")).toBe("Global");
  });

  it("reads a processes scope as its process count in English", () => {
    expect(scopeText({ type: "processes", processIds: ["proc_a", "proc_b"] }, "en")).toBe("2 processes");
  });

  it("reads a processes scope as its process count in German", () => {
    expect(scopeText({ type: "processes", processIds: ["proc_a"] }, "de")).toBe("1 Prozesse");
  });
});

describe("groupMatchesFilter", () => {
  it("matches a global scope against any filtered process", () => {
    expect(groupMatchesFilter({ type: "global" }, "proc_a")).toBe(true);
  });

  it("matches a processes scope naming the filtered process", () => {
    expect(groupMatchesFilter({ type: "processes", processIds: ["proc_a", "proc_b"] }, "proc_a")).toBe(true);
  });

  it("does not match a processes scope that does not name the filtered process", () => {
    expect(groupMatchesFilter({ type: "processes", processIds: ["proc_b"] }, "proc_a")).toBe(false);
  });

  it("matches every scope when no filter is set", () => {
    expect(groupMatchesFilter({ type: "processes", processIds: ["proc_b"] }, undefined)).toBe(true);
    expect(groupMatchesFilter({ type: "global" }, undefined)).toBe(true);
  });
});

describe("prefillScope", () => {
  it("pre-fills to the filtered process when one is active", () => {
    expect(prefillScope("proc_a")).toEqual({ type: "processes", processIds: ["proc_a"] });
  });

  it("pre-fills to global when no filter is active", () => {
    expect(prefillScope(undefined)).toEqual({ type: "global" });
  });
});

const users = [
  { userId: "user_a", email: "a@example.com", roles: [], disabled: false },
  { userId: "user_b", email: "b@example.com", roles: [], disabled: false },
];

describe("resolveMemberTokens", () => {
  it("resolves comma-separated known emails to their account ids", () => {
    expect(resolveMemberTokens("a@example.com, b@example.com", users, [])).toEqual({
      ok: true,
      memberIds: ["user_a", "user_b"],
    });
  });

  it("passes through a token matching a pre-edit dangling member id", () => {
    expect(resolveMemberTokens("a@example.com, user_gone", users, ["user_gone"])).toEqual({
      ok: true,
      memberIds: ["user_a", "user_gone"],
    });
  });

  it("refuses a token matching neither a loaded email nor a pre-edit member id, naming it", () => {
    const result = resolveMemberTokens("a@example.com, nope@example.com", users, []);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; unresolvedTokens: string[] }).unresolvedTokens).toContain("nope@example.com");
  });

  it("drops an entry that is empty after trimming", () => {
    expect(resolveMemberTokens("a@example.com,,", users, [])).toEqual({ ok: true, memberIds: ["user_a"] });
  });
});

describe("memberDisplayText", () => {
  it("resolves stored member ids to their emails, comma-joined", () => {
    expect(memberDisplayText(["user_a", "user_b"], users)).toBe("a@example.com, b@example.com");
  });

  it("falls back to the raw id for a stored member id no loaded account matches", () => {
    expect(memberDisplayText(["user_a", "user_gone"], users)).toBe("a@example.com, user_gone");
  });
});

describe("blockingProcessLabels", () => {
  const processes: { processId: string; version: number; key: string; label: Record<string, string>; baseLocale: "en" | "de" }[] = [
    { processId: "proc_a", version: 1, key: "a", label: { en: "Alpha" }, baseLocale: "en" },
    { processId: "proc_b", version: 1, key: "b", label: { en: "English", de: "Deutsch" }, baseLocale: "de" },
  ];

  it("resolves each blocking id to its process's own baseLocale label", () => {
    expect(blockingProcessLabels(["proc_a", "proc_b"], processes)).toEqual(["Alpha", "Deutsch"]);
  });

  it("falls back to the raw id for a blocking id absent from the loaded process list", () => {
    expect(blockingProcessLabels(["proc_gone"], processes)).toEqual(["proc_gone"]);
  });
});

describe("scopeIsSavable", () => {
  it("is always savable when global", () => {
    expect(scopeIsSavable({ type: "global" })).toBe(true);
  });

  it("is savable when a processes scope names at least one process", () => {
    expect(scopeIsSavable({ type: "processes", processIds: ["proc_a"] })).toBe(true);
  });

  it("refuses a processes scope naming no process", () => {
    const scope: GroupScope = { type: "processes", processIds: [] };
    expect(scopeIsSavable(scope)).toBe(false);
  });
});
