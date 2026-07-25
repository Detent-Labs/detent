import { describe, expect, it, mock, beforeEach } from "bun:test";
import { PlayerClientError } from "../src/player/client";
import type { InstanceView } from "../src/player/types";

const calls: { fn: string; args: unknown[] }[] = [];
const mockResponses: { createInstance?: unknown; getInstanceView?: unknown; submit?: unknown; login?: unknown } = {};

/** Stub only the fetch-calling functions; `PlayerClientError` stays
 * the real class so `instanceof` checks (both here and inside store.tsx)
 * keep working. Registered before `store.tsx` is imported below, matching
 * the `graph-view-rendering.test.tsx` mock-before-dynamic-import convention. */
mock.module("../src/player/client", () => ({
  PlayerClientError,
  createInstance: mock(async (...args: unknown[]) => {
    calls.push({ fn: "createInstance", args });
    return mockResponses.createInstance;
  }),
  getInstanceView: mock(async (...args: unknown[]) => {
    calls.push({ fn: "getInstanceView", args });
    return mockResponses.getInstanceView;
  }),
  submit: mock(async (...args: unknown[]) => {
    calls.push({ fn: "submit", args });
    return mockResponses.submit;
  }),
  login: mock(async (...args: unknown[]) => {
    calls.push({ fn: "login", args });
    return mockResponses.login;
  }),
}));

const { editableFieldIds, parseSeedData, loadStoredConnection, persistConnection, createInstanceAndFetchView, submitAndFetchView, DEFAULT_CONNECTION, STORAGE_KEY } =
  await import("../src/player/store");

const token = "test-token-abc";

function view(fields: InstanceView["fields"]): InstanceView {
  return {
    instanceId: "inst_1",
    processId: "proc_1",
    version: 1,
    status: "running",
    step: { id: "step_a", key: "a", label: { en: "A" }, type: "task" },
    fields,
    availablePaths: [{ id: "path_ab", key: "ab" }],
  };
}

beforeEach(() => {
  calls.length = 0;
  mockResponses.createInstance = undefined;
  mockResponses.getInstanceView = undefined;
  mockResponses.submit = undefined;
  mockResponses.login = undefined;
});

describe("editableFieldIds", () => {
  it("excludes readonly and group-container fields, includes ordinary visible fields", () => {
    const v = view([
      { field: { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" }, value: 5, required: true, readonly: false },
      { field: { id: "field_locked", key: "locked", label: { en: "Locked" }, type: "string" }, value: "x", required: false, readonly: true },
      { field: { id: "field_grp", key: "grp", label: { en: "Group" }, type: "group" }, value: undefined, required: false, readonly: false },
    ]);

    expect(editableFieldIds(v)).toEqual(new Set(["field_amount"]));
  });
});

describe("parseSeedData", () => {
  it("returns undefined for empty/whitespace-only input", () => {
    expect(parseSeedData("")).toBeUndefined();
    expect(parseSeedData("   ")).toBeUndefined();
  });

  it("parses valid JSON", () => {
    expect(parseSeedData('{"field_amount": 5}')).toEqual({ field_amount: 5 });
  });

  it("throws a validation-shaped PlayerClientError for invalid JSON", () => {
    let caught: unknown;
    try {
      parseSeedData("{not json");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PlayerClientError);
    expect((caught as PlayerClientError).error.type).toBe("validation");
  });
});

describe("localStorage persistence round trip", () => {
  it("restores exactly what was persisted", () => {
    const store = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };

    persistConnection({ serverUrl: "http://example:4000", token: "tok_abc" }, fakeStorage);
    const restored = loadStoredConnection(fakeStorage);

    expect(restored).toEqual({ serverUrl: "http://example:4000", token: "tok_abc" });
  });

  it("falls back to defaults with no storage or nothing stored yet", () => {
    expect(loadStoredConnection(undefined)).toEqual(DEFAULT_CONNECTION);
    const empty = { getItem: () => null, setItem: () => {} };
    expect(loadStoredConnection(empty)).toEqual(DEFAULT_CONNECTION);
  });

  it("uses a stable storage key", () => {
    expect(STORAGE_KEY).toBe("player.connection");
  });
});

describe("createInstanceAndFetchView", () => {
  it("creates, then re-fetches the view for the created instance id", async () => {
    mockResponses.createInstance = { instanceId: "inst_new" };
    mockResponses.getInstanceView = view([]);

    const result = await createInstanceAndFetchView("http://x", "proc_1", token, { seedDataJson: "" });

    expect(result.instanceId).toBe("inst_new");
    expect(result.view).toEqual(view([]));
    expect(calls.map((c) => c.fn)).toEqual(["createInstance", "getInstanceView"]);
    expect(calls[1]!.args[1]).toBe("inst_new"); // getInstanceView(serverUrl, instanceId, token)
  });

  it("rejects invalid seed JSON before calling createInstance", async () => {
    await expect(createInstanceAndFetchView("http://x", "proc_1", token, { seedDataJson: "{bad" })).rejects.toBeInstanceOf(PlayerClientError);
    expect(calls).toHaveLength(0);
  });
});

describe("submitAndFetchView", () => {
  it("sends only editable fields, then always re-fetches the view regardless of submit's own response shape", async () => {
    const currentView = view([
      { field: { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" }, value: 5, required: true, readonly: false },
      { field: { id: "field_locked", key: "locked", label: { en: "Locked" }, type: "string" }, value: "x", required: false, readonly: true },
    ]);
    // submit's own response is ignored no matter its shape — an Instance-like
    // body here stands in for the normal case, but the assertion below never
    // reads it (design.md: "ignores the mutation response body").
    mockResponses.submit = { instanceId: "inst_1", currentStepId: "step_b" };
    mockResponses.getInstanceView = view([]);

    const result = await submitAndFetchView(
      "http://x",
      "inst_1",
      "path_ab",
      { field_amount: 10, field_locked: "attempted-override" },
      token,
      currentView,
    );

    expect(result).toEqual(view([]));
    expect(calls.map((c) => c.fn)).toEqual(["submit", "getInstanceView"]);
    const submittedData = calls[0]!.args[3];
    expect(submittedData).toEqual({ field_amount: 10 });
  });
});
