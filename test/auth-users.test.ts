/**
 * `auth_users` schema (ensureSchema/initSchema) + `src/auth/users.ts`
 * (createUser/verifyLogin/setRoles/setRolesById/setPassword/setPasswordById/
 * listUsers/setDisabled). DB-backed, skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import {
  createUser,
  verifyLogin,
  setRoles,
  setRolesById,
  setPassword,
  setPasswordById,
  listUsers,
  setDisabled,
  setManagerById,
  setManagerByEmail,
  getManagerOf,
  setDisplayName,
  setDisplayNameByEmail,
  getAccountById,
  updateAccount,
  SelfManagerError,
} from "../src/auth/users.js";

const DB = !!process.env.DATABASE_URL;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE auth_users`;
});

test.skipIf(!DB)("initSchema creates auth_users with a unique constraint on email", async () => {
  await createUser("a@example.com", "pw1", []);
  let caught: unknown;
  try {
    await createUser("a@example.com", "pw2", []);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  const rows = (await sql`SELECT count(*)::int AS n FROM auth_users`) as { n: number }[];
  expect(rows[0]!.n).toBe(1);
});

test.skipIf(!DB)("a created user's password verifies and returns userId/roles", async () => {
  const { userId } = await createUser("b@example.com", "correct-horse", ["employee"]);
  const result = await verifyLogin("b@example.com", "correct-horse");
  expect(result).toEqual({ userId, roles: ["employee"], displayName: "b@example.com" });
});

test.skipIf(!DB)("a wrong password does not verify", async () => {
  await createUser("c@example.com", "correct-horse", []);
  expect(await verifyLogin("c@example.com", "wrong-password")).toBeUndefined();
});

test.skipIf(!DB)("an unknown email does not verify", async () => {
  expect(await verifyLogin("nobody@example.com", "anything")).toBeUndefined();
});

test.skipIf(!DB)("an unknown email takes comparable time to a known one with the wrong password", async () => {
  await createUser("timing@example.com", "correct-horse", []);

  const time = async (fn: () => Promise<unknown>): Promise<number> => {
    const start = performance.now();
    await fn();
    return performance.now() - start;
  };

  const knownWrong = await time(() => verifyLogin("timing@example.com", "wrong-password"));
  const unknown = await time(() => verifyLogin("nobody-timing@example.com", "wrong-password"));

  // Before this fix, an unknown email skipped Bun.password.verify entirely and
  // returned roughly two orders of magnitude faster (about 1/100 the duration).
  // A 1/2 bound is a wide margin that separates the two behaviors without
  // depending on machine speed — do not tighten it, or this becomes a flaky test.
  expect(unknown).toBeGreaterThan(knownWrong / 2);
});

test.skipIf(!DB)("no plaintext password is stored", async () => {
  await createUser("d@example.com", "correct-horse", []);
  const rows = (await sql`SELECT password_hash FROM auth_users WHERE email = ${"d@example.com"}`) as { password_hash: string }[];
  expect(rows[0]!.password_hash).not.toBe("correct-horse");
  expect(rows[0]!.password_hash).toStartWith("$argon2id$");
});

test.skipIf(!DB)("a disabled user cannot log in even with the correct password", async () => {
  await createUser("e@example.com", "correct-horse", []);
  await sql`UPDATE auth_users SET disabled = true WHERE email = ${"e@example.com"}`;
  expect(await verifyLogin("e@example.com", "correct-horse")).toBeUndefined();
});

test.skipIf(!DB)("setRoles updates the stored roles", async () => {
  await createUser("f@example.com", "pw", []);
  await setRoles("f@example.com", ["admin", "finance-approver"]);
  const result = await verifyLogin("f@example.com", "pw");
  expect(result?.roles).toEqual(["admin", "finance-approver"]);
});

test.skipIf(!DB)("setPassword changes the password that verifies", async () => {
  await createUser("g@example.com", "old-pw", []);
  await setPassword("g@example.com", "new-pw");
  expect(await verifyLogin("g@example.com", "old-pw")).toBeUndefined();
  expect(await verifyLogin("g@example.com", "new-pw")).toBeDefined();
});

test.skipIf(!DB)("listUsers returns every user without password_hash", async () => {
  await createUser("h1@example.com", "pw", ["employee"]);
  await createUser("h2@example.com", "pw", []);
  const { items: users } = await listUsers();
  expect(users.map((u) => u.email).sort()).toEqual(["h1@example.com", "h2@example.com"]);
  const h1 = users.find((u) => u.email === "h1@example.com")!;
  expect(h1.roles).toEqual(["employee"]);
  expect(h1.disabled).toBe(false);
  expect(h1).not.toHaveProperty("password_hash");
});

test.skipIf(!DB)("setDisabled flips the flag and returns the updated row, or undefined for an unknown userId", async () => {
  const { userId } = await createUser("i@example.com", "pw", ["employee"]);
  const updated = await setDisabled(userId, true);
  expect(updated).toEqual({ userId, email: "i@example.com", roles: ["employee"], disabled: true, managerUserId: undefined, displayName: "i@example.com" });
  const [after] = (await listUsers()).items;
  expect(after!.disabled).toBe(true);
  expect(await setDisabled("user_does_not_exist", true)).toBeUndefined();
});

test.skipIf(!DB)("setRolesById replaces the whole set and returns the updated row, or undefined for an unknown userId", async () => {
  const { userId } = await createUser("k@example.com", "pw", ["a", "b"]);
  const updated = await setRolesById(userId, ["a"]);
  expect(updated).toEqual({ userId, email: "k@example.com", roles: ["a"], disabled: false, managerUserId: undefined, displayName: "k@example.com" });
  expect(await setRolesById("user_does_not_exist", ["a"])).toBeUndefined();
});

test.skipIf(!DB)("setRoles and setRolesById write the same column", async () => {
  const { userId } = await createUser("l@example.com", "pw", []);
  await setRoles("l@example.com", ["from-cli"]);
  const [afterCli] = (await listUsers()).items;
  expect(afterCli!.roles).toEqual(["from-cli"]);
  await setRolesById(userId, ["from-route"]);
  const [afterRoute] = (await listUsers()).items;
  expect(afterRoute!.roles).toEqual(["from-route"]);
  expect((await verifyLogin("l@example.com", "pw"))?.roles).toEqual(["from-route"]);
});

test.skipIf(!DB)("a user disabled via setDisabled fails verifyLogin exactly like one disabled directly in the DB", async () => {
  const { userId } = await createUser("j@example.com", "correct-horse", []);
  await setDisabled(userId, true);
  expect(await verifyLogin("j@example.com", "correct-horse")).toBeUndefined();
  await setDisabled(userId, false);
  expect(await verifyLogin("j@example.com", "correct-horse")).toBeDefined();
});

// ============================================================
// The manager pointer (manager-of-starter-assignment)
// ============================================================

test.skipIf(!DB)("initSchema adds manager_user_id, and an existing row holds NULL", async () => {
  // The column ships as its own ALTER, since CREATE TABLE IF NOT EXISTS does not
  // touch a table that already exists. Re-running initSchema over a populated
  // table is the shape a deployed database upgrades through.
  const { userId } = await createUser("m1@example.com", "pw", []);
  await initSchema();
  const rows = (await sql`SELECT manager_user_id FROM auth_users WHERE user_id = ${userId}`) as { manager_user_id: string | null }[];
  expect(rows[0]!.manager_user_id).toBeNull();
  const [listed] = (await listUsers()).items;
  expect(listed!.managerUserId).toBeUndefined();
});

test.skipIf(!DB)("initSchema adds locale, and an existing row holds NULL", async () => {
  // Same shape as the manager_user_id migration above: its own ALTER, run over a
  // table that already holds a row, which is how a deployed database upgrades.
  const { userId } = await createUser("loc1@example.com", "pw", []);
  await initSchema();
  const rows = (await sql`SELECT locale FROM auth_users WHERE user_id = ${userId}`) as { locale: string | null }[];
  expect(rows[0]!.locale).toBeNull();
  expect((await getAccountById(userId))!.locale).toBeUndefined();
});

test.skipIf(!DB)("getAccountById returns one account, or undefined for an unknown id", async () => {
  const boss = await createUser("loc-boss@example.com", "pw", []);
  const { userId } = await createUser("loc2@example.com", "pw", ["a"], "Rita Alvarez");
  await setManagerById(userId, boss.userId);
  await updateAccount(userId, { locale: "de" });
  expect(await getAccountById(userId)).toEqual({
    userId,
    email: "loc2@example.com",
    roles: ["a"],
    disabled: false,
    managerUserId: boss.userId,
    displayName: "Rita Alvarez",
    storedDisplayName: "Rita Alvarez",
    locale: "de",
  });
  expect(await getAccountById("user_does_not_exist")).toBeUndefined();
});

test.skipIf(!DB)("updateAccount leaves a column the change set omits untouched", async () => {
  const { userId } = await createUser("loc3@example.com", "pw", [], "Rita Alvarez");
  await updateAccount(userId, { locale: "de" });
  const afterLocale = await updateAccount(userId, { locale: "en" });
  expect(afterLocale!.displayName).toBe("Rita Alvarez");
  const afterName = await updateAccount(userId, { displayName: null });
  expect(afterName!.locale).toBe("en");
  expect(afterName!.displayName).toBe("loc3@example.com");
  expect(await updateAccount("user_does_not_exist", { locale: "de" })).toBeUndefined();
});

test.skipIf(!DB)("an account record carries the raw display_name column beside the resolved name", async () => {
  const named = await createUser("raw1@example.com", "pw", [], "Rita Alvarez");
  const unnamed = await createUser("raw2@example.com", "pw", []);
  expect((await getAccountById(named.userId))!.storedDisplayName).toBe("Rita Alvarez");
  const record = (await getAccountById(unnamed.userId))!;
  expect(record.storedDisplayName).toBeNull();
  expect(record.displayName).toBe("raw2@example.com");
  expect((await updateAccount(named.userId, { displayName: null }))!.storedDisplayName).toBeNull();
});

test.skipIf(!DB)("a manager pointer round-trips through setManagerById and getManagerOf", async () => {
  const boss = await createUser("boss@example.com", "pw", []);
  const staff = await createUser("staff@example.com", "pw", []);
  const updated = await setManagerById(staff.userId, boss.userId);
  expect(updated!.managerUserId).toBe(boss.userId);
  expect(await getManagerOf(staff.userId)).toBe(boss.userId);
});

test.skipIf(!DB)("setManagerById with null clears the pointer", async () => {
  const boss = await createUser("boss2@example.com", "pw", []);
  const staff = await createUser("staff2@example.com", "pw", []);
  await setManagerById(staff.userId, boss.userId);
  const cleared = await setManagerById(staff.userId, null);
  expect(cleared!.managerUserId).toBeUndefined();
  expect(await getManagerOf(staff.userId)).toBeUndefined();
});

test.skipIf(!DB)("setManagerById returns undefined for an unknown userId", async () => {
  const boss = await createUser("boss3@example.com", "pw", []);
  expect(await setManagerById("user_does_not_exist", boss.userId)).toBeUndefined();
});

test.skipIf(!DB)("a manager naming no account is refused by the self-reference", async () => {
  const staff = await createUser("staff4@example.com", "pw", []);
  let caught: unknown;
  try {
    await setManagerById(staff.userId, "user_does_not_exist");
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  expect(await getManagerOf(staff.userId)).toBeUndefined();
});

test.skipIf(!DB)("an account cannot be its own manager", async () => {
  const staff = await createUser("staff5@example.com", "pw", []);
  let caught: unknown;
  try {
    await setManagerById(staff.userId, staff.userId);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(SelfManagerError);
  expect(await getManagerOf(staff.userId)).toBeUndefined();
});

test.skipIf(!DB)("a two-account cycle is representable, since nothing walks the pointer", async () => {
  const a = await createUser("cyc-a@example.com", "pw", []);
  const b = await createUser("cyc-b@example.com", "pw", []);
  await setManagerById(a.userId, b.userId);
  await setManagerById(b.userId, a.userId);
  expect(await getManagerOf(a.userId)).toBe(b.userId);
  expect(await getManagerOf(b.userId)).toBe(a.userId);
});

test.skipIf(!DB)("getManagerOf is undefined for no manager and for an unknown account", async () => {
  const staff = await createUser("staff6@example.com", "pw", []);
  expect(await getManagerOf(staff.userId)).toBeUndefined();
  expect(await getManagerOf("user_does_not_exist")).toBeUndefined();
});

test.skipIf(!DB)("an account with no manager still logs in and still lists", async () => {
  await createUser("plain@example.com", "pw", ["employee"]);
  expect(await verifyLogin("plain@example.com", "pw")).toMatchObject({ roles: ["employee"] });
  const [listed] = (await listUsers()).items;
  expect(listed!.managerUserId).toBeUndefined();
});

test.skipIf(!DB)("setManagerByEmail is the CLI's email-keyed path, and clears with null", async () => {
  await createUser("boss7@example.com", "pw", []);
  const staff = await createUser("staff7@example.com", "pw", []);
  await setManagerByEmail("staff7@example.com", "boss7@example.com");
  const boss = (await listUsers()).items.find((u) => u.email === "boss7@example.com")!;
  expect(await getManagerOf(staff.userId)).toBe(boss.userId);
  await setManagerByEmail("staff7@example.com", null);
  expect(await getManagerOf(staff.userId)).toBeUndefined();
});

test.skipIf(!DB)("setManagerByEmail names the email that does not exist", async () => {
  await createUser("staff8@example.com", "pw", []);
  expect(setManagerByEmail("staff8@example.com", "ghost@example.com")).rejects.toThrow("ghost@example.com");
  expect(setManagerByEmail("ghost@example.com", null)).rejects.toThrow("ghost@example.com");
});

test.skipIf(!DB)("setPasswordById replaces the hash and returns the row, or undefined for an unknown userId", async () => {
  const { userId } = await createUser("pw1@example.com", "old-pw", ["employee"]);
  const before = (await sql`SELECT password_hash FROM auth_users WHERE user_id = ${userId}`) as { password_hash: string }[];

  const updated = await setPasswordById(userId, "new-pw");
  expect(updated).toEqual({ userId, email: "pw1@example.com", roles: ["employee"], disabled: false, managerUserId: undefined, displayName: "pw1@example.com" });

  const after = (await sql`SELECT password_hash FROM auth_users WHERE user_id = ${userId}`) as { password_hash: string }[];
  expect(after[0]!.password_hash).not.toBe(before[0]!.password_hash);
  expect(await setPasswordById("user_does_not_exist", "new-pw")).toBeUndefined();
});

test.skipIf(!DB)("a password set by setPasswordById logs in, and the previous one stops", async () => {
  const { userId } = await createUser("pw2@example.com", "old-pw", []);
  await setPasswordById(userId, "new-pw");
  expect(await verifyLogin("pw2@example.com", "new-pw")).toMatchObject({ userId });
  expect(await verifyLogin("pw2@example.com", "old-pw")).toBeUndefined();
});

test.skipIf(!DB)("setPasswordById writes password_hash alone", async () => {
  const boss = await createUser("pw3-boss@example.com", "pw", []);
  const { userId } = await createUser("pw3@example.com", "old-pw", ["a", "b"]);
  await setManagerById(userId, boss.userId);
  await setDisabled(userId, true);

  const updated = await setPasswordById(userId, "new-pw");
  expect(updated).toEqual({ userId, email: "pw3@example.com", roles: ["a", "b"], disabled: true, managerUserId: boss.userId, displayName: "pw3@example.com" });
});

/**
 * `createUser` runs `Bun.password.hash` (argon2id) once per account, so 51
 * calls would cost seconds of CPU inside a shared suite. The rows below assert
 * a page size, never a credential, so they carry one constant hash string.
 * `roles` takes its column default.
 */
async function seedAccounts(emails: string[]): Promise<void> {
  const ids = emails.map((_, i) => `user_seed_${i}`);
  await sql`
    INSERT INTO auth_users (user_id, email, password_hash)
    SELECT id, email, 'not-a-real-hash'
    FROM UNNEST(${sql.array(ids, "TEXT")}::text[], ${sql.array(emails, "TEXT")}::text[]) AS t(id, email)
  `;
}

test.skipIf(!DB)("listUsers orders by email and pages through the whole set with a cursor", async () => {
  await seedAccounts(["c@example.com", "a@example.com", "b@example.com", "d@example.com"]);

  const first = await listUsers({ limit: 2 });
  expect(first.items.map((u) => u.email)).toEqual(["a@example.com", "b@example.com"]);
  expect(first.cursor).toBeDefined();

  const second = await listUsers({ limit: 2, cursor: first.cursor });
  expect(second.items.map((u) => u.email)).toEqual(["c@example.com", "d@example.com"]);
  expect(second.cursor).toBeUndefined();
});

test.skipIf(!DB)("listUsers defaults to 50 rows and hands back a cursor for the rest", async () => {
  // 51 accounts: one past the default, so the default is what bounds the first
  // page rather than the row count running out.
  const emails = Array.from({ length: 51 }, (_, i) => `page-${String(i).padStart(3, "0")}@example.com`);
  await seedAccounts(emails);

  const page = await listUsers();
  expect(page.items).toHaveLength(50);
  expect(page.cursor).toBeDefined();

  const rest = await listUsers({ cursor: page.cursor });
  expect(rest.items).toHaveLength(1);
  expect(rest.cursor).toBeUndefined();
  expect([...page.items, ...rest.items].map((u) => u.email)).toEqual(emails);
});

test.skipIf(!DB)("listUsers caps limit at MAX_LIST_LIMIT rather than refusing it", async () => {
  await seedAccounts(Array.from({ length: 3 }, (_, i) => `cap-${i}@example.com`));
  const page = await listUsers({ limit: 10_000 });
  expect(page.items).toHaveLength(3);
  expect(page.cursor).toBeUndefined();
});

// ============================================================
// The display name (COALESCE(display_name, email))
// ============================================================

const storedDisplayName = async (userId: string): Promise<string | null> => {
  const rows = (await sql`SELECT display_name FROM auth_users WHERE user_id = ${userId}`) as { display_name: string | null }[];
  return rows[0]!.display_name;
};

test.skipIf(!DB)("initSchema adds display_name, and an existing row holds NULL", async () => {
  // Its own ALTER, like manager_user_id: CREATE TABLE IF NOT EXISTS does not
  // touch a table that already exists, so a deployed database picks the column
  // up on the next run over its populated table.
  const { userId } = await createUser("n1@example.com", "pw", []);
  await initSchema();
  expect(await storedDisplayName(userId)).toBeNull();
  const [listed] = (await listUsers()).items;
  expect(listed!.displayName).toBe("n1@example.com");
});

test.skipIf(!DB)("createUser stores a display name, and verifyLogin returns it instead of the email", async () => {
  const { userId } = await createUser("n2@example.com", "pw", [], "Rita Alvarez");
  expect(await storedDisplayName(userId)).toBe("Rita Alvarez");
  expect((await verifyLogin("n2@example.com", "pw"))?.displayName).toBe("Rita Alvarez");
});

test.skipIf(!DB)("createUser trims the display name, and stores NULL for an omitted, empty or whitespace-only one", async () => {
  const trimmed = await createUser("n3@example.com", "pw", [], "  Rita Alvarez  ");
  expect(await storedDisplayName(trimmed.userId)).toBe("Rita Alvarez");

  // Each of these must leave NULL, never "": the resolution reads the column
  // with `??`, so an empty string would resolve to an empty display name.
  const omitted = await createUser("n4@example.com", "pw", []);
  const empty = await createUser("n5@example.com", "pw", [], "");
  const blank = await createUser("n6@example.com", "pw", [], "   ");
  for (const { userId } of [omitted, empty, blank]) {
    expect(await storedDisplayName(userId)).toBeNull();
  }
  expect((await verifyLogin("n6@example.com", "pw"))?.displayName).toBe("n6@example.com");
});

test.skipIf(!DB)("setDisplayName sets, trims and clears, and is undefined for an unknown userId", async () => {
  const { userId } = await createUser("n7@example.com", "pw", []);
  const set = await setDisplayName(userId, "  Rita Alvarez  ");
  expect(set!.displayName).toBe("Rita Alvarez");
  expect(await storedDisplayName(userId)).toBe("Rita Alvarez");

  const cleared = await setDisplayName(userId, null);
  expect(cleared!.displayName).toBe("n7@example.com");
  expect(await storedDisplayName(userId)).toBeNull();

  expect(await setDisplayName("user_does_not_exist", "Rita Alvarez")).toBeUndefined();
});

test.skipIf(!DB)("setDisplayName normalizes a whitespace-only value to NULL rather than an empty string", async () => {
  // This function normalizes; refusing an empty submission is the HTTP route's
  // job (see test/http-admin.test.ts).
  const { userId } = await createUser("n8@example.com", "pw", []);
  await setDisplayName(userId, "Rita Alvarez");
  const updated = await setDisplayName(userId, "   ");
  expect(await storedDisplayName(userId)).toBeNull();
  expect(updated!.displayName).toBe("n8@example.com");
});

test.skipIf(!DB)("setDisplayNameByEmail is the CLI's email-keyed path, and names an email that does not exist", async () => {
  const { userId } = await createUser("n9@example.com", "pw", []);
  await setDisplayNameByEmail("n9@example.com", " Rita Alvarez ");
  expect(await storedDisplayName(userId)).toBe("Rita Alvarez");
  await setDisplayNameByEmail("n9@example.com", "   ");
  expect(await storedDisplayName(userId)).toBeNull();
  expect(setDisplayNameByEmail("ghost@example.com", "Rita Alvarez")).rejects.toThrow("ghost@example.com");
});

test.skipIf(!DB)("listUsers resolves displayName per row, falling back to email only where the column is NULL", async () => {
  await createUser("n10@example.com", "pw", [], "Rita Alvarez");
  await createUser("n11@example.com", "pw", []);
  const { items: users } = await listUsers();
  expect(users.find((u) => u.email === "n10@example.com")!.displayName).toBe("Rita Alvarez");
  expect(users.find((u) => u.email === "n11@example.com")!.displayName).toBe("n11@example.com");
});

test.skipIf(!DB)("setRolesById, setDisabled, setManagerById and setPasswordById all return the stored display name, not the email", async () => {
  // All four share `toSummary`; a column list missing `display_name` in one of
  // them returns that row's email while the stored name says otherwise.
  const boss = await createUser("n12-boss@example.com", "pw", []);
  const { userId } = await createUser("n12@example.com", "pw", [], "Rita Alvarez");
  expect((await setRolesById(userId, ["employee"]))!.displayName).toBe("Rita Alvarez");
  expect((await setDisabled(userId, true))!.displayName).toBe("Rita Alvarez");
  expect((await setManagerById(userId, boss.userId))!.displayName).toBe("Rita Alvarez");
  expect((await setPasswordById(userId, "new-pw"))!.displayName).toBe("Rita Alvarez");
});
