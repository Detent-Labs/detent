import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  collectFieldIds,
  PublishedFieldIdsProvider,
  usePublishedFieldIds,
  watchPublishedFieldIds,
} from "../src/areas/studio/draft/publishedFields.js";

// `PublishedFieldIdsProvider` fires its fetch from a `useEffect`, which
// `renderToStaticMarkup` never runs, and this repo ships no DOM test library
// (see `studio-draftProvider-chainingFetch.test.ts`). The fetch and its stale
// guard live in `watchPublishedFieldIds`, a plain function over an injected
// `fetchBody`. The effect only calls it, so these cases drive that function
// the way the effect does: one watch per base version, cancelled on change.

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A `fetchBody` stub that records each call and settles it on demand. */
function stubFetch() {
  const calls: { processId: string; version: number; token: string; resolve: (body: unknown) => void; reject: (e: unknown) => void }[] = [];
  const fetchBody = (processId: string, version: number, token: string) =>
    new Promise<unknown>((resolve, reject) => {
      calls.push({ processId, version, token, resolve, reject });
    });
  return { calls, fetchBody };
}

const body = (...fields: unknown[]) => ({ key: "p", fields });

describe("collectFieldIds", () => {
  it("collects the id of every field at every depth", () => {
    const ids = collectFieldIds(
      body(
        { id: "field_a", key: "a" },
        { id: "field_g", key: "g", type: "group", fields: [{ id: "field_b", key: "b" }, { id: "field_h", type: "group", fields: [{ id: "field_c" }] }] },
      ),
    );

    expect([...ids].sort()).toEqual(["field_a", "field_b", "field_c", "field_g", "field_h"]);
  });

  it("answers an empty set for a body with no field catalog", () => {
    expect(collectFieldIds({ key: "p" }).size).toBe(0);
    expect(collectFieldIds(null).size).toBe(0);
  });
});

describe("watchPublishedFieldIds", () => {
  it("reports nothing while the fetch runs", async () => {
    const { calls, fetchBody } = stubFetch();
    const seen: ReadonlySet<string>[] = [];

    watchPublishedFieldIds(fetchBody, "proc_a", 3, "tok", (ids) => seen.push(ids));
    await flush();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ processId: "proc_a", version: 3, token: "tok" });
    expect(seen).toEqual([]);
  });

  it("reports the ids once the fetch resolves, nested group fields included", async () => {
    const { calls, fetchBody } = stubFetch();
    const seen: ReadonlySet<string>[] = [];

    watchPublishedFieldIds(fetchBody, "proc_a", 3, "tok", (ids) => seen.push(ids));
    calls[0]!.resolve(body({ id: "field_g", type: "group", fields: [{ id: "field_n" }] }));
    await flush();

    expect(seen).toHaveLength(1);
    expect([...seen[0]!].sort()).toEqual(["field_g", "field_n"]);
  });

  it("reports nothing after the fetch fails, so the lock stays on", async () => {
    const { calls, fetchBody } = stubFetch();
    const seen: ReadonlySet<string>[] = [];

    watchPublishedFieldIds(fetchBody, "proc_a", 3, "tok", (ids) => seen.push(ids));
    calls[0]!.reject(new Error("network"));
    await flush();

    expect(seen).toEqual([]);
  });

  it("ignores a response that arrives after the watch was cancelled", async () => {
    const { calls, fetchBody } = stubFetch();
    const seen: { version: number; ids: string[] }[] = [];

    // The effect for base version 3, then the cleanup and the effect for 4.
    const cancel3 = watchPublishedFieldIds(fetchBody, "proc_a", 3, "tok", (ids) => seen.push({ version: 3, ids: [...ids] }));
    cancel3();
    watchPublishedFieldIds(fetchBody, "proc_a", 4, "tok", (ids) => seen.push({ version: 4, ids: [...ids] }));

    expect(calls.map((c) => c.version)).toEqual([3, 4]);

    // The newer response lands first, the stale one second.
    calls[1]!.resolve(body({ id: "field_new" }));
    await flush();
    calls[0]!.resolve(body({ id: "field_old" }));
    await flush();

    expect(seen).toEqual([{ version: 4, ids: ["field_new"] }]);
  });
});

/** Prints what `usePublishedFieldIds` answers: `loading`, or the ids sorted. */
function Probe() {
  const ids = usePublishedFieldIds();
  return <p>{ids === undefined ? "loading" : `ids:[${[...ids].sort().join(",")}]`}</p>;
}

describe("PublishedFieldIdsProvider", () => {
  it("answers an empty set with no provider mounted", () => {
    expect(renderToStaticMarkup(<Probe />)).toContain("ids:[]");
  });

  it("answers an empty set for a draft with no base version", () => {
    const html = renderToStaticMarkup(
      <PublishedFieldIdsProvider processId="proc_a" token="tok" baseVersion={null}>
        <Probe />
      </PublishedFieldIdsProvider>,
    );

    expect(html).toContain("ids:[]");
  });

  it("answers undefined before the base version has loaded", () => {
    const html = renderToStaticMarkup(
      <PublishedFieldIdsProvider processId="proc_a" token="tok" baseVersion={2}>
        <Probe />
      </PublishedFieldIdsProvider>,
    );

    expect(html).toContain("loading");
  });

  it("fetches again when the base version changes", () => {
    const source = readFileSync(new URL("../src/areas/studio/draft/publishedFields.tsx", import.meta.url), "utf8");
    const deps = source.match(/useEffect\([\s\S]*?\},\s*(\[[^\]]*\])\s*\)/);

    expect(deps?.[1]).toContain("baseVersion");
    expect(deps?.[1]).toContain("processId");
  });
});

describe("watchPublishedFieldIds option values", () => {
  it("reports the choice values beside the ids", async () => {
    const { calls, fetchBody } = stubFetch();
    const seen: { ids: string[]; values: string[] }[] = [];

    watchPublishedFieldIds(fetchBody, "proc_a", 3, "tok", (ids, optionValues) =>
      seen.push({ ids: [...ids], values: [...(optionValues.get("field_a") ?? [])] }),
    );
    calls[0]!.resolve(body({ id: "field_a", options: [{ value: "open" }] }));
    await flush();

    expect(seen).toEqual([{ ids: ["field_a"], values: ["open"] }]);
  });
});
