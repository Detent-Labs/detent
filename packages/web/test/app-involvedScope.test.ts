/**
 * involved-cases-screen: the took-part screen's listing request.
 *
 * The screen itself stays untested, the convention `app-startedLogic.test.ts`
 * sets for this area: `packages/web` carries no DOM harness, and a server
 * render of the screen runs no effect. The row shape, the empty state and the
 * failure state belong to the browser check instead. What a `bun:test` can
 * pin is the request, and the rule that matters there is that the screen
 * sends a scope and never an actor id.
 */
import { describe, it, expect, afterEach } from "bun:test";
import { listInstances } from "../src/areas/app/api/client.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Captures the one URL the client requests, and answers an empty page. */
function captureUrl(): { urls: string[] } {
  const urls: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    urls.push(typeof input === "string" ? input : input.toString());
    return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } }));
  }) as typeof fetch;
  return { urls };
}

const paramsOf = (url: string) => new URL(url, "http://test.local").searchParams;

describe("the took-part screen's listing request", () => {
  it("carries scope=visible and the screen's limit", async () => {
    const cap = captureUrl();
    await listInstances("visible", "token", { limit: 200 });
    const params = paramsOf(cap.urls[0]!);
    expect(params.get("scope")).toBe("visible");
    expect(params.get("limit")).toBe("200");
  });

  it("carries no actor id of its own", async () => {
    const cap = captureUrl();
    await listInstances("visible", "token", { limit: 200 });
    const params = paramsOf(cap.urls[0]!);
    expect(params.get("assignedTo")).toBeNull();
    expect(params.get("startedBy")).toBeNull();
    expect([...params.keys()].sort()).toEqual(["limit", "scope"]);
  });

  it("passes a cursor through when the load-more control asks for the next page", async () => {
    const cap = captureUrl();
    await listInstances("visible", "token", { limit: 200, cursor: "c1" });
    expect(paramsOf(cap.urls[0]!).get("cursor")).toBe("c1");
  });
});
