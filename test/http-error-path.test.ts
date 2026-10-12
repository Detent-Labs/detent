/**
 * The error path of the HTTP wrapper: the dispatcher catch in `createServer`,
 * the settings that keep Bun out of development mode, and the login email
 * check that runs before any rate-limit window or query.
 *
 * None of the `createServer` tests needs a database. The `db` handle throws on
 * any statement, so a passing test also proves that the request ran no query
 * (the NUL-byte cases) or that a database fault reached the catch (the 500).
 */
import { test, expect, spyOn } from "bun:test";
import type { SQL } from "bun";
import { createServer } from "../src/http/server.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { MAX_ATTEMPTS, MAX_ADDRESS_ATTEMPTS } from "../src/auth/login.js";

const SECRET = "http-error-path-secret-0123456789"; // >= 32 encoded bytes
const ALLOWED_ORIGIN = "https://app.example.test";

/** A database handle whose every statement raises, the way a missing relation does. */
const throwingDb = ((): never => {
  throw new Error("relation secret_table");
}) as unknown as SQL;

const fetchWith = (db: SQL) =>
  createServer(createDataSourceRegistry(), createRegistry(), db, devHeaderResolver, [ALLOWED_ORIGIN], SECRET);

const loginReq = (email: string): Request =>
  new Request("http://x/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", Origin: ALLOWED_ORIGIN },
    body: JSON.stringify({ email, password: "irrelevant" }),
  });

test("a handler that throws unguarded answers a message-free JSON 500 with the CORS headers, and logs the method and path", async () => {
  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  try {
    const res = await fetchWith(throwingDb)(loginReq("catch-500@example.test"));
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
    const body = (await res.json()) as { error: { type: string; message?: string } };
    expect(body.error.type).toBe("internal");
    expect("message" in body.error).toBe(false);
    const logged = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("POST");
    expect(logged).toContain("/auth/login");
    expect(logged).toContain("relation secret_table"); // the fault, visible server-side only
  } finally {
    errorSpy.mockRestore();
  }
});

test("a login email with a NUL byte answers a JSON 400 request-shape and runs no query", async () => {
  const res = await fetchWith(throwingDb)(loginReq("a\u0000b@x.ch"));
  expect(res.status).toBe(400);
  expect(res.headers.get("content-type")).toBe("application/json");
  const body = (await res.json()) as { error: { type: string; message?: string } };
  expect(body.error.type).toBe("request-shape");
  expect(body.error.message).not.toContain("x.ch"); // the value is not echoed
});

test("NUL-byte logins count against neither window: more requests than either limit from one address all answer 400", async () => {
  const fetch = fetchWith(throwingDb);
  // clientAddressOf reads the peer from the server argument; without one the address window is skipped.
  const peer = { requestIP: () => ({ address: "203.0.113.77", family: "IPv4", port: 1 }) } as unknown as Parameters<typeof fetch>[1];
  for (let i = 0; i < Math.max(MAX_ATTEMPTS, MAX_ADDRESS_ATTEMPTS) + 1; i++) {
    expect((await fetch(loginReq("count\u0000me@x.ch"), peer)).status).toBe(400);
  }
});

test("Bun.serve runs with development off", async () => {
  const source = await Bun.file(new URL("../src/http/server.ts", import.meta.url)).text();
  expect(source).toMatch(/Bun\.serve\(\{[^}]*\bdevelopment: false\b/);
});

test("the engine image sets NODE_ENV=production before it drops to the bun user", async () => {
  const dockerfile = await Bun.file(new URL("../docker/engine.Dockerfile", import.meta.url)).text();
  const env = dockerfile.indexOf("ENV NODE_ENV=production");
  expect(env).toBeGreaterThan(-1);
  expect(env).toBeLessThan(dockerfile.indexOf("USER bun"));
});
