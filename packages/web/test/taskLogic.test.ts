import { describe, expect, it } from "bun:test";
import { formIsReadonly } from "form-ui";
import { readonlyNoteKey, seedTaskValues } from "../src/areas/app/screens/taskLogic.js";
import type { InstanceView } from "../src/areas/app/api/types.js";

const fields = [{ field: { id: "fld_amount" }, value: 120 }];

describe("seedTaskValues", () => {
  it("lets a draft null win over the committed value", () => {
    expect(seedTaskValues(fields, { data: { fld_amount: null } })).toEqual({ fld_amount: null });
  });

  it("lets a draft value win over the committed value", () => {
    expect(seedTaskValues(fields, { data: { fld_amount: 7 } })).toEqual({ fld_amount: 7 });
  });

  it("keeps the committed value when the draft has no key for the field", () => {
    expect(seedTaskValues(fields, { data: { fld_other: 1 } })).toEqual({ fld_amount: 120 });
  });

  it("keeps the committed value when there is no draft", () => {
    expect(seedTaskValues(fields, undefined)).toEqual({ fld_amount: 120 });
  });
});

describe("readonlyNoteKey", () => {
  const path = { id: "path_a", key: "approve", label: "Approve" } as InstanceView["availablePaths"][number];
  const note = (status: InstanceView["status"], availablePaths: InstanceView["availablePaths"]) => readonlyNoteKey({ status, availablePaths });

  it("names the not-running cause for a completed, cancelled or faulted case", () => {
    expect(note("completed", [])).toBe("task.readonlyNotRunning");
    expect(note("cancelled", [path])).toBe("task.readonlyNotRunning");
    expect(note("faulted", [])).toBe("task.readonlyNotRunning");
  });

  it("names the no-path cause for a running step with no available path", () => {
    expect(note("running", [])).toBe("task.readonlyNoPath");
  });

  it("gives no note for a running step with an available path", () => {
    expect(note("running", [path])).toBeUndefined();
  });
});

describe("formIsReadonly and readonlyNoteKey", () => {
  const path = { id: "path_a", key: "approve", label: "Approve" } as InstanceView["availablePaths"][number];
  const statuses: InstanceView["status"][] = ["running", "completed", "cancelled", "faulted"];

  it("agree on every status and path combination", () => {
    for (const status of statuses) {
      for (const availablePaths of [[], [path]]) {
        const view = { status, availablePaths };
        expect(formIsReadonly(view)).toBe(readonlyNoteKey(view) !== undefined);
      }
    }
  });
});
