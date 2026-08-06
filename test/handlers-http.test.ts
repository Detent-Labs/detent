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
  egressRefusal,
  HTTP_ACTION_TYPE,
  IDEMPOTENCY_HEADER,
  HTTP_DEFAULT_TIMEOUT_MS,
  HTTP_MAX_RESPONSE_BYTES,
} from "../src/handlers/http.js";
import { deliver, PermanentError, type ClaimedRow } from "../src/engine/outbox.js";
import { createRegistry, register, type HandlerContext } from "../src/engine/registry.js";
import type { Action } from "../src/schema/definition.js";

type CapturedRequest = { method: string; headers: Record<string, string>; bodyText: string };

/**
 * Sets the named variables for the duration of `fn` and restores the previous
 * values in a `finally`. An `undefined` value deletes the variable rather than
 * setting an empty string.
 *
 * Restoring matters here: the egress policy reads process.env per call, the
 * devcontainer sets HTTP_ACTION_ALLOWED_HOSTS, and bun runs a file's cases in
 * one process in order — a leaked deletion would refuse every later case.
 * Nesting is deliberate: an inner call overrides and then restores the outer
 * call's value, which is how a case narrows the policy `withServer` set.
 */
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  const apply = (values: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  for (const key of Object.keys(vars)) saved[key] = process.env[key];
  apply(vars);
  try {
    return await fn();
  } finally {
    apply(saved);
  }
}

/** Permits `host` over plain HTTP, the policy every mock-target case needs. */
const permitting = <T>(host: string, fn: () => Promise<T>) =>
  withEnv({ HTTP_ACTION_ALLOWED_HOSTS: host, HTTP_ACTION_ALLOW_INSECURE: "1" }, fn);

/**
 * Starts a fresh mock target on a random port for the duration of `fn`,
 * capturing every request it receives, and permits that target's own host for
 * the same duration. Without the policy every case here would refuse before
 * opening a connection.
 */
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
    return await permitting(`localhost:${server.port}`, () => fn(`http://localhost:${server.port}`, requests));
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
  const host = `localhost:${server.port}`;
  server.stop(true);
  await new Promise((r) => setTimeout(r, 10)); // let the OS actually release the port

  // The policy must permit the target, or the refusal would be permanent and
  // this case would pass for the wrong reason.
  const err = await permitting(host, () => rejects(httpHandlerDef.handler(ctxFor({ url }))));
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

test("no declared timeout still succeeds for a response faster than the engine default", async () => {
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

test(
  "no declared timeout is still bounded by the engine default, against a target that never responds",
  async () => {
    await withServer(
      () => new Promise<Response>(() => {}), // never resolves: no response at all
      async (url) => {
        const start = Date.now();
        const err = await rejects(httpHandlerDef.handler(ctxFor({ url, method: "GET" })));
        expect(err).not.toBeInstanceOf(PermanentError);
        expect(Date.now() - start).toBeLessThan(HTTP_DEFAULT_TIMEOUT_MS + 2000); // bounded, not open-ended
      },
    );
  },
  HTTP_DEFAULT_TIMEOUT_MS + 5000, // bun test's own per-test timeout, given the deliberate wait
);

test("a hang during the body read is aborted too, not only a hang before headers", async () => {
  // Headers flush (status 200, valid Content-Type), then the stream never
  // closes: clearing the abort timer in a `finally` around only the fetch()
  // call would leave this read unbounded.
  const server = Bun.serve({
    port: 0,
    fetch: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("{"));
            // deliberately never enqueue further or close
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  });
  try {
    const err = await permitting(`localhost:${server.port}`, () =>
      rejects(
        httpHandlerDef.handler(ctxFor({ url: `http://localhost:${server.port}`, method: "GET" }, { timeout: "PT0.1S" })),
      ),
    );
    expect(err).not.toBeInstanceOf(PermanentError);
  } finally {
    server.stop(true);
  }
});

// --- response size cap ----------------------------------------------------------

test("a response whose content-length exceeds the size limit is refused as a permanent failure", async () => {
  const overSize = "x".repeat(HTTP_MAX_RESPONSE_BYTES + 1000);
  await withServer(
    () => new Response(overSize, { status: 200, headers: { "Content-Type": "text/plain" } }),
    async (url) => {
      const err = await rejects(httpHandlerDef.handler(ctxFor({ url })));
      expect(err).toBeInstanceOf(PermanentError);
    },
  );
});

test("an over-size response dead-letters via deliver(), the classification the outbox worker acts on", async () => {
  const overSize = "x".repeat(HTTP_MAX_RESPONSE_BYTES + 1000);
  await withServer(
    () => new Response(overSize, { status: 200, headers: { "Content-Type": "text/plain" } }),
    async (url) => {
      const reg = createRegistry();
      register(reg, HTTP_ACTION_TYPE, httpHandlerDef);
      const row: ClaimedRow = {
        idempotency_key: "idem_oversize",
        instance_id: "inst_1",
        transition_seq: 1,
        action: action({ url }),
        attempts: 0,
        event_id: null,
        field_version: 1,
      };
      const err = await rejects(deliver(row, reg));
      expect(err).toBeInstanceOf(PermanentError); // -> outbox dead-letters, never retries, writes no data
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

// --- egress policy ----------------------------------------------------------------

test("a target outside HTTP_ACTION_ALLOWED_HOSTS is refused, and no request leaves", async () => {
  await withServer(
    () => jsonResponse({ leaked: true }),
    async (url, requests) => {
      const err = await withEnv({ HTTP_ACTION_ALLOWED_HOSTS: "api.example.com" }, () =>
        rejects(httpHandlerDef.handler(ctxFor({ url }))),
      );
      expect(err).toBeInstanceOf(PermanentError);
      expect((err as Error).message).toContain(new URL(url).host);
      expect(requests).toHaveLength(0);
    },
  );
});

test("the cloud metadata address is refused when the allowlist does not name it", async () => {
  // The SEC-2 finding's own example. Asserted against the helper so no case
  // here ever opens a socket to a link-local address.
  const refusal = await withEnv({ HTTP_ACTION_ALLOWED_HOSTS: "api.example.com" }, async () =>
    egressRefusal("https://169.254.169.254/latest/meta-data/"),
  );
  expect(refusal).toContain("169.254.169.254");
});

test("an unset HTTP_ACTION_ALLOWED_HOSTS refuses every target, and no request leaves", async () => {
  await withServer(
    () => jsonResponse({ leaked: true }),
    async (url, requests) => {
      const err = await withEnv({ HTTP_ACTION_ALLOWED_HOSTS: undefined }, () =>
        rejects(httpHandlerDef.handler(ctxFor({ url }))),
      );
      expect(err).toBeInstanceOf(PermanentError);
      expect(requests).toHaveLength(0);
    },
  );
});

test("an empty HTTP_ACTION_ALLOWED_HOSTS refuses every target", async () => {
  const refusal = await withEnv({ HTTP_ACTION_ALLOWED_HOSTS: "" }, async () =>
    egressRefusal("https://api.example.com/hook"),
  );
  expect(refusal).toContain("HTTP_ACTION_ALLOWED_HOSTS");
});

test("a plain-http target is refused without the escape hatch, and permitted with it", async () => {
  await withServer(
    () => jsonResponse({ ok: true }),
    async (url, requests) => {
      const err = await withEnv({ HTTP_ACTION_ALLOW_INSECURE: undefined }, () =>
        rejects(httpHandlerDef.handler(ctxFor({ url }))),
      );
      expect(err).toBeInstanceOf(PermanentError);
      expect((err as Error).message).toContain("http:");
      expect(requests).toHaveLength(0);

      // withServer's own policy is back in force here, hatch included.
      const result = await httpHandlerDef.handler(ctxFor({ url }));
      expect((result as { body: unknown }).body).toEqual({ ok: true });
      expect(requests).toHaveLength(1);
    },
  );
});

test("an https target on the allowlist passes the policy with the hatch unset", async () => {
  const refusal = await withEnv(
    { HTTP_ACTION_ALLOWED_HOSTS: "api.example.com", HTTP_ACTION_ALLOW_INSECURE: undefined },
    async () => egressRefusal("https://api.example.com/hook"),
  );
  expect(refusal).toBeUndefined();
});

test("a list entry survives surrounding space and mixed case", async () => {
  const refusal = await withEnv(
    { HTTP_ACTION_ALLOWED_HOSTS: " a.example.com, API.Example.com ", HTTP_ACTION_ALLOW_INSECURE: undefined },
    async () => egressRefusal("https://api.example.com/hook"),
  );
  expect(refusal).toBeUndefined();
});

test("a redirect off the allowlist fails permanently, and the redirect target sees no request", async () => {
  await withServer(
    () => jsonResponse({ leaked: true }), // the redirect target: allowlisted for nothing
    async (victimUrl, victimRequests) => {
      await withServer(
        () => new Response(null, { status: 302, headers: { Location: victimUrl } }),
        async (redirectorUrl) => {
          // withServer allowlists the redirector alone, so following the hop
          // would reach a host the policy never saw.
          const err = await rejects(httpHandlerDef.handler(ctxFor({ url: redirectorUrl })));
          expect(err).toBeInstanceOf(PermanentError);
          expect((err as Error).message).toContain("302");
          expect(victimRequests).toHaveLength(0);
        },
      );
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
