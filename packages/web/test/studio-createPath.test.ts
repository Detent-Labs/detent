import { describe, expect, it } from "bun:test";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import { derivePathDefaults, newPath } from "../src/areas/studio/draft/createPath.js";

type DraftStep = DraftOf<Step>;

const UNNAMED = "(unnamed step)";

function step(id: string, key: string, label: string | undefined): DraftStep {
  return { id, key, label: label === undefined ? undefined : { en: label }, type: "task" } as unknown as DraftStep;
}

describe("derivePathDefaults", () => {
  it("names the path from each step's label when both carry one", () => {
    const source = step("step_a", "manager-review", "Manager review");
    const target = step("step_b", "finance-signoff", "Finance sign-off");
    const { key, label } = derivePathDefaults(source, target, "en", "en", UNNAMED);
    expect(label).toBe("Manager review → Finance sign-off");
    expect(key).toBe("manager-review-finance-sign-off");
  });

  it("falls back to a step's key when its label is empty", () => {
    const source = step("step_a", "manager-review", "");
    const target = step("step_b", "finance-signoff", "Finance sign-off");
    const { key, label } = derivePathDefaults(source, target, "en", "en", UNNAMED);
    expect(label).toBe("manager-review → Finance sign-off");
    expect(key).toBe("manager-review-finance-sign-off");
  });

  it("falls back to the placeholder when a step has neither label nor key", () => {
    const source = step("step_a", "", "");
    const target = step("step_b", "finance-signoff", "Finance sign-off");
    const { key, label } = derivePathDefaults(source, target, "en", "en", UNNAMED);
    expect(label).toBe(`${UNNAMED} → Finance sign-off`);
    expect(key).toBe("unnamed-step-finance-sign-off");
  });

  it("falls back to the placeholder's slug when a side's name slugs to empty", () => {
    const source = step("step_a", "", "!!!");
    const target = step("step_b", "", "???");
    const { key, label } = derivePathDefaults(source, target, "en", "en", UNNAMED);
    expect(label).toBe("!!! → ???");
    expect(key).toBe("unnamed-step-unnamed-step");
  });

  it("falls back to the placeholder on both sides when both steps are undefined", () => {
    const { key, label } = derivePathDefaults(undefined, undefined, "en", "en", UNNAMED);
    expect(label).toBe(`${UNNAMED} → ${UNNAMED}`);
    expect(key).toBe("unnamed-step-unnamed-step");
  });

  it("resolves a step's label at the given content locale, falling back to the base locale", () => {
    const source = { id: "step_a", key: "a", label: { de: "Manager-Prüfung" }, type: "task" } as unknown as DraftStep;
    const target = step("step_b", "b", "Finance sign-off");
    const { label } = derivePathDefaults(source, target, "en", "de", UNNAMED);
    expect(label).toBe("Manager-Prüfung → Finance sign-off");
  });
});

describe("newPath", () => {
  it("mints a fresh, prefixed id and carries the derived key/label pair", () => {
    const source = step("step_a", "manager-review", "Manager review");
    const target = step("step_b", "finance-signoff", "Finance sign-off");
    const path = newPath(source, target, target.id, "manual", "en", "en", UNNAMED);

    expect(String(path.id).startsWith("path_")).toBe(true);
    expect(path.to).toBe(target.id);
    expect(path.trigger).toBe("manual");
    expect(path.key).toBe("manager-review-finance-sign-off");
    expect(path.label).toBe("Manager review → Finance sign-off");
  });

  it("a drag to empty canvas derives its default from the just-created, unnamed target step", () => {
    const source = step("step_a", "manager-review", "Manager review");
    const target = step("step_new", "", undefined);
    const path = newPath(source, target, target.id, "manual", "en", "en", UNNAMED);

    expect(path.label).toBe(`Manager review → ${UNNAMED}`);
    expect(path.key).not.toBe("");
    expect(path.key).toBe("manager-review-unnamed-step");
  });

  it("a later rename of either step leaves an already-created path's key/label untouched", () => {
    const source = step("step_a", "manager-review", "Manager review");
    const target = step("step_b", "finance-signoff", "Finance sign-off");
    const path = newPath(source, target, target.id, "manual", "en", "en", UNNAMED);
    const before = { key: path.key, label: path.label };

    // Simulate a rename: the derivation ran once, at creation, over these
    // step objects — mutating them afterward must not resync the path.
    (source as { label?: unknown }).label = { en: "Renamed source" };
    (target as { key?: unknown }).key = "renamed-target";

    expect(path.key).toBe(before.key);
    expect(path.label).toBe(before.label);
  });
});
