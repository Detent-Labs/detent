import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChecksRail } from "../src/areas/studio/panels/ChecksRail.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";

/**
 * studio-publish-gate-and-report: the checks rail states a publish verdict it
 * can verify.
 *
 * The defect this rejects reached the running build. The rail's all-clear box
 * read "No open issues. This draft is ready to publish." for every actor,
 * because the component received `validation` and nothing else. An actor
 * without the publish permission read that sentence in a bordered box in the
 * right rail while the `⋮` menu across the screen refused the act.
 *
 * `development-toolchain`'s split rule sends this to an assertion: the box is
 * a property of the rendered string, and this repository produced the defect.
 *
 * A clear draft is what makes the box render at all, so every case below
 * carries an empty `issues[]`.
 */
const clear: ValidationResult = {
  zodValid: true,
  issues: [],
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

describe("The checks rail's all-clear box", () => {
  it("reports the validation verdict and the publish verdict as two sentences", () => {
    const html = renderToStaticMarkup(<ChecksRail validation={clear} canPublish={true} />);

    expect(html).toContain("checksRailClear");
    expect(html).toContain("No open issues.");
    expect(html).toContain("This draft is ready to publish.");
  });

  it("names the permission instead of asserting publishability it cannot verify", () => {
    const html = renderToStaticMarkup(<ChecksRail validation={clear} canPublish={false} />);

    expect(html).toContain("No open issues.");
    expect(html).toContain("Publishing needs the publish permission for this process.");
    // The violating input: the sentence the rail used to print for every
    // actor, contradicting the gate 900px away that it never read.
    expect(html).not.toContain("ready to publish");
  });

  it("keeps the validation verdict whichever way the permission reads", () => {
    const refused = renderToStaticMarkup(<ChecksRail validation={clear} canPublish={false} />);

    // The two verdicts are different facts. A refused publish leaves the
    // checks clear, and the rail still says so.
    expect(refused).toContain("No open issues.");
  });

  it("states no publish verdict at all while issues remain open", () => {
    const withIssue: ValidationResult = {
      ...clear,
      zodValid: false,
      issues: [{ source: "zod", entityType: "process", entityId: "proc_a", message: "steps must not be empty", loc: "" }],
    };
    const html = renderToStaticMarkup(<ChecksRail validation={withIssue} canPublish={false} />);

    expect(html).not.toContain("checksRailClear");
    expect(html).not.toContain("publish permission");
  });
});
