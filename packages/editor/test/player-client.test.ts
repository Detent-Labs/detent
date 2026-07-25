import { describe, expect, it, mock, afterEach } from "bun:test";
import { createInstance, getInstanceView, submit, login, PlayerClientError } from "../src/player/client";
import type { ClientError } from "../src/player/types";

const token = "test-token-abc";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  // @ts-expect-error test-only cleanup of the module-scope fetch stub
  delete globalThis.fetch;
});

describe("player/client request shapes", () => {
  it("login POSTs email/password to /auth/login and returns the token/expiresAt/actor", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(200, { token: "tok_1", expiresAt: "2026-01-01T00:00:00.000Z", actor: { id: "user_1", roles: ["employee"] } });
    }) as unknown as typeof fetch;

    const result = await login("http://x", "a@example.com", "correct-horse");

    expect(result).toEqual({ token: "tok_1", expiresAt: "2026-01-01T00:00:00.000Z", actor: { id: "user_1", roles: ["employee"] } });
    expect(calls[0]!.url).toBe("http://x/auth/login");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ email: "a@example.com", password: "correct-horse" });
  });

  it("createInstance POSTs to /processes/:processId/instances with the token as Authorization, version and data in the body", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(201, { instanceId: "inst_abc" });
    }) as unknown as typeof fetch;

    const result = await createInstance("http://x", "proc_1", token, { version: 2, data: { a: 1 } });

    expect(result).toEqual({ instanceId: "inst_abc" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://x/processes/proc_1/instances");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.headers).toMatchObject({ Authorization: `Bearer ${token}` });
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ version: 2, data: { a: 1 } });
  });

  it("createInstance omits version/data when not provided", async () => {
    const calls: { init: RequestInit | undefined }[] = [];
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      calls.push({ init });
      return jsonResponse(201, { instanceId: "inst_abc" });
    }) as unknown as typeof fetch;

    await createInstance("http://x", "proc_1", token);

    const sentBody = JSON.parse(calls[0]!.init!.body as string) as Record<string, unknown>;
    expect("version" in sentBody).toBe(false);
    expect("data" in sentBody).toBe(false);
  });

  it("getInstanceView GETs /instances/:instanceId with the token as an Authorization: Bearer header", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(200, { instanceId: "inst_1", fields: [], availablePaths: [] });
    }) as unknown as typeof fetch;

    await getInstanceView("http://x", "inst_1", token);

    expect(calls[0]!.url).toBe("http://x/instances/inst_1");
    expect(calls[0]!.init?.headers).toMatchObject({ Authorization: `Bearer ${token}` });
  });

  it("submit POSTs to /instances/:instanceId/submit with the token as Authorization, pathId and data in the body", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(200, { instanceId: "inst_1" });
    }) as unknown as typeof fetch;

    await submit("http://x", "inst_1", "path_ab", { field_amount: 10 }, token);

    expect(calls[0]!.url).toBe("http://x/instances/inst_1/submit");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.headers).toMatchObject({ Authorization: `Bearer ${token}` });
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ pathId: "path_ab", data: { field_amount: 10 } });
  });
});

describe("player/client error mapping", () => {
  it("maps a 422 validation response", async () => {
    globalThis.fetch = mock(async () => jsonResponse(422, { error: { type: "validation", issues: [{ kind: "type-mismatch", fieldId: "field_amount" }] } })) as unknown as typeof fetch;

    await expectClientError(() => getInstanceView("http://x", "inst_1", token), {
      type: "validation",
      issues: [{ kind: "type-mismatch", fieldId: "field_amount" }],
    });
  });

  it("maps a 409 guard-refused response", async () => {
    globalThis.fetch = mock(async () => jsonResponse(409, { error: { type: "guard-refused", message: "path no longer available" } })) as unknown as typeof fetch;

    await expectClientError(() => getInstanceView("http://x", "inst_1", token), {
      type: "guard-refused",
      message: "path no longer available",
    });
  });

  it("maps a 409 concurrency-conflict response", async () => {
    globalThis.fetch = mock(async () => jsonResponse(409, { error: { type: "concurrency-conflict" } })) as unknown as typeof fetch;

    await expectClientError(() => getInstanceView("http://x", "inst_1", token), { type: "concurrency-conflict" });
  });

  it("maps a 500 internal response", async () => {
    globalThis.fetch = mock(async () => jsonResponse(500, { error: { type: "internal", message: "boom" } })) as unknown as typeof fetch;

    await expectClientError(() => getInstanceView("http://x", "inst_1", token), { type: "internal", message: "boom" });
  });

  it("maps a network failure to internal", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;

    await expectClientError(() => getInstanceView("http://x", "inst_1", token), { type: "internal", message: "connection refused" });
  });

  it("carries the response status on PlayerClientError, so a 401 is distinguishable from other errors", async () => {
    globalThis.fetch = mock(async () => jsonResponse(401, { error: { type: "actor-resolution", message: "invalid token" } })) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await getInstanceView("http://x", "inst_1", token);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PlayerClientError);
    expect((caught as PlayerClientError).status).toBe(401);
  });
});

async function expectClientError(fn: () => Promise<unknown>, expected: ClientError): Promise<void> {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(PlayerClientError);
  expect((caught as PlayerClientError).error).toEqual(expected);
}
