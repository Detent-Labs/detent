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

describe("The checks rail's start state", () => {
  const stepless: ValidationResult = {
    ...clear,
    zodValid: false,
    noStepYet: true,
    dimensions: { ...clear.dimensions, duration: "not-run", structural: "not-run" },
  };
  const SENTENCE = "No step yet. Add the first step on the Canvas or the Steps tab.";

  it("renders the sentence alone, with no group and no validator name", () => {
    const html = renderToStaticMarkup(<ChecksRail validation={stepless} canPublish={true} />);

    expect(html).toContain(SENTENCE);
    expect(html).not.toContain("checksGroup");
    expect(html).not.toContain("Held back");
    expect(html).not.toContain("zod");
    expect(html).not.toContain("Invalid input");
  });

  it("puts the sentence above the groups when an issue is open", () => {
    const withIssue: ValidationResult = {
      ...stepless,
      issues: [{ entityType: "process", entityId: "process", message: "The process needs a name.", source: "zod", loc: "" }],
    };
    const html = renderToStaticMarkup(<ChecksRail validation={withIssue} canPublish={true} />);

    expect(html).toContain(SENTENCE);
    expect(html).toContain("The process needs a name.");
    expect(html.indexOf(SENTENCE)).toBeLessThan(html.indexOf("The process needs a name."));
  });

  it("never renders the all-clear box", () => {
    const html = renderToStaticMarkup(<ChecksRail validation={stepless} canPublish={true} />);

    expect(html).not.toContain("No open issues.");
    expect(html).not.toContain("ready to publish");
  });

  it("draws the sentence as plain text, not in the all-clear box's class", () => {
    const classOf = (html: string, text: string): string => {
      const m = html.match(new RegExp(`<p class="([^"]*)"[^>]*>${text}`));
      return m ? m[1] : "";
    };
    const start = renderToStaticMarkup(<ChecksRail validation={stepless} canPublish={true} />);
    const allClear = renderToStaticMarkup(<ChecksRail validation={clear} canPublish={true} />);
    const startClass = classOf(start, "No step yet");
    const clearClass = classOf(allClear, "No open issues");

    expect(startClass).not.toBe("");
    expect(clearClass).not.toBe("");
    expect(startClass).not.toBe(clearClass);
  });
});
