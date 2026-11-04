/**
 * The studio client's assignable-groups call and the hook's pure reading.
 * `packages/web` has no DOM harness, so `fetch` is stubbed.
 */
import { describe, it, expect, afterEach } from "bun:test";
import { StudioClientError, getAssignableGroups } from "../src/areas/studio/api/client.js";
import { assignableGroupsFor } from "../src/areas/studio/panels/shared/useAssignableGroups.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function answer(status: number, payload: unknown): string[] {
  const urls: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    urls.push(String(input));
    return Promise.resolve(new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }));
  }) as typeof fetch;
  return urls;
}

describe("getAssignableGroups", () => {
  it("reads the groups array from the route", async () => {
    const urls = answer(200, { groups: [{ groupId: "group_1", name: "Finance" }] });
    expect(await getAssignableGroups("proc a", "tok")).toEqual([{ groupId: "group_1", name: "Finance" }]);
    expect(urls[0]).toBe("/drafts/proc%20a/assignable-groups");
  });

  it("throws the client error on a 403", async () => {
    answer(403, { error: { type: "forbidden", message: "no" } });
    await expect(getAssignableGroups("proc_x", "tok")).rejects.toBeInstanceOf(StudioClientError);
  });
});

describe("assignableGroupsFor", () => {
  const ready = { forProcessId: "proc_x", status: "ready" as const, groups: [{ groupId: "g", name: "G" }], message: "" };
  const failed = { forProcessId: "proc_x", status: "failed" as const, groups: [], message: "Could not load" };

  it("is loading with no result", () => {
    expect(assignableGroupsFor(undefined, "proc_x")).toEqual({ status: "loading", groups: [], message: "" });
  });

  it("is loading when the result belongs to another process", () => {
    expect(assignableGroupsFor(ready, "proc_y").status).toBe("loading");
  });

  it("returns a ready result", () => {
    expect(assignableGroupsFor(ready, "proc_x")).toEqual({ status: "ready", groups: ready.groups, message: "" });
  });

  it("reads the failed status with its message", () => {
    expect(assignableGroupsFor(failed, "proc_x")).toEqual({ status: "failed", groups: [], message: "Could not load" });
  });
});
