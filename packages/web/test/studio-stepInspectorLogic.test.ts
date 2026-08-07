import { describe, expect, it } from "bun:test";
import { openSectionForSelection } from "../src/areas/studio/panels/stepInspectorLogic.js";

describe("openSectionForSelection", () => {
  it("opens the paths section when a path is selected", () => {
    expect(openSectionForSelection("path_ab")).toBe("paths");
  });

  it("starts collapsed when no path is selected (a plain step selection or a deselect)", () => {
    expect(openSectionForSelection(undefined)).toBeUndefined();
  });
});
