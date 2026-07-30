/**
 * `src/http/health.ts`: `GET /livez` (unconditional, no DB dependency) and
 * `GET /readyz` (a database ping), plus the CORS/auth exemptions the
 * `http-wrapper` MODIFIED requirements carve out for both routes.
 */
import type { SQL } from "bun";
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createServer, resolveAuthResolver } from "../src/http/server.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { checkDbReady, handleLivez, handleReadyz } from "../src/http/health.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
});

test("handleLivez returns 200 unconditionally, no database dependency", async () => {
  const result = await handleLivez();
  expect(result).toEqual({ status: 200, body: { status: "ok" } });
});

test.skipIf(!DB)("handleReadyz returns 200 against the real test database", async () => {
  const result = await handleReadyz(sql);
  expect(result).toEqual({ status: 200, body: { status: "ok" } });
});

test("checkDbReady resolves false, not throwing, when the query rejects", async () => {
  const badDb = (() => {
    throw new Error("connection refused");
  }) as unknown as SQL;
  await expect(checkDbReady(badDb)).resolves.toBe(false);
});

test("handleReadyz returns 503 with no failure detail when the ping fails", async () => {
  const badDb = (() => {
    throw new Error("connection refused: password authentication failed for user \"postgres\"");
  }) as unknown as SQL;
  const result = await handleReadyz(badDb);
  expect(result).toEqual({ status: 503, body: { status: "unavailable" } });
});

test("OPTIONS /livez and OPTIONS /readyz are not treated as a preflight", async () => {
  const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver, "*");
  const livez = await fetch(new Request("http://x/livez", { method: "OPTIONS" }));
  const readyz = await fetch(new Request("http://x/readyz", { method: "OPTIONS" }));
  expect(livez.status).toBe(404);
  expect(readyz.status).toBe(404);
});

test.skipIf(!DB)("GET /livez ignores the CORS configuration", async () => {
  const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver, "*");
  const res = await fetch(new Request("http://x/livez", { headers: { Origin: "http://example.com" } }));
  expect(res.status).toBe(200);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
});

test.skipIf(!DB)("GET /readyz ignores a wildcard CORS configuration", async () => {
  const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver, "*");
  const res = await fetch(new Request("http://x/readyz", { headers: { Origin: "http://example.com" } }));
  expect(res.status).toBe(200);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
});

test.skipIf(!DB)("GET /readyz ignores an allowlist CORS configuration matching the request's Origin", async () => {
  const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver, ["http://example.com"]);
  const res = await fetch(new Request("http://x/readyz", { headers: { Origin: "http://example.com" } }));
  expect(res.status).toBe(200);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
});

test.skipIf(!DB)("neither route requires a credential when the JWT resolver is active", async () => {
  const resolver = resolveAuthResolver({ AUTH_JWT_SECRET: "health-test-secret-0123456789abcd" }); // >= 32 encoded bytes, required by resolveAuthResolver
  const fetch = createServer(dataSourceReg, reg, sql, resolver);
  const livez = await fetch(new Request("http://x/livez"));
  const readyz = await fetch(new Request("http://x/readyz"));
  expect(livez.status).toBe(200);
  expect(readyz.status).toBe(200);
});
