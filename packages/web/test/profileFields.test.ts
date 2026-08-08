/**
 * The profile page's presentation decision, asserted without a DOM. The page
 * component renders what these functions return, so the two shapes `GET
 * /account/me` answers with are covered here rather than in a browser.
 *
 * The federated case is unreachable from a browser walk at all: `POST
 * /auth/login` issues an `iss: "bps"` token only (`src/auth/login.ts`), and such
 * a token guarantees a local `auth_users` row.
 */
import { describe, expect, it } from "bun:test";
import { accountChanges, editSeed, profileFields, ABSENT } from "../src/shell/profileFields.js";
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

const federated: AccountView = { id: "sso|ada", roles: ["system:reports"], editable: false };

describe("profileFields", () => {
  it("gives a local account its five rows, in the order the page prints them", () => {
    const view = profileFields(local);
    expect(view.editable).toBe(true);
    expect(view.rows.map((r) => r.key)).toEqual(["email", "roles", "managerUserId", "displayName", "locale"]);
    expect(view.rows.map((r) => r.value)).toEqual(["ada@example.com", "system:admin, system:developer", "usr_2", "Ada Lovelace", "de"]);
  });

  it("marks exactly the display name and the locale as the actor's to change", () => {
    const editable = profileFields(local).rows.filter((r) => r.control !== "read-only");
    expect(editable.map((r) => [r.key, r.control])).toEqual([
      ["displayName", "text"],
      ["locale", "locale"],
    ]);
  });

  it("sets the machine-matched values in the mono face and nothing else", () => {
    expect(
      profileFields(local)
        .rows.filter((r) => r.mono)
        .map((r) => r.key),
    ).toEqual(["roles", "managerUserId"]);
  });

  it("prints a placeholder where a local account holds no manager", () => {
    const view = profileFields({ ...local, managerUserId: undefined });
    expect(view.rows.find((r) => r.key === "managerUserId")?.value).toBe(ABSENT);
  });

  it("gives a federated actor an id and roles alone, with no row to change", () => {
    const view = profileFields(federated);
    expect(view.editable).toBe(false);
    expect(view.rows.map((r) => r.key)).toEqual(["id", "roles"]);
    expect(view.rows.map((r) => r.value)).toEqual(["sso|ada", "system:reports"]);
    expect(view.rows.every((r) => r.control === "read-only")).toBe(true);
  });

  it("gives every row a catalog key rather than a literal label", () => {
    for (const row of [...profileFields(local).rows, ...profileFields(federated).rows]) {
      expect(row.labelKey).toStartWith("profile.");
    }
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
