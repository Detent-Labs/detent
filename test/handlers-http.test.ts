/**
 * Generic http.request action handler: pure unit tests against a locally
 * started Bun.serve mock target, no DATABASE_URL required (the handler does
 * no DB work). Mirrors registry-check.test.ts's style — flat test(), no
 * describe blocks.
 */
import { test, expect } from "bun:test";
import {
  httpHandlerDef,
  httpConfigSchema,
  HTTP_ACTION_TYPE,
  IDEMPOTENCY_HEADER,
} from "../src/handlers/http.js";
import { deliver, PermanentError, type ClaimedRow } from "../src/engine/outbox.js";
import { createRegistry, register, type HandlerContext } from "../src/engine/registry.js";
import type { Action } from "../src/schema/definition.js";

type CapturedRequest = { method: string; headers: Record<string, string>; bodyText: string };

/** Starts a fresh mock target on a random port for the duration of `fn`, capturing every request it receives. */
async function withServer<T>(
  handle: (req: Request) => Response | Promise<Response>,
  fn: (url: string, requests: CapturedRequest[]) => Promise<T>,
): Promise<T> {
  const requests: CapturedRequest[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const bodyText = await req.text();
      requests.push({ method: req.method, headers: Object.fromEntries(req.headers.entries()), bodyText });
      return handle(req);
    },
  });
  try {
    return await fn(`http://localhost:${server.port}`, requests);
  } finally {
    server.stop(true);
  }
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const action = (config: Record<string, unknown>, timeout?: string): Action =>
  ({ id: "action_http", type: HTTP_ACTION_TYPE, config, ...(timeout ? { timeout } : {}) }) as unknown as Action;

const ctxFor = (config: Record<string, unknown>, opts: { idempotencyKey?: string; timeout?: string } = {}): HandlerContext => ({
  action: action(config, opts.timeout),
  config,
  idempotencyKey: opts.idempotencyKey ?? "idem_1",
  instanceId: "inst_1",
});

async function rejects(p: Promise<unknown>): Promise<unknown> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeDefined();
  return err;
}

// --- success responses -----------------------------------------------------

test("a 2xx JSON response is parsed into result.body", async () => {
  await withServer(
    () => jsonResponse({ ok: true }),
    async (url) => {
      const result = await httpHandlerDef.handler(ctxFor({ url }));
      expect((result as { body: unknown }).body).toEqual({ ok: true });
    },
  );
});

test("a 2xx non-JSON response is returned as raw text", async () => {
  await withServer(
    () => new Response("plain text", { status: 200, headers: { "Content-Type": "text/plain" } }),
    async (url) => {
      const result = await httpHandlerDef.handler(ctxFor({ url }));
      expect((result as { body: unknown }).body).toBe("plain text");
    },
  );
});

// --- request construction ---------------------------------------------------

test("method, headers, and body from config arrive unchanged at the target", async () => {
  await withServer(
    () => jsonResponse({}),
    async (url, requests) => {
      await httpHandlerDef.handler(
        ctxFor({ url, method: "PUT", headers: { "X-Custom": "yes" }, body: { a: 1 } }),
      );
      expect(requests).toHaveLength(1);
      expect(requests[0]!.method).toBe("PUT");
      expect(requests[0]!.headers["x-custom"]).toBe("yes");
      expect(JSON.parse(requests[0]!.bodyText)).toEqual({ a: 1 });
    },
  );
});

// --- failure classification --------------------------------------------------

test("a 404 response is a permanent failure", async () => {
  await withServer(
    () => new Response("nope", { status: 404 }),
    async (url) => {
      const err = await rejects(httpHandlerDef.handler(ctxFor({ url })));
      expect(err).toBeInstanceOf(PermanentError);
    },
  );
});

test("a 429 response is a transient (non-permanent) failure", async () => {
  await withServer(
    () => new Response("slow down", { status: 429 }),
    async (url) => {
      const err = await rejects(httpHandlerDef.handler(ctxFor({ url })));
      expect(err).not.toBeInstanceOf(PermanentError);
    },
  );
});

test("a 500 response is a transient (non-permanent) failure", async () => {
  await withServer(
    () => new Response("boom", { status: 500 }),
    async (url) => {
      const err = await rejects(httpHandlerDef.handler(ctxFor({ url })));
      expect(err).not.toBeInstanceOf(PermanentError);
    },
  );
});

test("a connection failure (no response received) is a transient (non-permanent) failure", async () => {
  const server = Bun.serve({ port: 0, fetch: () => new Response("ok") });
  const url = `http://localhost:${server.port}`;
  server.stop(true);
  await new Promise((r) => setTimeout(r, 10)); // let the OS actually release the port

  const err = await rejects(httpHandlerDef.handler(ctxFor({ url })));
  expect(err).not.toBeInstanceOf(PermanentError);
});

// --- timeout ------------------------------------------------------------------

test("a response delayed past the action timeout aborts and rejects transiently", async () => {
  await withServer(
    async () => {
      await new Promise((r) => setTimeout(r, 300));
      return jsonResponse({});
    },
    async (url) => {
      const err = await rejects(httpHandlerDef.handler(ctxFor({ url, method: "GET" }, { timeout: "PT0.05S" })));
      expect(err).not.toBeInstanceOf(PermanentError);
    },
  );
});

test("no declared timeout imposes no handler-level bound", async () => {
  await withServer(
    async () => {
      await new Promise((r) => setTimeout(r, 100));
      return jsonResponse({ waited: true });
    },
    async (url) => {
      const result = await httpHandlerDef.handler(ctxFor({ url, method: "GET" }));
      expect((result as { body: unknown }).body).toEqual({ waited: true });
    },
  );
});

// --- deduplication signal -----------------------------------------------------

test("every request carries an Idempotency-Key header equal to ctx.idempotencyKey", async () => {
  await withServer(
    () => jsonResponse({}),
    async (url, requests) => {
      await httpHandlerDef.handler(ctxFor({ url }, { idempotencyKey: "idem_abc" }));
      expect(requests[0]!.headers[IDEMPOTENCY_HEADER.toLowerCase()]).toBe("idem_abc");
    },
  );
});

test("a retried delivery sends the same Idempotency-Key as the original", async () => {
  await withServer(
    () => jsonResponse({}),
    async (url, requests) => {
      const reg = createRegistry();
      register(reg, HTTP_ACTION_TYPE, httpHandlerDef);
      const row: ClaimedRow = {
        idempotency_key: "idem_stable",
        instance_id: "inst_1",
        transition_seq: 1,
        action: action({ url }),
        attempts: 0,
        event_id: null,
        field_version: 1,
      };
      await deliver(row, reg);
      await deliver({ ...row, attempts: row.attempts + 1 }, reg); // simulated retry
      expect(requests).toHaveLength(2);
      const keyHeader = IDEMPOTENCY_HEADER.toLowerCase();
      expect(requests[0]!.headers[keyHeader]).toBe("idem_stable");
      expect(requests[1]!.headers[keyHeader]).toBe("idem_stable");
    },
  );
});

// --- content-type default -------------------------------------------------------

test("a body with no declared Content-Type defaults to application/json", async () => {
  await withServer(
    () => jsonResponse({}),
    async (url, requests) => {
      await httpHandlerDef.handler(ctxFor({ url, body: { a: 1 } }));
      expect(requests[0]!.headers["content-type"]).toBe("application/json");
    },
  );
});

test("an authored Content-Type is respected, not overwritten", async () => {
  await withServer(
    () => jsonResponse({}),
    async (url, requests) => {
      await httpHandlerDef.handler(
        ctxFor({ url, body: { a: 1 }, headers: { "Content-Type": "application/x-www-form-urlencoded" } }),
      );
      expect(requests[0]!.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    },
  );
});

// --- config schema (no network calls) --------------------------------------------

test("a GET config with a body fails schema validation", () => {
  const result = httpConfigSchema.safeParse({ url: "http://example.com", method: "GET", body: { a: 1 } });
  expect(result.success).toBe(false);
});

test("a config.headers entry named Idempotency-Key (any casing) fails schema validation", () => {
  for (const key of ["Idempotency-Key", "idempotency-key", "IDEMPOTENCY-KEY"]) {
    const result = httpConfigSchema.safeParse({ url: "http://example.com", headers: { [key]: "author-supplied" } });
    expect(result.success).toBe(false);
  }
});

test("a well-formed config passes schema validation", () => {
  const result = httpConfigSchema.safeParse({ url: "http://example.com", method: "POST", headers: { "X-A": "1" }, body: { a: 1 } });
  expect(result.success).toBe(true);
});
