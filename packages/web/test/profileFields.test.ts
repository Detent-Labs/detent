/**
 * `profileFields.ts`'s form bookkeeping, asserted without a DOM: seeding the
 * edit form from a loaded account, building the `PATCH /account/me` body, and
 * formatting a role list. `ProfilePage.tsx` renders the federated and local
 * branches directly as JSX; that rendered markup is a browser-check concern
 * (see `docs/browser-checks.md`), not this file's.
 */
import { describe, expect, it } from "bun:test";
import { accountChanges, editSeed, rolesText, ABSENT } from "../src/shell/profileFields.js";
import type { AccountView } from "../src/api/types.js";

const local: AccountView = {
  id: "usr_1",
  roles: ["system:admin", "system:developer"],
  editable: true,
  displayName: "Ada Lovelace",
  storedDisplayName: "Ada Lovelace",
  email: "ada@example.com",
  managerUserId: "usr_2",
  locale: "de",
};

/**
 * The shape the route answers for a local account that never set a name:
 * `displayName` resolves to the email, `storedDisplayName` is the `NULL`
 * column. The two differ only here, which is the case the seed must read.
 */
const unnamed: AccountView = {
  id: "usr_3",
  roles: [],
  editable: true,
  displayName: "grace@example.com",
  storedDisplayName: null,
  email: "grace@example.com",
  managerUserId: undefined,
  locale: undefined,
};

describe("rolesText", () => {
  it("prints a placeholder for an account with no roles", () => {
    expect(rolesText([])).toBe(ABSENT);
  });

  it("joins every role the account holds", () => {
    expect(rolesText(["system:admin", "system:developer"])).toBe("system:admin, system:developer");
  });
});

describe("editSeed", () => {
  it("seeds the name box with the name the account set", () => {
    expect(editSeed(local, "en")).toEqual({ displayName: "Ada Lovelace", locale: "de" });
  });

  // The defect this replaces: seeding from the resolved `displayName` put the
  // email in the box, and every save — a locale-only one included — stored it.
  it("leaves the name box empty where the account set no name, though the resolved value is the email", () => {
    expect(editSeed(unnamed, "de")).toEqual({ displayName: "", locale: "de" });
  });

  it("seeds the picker with the active locale where the account chose none", () => {
    expect(editSeed({ ...local, locale: undefined }, "de").locale).toBe("de");
  });

  it("drops an account locale outside the two shipped catalogs", () => {
    expect(editSeed({ ...local, locale: "fr" }, "en").locale).toBe("en");
  });
});

describe("accountChanges", () => {
  it("sends the trimmed name and the chosen locale", () => {
    expect(accountChanges({ displayName: "  Ada  ", locale: "de" })).toEqual({ displayName: "Ada", locale: "de" });
  });

  it("clears the stored name with null rather than an empty string, which the route refuses", () => {
    expect(accountChanges({ displayName: "   ", locale: "en" })).toEqual({ displayName: null, locale: "en" });
  });
});
