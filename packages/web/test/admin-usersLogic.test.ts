import { describe, expect, it } from "bun:test";
import { parseRoles, appendRole, managerChoices, managerLabel, managerValueOf } from "../src/areas/admin/screens/usersLogic.js";

describe("parseRoles", () => {
  it("splits on commas and trims each entry", () => {
    expect(parseRoles(" a , b ")).toEqual(["a", "b"]);
  });

  it("keeps the first occurrence of a duplicate and drops the rest", () => {
    expect(parseRoles("b, a, b")).toEqual(["b", "a"]);
  });

  it("drops an entry that is empty after trimming", () => {
    expect(parseRoles("a,,b")).toEqual(["a", "b"]);
    expect(parseRoles("a,   ,b")).toEqual(["a", "b"]);
  });

  it("drops a trailing comma", () => {
    expect(parseRoles("a, b,")).toEqual(["a", "b"]);
  });

  it("returns an empty array for empty or whitespace-only text", () => {
    expect(parseRoles("")).toEqual([]);
    expect(parseRoles("   ")).toEqual([]);
    expect(parseRoles(",,")).toEqual([]);
  });

  it("leaves a role string's own characters alone", () => {
    expect(parseRoles("Abteilung Süd / Freigabe-2")).toEqual(["Abteilung Süd / Freigabe-2"]);
  });
});

describe("appendRole", () => {
  it("appends to an empty editor", () => {
    expect(appendRole("", "system:admin")).toBe("system:admin");
  });

  it("appends after the existing roles", () => {
    expect(appendRole("a", "system:admin")).toBe("a, system:admin");
  });

  it("is a no-op when the role is already present", () => {
    expect(appendRole("a, system:admin", "system:admin")).toBe("a, system:admin");
  });

  it("leaves the typed text untouched when the role is already present, even if that text is unnormalized", () => {
    expect(appendRole(" a ,system:admin", "system:admin")).toBe(" a ,system:admin");
  });

  it("normalizes the existing text when it does append", () => {
    expect(appendRole(" a ,, b ", "system:reports")).toBe("a, b, system:reports");
  });
});

describe("managerChoices", () => {
  const users = [
    { userId: "user_a", email: "a@example.com" },
    { userId: "user_b", email: "b@example.com" },
    { userId: "user_c", email: "c@example.com" },
  ];

  it("excludes the account being changed, which the route refuses anyway", () => {
    expect(managerChoices(users, "user_b").map((u) => u.userId)).toEqual(["user_a", "user_c"]);
  });

  it("offers every other account, keeping the listed order", () => {
    expect(managerChoices(users, "user_zzz").map((u) => u.userId)).toEqual(["user_a", "user_b", "user_c"]);
  });

  it("offers nothing when the account is the only one listed", () => {
    expect(managerChoices([users[0]!], "user_a")).toEqual([]);
  });

  it("keeps a disabled account on the list, since disabling is not retirement", () => {
    const withDisabled = [...users, { userId: "user_d", email: "d@example.com", disabled: true }];
    expect(managerChoices(withDisabled, "user_a").map((u) => u.userId)).toContain("user_d");
  });
});

describe("managerLabel", () => {
  const users = [
    { userId: "user_a", email: "a@example.com" },
    { userId: "user_b", email: "b@example.com" },
  ];

  it("shows the manager's email", () => {
    expect(managerLabel(users, "user_b")).toBe("b@example.com");
  });

  it("shows an em dash when no manager is on record", () => {
    expect(managerLabel(users, undefined)).toBe("—");
  });

  it("falls back to the raw id rather than rendering blank", () => {
    expect(managerLabel(users, "user_gone")).toBe("user_gone");
  });

  // Both helpers read whatever array the screen hands them as the whole account
  // directory. That is why `UsersScreen.tsx`'s `load()` follows the cursor to
  // the end instead of showing one page: over a partial set the same manager
  // reads as an opaque id here, and leaves the dropdown below.
  it("resolves an email over the full set and falls back over a partial one", () => {
    const partial = [users[0]!];
    expect(managerLabel(users, "user_b")).toBe("b@example.com");
    expect(managerLabel(partial, "user_b")).toBe("user_b");
    expect(managerChoices(users, "user_a").map((u) => u.userId)).toEqual(["user_b"]);
    expect(managerChoices(partial, "user_a")).toEqual([]);
  });
});

describe("managerValueOf", () => {
  it("reads the empty option as a clear", () => {
    expect(managerValueOf("")).toBeNull();
  });

  it("passes any other value through as the target id", () => {
    expect(managerValueOf("user_b")).toBe("user_b");
  });
});
