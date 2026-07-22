import { describe, expect, it } from "bun:test";
import { runValidation } from "../src/draft/validation";
import { mintId } from "../src/draft/ids";
import { createExampleRegistry } from "../src/registry/exampleRegistry";
import type { Draft } from "../src/draft/types";

function baseDraft(): Draft {
  const fieldId = mintId("field");
  const stepStart = mintId("step");
  const stepEnd = mintId("step");
  const pathId = mintId("path");
  const timerId = mintId("timer");

  return {
    key: "test_process",
    label: { en: "Test process" },
    baseLocale: "en",
    fields: [{ id: fieldId, key: "count", label: { en: "Count" }, type: "number" }],
    workflow: {
      initialStep: stepStart,
      steps: [
        {
          id: stepStart,
          key: "start",
          label: { en: "Start" },
          type: "task",
          timers: [{ id: timerId, duration: "PT1H", onFire: {} }],
          paths: [
            {
              id: pathId,
              key: "go",
              to: stepEnd,
              trigger: "automatic",
              priority: 1,
              // Missing the CEL `double` literal (`5.0`) — the documented papercut (CLAUDE.md).
              guard: { lang: "cel", src: "data.count == 5" },
            },
          ],
        },
        { id: stepEnd, key: "end", label: { en: "End" }, type: "task", terminal: true },
      ],
    },
  } as Draft;
}

describe("runValidation", () => {
  it("reports only Zod issues on a structurally incomplete draft", () => {
    const result = runValidation({ key: "incomplete" }, undefined, {});
    expect(result.zodValid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((i) => i.source === "zod")).toBe(true);
    expect(result.registryChecked).toBe(false);
  });

  it("locates a CEL type error on the path that carries the bad guard", () => {
    const draft = baseDraft();
    const result = runValidation(draft, undefined, {});
    expect(result.zodValid).toBe(true);
    const pathId = draft.workflow!.steps![0].paths![0].id!;
    const celIssue = result.issues.find((i) => i.source === "cel" && i.entityId === pathId);
    expect(celIssue).toBeDefined();
  });

  it("locates a duration grammar error on its timer", () => {
    const draft = baseDraft();
    draft.workflow!.steps![0].timers![0].duration = "not-a-duration";
    const result = runValidation(draft, undefined, {});
    const timerId = draft.workflow!.steps![0].timers![0].id!;
    const durationIssue = result.issues.find((i) => i.source === "duration" && i.entityId === timerId);
    expect(durationIssue).toBeDefined();
  });

  it("shows registryChecked=false and no registry issues when no registry is loaded", () => {
    const draft = baseDraft();
    draft.workflow!.steps![0].onEntry = [{ id: mintId("action"), type: "http.call", config: {} }];
    const result = runValidation(draft, undefined, {});
    expect(result.registryChecked).toBe(false);
    expect(result.issues.some((i) => i.source === "registry")).toBe(false);
  });

  it("locates a registry config error on its action once a registry is loaded", () => {
    const draft = baseDraft();
    const actionId = mintId("action");
    draft.workflow!.steps![0].onEntry = [{ id: actionId, type: "http.call", config: {} }]; // missing required `url`
    const result = runValidation(draft, createExampleRegistry(), {});
    expect(result.registryChecked).toBe(true);
    const registryIssue = result.issues.find((i) => i.source === "registry" && i.entityId === actionId);
    expect(registryIssue).toBeDefined();
  });

  it("marks a subprocess step not-checked until a child body is loaded", () => {
    const draft = baseDraft();
    const subStep = mintId("step");
    draft.workflow!.steps!.push({
      id: subStep,
      key: "call_child",
      label: { en: "Call child" },
      type: "subprocess",
      terminal: true,
      subprocess: {
        processId: "proc_00000000-0000-0000-0000-000000000000" as never,
        versionBinding: "pinned",
        pinnedVersion: 1,
        inputMapping: {},
        outputMapping: {},
      },
    });
    const result = runValidation(draft, undefined, {});
    expect(result.subprocessStepStatus[subStep]).toBe("not-checked");
  });

  it("locates a missing-baseLocale violation on its owning step", () => {
    const draft = baseDraft();
    draft.workflow!.steps![0].label = { de: "Anfang" }; // baseLocale is "en" — no "en" entry
    const result = runValidation(draft, undefined, {});
    const stepId = draft.workflow!.steps![0].id!;
    expect(result.zodValid).toBe(false);
    const issue = result.issues.find((i) => i.entityType === "step" && i.entityId === stepId);
    expect(issue).toBeDefined();
  });

  it("locates a missing-baseLocale violation on its owning field, including a field option", () => {
    const draft = baseDraft();
    draft.fields![0].label = { de: "Anzahl" }; // baseLocale is "en" — no "en" entry
    const result = runValidation(draft, undefined, {});
    const fieldId = draft.fields![0].id!;
    expect(result.zodValid).toBe(false);
    const issue = result.issues.find((i) => i.entityType === "field" && i.entityId === fieldId);
    expect(issue).toBeDefined();
  });

  it("locates a missing-baseLocale violation on a field option's owning field", () => {
    const draft = baseDraft();
    const selectFieldId = mintId("field");
    draft.fields!.push({
      id: selectFieldId,
      key: "choice",
      label: { en: "Choice" },
      type: "select",
      options: [{ value: "a", label: { de: "A" } }], // baseLocale is "en" — no "en" entry
    });
    const result = runValidation(draft, undefined, {});
    expect(result.zodValid).toBe(false);
    const issue = result.issues.find((i) => i.entityType === "field" && i.entityId === selectFieldId);
    expect(issue).toBeDefined();
  });
});
