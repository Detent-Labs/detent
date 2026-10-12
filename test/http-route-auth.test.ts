/**
 * widen-test-guards: every row of `createServer`'s route table answers 401 to
 * a request that carries no credential, except the rows named in `EXEMPT`.
 * `routes` is a local inside `createServer` and has no other consumer, so the
 * test reads `src/http/server.ts` as text and takes each
 * `method: "X", segments: seg("/path")` pair. Two self-checks keep that parse
 * honest: the parsed row count equals the count of `segments: seg(` in the
 * file, and every `EXEMPT` key names a parsed row.
 *
 * Routes outside the table: `GET /livez` and `GET /readyz` answer without a
 * credential by design, and `GET /metrics` takes its own bearer token
 * (`METRICS_TOKEN`). `test/metrics.test.ts` covers `/metrics`.
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { sql } from "../src/engine/store.js";
import { createServer } from "../src/http/server.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { devHeaderResolver } from "../src/auth/resolve.js";

const SOURCE = readFileSync(new URL("../src/http/server.ts", import.meta.url), "utf8");

const ROW = /method: "(\w+)", segments: seg\("([^"]+)"\)/g;
const ROWS = [...SOURCE.matchAll(ROW)].map((m) => ({ method: m[1]!, path: m[2]!, key: `${m[1]} ${m[2]}` }));

const EXEMPT: Record<string, string> = {
  "POST /auth/login": "takes credentials in its body, and is registered only when a JWT secret is configured",
  "GET /ui-strings": "serves the public override catalog to the login screen, before any session exists",
};

test("the parse reads every row of the route table", () => {
  const declared = SOURCE.split("segments: seg(").length - 1;
  expect(ROWS.length).toBe(declared);
  expect(ROWS.length).toBeGreaterThan(0);
});

test("every EXEMPT entry names a row of the route table", () => {
  const keys = new Set(ROWS.map((r) => r.key));
  const stale = Object.keys(EXEMPT).filter((k) => !keys.has(k));
  expect(stale).toEqual([]);
});

test("every route outside EXEMPT answers 401 to a request without credentials", async () => {
  const handler = createServer(createDataSourceRegistry(), createRegistry(), sql, devHeaderResolver);
  const offenders: string[] = [];
  for (const row of ROWS) {
    if (row.key in EXEMPT) continue;
    const path = row.path.replace(/:\w+/g, "x");
    const res = await handler(new Request(`http://t${path}`, { method: row.method }));
    if (res.status !== 401) offenders.push(`${row.key} answered ${res.status}`);
  }
  expect(offenders).toEqual([]);
});
