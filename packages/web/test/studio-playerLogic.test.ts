import { describe, expect, it } from "bun:test";
import { describeRecordElement } from "../src/api/record.js";
import { seedFormValues, createAndOpenInstance, isTestInstance } from "../src/areas/studio/screens/playerLogic.js";
import type { InstanceRecordElement } from "../src/areas/studio/api/types.js";

describe("describeRecordElement", () => {
  it("summarizes a transition with its cause, path, and step change", () => {
    const el = {
      kind: "transition",
      entry: { at: "2026-01-01T00:00:00.000Z", cause: "manual", pathId: "path_ab", fromStepId: "step_a", toStepId: "step_b" },
    } as unknown as InstanceRecordElement;
    const d = describeRecordElement(el);
    expect(d.at).toBe("2026-01-01T00:00:00.000Z");
    expect(d.summary).toBe("transition — manual via path_ab — step_a → step_b");
  });

  it("renders (start) for a transition with no fromStepId", () => {
    const el = {
      kind: "transition",
      entry: { at: "2026-01-01T00:00:00.000Z", cause: "manual", toStepId: "step_a" },
    } as unknown as InstanceRecordElement;
    expect(describeRecordElement(el).summary).toBe("transition — manual — (start) → step_a");
  });

  it("omits the path segment when a transition has no pathId", () => {
    const el = {
      kind: "transition",
      entry: { at: "2026-01-01T00:00:00.000Z", cause: "timer", fromStepId: "step_a", toStepId: "step_b" },
    } as unknown as InstanceRecordElement;
    expect(describeRecordElement(el).summary).toBe("transition — timer — step_a → step_b");
  });

  it("summarizes an event with its kind", () => {
    const el = { kind: "event", event: { at: "2026-01-01T00:00:01.000Z", kind: "timer.fired" } } as unknown as InstanceRecordElement;
    const d = describeRecordElement(el);
    expect(d.at).toBe("2026-01-01T00:00:01.000Z");
    expect(d.summary).toBe("event — timer.fired");
  });
});

describe("seedFormValues", () => {
  it("keys each field's value by the field's id", () => {
    const fields = [
      { field: { id: "field_a" }, value: 1 },
      { field: { id: "field_b" }, value: "x" },
    ];
    expect(seedFormValues(fields)).toEqual({ field_a: 1, field_b: "x" });
  });

  it("returns an empty object for no fields", () => {
    expect(seedFormValues([])).toEqual({});
  });
});

/**
 * draft-play-instance-marker, tasks 8.1/8.3: `PlayerScreen`'s "Create test
 * instance" and "Create new instance" actions share this same
 * create-then-load flow, differing only in which creation route the caller
 * injects. `renderToStaticMarkup` (this repo's own convention, per
 * `studio-draftProvider-chainingFetch.test.ts`) never fires a click, so the
 * flow each button drives is exercised here directly instead, with fakes
 * standing in for the two studio-api client calls.
 */
describe("createAndOpenInstance", () => {
  it("task 8.1: creates via the injected test-instance route and renders the resulting running, test-kind instance", async () => {
    let createCalls = 0;
    let loadedId: string | undefined;
    const result = await createAndOpenInstance(
      async () => {
        createCalls++;
        return { instanceId: "inst_test1" };
      },
      async (id) => {
        loadedId = id;
        return { kind: "test" as const, status: "running" };
      },
    );
    expect(createCalls).toBe(1);
    expect(loadedId).toBe("inst_test1");
    expect(result.instanceId).toBe("inst_test1");
    expect(result.view.kind).toBe("test");
    expect(result.view.status).toBe("running");
  });

  it("task 8.3: creates via the injected published-instance route and renders a non-test instance, unaffected by the new route", async () => {
    let createCalls = 0;
    const result = await createAndOpenInstance(
      async () => {
        createCalls++;
        return { instanceId: "inst_pub1" };
      },
      async () => ({ kind: "published" as const, status: "running" }),
    );
    expect(createCalls).toBe(1);
    expect(result.instanceId).toBe("inst_pub1");
    expect(result.view.kind).toBe("published");
  });
});

/** draft-play-instance-marker, task 8.2: the marker's visibility rule. */
describe("isTestInstance", () => {
  it("is false for an ordinary (published-kind) instance view", () => {
    expect(isTestInstance({ kind: "published" })).toBe(false);
  });

  it("is true for a test-kind instance view", () => {
    expect(isTestInstance({ kind: "test" })).toBe(true);
  });

  it("is false when there is no view yet", () => {
    expect(isTestInstance(undefined)).toBe(false);
  });
});
