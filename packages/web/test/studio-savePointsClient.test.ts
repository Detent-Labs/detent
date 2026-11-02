/**
 * The studio client's save point calls: the success shapes, the 409 read as
 * `undefined`, and the timeout on every draft write. `packages/web` has no DOM
 * harness, so `fetch` and `AbortSignal.timeout` are stubbed.
 */
import { describe, it, expect, afterEach } from "bun:test";
import {
  SAVE_TIMEOUT_MS,
  StudioClientError,
  createSavePoint,
  getDraft,
  listSavePoints,
  removeSavePoint,
  restoreSavePoint,
  saveDraft,
} from "../src/areas/studio/api/client.js";

const realFetch = globalThis.fetch;
const realTimeout = AbortSignal.timeout;
afterEach(() => {
  globalThis.fetch = realFetch;
  AbortSignal.timeout = realTimeout;
});

type Seen = { url: string; init: RequestInit | undefined };

/** Records each request and answers `status` with `payload`. */
function answer(status: number, payload: unknown): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), init });
    return Promise.resolve(
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }),
    );
  }) as typeof fetch;
  return seen;
}

const conflict = { error: { type: "draft-conflict", message: "moved on" } };
const summary = { savePointId: "spt_1", processId: "proc_a", name: "n", revision: 3, createdBy: "u", createdAt: "2026-11-02T00:00:00.000Z" };

describe("save point client calls", () => {
  it("lists to the points route and returns the items with the limit", async () => {
    const seen = answer(200, { items: [{ ...summary, createdByDisplayName: null }], limit: 50 });
    const list = await listSavePoints("proc a", "tok");
    expect(seen[0]!.url).toBe("/drafts/proc%20a/save-points");
    expect(list.limit).toBe(50);
    expect(list.items[0]!.savePointId).toBe("spt_1");
  });

  it("creates with a POST of name and revision, and returns the summary", async () => {
    const seen = answer(201, summary);
    const created = await createSavePoint("proc_a", { name: "n", revision: 3 }, "tok");
    expect(created?.savePointId).toBe("spt_1");
    expect(seen[0]!.url).toBe("/drafts/proc_a/save-points");
    expect(seen[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({ name: "n", revision: 3 });
  });

  it("restores with a POST of revision and keepName, and returns the draft", async () => {
    const draft = { processId: "proc_a", body: {}, layout: {}, revision: 4, baseVersion: null, updatedBy: "u", updatedAt: "t" };
    const seen = answer(200, draft);
    const restored = await restoreSavePoint("proc_a", "spt_1", { revision: 3, keepName: "kept" }, "tok");
    expect(restored?.revision).toBe(4);
    expect(seen[0]!.url).toBe("/drafts/proc_a/save-points/spt_1/restore");
    expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({ revision: 3, keepName: "kept" });
  });

  it("removes with a DELETE and resolves on 204", async () => {
    const seen = answer(204, null);
    await removeSavePoint("proc_a", "spt_1", "tok");
    expect(seen[0]!.url).toBe("/drafts/proc_a/save-points/spt_1");
    expect(seen[0]!.init?.method).toBe("DELETE");
  });

  it("reads a 409 on create as undefined", async () => {
    answer(409, conflict);
    expect(await createSavePoint("proc_a", { name: "n", revision: 1 }, "tok")).toBeUndefined();
  });

  it("reads a 409 on restore as undefined", async () => {
    answer(409, conflict);
    expect(await restoreSavePoint("proc_a", "spt_1", { revision: 1, keepName: "k" }, "tok")).toBeUndefined();
  });

  it("throws any other refusal, a 404 on restore among them", async () => {
    answer(404, { error: { type: "not-found", message: "gone" } });
    let err: unknown;
    try {
      await restoreSavePoint("proc_a", "spt_1", { revision: 1, keepName: "k" }, "tok");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(StudioClientError);
    expect((err as StudioClientError).error.type).toBe("not-found");
    expect((err as StudioClientError).status).toBe(404);
  });
});

describe("getDraft's optional signal", () => {
  it("reaches the request, and an aborted read reads as the network error", async () => {
    const seen = answer(200, { processId: "proc_a", body: {}, layout: {}, revision: 1 });
    const signal = new AbortController().signal;
    expect((await getDraft("proc_a", "tok", signal))?.revision).toBe(1);
    expect(seen[0]!.init?.signal).toBe(signal);

    globalThis.fetch = (() => Promise.reject(new DOMException("timed out", "TimeoutError"))) as unknown as typeof fetch;
    const caught = await getDraft("proc_a", "tok", signal).catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(StudioClientError);
    expect((caught as InstanceType<typeof StudioClientError>).status).toBeUndefined();
  });

  it("sends no signal where the caller passes none, and a 404 still reads as undefined", async () => {
    const seen = answer(200, { processId: "proc_a", body: {}, layout: {}, revision: 1 });
    await getDraft("proc_a", "tok");
    expect(seen[0]!.init?.signal ?? undefined).toBeUndefined();
    answer(404, { error: { type: "not-found", message: "no" } });
    expect(await getDraft("proc_a", "tok")).toBeUndefined();
  });
});

describe("the save timeout", () => {
  /** A fetch that never answers and rejects when its signal aborts; the stubbed timeout aborts at once. */
  function hang(): { ms: number[] } {
    const ms: number[] = [];
    AbortSignal.timeout = ((n: number) => {
      ms.push(n);
      return AbortSignal.abort(new DOMException("The operation timed out.", "TimeoutError"));
    }) as typeof AbortSignal.timeout;
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) reject(signal.reason);
        signal.addEventListener("abort", () => reject(signal.reason));
      })) as typeof fetch;
    return { ms };
  }

  const reads = async (call: () => Promise<unknown>): Promise<string | undefined> => {
    try {
      await call();
    } catch (e) {
      return e instanceof StudioClientError ? e.error.type : "other";
    }
    return undefined;
  };

  it("reads a timed-out saveDraft as the network error", async () => {
    const t = hang();
    expect(await reads(() => saveDraft("proc_a", { body: {}, layout: {}, revision: 1 }, "tok"))).toBe("network");
    expect(t.ms).toEqual([SAVE_TIMEOUT_MS]);
  });

  it("reads a timed-out create, restore and remove as the network error", async () => {
    const t = hang();
    expect(await reads(() => createSavePoint("proc_a", { name: "n", revision: 1 }, "tok"))).toBe("network");
    expect(await reads(() => restoreSavePoint("proc_a", "spt_1", { revision: 1, keepName: "k" }, "tok"))).toBe("network");
    expect(await reads(() => removeSavePoint("proc_a", "spt_1", "tok"))).toBe("network");
    expect(t.ms).toEqual([SAVE_TIMEOUT_MS, SAVE_TIMEOUT_MS, SAVE_TIMEOUT_MS]);
  });
});
