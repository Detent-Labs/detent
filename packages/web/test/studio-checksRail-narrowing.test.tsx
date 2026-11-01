import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChecksRail } from "../src/areas/studio/panels/ChecksRail.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";

/**
 * The Checks tab narrowed to one step (`studio-forms-overview`: "Pressing the
 * badge SHALL open the Checks tab, narrowed to that step").
 *
 * The narrowing is additive: every other mount passes no `narrowedTo` and
 * reads exactly as it did. The escape hatch is not optional — an author must
 * never be stuck in a filtered list — so it is asserted here beside the
 * filter itself.
 */

function issue(entityId: string, sentence: string): EditorIssue {
  return { entityType: "step", entityId, message: `raw ${entityId}`, sentence, source: "cel", loc: `workflow.steps[0].guard` };
}

const validation: ValidationResult = {
  zodValid: true,
  issues: [issue("step_a", "the intake guard does not parse"), issue("step_b", "the review guard does not parse")],
  dimensions: {
    zod: "ran",
    duration: "ran",
    structural: "ran",
    actionType: "ran",
    assignmentType: "ran",
    dataSourceType: "ran",
    registryConfig: "ran",
    cel: "ran",
  },
  subprocessStepStatus: {},
  chainingSiteStatus: {},
};

const NARROWED = { label: "Intake", entityIds: ["step_a"] };

describe("A narrowed checks rail", () => {
  it("shows the issues naming that step and leaves the rest out", () => {
    const html = renderToStaticMarkup(<ChecksRail validation={validation} canPublish={true} narrowedTo={NARROWED} />);

    expect(html).toContain("the intake guard does not parse");
    expect(html).not.toContain("the review guard does not parse");
  });

  it("names the step it is showing", () => {
    const html = renderToStaticMarkup(<ChecksRail validation={validation} canPublish={true} narrowedTo={NARROWED} />);

    expect(html).toContain("Showing the checks on Intake.");
  });

  it("carries the control that returns to every check", () => {
    const html = renderToStaticMarkup(<ChecksRail validation={validation} canPublish={true} narrowedTo={NARROWED} />);

    expect(html).toContain("Show every check");
  });

  it("states no publish verdict while narrowed, since it is reading one step alone", () => {
    const oneStep = { ...validation, issues: [issue("step_b", "the review guard does not parse")] };
    const html = renderToStaticMarkup(<ChecksRail validation={oneStep} canPublish={true} narrowedTo={NARROWED} />);

    expect(html).not.toContain("ready to publish");
  });

  it("keeps Before publishing and its line while narrowed", () => {
    const html = renderToStaticMarkup(<ChecksRail validation={validation} canPublish={true} narrowedTo={NARROWED} />);

    expect(html).toContain("Before publishing");
    expect(html).toContain("Publishing also checks each plugin&#x27;s settings");
  });

  it("reads the held-back state off the whole draft, not the rows shown", () => {
    const structural: EditorIssue = { entityType: "step", entityId: "step_b", message: "raw", sentence: "x", source: "structural", loc: "" };
    const held = { ...validation, issues: [structural, issue("step_a", "the intake guard does not parse")] };
    const html = renderToStaticMarkup(<ChecksRail validation={held} canPublish={true} narrowedTo={NARROWED} />);

    // The structural row belongs to step_b and stays out, yet it still holds the CEL and registry checks back.
    expect(html).toContain("More checks run once you fix the rows above.");
  });

  it("shows every issue again once the narrowing goes", () => {
    const html = renderToStaticMarkup(<ChecksRail validation={validation} canPublish={true} />);

    expect(html).toContain("the intake guard does not parse");
    expect(html).toContain("the review guard does not parse");
    expect(html).not.toContain("Show every check");
  });
});
