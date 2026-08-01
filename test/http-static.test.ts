/**
 * Static asset fallthrough (src/http/static.ts + its wiring at the terminal 404
 * in src/http/server.ts). No DB and no port: `createServer`'s handler is called
 * directly with `new Request(...)` against a committed fixture directory, which
 * is why this suite does not skip when DATABASE_URL is unset.
 *
 * The containment cases are the security-relevant half. See the
 * `web-asset-serving` capability.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "bun:test";
import { createServer } from "../src/http/server.js";
import { serveWebAsset, resolveWebRoot, isNavigationRequest } from "../src/http/static.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { jwtResolver } from "../src/auth/jwt.js";
import { sql } from "../src/engine/store.js";

const ROOT = resolve(import.meta.dir, "fixtures/web-root");
const EMPTY_ROOT = resolve(import.meta.dir, "fixtures/web-root-empty");
const ABSENT_ROOT = resolve(import.meta.dir, "fixtures/web-root-does-not-exist");

const reg = createRegistry();
const dsReg = createDataSourceRegistry();

/** The handler under test, with `webRoot` as the only variable. */
const server = (webRoot: string | undefined, resolver = devHeaderResolver, origins: "*" | undefined = undefined) =>
  createServer(dsReg, reg, sql, resolver, origins, undefined, webRoot);

const served = server(ROOT);

const get = (path: string, init?: RequestInit) => served(new Request(`http://x${path}`, init));

// ============================================================
// Serving a file
// ============================================================

test("an existing file under the root is served with its type", async () => {
  const res = await get("/assets/app-a1b2c3.js");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("javascript");
  expect(await res.text()).toContain('build = "a1b2c3"');
});

test("an asset is cached immutably", async () => {
  const res = await get("/assets/app-a1b2c3.js");
  expect(res.headers.get("cache-control")).toBe("max-age=31536000, immutable");
});

test("HEAD returns the headers with an empty body", async () => {
  const res = await get("/assets/app-a1b2c3.js", { method: "HEAD" });
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("max-age=31536000, immutable");
  expect(await res.text()).toBe("");
});

test("no credential is needed while the JWT resolver is wired", async () => {
  const jwt = server(ROOT, jwtResolver({ localSecret: "test-secret" }));
  const res = await jwt(new Request("http://x/assets/app-a1b2c3.js"));
  expect(res.status).toBe(200);
});

// ============================================================
// The index.html fallback
// ============================================================

test("an unmatched client-side route is served the shell", async () => {
  const res = await get("/studio/processes/proc_x/migrate/1/2");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("html");
  expect(await res.text()).toContain("<title>shell</title>");
});

test("the shell document is revalidated, not cached immutably", async () => {
  expect((await get("/studio/anything")).headers.get("cache-control")).toBe("no-cache");
});

test("a direct request for the shell document is not cached immutably", async () => {
  const res = await get("/index.html");
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-cache");
});

test("the root path serves the shell", async () => {
  expect(await (await get("/")).text()).toContain("<title>shell</title>");
});

test("a directory path is not an error", async () => {
  const res = await get("/assets");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("<title>shell</title>");
});

// ============================================================
// Containment: the trust boundary
// ============================================================

/**
 * Each path names a file that really exists outside the root — the repo's own
 * `package.json`, three levels up from `test/fixtures/web-root` — so a test
 * fails if containment is removed. A traversal to a nonexistent path would fall
 * back to the shell either way and prove nothing.
 */
const escapes = [
  ["a traversal segment", "/../../../package.json"],
  ["a percent-encoded traversal", "/%2e%2e%2f%2e%2e%2f%2e%2e%2fpackage.json"],
  ["a mixed-encoding traversal", "/..%2f..%2f../package.json"],
] as const;

/** Keeps the cases above honest: without containment they would serve this file. */
test("the traversal target really exists outside the root", () => {
  expect(existsSync(resolve(ROOT, "../../../package.json"))).toBe(true);
});

for (const [name, path] of escapes) {
  test(`${name} does not escape the root`, async () => {
    const res = await get(path);
    const body = await res.text();
    expect(body).not.toContain('"workflow-engine"');
    expect(res.status).toBe(200);
    expect(body).toContain("<title>shell</title>");
  });
}

/**
 * A single decode, never a loop: `%252e` decodes to the literal `%2e`, which is
 * a filename character, not a traversal. The request stays under the root.
 */
test("a double-encoded traversal is not decoded twice", async () => {
  const res = await get("/%252e%252e%252fpackage.json");
  expect(await res.text()).toContain("<title>shell</title>");
});

const undecodable = [
  ["a malformed percent-escape", "/%zz"],
  ["an encoded null byte", "/%00"],
] as const;

for (const [name, path] of undecodable) {
  test(`${name} reads no file`, async () => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>shell</title>");
  });
}

// ============================================================
// Declining
// ============================================================

test("a POST to an unmatched path keeps the JSON 404", async () => {
  const res = await get("/studio/processes", { method: "POST" });
  expect(res.status).toBe(404);
  expect(((await res.json()) as { error: { type: string } }).error.type).toBe("not-found");
});

test("an absent root keeps the JSON 404 for GET", async () => {
  const res = await server(undefined)(new Request("http://x/anything"));
  expect(res.status).toBe(404);
  expect(((await res.json()) as { error: { type: string } }).error.type).toBe("not-found");
});

test("a root with no index.html does not mask the 404", async () => {
  const res = await server(EMPTY_ROOT)(new Request("http://x/anything"));
  expect(res.status).toBe(404);
  expect(((await res.json()) as { error: { type: string } }).error.type).toBe("not-found");
});

test("an API route still wins over a same-named file", async () => {
  // The fixture root holds a file literally named `livez`. The route answers.
  const res = await get("/livez");
  expect(res.headers.get("content-type")).toContain("json");
  expect(await res.text()).not.toContain("must never be served");
});

test("a served file carries no CORS headers, even in wildcard mode", async () => {
  const permissive = server(ROOT, devHeaderResolver, "*");
  const asset = await permissive(new Request("http://x/assets/app-a1b2c3.js", { headers: { Origin: "http://elsewhere" } }));
  expect(asset.headers.get("access-control-allow-origin")).toBeNull();
  // The JSON envelope from the very same terminal position still carries its
  // header, so the assertion above is about the static branch, not about the
  // harness failing to enable CORS.
  const json = await permissive(new Request("http://x/unmatched", { method: "POST", headers: { Origin: "http://elsewhere" } }));
  expect(json.headers.get("access-control-allow-origin")).toBe("*");
});

// ============================================================
// Root resolution
// ============================================================

test("an existing directory resolves to an absolute root", () => {
  expect(resolveWebRoot(ROOT)).toBe(ROOT);
});

test("an absent directory resolves to undefined", () => {
  expect(resolveWebRoot(ABSENT_ROOT)).toBeUndefined();
});

test("a path that is a file, not a directory, resolves to undefined", () => {
  expect(resolveWebRoot(resolve(ROOT, "index.html"))).toBeUndefined();
});

test("an empty WEB_ROOT means unset, never the working directory", () => {
  // `resolve("")` is the CWD, which would otherwise serve the whole repo.
  // "Unset" means the default applies, so this asserts equivalence with an
  // absent variable rather than `undefined` — the default is a real directory
  // once packages/web has been built.
  const cwd = resolve(".");
  for (const value of ["", "   "]) {
    expect(resolveWebRoot(value)).toBe(resolveWebRoot(undefined));
    expect(resolveWebRoot(value)).not.toBe(cwd);
  }
});

test("serveWebAsset declines every method but GET and HEAD", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const req = new Request("http://x/index.html", { method });
    expect(serveWebAsset(req, new URL(req.url), ROOT)).toBeNull();
  }
});

// ============================================================
// Navigation requests: ordered ahead of route matching
// ============================================================

/**
 * An area's URL prefix can be the same as an API prefix. `/readyz` stands in for
 * the real collisions (`/admin/outbox`, `/admin/timers`, `/admin/users`), which
 * need a database; the ordering rule under test is the same one. It is an API
 * route with no file of that name under the fixture root, so a navigation must
 * fall through to the shell rather than to a file.
 */
const NAV = { "sec-fetch-mode": "navigate", accept: "text/html,application/xhtml+xml" };

test("a navigation to a path an API route owns serves the shell", async () => {
  const res = await get("/readyz", { headers: NAV });
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("<title>shell</title>");
});

test("the same path without a navigation still reaches the API route", async () => {
  const res = await get("/readyz", { headers: { "sec-fetch-mode": "cors" } });
  expect(res.headers.get("content-type")).toContain("json");
});

test("a navigation to a path that is also a real file serves the file", async () => {
  // The web root answers first; within it, an existing file still beats the shell.
  const res = await get("/livez", { headers: NAV });
  expect(await res.text()).toContain("must never be served");
});

test("a client sending no Sec-Fetch headers is judged by Accept", () => {
  expect(isNavigationRequest(new Request("http://x/a", { headers: { accept: "text/html" } }))).toBe(true);
  expect(isNavigationRequest(new Request("http://x/a", { headers: { accept: "application/json" } }))).toBe(false);
  expect(isNavigationRequest(new Request("http://x/a"))).toBe(false);
});

test("Sec-Fetch-Mode wins over Accept when both are present", () => {
  // A page's own fetch may still send an HTML-ish Accept; the explicit mode decides.
  const req = new Request("http://x/a", { headers: { "sec-fetch-mode": "cors", accept: "text/html" } });
  expect(isNavigationRequest(req)).toBe(false);
});

test("a POST navigation does not take the shell path", async () => {
  const res = await get("/readyz", { method: "POST", headers: NAV });
  expect(res.status).toBe(404);
  expect(res.headers.get("content-type")).toContain("json");
});

test("an absent web root leaves the navigation ordering inert", async () => {
  const res = await server(undefined)(new Request("http://x/readyz", { headers: NAV }));
  expect(res.headers.get("content-type")).toContain("json");
});
