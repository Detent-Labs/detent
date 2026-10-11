import { describe, expect, it } from "bun:test";
import { catalogStateFor, fieldsToRefs, mergeVersionBodies } from "../src/areas/studio/panels/shared/useTargetProcessCatalog.js";

/**
 * `studio-plugin-config-form`: the form reads a compared field's declared type
 * from the target's published versions, and the newest version that declares
 * the field decides (design.md decision 3).
 */

const label = (en: string) => ({ en });

describe("fieldsToRefs", () => {
  it("copies a string type and leaves a plugin envelope without one", () => {
    const refs = fieldsToRefs(
      [
        { id: "field_a", key: "a", label: label("A"), type: "number" },
        { id: "field_b", key: "b", label: label("B"), type: { type: "acme.money", config: {} } },
      ],
      "en",
    );
    expect(refs).toEqual([
      { id: "field_a", key: "a", label: "A", type: "number" },
      { id: "field_b", key: "b", label: "B" },
    ]);
    expect("type" in refs[1]!).toBe(false);
  });
});

describe("mergeVersionBodies", () => {
  const v1 = {
    version: 1,
    body: {
      baseLocale: "en",
      fields: [{ id: "field_p", key: "priority", label: label("Priority"), type: "string" }],
      workflow: { steps: [{ id: "step_a", key: "a", label: label("Old A") }] },
    },
  };
  const v2 = {
    version: 2,
    body: {
      baseLocale: "en",
      fields: [{ id: "field_p", key: "priority", label: label("Priority"), type: "number" }],
      workflow: { steps: [{ id: "step_a", key: "a", label: label("New A") }] },
    },
  };

  it("lets the newest version decide a field's type, whatever order the versions arrive in", () => {
    const catalog = mergeVersionBodies([v2, v1]);
    expect(catalog.fields).toEqual([{ id: "field_p", key: "priority", label: "Priority", type: "number" }]);
    expect(catalog.steps).toEqual([{ id: "step_a", key: "a", label: "New A" }]);
  });

  it("keeps a field only an older version declares", () => {
    const v3 = { version: 3, body: { baseLocale: "en", fields: [], workflow: { steps: [] } } };
    const catalog = mergeVersionBodies([v3, v1]);
    expect(catalog.fields.map((f) => f.id)).toEqual(["field_p"]);
    expect(catalog.fields[0]!.type).toBe("string");
  });

  it("drops the type when the newest declaration is a plugin envelope", () => {
    const v3 = {
      version: 3,
      body: { fields: [{ id: "field_p", key: "priority", label: label("Priority"), type: { type: "acme.money" } }] },
    };
    const catalog = mergeVersionBodies([v3, v2, v1]);
    expect(catalog.fields).toEqual([{ id: "field_p", key: "priority", label: "Priority" }]);
  });
});

describe("catalogStateFor", () => {
  const loaded = { catalog: { steps: [], fields: [] }, error: false };
  const failed = { catalog: undefined, error: true };

  it("returns the result fetched for the current process", () => {
    expect(catalogStateFor({ forId: "proc_a", state: loaded }, "proc_a")).toBe(loaded);
    expect(catalogStateFor({ forId: "proc_a", state: failed }, "proc_a")).toBe(failed);
  });

  it("reads as loading after a switch, before the new process's fetch ends", () => {
    expect(catalogStateFor({ forId: "proc_a", state: failed }, "proc_b")).toEqual({ catalog: undefined, error: false });
    expect(catalogStateFor({ forId: "proc_a", state: loaded }, "proc_b")).toEqual({ catalog: undefined, error: false });
  });

  it("reads as loading when no process is picked", () => {
    expect(catalogStateFor({ forId: undefined, state: failed }, undefined)).toEqual({ catalog: undefined, error: false });
  });
});
