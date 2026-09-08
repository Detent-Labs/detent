import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftNavControls } from "../src/areas/studio/panels/DraftNavControls.js";

/**
 * The studio's area nav carries one control while a draft stands open:
 * Checks (`studio-process-tabs`). Save, Discard draft, Publish and the
 * Publish permission gate moved to `ProcessHeaderBar.tsx`; their coverage
 * moved with them, into `studio-processHeaderBar-publishGate.test.tsx`.
 *
 * `development-toolchain`'s split rule sends these to assertions: the state
 * dot, the counts and the reason text are all properties of the rendered
 * string.
 */
const RAN = {
  zod: "ran",
  duration: "ran",
  structural: "ran",
  actionType: "ran",
  assignmentType: "ran",
  dataSourceType: "ran",
  registryConfig: "not-run",
  cel: "ran",
} as const;

function validationOf(issues: EditorIssue[], zodValid = true): ValidationResult {
  return {
    zodValid,
    issues,
    dimensions: zodValid ? { ...RAN } : { ...RAN, structural: "not-run" },
    subprocessStepStatus: {},
    chainingSiteStatus: {},
  };
}

function issue(source: EditorIssue["source"]): EditorIssue {
  return { entityType: "step", entityId: "step_1", message: "bad", source, loc: "workflow.steps[0]" };
}

function render(over: { issues?: EditorIssue[]; zodValid?: boolean; canPublish?: boolean }): string {
  return renderToStaticMarkup(
    <DraftNavControls
      validation={validationOf(over.issues ?? [], over.zodValid ?? true)}
      canPublish={over.canPublish ?? true}
      onOpenChecks={() => {}}
    />,
  );
}

describe("The Checks control's state dot", () => {
  it("takes the blocker color when an engine validator holds an open issue", () => {
    const html = render({ issues: [issue("structural")] });

    expect(html).toContain("checksRailDotBlocker");
    expect(html).not.toContain("checksRailDotAdvisory");
    expect(html).not.toContain("checksRailDotClear");
  });

  it("takes the advisory color when the studio's own view findings stand alone", () => {
    // A `view`-source entry never refuses a publish, so it is advisory.
    const html = render({ issues: [issue("view")] });

    expect(html).toContain("checksRailDotAdvisory");
    expect(html).not.toContain("checksRailDotBlocker");
  });

  it("takes the clear color on a draft with no open issue", () => {
    const html = render({});

    expect(html).toContain("checksRailDotClear");
    expect(html).not.toContain("checksRailDotBlocker");
    expect(html).not.toContain("checksRailDotAdvisory");
  });

  it("refuses the clear color while a group holds back", () => {
    const html = render({ zodValid: false });

    expect(html).not.toContain("checksRailDotClear");
    expect(html).toContain("checksRailDotBlocker");
  });

  it("names the count and the dot's own reading in one accessible name", () => {
    // Two `zod` entries: the zod group never holds back, and its own entries
    // leave the later groups running, so the summary reads a plain count.
    const html = render({ issues: [issue("zod"), issue("zod")] });

    expect(html).toContain("Checks: 2 open issues, one of which refuses a publish.");
    // The dot itself says nothing: the name above already carries it.
    expect(html).toContain('aria-hidden="true"');
  });

  it("prints the open issue count beside the name", () => {
    expect(render({ issues: [issue("zod"), issue("zod")] })).toContain(">2<");
  });

  it("names one issue in the singular", () => {
    const html = render({ issues: [issue("zod")] });

    expect(html).toContain("Checks: one open issue, and it refuses a publish.");
    expect(html).not.toContain("1 open issues");
  });

  it("names one advisory issue in the singular", () => {
    const html = render({ issues: [issue("view")] });

    expect(html).toContain("Checks: one open issue, and it refuses no publish.");
    expect(html).not.toContain("1 open issues");
  });
});
