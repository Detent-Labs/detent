/**
 * `draft/subprocessSpec.ts::specForProcess` and
 * `panels/shared/useChildInputFields.ts::childInputRefs`
 * (`fix-subprocess-step-editor`, design.md decisions 1 and 2).
 */
import { describe, expect, it } from "bun:test";
import { childVersionFor, specForProcess } from "../src/areas/studio/draft/subprocessSpec.js";
import { childInputRefs, childInputsFor } from "../src/areas/studio/panels/shared/useChildInputFields.js";
import type { ProcessSummary } from "../src/areas/studio/api/types.js";
import type { ProcessId } from "workflow-engine/schema";

const CREDIT = "proc_11111111-1111-4111-8111-111111111111" as ProcessId;
const VENDOR = "proc_22222222-2222-4222-8222-222222222222" as ProcessId;

const PROCESSES: ProcessSummary[] = [
  { processId: CREDIT, version: 3, definitionHash: "h-a", key: "credit-check", label: { en: "Credit check" }, baseLocale: "en", publishedAt: "2026-07-01T00:00:00.000Z" },
  { processId: VENDOR, version: 7, definitionHash: "h-b", key: "vendor", label: { en: "Vendor" }, baseLocale: "en", publishedAt: "2026-07-02T00:00:00.000Z" },
];

describe("specForProcess", () => {
  it("writes a whole pinned spec on the first pick", () => {
    expect(specForProcess(CREDIT, PROCESSES, undefined)).toEqual({
      processId: CREDIT,
      versionBinding: "pinned",
      pinnedVersion: 3,
      inputMapping: {},
      outputMapping: {},
    });
  });

  it("resets pinnedVersion to the new process's newest on a pinned spec", () => {
    const current = {
      processId: CREDIT,
      versionBinding: "pinned" as const,
      pinnedVersion: 2,
      inputMapping: { fld_a: { lang: "cel" as const, src: "data.x" } } as never,
      outputMapping: {},
    };
    expect(specForProcess(VENDOR, PROCESSES, current)).toEqual({ ...current, processId: VENDOR, pinnedVersion: 7 });
  });

  it("changes only processId on a latest-at-spawn spec", () => {
    const current = {
      processId: CREDIT,
      versionBinding: "latest-at-spawn" as const,
      contractRef: "ref-1",
      inputMapping: { fld_a: { lang: "cel" as const, src: "data.x" } } as never,
      outputMapping: { fld_b: { lang: "cel" as const, src: "child.data.y" } } as never,
    };
    expect(specForProcess(VENDOR, PROCESSES, current)).toEqual({ ...current, processId: VENDOR });
  });

  it("leaves pinnedVersion alone when the process is not in the list", () => {
    const current = { processId: CREDIT, versionBinding: "pinned" as const, pinnedVersion: 2 };
    expect(specForProcess("proc_absent", PROCESSES, current)).toEqual({ ...current, processId: "proc_absent" as ProcessId });
  });
});

describe("childInputRefs", () => {
  it("lists the contract's input fields in contract order", () => {
    const body = {
      baseLocale: "en",
      fields: [
        { id: "fld_a", key: "amount", type: "number", label: { en: "Amount" } },
        { id: "fld_b", key: "applicant", type: "string", label: { en: "Applicant" } },
        { id: "fld_c", key: "note", type: "string", label: { en: "Note" } },
      ],
      contract: { inputFields: ["fld_b", "fld_a"] },
    };
    expect(childInputRefs(body).map((r) => [r.id, r.key])).toEqual([
      ["fld_b", "applicant"],
      ["fld_a", "amount"],
    ]);
  });

  it("resolves a field nested in a group", () => {
    const body = {
      baseLocale: "en",
      fields: [{ id: "fld_g", key: "grp", type: "group", fields: [{ id: "fld_n", key: "nested", type: "string" }] }],
      contract: { inputFields: ["fld_n"] },
    };
    expect(childInputRefs(body).map((r) => r.key)).toEqual(["nested"]);
  });

  it("returns an empty list for a body without a contract", () => {
    expect(childInputRefs({ baseLocale: "en", fields: [{ id: "fld_a", key: "amount" }] })).toEqual([]);
  });

  it("returns an empty list for a contract without inputFields", () => {
    expect(childInputRefs({ baseLocale: "en", fields: [], contract: { outcomes: ["ok"] } })).toEqual([]);
  });

  it("returns an empty list for a body that is not an object", () => {
    expect(childInputRefs(null)).toEqual([]);
    expect(childInputRefs("x")).toEqual([]);
  });
});

describe("childInputsFor", () => {
  const ready = { forKey: "p@1", status: "ready" as const, fields: [{ id: "fld_a", key: "a", label: "a" }] };

  it("is idle with no key", () => {
    expect(childInputsFor(ready, undefined)).toEqual({ status: "idle", fields: [] });
  });

  it("is loading when the result belongs to another key", () => {
    expect(childInputsFor(ready, "p@2")).toEqual({ status: "loading", fields: [] });
  });

  it("returns the result for the same key", () => {
    expect(childInputsFor(ready, "p@1")).toEqual({ status: "ready", fields: ready.fields });
  });
});

describe("childVersionFor", () => {
  it("returns the pinned version of a pinned binding", () => {
    expect(childVersionFor({ processId: CREDIT, versionBinding: "pinned", pinnedVersion: 2 }, PROCESSES)).toBe(2);
  });

  it("reads the process-list row's version for latest-at-spawn", () => {
    expect(childVersionFor({ processId: VENDOR, versionBinding: "latest-at-spawn", contractRef: "r" }, PROCESSES)).toBe(7);
  });

  it("returns undefined for latest-at-spawn on a process the list does not carry", () => {
    expect(childVersionFor({ processId: "proc_absent" as ProcessId, versionBinding: "latest-at-spawn" }, PROCESSES)).toBeUndefined();
  });

  it("returns undefined for a pinned binding with no pinnedVersion", () => {
    expect(childVersionFor({ processId: CREDIT, versionBinding: "pinned" }, PROCESSES)).toBeUndefined();
  });

  it("returns undefined for no spec or a spec with no binding", () => {
    expect(childVersionFor(undefined, PROCESSES)).toBeUndefined();
    expect(childVersionFor({ processId: CREDIT }, PROCESSES)).toBeUndefined();
  });
});
