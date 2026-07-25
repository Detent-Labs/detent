/**
 * `auth_users` schema (ensureSchema/initSchema) + `src/auth/users.ts`
 * (createUser/verifyLogin/setRoles/setPassword). DB-backed, skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createUser, verifyLogin, setRoles, setPassword } from "../src/auth/users.js";

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
  expect(result).toEqual({ userId, roles: ["employee"] });
});

test.skipIf(!DB)("a wrong password does not verify", async () => {
  await createUser("c@example.com", "correct-horse", []);
  expect(await verifyLogin("c@example.com", "wrong-password")).toBeUndefined();
});

test.skipIf(!DB)("an unknown email does not verify", async () => {
  expect(await verifyLogin("nobody@example.com", "anything")).toBeUndefined();
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
