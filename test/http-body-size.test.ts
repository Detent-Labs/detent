/**
 * harden-publish-validation: `Bun.serve` declares `maxRequestBodySize`
 * (`src/http/server.ts::startHttpServer`) instead of inheriting Bun's 128 MiB
 * default. `createServer`'s pure `fetch(req)` handler — used by every other
 * HTTP test in this repo — bypasses Bun's own transport layer entirely, so
 * the only way to exercise this option is a REAL `Bun.serve` instance. This
 * mirrors that exact wiring (same option, same handler) on an ephemeral port,
 * without starting the full engine (no outbox/timer workers needed to prove
 * the transport-level bound).
 */
import { test, expect } from "bun:test";
import { sql } from "../src/engine/store.js";
import { createServer, MAX_REQUEST_BODY_SIZE } from "../src/http/server.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { devHeaderResolver } from "../src/auth/resolve.js";

const DB = !!process.env.DATABASE_URL;

async function withRealServer<T>(fn: (url: string) => Promise<T>): Promise<T> {
  const fetch = createServer(createDataSourceRegistry(), createRegistry(), sql, devHeaderResolver);
  const server = Bun.serve({ port: 0, fetch, maxRequestBodySize: MAX_REQUEST_BODY_SIZE });
  try {
    return await fn(`http://localhost:${server.port}`);
  } finally {
    server.stop(true);
  }
}

test.skipIf(!DB)("an ordinary-size request reaches the route handler", async () => {
  await withRealServer(async (url) => {
    const res = await fetch(`${url}/processes`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Actor-Id": "u", "X-Actor-Roles": "system:publish" },
      body: JSON.stringify({ key: "small" }),
    });
    // Not a transport-level rejection: it reaches the route and fails on its
    // own terms (a malformed process body), never on size.
    expect(res.status).not.toBe(413);
  });
});

test.skipIf(!DB)("a request body over the declared bound is refused before any route handler runs", async () => {
  await withRealServer(async (url) => {
    const oversized = "x".repeat(MAX_REQUEST_BODY_SIZE + 1024);
    // Bun refuses an over-size body at the transport layer, so the route
    // handler never runs and no typed engine error is produced. How it
    // refuses is Bun's business and has varied across versions: 1.3.11
    // answers 413, earlier lines reset the connection. Accept either — the
    // property under test is that the request is refused on size, which a
    // route-level status (a publish body this malformed maps to 422) would
    // disprove.
    let refused: "reset" | number;
    try {
      const res = await fetch(`${url}/processes`, {
        method: "POST",
        headers: { "content-type": "application/json", "X-Actor-Id": "u", "X-Actor-Roles": "system:publish" },
        body: oversized,
      });
      refused = res.status;
    } catch {
      refused = "reset";
    }
    expect(refused === "reset" || refused === 413).toBe(true);
  });
});
