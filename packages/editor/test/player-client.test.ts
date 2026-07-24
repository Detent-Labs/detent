import { describe, expect, it, mock, afterEach } from "bun:test";
import { createInstance, getInstanceView, submit, PlayerClientError } from "../src/player/client";
import type { ClientError } from "../src/player/types";

const actor = { id: "user_1", roles: ["employee"] };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  // @ts-expect-error test-only cleanup of the module-scope fetch stub
  delete globalThis.fetch;
});

describe("player/client request shapes", () => {
  it("createInstance POSTs to /processes/:processId/instances with actor as headers, version and data in the body", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(201, { instanceId: "inst_abc" });
    }) as unknown as typeof fetch;

    const result = await createInstance("http://x", "proc_1", actor, { version: 2, data: { a: 1 } });

    expect(result).toEqual({ instanceId: "inst_abc" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://x/processes/proc_1/instances");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.headers).toMatchObject({ "X-Actor-Id": "user_1", "X-Actor-Roles": "employee" });
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ version: 2, data: { a: 1 } });
  });

  it("createInstance omits version/data when not provided", async () => {
    const calls: { init: RequestInit | undefined }[] = [];
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      calls.push({ init });
      return jsonResponse(201, { instanceId: "inst_abc" });
    }) as unknown as typeof fetch;

    await createInstance("http://x", "proc_1", actor);

    const sentBody = JSON.parse(calls[0]!.init!.body as string) as Record<string, unknown>;
    expect("version" in sentBody).toBe(false);
    expect("data" in sentBody).toBe(false);
  });

  it("getInstanceView GETs /instances/:instanceId with the actor as X-Actor-Id/X-Actor-Roles headers", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(200, { instanceId: "inst_1", fields: [], availablePaths: [] });
    }) as unknown as typeof fetch;

    await getInstanceView("http://x", "inst_1", actor);

    expect(calls[0]!.url).toBe("http://x/instances/inst_1");
    expect(calls[0]!.init?.headers).toMatchObject({ "X-Actor-Id": "user_1", "X-Actor-Roles": "employee" });
  });

  it("submit POSTs to /instances/:instanceId/submit with actor as headers, pathId and data in the body", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(200, { instanceId: "inst_1" });
    }) as unknown as typeof fetch;

    await submit("http://x", "inst_1", "path_ab", { field_amount: 10 }, actor);

    expect(calls[0]!.url).toBe("http://x/instances/inst_1/submit");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.headers).toMatchObject({ "X-Actor-Id": "user_1", "X-Actor-Roles": "employee" });
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ pathId: "path_ab", data: { field_amount: 10 } });
  });
});

describe("player/client error mapping", () => {
  it("maps a 422 validation response", async () => {
    globalThis.fetch = mock(async () => jsonResponse(422, { error: { type: "validation", issues: [{ kind: "type-mismatch", fieldId: "field_amount" }] } })) as unknown as typeof fetch;

    await expectClientError(() => getInstanceView("http://x", "inst_1", actor), {
      type: "validation",
      issues: [{ kind: "type-mismatch", fieldId: "field_amount" }],
    });
  });

  it("maps a 409 guard-refused response", async () => {
    globalThis.fetch = mock(async () => jsonResponse(409, { error: { type: "guard-refused", message: "path no longer available" } })) as unknown as typeof fetch;

    await expectClientError(() => getInstanceView("http://x", "inst_1", actor), {
      type: "guard-refused",
      message: "path no longer available",
    });
  });

  it("maps a 409 concurrency-conflict response", async () => {
    globalThis.fetch = mock(async () => jsonResponse(409, { error: { type: "concurrency-conflict" } })) as unknown as typeof fetch;

    await expectClientError(() => getInstanceView("http://x", "inst_1", actor), { type: "concurrency-conflict" });
  });

  it("maps a 500 internal response", async () => {
    globalThis.fetch = mock(async () => jsonResponse(500, { error: { type: "internal", message: "boom" } })) as unknown as typeof fetch;

    await expectClientError(() => getInstanceView("http://x", "inst_1", actor), { type: "internal", message: "boom" });
  });

  it("maps a network failure to internal", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;

    await expectClientError(() => getInstanceView("http://x", "inst_1", actor), { type: "internal", message: "connection refused" });
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
