/**
 * `openspec/changes/add-ui-chrome-white-label-overrides`: the public
 * `GET /ui-strings` read and the two `/admin/ui-strings` writes.
 *
 * The public read is the one envelope this wrapper returns that no token gates.
 * These tests hold that gate open on purpose and hold it narrow: the route
 * answers the same map to everybody, and the write path decides how large that
 * map may get. DB-backed — skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createServer } from "../src/http/server.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { ADMIN_ROLE, DATALISTS_ROLE } from "../src/auth/authorize.js";
import { MAX_OVERRIDE_VALUE_LENGTH, MAX_OVERRIDES } from "../src/http/admin-routes.js";
import { MAX_KEY_LENGTH } from "../src/schema/compile.js";
import { setUiStringOverride, countUiStringOverrides } from "../src/engine/ui-strings.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);
const corsFetch = createServer(dataSourceReg, reg, sql, devHeaderResolver, "*");

const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };
const maintainer: Actor = { id: "user_maintainer", roles: [DATALISTS_ROLE] };
const bystander: Actor = { id: "user_bystander", roles: [] };

const PUBLIC = "http://x/ui-strings";
const ADMIN = "http://x/admin/ui-strings";

function req(url: string, method: string, actor: Actor, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: {
      "X-Actor-Id": actor.id,
      ...(actor.roles.length > 0 ? { "X-Actor-Roles": actor.roles.join(",") } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const put = (body: unknown, actor: Actor = admin) => fetch(req(ADMIN, "PUT", actor, body));

async function overridesFrom(res: Response): Promise<Record<string, Record<string, Record<string, string>>>> {
  const body = (await res.json()) as { overrides: Record<string, Record<string, Record<string, string>>> };
  return body.overrides;
}

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE ui_string_overrides`;
});

// --- The public read -------------------------------------------------------

test.skipIf(!DB)("an unauthenticated request returns every stored override as one nested map", async () => {
  await setUiStringOverride("shell", "en", "login.title", "Sign in", admin.id, sql);
  await setUiStringOverride("app", "de", "tasks.title", "Meine Arbeit", admin.id, sql);

  // No X-Actor-Id header at all: this is a browser fetch before any token exists.
  const res = await fetch(new Request(PUBLIC));
  expect(res.status).toBe(200);
  expect(await overridesFrom(res)).toEqual({
    app: { de: { "tasks.title": "Meine Arbeit" } },
    shell: { en: { "login.title": "Sign in" } },
  });
});

test.skipIf(!DB)("the public read answers the same map to an anonymous caller and to an admin", async () => {
  await setUiStringOverride("shell", "en", "login.title", "Sign in", admin.id, sql);

  const anonymous = await overridesFrom(await fetch(new Request(PUBLIC)));
  const authenticated = await overridesFrom(await fetch(req(PUBLIC, "GET", admin)));
  // The route reads the table whole, so no request can probe it for the
  // presence of anything a caller is not entitled to see.
  expect(anonymous).toEqual(authenticated);
});

test.skipIf(!DB)("the public read returns an empty map, not an error, when nothing is overridden", async () => {
  const res = await fetch(new Request(PUBLIC));
  expect(res.status).toBe(200);
  expect(await overridesFrom(res)).toEqual({});
});

test.skipIf(!DB)("the public read carries no updated_by, updated_at or any other column", async () => {
  await setUiStringOverride("shell", "en", "login.title", "Sign in", admin.id, sql);

  const body = (await (await fetch(new Request(PUBLIC))).json()) as Record<string, unknown>;
  expect(Object.keys(body)).toEqual(["overrides"]);
  // Three levels of plain strings and nothing else: the operator who typed the
  // value is not part of what an anonymous caller reads.
  expect(JSON.stringify(body)).not.toContain(admin.id);
});

test.skipIf(!DB)("the route answers an OPTIONS preflight, which a route outside the table would not", async () => {
  const res = await corsFetch(new Request(PUBLIC, { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});

test.skipIf(!DB)("a request carrying an allowed Origin comes back with the CORS header", async () => {
  const allowlisted = createServer(dataSourceReg, reg, sql, devHeaderResolver, ["http://example.com"]);
  const res = await allowlisted(new Request(PUBLIC, { headers: { Origin: "http://example.com" } }));
  expect(res.status).toBe(200);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://example.com");
});

// --- The admin routes ------------------------------------------------------

test.skipIf(!DB)("both admin routes refuse an actor without system:admin", async () => {
  for (const actor of [maintainer, bystander]) {
    const read = await fetch(req(ADMIN, "GET", actor));
    expect(read.status).toBe(403);
    const write = await put({ area: "shell", locale: "en", key: "login.title", value: "Sign in" }, actor);
    expect(write.status).toBe(403);
  }
  expect(await countUiStringOverrides(sql)).toBe(0);
});

test.skipIf(!DB)("a string value upserts the row and records the acting actor", async () => {
  const res = await put({ area: "shell", locale: "en", key: "login.title", value: "Sign in" });
  expect(res.status).toBe(200);

  const rows = (await sql`SELECT value, updated_by FROM ui_string_overrides`) as { value: string; updated_by: string }[];
  expect(rows).toEqual([{ value: "Sign in", updated_by: admin.id }]);
  expect(await overridesFrom(await fetch(req(ADMIN, "GET", admin)))).toEqual({ shell: { en: { "login.title": "Sign in" } } });
});

test.skipIf(!DB)("a null value deletes the row, and the public read stops carrying the key", async () => {
  await put({ area: "shell", locale: "en", key: "login.title", value: "Sign in" });
  const res = await put({ area: "shell", locale: "en", key: "login.title", value: null });
  expect(res.status).toBe(200);
  expect((await res.json()) as unknown).toMatchObject({ deleted: true });

  expect(await overridesFrom(await fetch(new Request(PUBLIC)))).toEqual({});
  expect(await countUiStringOverrides(sql)).toBe(0);
});

test.skipIf(!DB)("an over-long value is refused and no row is stored", async () => {
  const res = await put({ area: "shell", locale: "en", key: "login.title", value: "x".repeat(MAX_OVERRIDE_VALUE_LENGTH + 1) });
  expect(res.status).toBe(400);
  expect(await countUiStringOverrides(sql)).toBe(0);

  // The bound itself is not the violation: one character less is accepted.
  const ok = await put({ area: "shell", locale: "en", key: "login.title", value: "x".repeat(MAX_OVERRIDE_VALUE_LENGTH) });
  expect(ok.status).toBe(200);
});

test.skipIf(!DB)("an over-long area, locale or key is refused and no row is stored", async () => {
  const long = "k".repeat(MAX_KEY_LENGTH + 1);
  const base = { area: "shell", locale: "en", key: "login.title", value: "Sign in" };
  for (const field of ["area", "locale", "key"] as const) {
    const res = await put({ ...base, [field]: long });
    expect(res.status, `over-long ${field}`).toBe(400);
  }
  expect(await countUiStringOverrides(sql)).toBe(0);
});

test.skipIf(!DB)("an empty-string value is refused; clearing goes through null", async () => {
  await put({ area: "shell", locale: "en", key: "login.title", value: "Sign in" });

  const res = await put({ area: "shell", locale: "en", key: "login.title", value: "" });
  expect(res.status).toBe(400);
  // The existing override survives the refusal rather than being blanked.
  expect(await overridesFrom(await fetch(new Request(PUBLIC)))).toEqual({ shell: { en: { "login.title": "Sign in" } } });
});

test.skipIf(!DB)("a value that is neither a string nor null is refused", async () => {
  const res = await put({ area: "shell", locale: "en", key: "login.title", value: 42 });
  expect(res.status).toBe(400);
  expect(await countUiStringOverrides(sql)).toBe(0);
});

test.skipIf(!DB)("a write past the row bound is refused, while an overwrite and a clear stay possible", async () => {
  // Seed to the bound directly. Driving MAX_OVERRIDES writes through the route
  // would cost one request each and test the same predicate.
  await sql`
    INSERT INTO ui_string_overrides (area, locale, key, value, updated_by)
    SELECT 'shell', 'en', 'key.' || i, 'seeded', ${admin.id} FROM generate_series(1, ${MAX_OVERRIDES}) AS i
  `;
  expect(await countUiStringOverrides(sql)).toBe(MAX_OVERRIDES);

  const added = await put({ area: "shell", locale: "en", key: "one.too.many", value: "Sign in" });
  expect(added.status).toBe(400);
  expect(await countUiStringOverrides(sql)).toBe(MAX_OVERRIDES);

  // The bound counts rows, not writes: replacing a value adds none.
  const overwritten = await put({ area: "shell", locale: "en", key: "key.1", value: "Sign in" });
  expect(overwritten.status).toBe(200);
  const cleared = await put({ area: "shell", locale: "en", key: "key.1", value: null });
  expect(cleared.status).toBe(200);
  expect(await countUiStringOverrides(sql)).toBe(MAX_OVERRIDES - 1);
});
