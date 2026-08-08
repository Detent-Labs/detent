/**
 * The self-scoped account surface (src/http/account-routes.ts): `GET` and
 * `PATCH /account/me`. Every scenario the `account-self-service` capability
 * states, plus the 401 no resolvable actor gets.
 *
 * Separate from `test/http-admin.test.ts`, whose routes are all admin-gated.
 * These two check no role, so an admin fixture would test the wrong thing.
 * Each test creates a real `auth_users` row and sets `X-Actor-Id` to its
 * `user_id`, which is what makes the local path — rather than the federated
 * one — the path under test. DB-backed: skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql } from "../src/engine/store.js";
import { DB, initDb, authedReq } from "./helpers/http-fixture.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createServer } from "../src/http/server.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { createUser, setManagerById, DISPLAY_NAME_MAX_LENGTH } from "../src/auth/users.js";
import type { Actor } from "../src/cel/eval.js";

const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);

beforeAll(initDb);
beforeEach(async () => {
  if (DB) await sql`TRUNCATE auth_users`;
});

/** The signed-in actor behind a local `auth_users` row: `Actor.id` equals `user_id`. */
const selfActor = (userId: string, roles: string[] = []): Actor => ({ id: userId, roles });

const getMe = (actor: Actor) => fetch(authedReq("http://x/account/me", "GET", actor));
const patchMe = (actor: Actor, body: unknown) => fetch(authedReq("http://x/account/me", "PATCH", actor, body));

type AccountBody = {
  id: string;
  displayName?: string;
  storedDisplayName?: string | null;
  email?: string;
  roles: string[];
  managerUserId?: string;
  locale?: string;
  editable: boolean;
};

/** The stored columns, read directly, so an assertion about "no row changes" reads the table rather than the response. */
const storedRow = async (userId: string): Promise<{ display_name: string | null; locale: string | null }> => {
  const rows = (await sql`SELECT display_name, locale FROM auth_users WHERE user_id = ${userId}`) as { display_name: string | null; locale: string | null }[];
  return rows[0]!;
};

// ============================================================
// GET /account/me
// ============================================================

test.skipIf(!DB)("GET /account/me returns the local account's own record", async () => {
  const boss = await createUser("boss@example.com", "pw", []);
  const { userId } = await createUser("rita@example.com", "pw", ["finance:approver"], "Rita Alvarez");
  await setManagerById(userId, boss.userId);
  await sql`UPDATE auth_users SET locale = 'de' WHERE user_id = ${userId}`;

  const res = await getMe(selfActor(userId));
  expect(res.status).toBe(200);
  const body = (await res.json()) as AccountBody;
  expect(body).toEqual({
    id: userId,
    displayName: "Rita Alvarez",
    storedDisplayName: "Rita Alvarez",
    email: "rita@example.com",
    roles: ["finance:approver"],
    managerUserId: boss.userId,
    locale: "de",
    editable: true,
  });
});

test.skipIf(!DB)("GET /account/me reaches an actor holding no system:* role", async () => {
  const { userId } = await createUser("plain@example.com", "pw", []);
  const res = await getMe(selfActor(userId));
  expect(res.status).toBe(200);
  const body = (await res.json()) as AccountBody;
  expect(body.editable).toBe(true);
  expect(body.roles).toEqual([]);
  // No display name on record: the resolved value falls back to the email, and
  // the raw column stays null so the page's name box seeds empty.
  expect(body.displayName).toBe("plain@example.com");
  expect(body.storedDisplayName).toBeNull();
  expect(body.locale).toBeUndefined();
});

test.skipIf(!DB)("GET /account/me answers an actor with no auth_users row 200 and editable: false", async () => {
  const federated = selfActor("user_from_entra", ["finance:approver"]);
  const res = await getMe(federated);
  expect(res.status).toBe(200);
  const body = (await res.json()) as AccountBody;
  expect(body).toEqual({ id: "user_from_entra", roles: ["finance:approver"], editable: false });
  expect(body.displayName).toBeUndefined();
  expect(body.storedDisplayName).toBeUndefined();
  expect(body.email).toBeUndefined();
  expect(body.managerUserId).toBeUndefined();
  expect(body.locale).toBeUndefined();
});

test.skipIf(!DB)("GET /account/me without a credential maps to 401", async () => {
  const res = await fetch(new Request("http://x/account/me"));
  expect(res.status).toBe(401);
});

// ============================================================
// PATCH /account/me
// ============================================================

test.skipIf(!DB)("PATCH /account/me sets the caller's own display name", async () => {
  const { userId } = await createUser("rita2@example.com", "pw", []);
  const res = await patchMe(selfActor(userId), { displayName: "Rita Alvarez" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as AccountBody;
  expect(body.displayName).toBe("Rita Alvarez");
  expect((await storedRow(userId)).display_name).toBe("Rita Alvarez");
});

test.skipIf(!DB)("PATCH /account/me with displayName null clears the column and falls back to the email", async () => {
  const { userId } = await createUser("rita3@example.com", "pw", [], "Rita Alvarez");
  const res = await patchMe(selfActor(userId), { displayName: null });
  expect(res.status).toBe(200);
  const body = (await res.json()) as AccountBody;
  expect(body.displayName).toBe("rita3@example.com");
  expect((await storedRow(userId)).display_name).toBeNull();
});

test.skipIf(!DB)("PATCH /account/me refuses a display name that is empty after trimming", async () => {
  const { userId } = await createUser("rita4@example.com", "pw", [], "Keep Me");
  const res = await patchMe(selfActor(userId), { displayName: "   " });
  expect(res.status).toBe(400);
  expect((await storedRow(userId)).display_name).toBe("Keep Me");
});

test.skipIf(!DB)("PATCH /account/me refuses a display name past the bound", async () => {
  const { userId } = await createUser("rita5@example.com", "pw", [], "Keep Me");
  const res = await patchMe(selfActor(userId), { displayName: "x".repeat(DISPLAY_NAME_MAX_LENGTH + 1) });
  expect(res.status).toBe(400);
  expect((await storedRow(userId)).display_name).toBe("Keep Me");
});

test.skipIf(!DB)("PATCH /account/me accepts a display name exactly at the bound", async () => {
  const { userId } = await createUser("rita5b@example.com", "pw", []);
  const atBound = "x".repeat(DISPLAY_NAME_MAX_LENGTH);
  const res = await patchMe(selfActor(userId), { displayName: atBound });
  expect(res.status).toBe(200);
  expect((await storedRow(userId)).display_name).toBe(atBound);
});

// The regression M1 produced: the page seeded its name box from the resolved
// `displayName`, which is the email for a nameless account, so a locale-only
// save wrote that email into the column. The route must leave the column null.
test.skipIf(!DB)("PATCH /account/me changing only the locale leaves a nameless account nameless", async () => {
  const { userId } = await createUser("rita5c@example.com", "pw", []);
  const res = await patchMe(selfActor(userId), { locale: "de" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as AccountBody;
  expect(body.displayName).toBe("rita5c@example.com");
  expect(body.storedDisplayName).toBeNull();
  expect(await storedRow(userId)).toEqual({ display_name: null, locale: "de" });
});

test.skipIf(!DB)("PATCH /account/me sets the caller's own locale", async () => {
  const { userId } = await createUser("rita6@example.com", "pw", []);
  const res = await patchMe(selfActor(userId), { locale: "de" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as AccountBody;
  expect(body.locale).toBe("de");
  expect((await storedRow(userId)).locale).toBe("de");
});

test.skipIf(!DB)("PATCH /account/me refuses a locale outside the supported set", async () => {
  const { userId } = await createUser("rita7@example.com", "pw", []);
  await sql`UPDATE auth_users SET locale = 'en' WHERE user_id = ${userId}`;
  const res = await patchMe(selfActor(userId), { locale: "fr" });
  expect(res.status).toBe(400);
  expect((await storedRow(userId)).locale).toBe("en");
});

test.skipIf(!DB)("PATCH /account/me refuses a body key outside displayName and locale", async () => {
  const { userId } = await createUser("rita8@example.com", "pw", ["keep"], "Keep Me");
  const res = await patchMe(selfActor(userId), { roles: ["system:admin"] });
  expect(res.status).toBe(400);
  const rows = (await sql`SELECT roles, display_name FROM auth_users WHERE user_id = ${userId}`) as { roles: string[]; display_name: string | null }[];
  expect(rows[0]!.roles).toEqual(["keep"]);
  expect(rows[0]!.display_name).toBe("Keep Me");
});

test.skipIf(!DB)("PATCH /account/me refuses an unknown key even beside a valid one", async () => {
  const { userId } = await createUser("rita9@example.com", "pw", [], "Keep Me");
  const res = await patchMe(selfActor(userId), { displayName: "Changed", disabled: true });
  expect(res.status).toBe(400);
  expect((await storedRow(userId)).display_name).toBe("Keep Me");
});

test.skipIf(!DB)("PATCH /account/me writes both fields in one request", async () => {
  const { userId } = await createUser("rita10@example.com", "pw", []);
  const res = await patchMe(selfActor(userId), { displayName: "Rita Alvarez", locale: "de" });
  expect(res.status).toBe(200);
  expect(await storedRow(userId)).toEqual({ display_name: "Rita Alvarez", locale: "de" });
});

test.skipIf(!DB)("PATCH /account/me leaves the field a request omits untouched", async () => {
  const { userId } = await createUser("rita11@example.com", "pw", [], "Rita Alvarez");
  await sql`UPDATE auth_users SET locale = 'de' WHERE user_id = ${userId}`;
  const res = await patchMe(selfActor(userId), { locale: "en" });
  expect(res.status).toBe(200);
  expect(await storedRow(userId)).toEqual({ display_name: "Rita Alvarez", locale: "en" });
});

test.skipIf(!DB)("PATCH /account/me refuses a federated actor's write with 403 and changes no row", async () => {
  const { userId } = await createUser("bystander@example.com", "pw", [], "Untouched");
  const res = await patchMe(selfActor("user_from_entra"), { displayName: "Anyone" });
  expect(res.status).toBe(403);
  expect((await storedRow(userId)).display_name).toBe("Untouched");
  const count = (await sql`SELECT count(*)::int AS n FROM auth_users WHERE display_name = 'Anyone'`) as { n: number }[];
  expect(count[0]!.n).toBe(0);
});

test.skipIf(!DB)("PATCH /account/me refuses a body that is not a JSON object", async () => {
  const { userId } = await createUser("rita12@example.com", "pw", [], "Keep Me");
  const res = await fetch(
    new Request("http://x/account/me", { method: "PATCH", headers: { "Content-Type": "application/json", "X-Actor-Id": userId }, body: "[]" }),
  );
  expect(res.status).toBe(400);
  expect((await storedRow(userId)).display_name).toBe("Keep Me");
});

// ============================================================
// CORS preflight, derived from the route table
// ============================================================

test("OPTIONS preflight on /account/me returns 204 permitting GET and PATCH", async () => {
  const res = await fetch(new Request("http://x/account/me", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, PATCH");
});
