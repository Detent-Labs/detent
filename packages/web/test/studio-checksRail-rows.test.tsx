import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChecksRail } from "../src/areas/studio/panels/ChecksRail.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";

/**
 * The Checks tab's rows by subject (`studio-checks-rail`): the three
 * subjects, the severity word, the Developer view, the held-back line and
 * the start state. A static render sees structure and text, not a compiled
 * class, so each check reads the markup's words and elements.
 */

const RAN: ValidationResult["dimensions"] = {
  zod: "ran",
  duration: "ran",
  structural: "ran",
  actionType: "ran",
  assignmentType: "ran",
  dataSourceType: "ran",
  registryConfig: "ran",
  cel: "ran",
};

function validation(over: Partial<ValidationResult> = {}): ValidationResult {
  return { zodValid: true, issues: [], dimensions: RAN, subprocessStepStatus: {}, chainingSiteStatus: {}, ...over };
}

function issue(over: Partial<EditorIssue> = {}): EditorIssue {
  return {
    entityType: "step",
    entityId: "step_a",
    message: "raw message",
    sentence: "A sentence.",
    source: "structural",
    loc: "workflow.steps[0].label",
    ...over,
  };
}

const render = (v: ValidationResult, extra: { onFix?: (i: EditorIssue) => void } = {}) =>
  renderToStaticMarkup(<ChecksRail validation={v} canPublish={true} {...extra} />);

/** The markup with every Developer view cut out: what an author reads while they stay closed. */
const outsideDeveloperViews = (html: string) => html.replace(/<details[\s\S]*?<\/details>/g, "");

/** The inner markup of each Developer view, in document order. */
const developerViews = (html: string) => [...html.matchAll(/<details[^>]*>([\s\S]*?)<\/details>/g)].map((m) => m[1]);

const heading = (name: string) => new RegExp(`<h2[^>]*>${name}</h2>`);

describe("The subjects", () => {
  it("prints issues from two sources under one Steps heading and names no source", () => {
    const html = render(
      validation({
        issues: [
          issue({ sentence: "First sentence.", source: "structural" }),
          issue({ sentence: "Second sentence.", source: "cel", loc: "workflow.steps[0].paths[0].guard" }),
        ],
      }),
    );
    const outside = outsideDeveloperViews(html);

    expect(html.match(heading("Steps"))).not.toBeNull();
    expect(html.match(/<h2/g)).toHaveLength(2);
    expect(outside).toContain("First sentence.");
    expect(outside).toContain("Second sentence.");
    expect(outside).not.toContain("structural");
    expect(outside).not.toContain("cel");
  });

  it("draws no Fields or Steps heading while neither holds a row", () => {
    const html = render(validation({ issues: [issue({ entityType: "contract", loc: "contract.outcomes" })] }));

    expect(html.match(heading("Steps"))).toBeNull();
    expect(html.match(heading("Fields"))).toBeNull();
    expect(html.match(heading("Before publishing"))).not.toBeNull();
  });

  it("stands a field and a data source under Fields, and a contract issue under Before publishing", () => {
    const html = render(
      validation({
        issues: [
          issue({ entityType: "field", sentence: "Field sentence.", loc: "fields[0].key" }),
          issue({ entityType: "dataSource", sentence: "Source sentence.", loc: "dataSources[0].key" }),
          issue({ entityType: "contract", sentence: "Contract sentence.", loc: "contract.outcomes" }),
        ],
      }),
    );
    const fields = html.indexOf("Fields</h2>");
    const publishing = html.indexOf("Before publishing</h2>");

    expect(fields).toBeGreaterThan(-1);
    expect(html.indexOf("Field sentence.")).toBeGreaterThan(fields);
    expect(html.indexOf("Source sentence.")).toBeGreaterThan(fields);
    expect(html.indexOf("Source sentence.")).toBeLessThan(publishing);
    expect(html.indexOf("Contract sentence.")).toBeGreaterThan(publishing);
  });

  it("lists Steps, then Fields, then Before publishing", () => {
    const html = render(
      validation({
        issues: [
          issue({ entityType: "contract", loc: "contract.outcomes" }),
          issue({ entityType: "field", loc: "fields[0].key" }),
          issue({ entityType: "step" }),
        ],
      }),
    );

    expect(html.indexOf("Steps</h2>")).toBeLessThan(html.indexOf("Fields</h2>"));
    expect(html.indexOf("Fields</h2>")).toBeLessThan(html.indexOf("Before publishing</h2>"));
  });

  it("stands the first step's row above the second step's", () => {
    const html = render(
      validation({
        issues: [
          issue({ sentence: "On the second step.", loc: "workflow.steps[1].label" }),
          issue({ sentence: "On the first step.", loc: "workflow.steps[0].label" }),
        ],
      }),
    );

    expect(html.indexOf("On the first step.")).toBeLessThan(html.indexOf("On the second step."));
  });

  it("prints the sentence, and the raw message only in the Developer view", () => {
    const html = render(validation({ issues: [issue()] }));

    expect(outsideDeveloperViews(html)).toContain("A sentence.");
    expect(outsideDeveloperViews(html)).not.toContain("raw message");
  });

  it("falls back to the raw message for an issue built with no sentence", () => {
    const html = render(validation({ issues: [issue({ sentence: undefined })] }));

    expect(outsideDeveloperViews(html)).toContain("raw message");
  });

  it("draws a clear draft's Before publishing with the line alone and no row", () => {
    const html = render(validation());

    expect(html.match(heading("Before publishing"))).not.toBeNull();
    expect(html).not.toContain("<li");
    expect(html).toContain("No open issues.");
  });
});

describe("The severity word", () => {
  it("reads Must fix for an engine issue", () => {
    for (const source of ["zod", "structural", "cel", "registry", "duration"] as const) {
      const html = render(validation({ issues: [issue({ source })] }));

      expect(html).toContain("Must fix");
      expect(html).not.toContain("Worth a look");
    }
  });

  it("reads Worth a look for a view finding", () => {
    const html = render(validation({ issues: [issue({ source: "view" })] }));

    expect(html).toContain("Worth a look");
    expect(html).not.toContain("Must fix");
  });

  it("stands above the sentence", () => {
    const html = render(validation({ issues: [issue()] }));

    expect(html.indexOf("Must fix")).toBeLessThan(html.indexOf("A sentence."));
  });
});

describe("The Fix control", () => {
  it("prints a button for each row when the rail has onFix", () => {
    const html = render(validation({ issues: [issue(), issue({ sentence: "Another." })] }), { onFix: () => {} });

    expect(html.match(/<button[^>]*>Fix<\/button>/g)).toHaveLength(2);
  });

  it("prints no button when the rail has no onFix", () => {
    const html = render(validation({ issues: [issue()] }));

    expect(html).not.toContain(">Fix<");
  });

  it("describes itself by the row's sentence", () => {
    const html = render(validation({ issues: [issue()] }), { onFix: () => {} });
    const id = html.match(/aria-describedby="([^"]+)"/)?.[1];

    expect(id).toBeDefined();
    expect(html).toContain(`<p id="${id}"`);
    expect(html.match(new RegExp(`<p id="${id}"[^>]*>([^<]*)</p>`))?.[1]).toBe("A sentence.");
  });

  it("gives each row its own description", () => {
    const html = render(validation({ issues: [issue(), issue()] }), { onFix: () => {} });
    const ids = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map((m) => m[1]);

    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("The row's form", () => {
  const row = () => render(validation({ issues: [issue()] }), { onFix: () => {} });

  it("reads the word, then the sentence, then Fix, then the Developer view", () => {
    const html = row();

    expect(html.indexOf("Must fix")).toBeLessThan(html.indexOf("A sentence."));
    expect(html.indexOf("A sentence.")).toBeLessThan(html.indexOf(">Fix<"));
    expect(html.indexOf(">Fix<")).toBeLessThan(html.indexOf("<details"));
  });

  it("prints Fix as the literal secondary button, with no compiled class beside it", () => {
    expect(row()).toMatch(/<button type="button" class="btn btn-secondary" aria-describedby="[^"]+">Fix<\/button>/);
  });

  it("stands the word above the row that holds the sentence and Fix", () => {
    const html = row();
    const wrapper = html.lastIndexOf("<div", html.indexOf("A sentence."));

    expect(html.indexOf("Must fix")).toBeLessThan(wrapper);
    expect(html.indexOf(">Fix<")).toBeLessThan(html.indexOf("</div>", wrapper));
  });

  it("names the rail on its aside, and draws no heading over it", () => {
    const html = row();

    expect(html).toContain('aria-label="Checks"');
    expect(html).not.toMatch(/<h2[^>]*>Checks<\/h2>/);
    expect(html).not.toContain("<h3");
  });
});

describe("A row's Developer view", () => {
  it("stands closed and holds the source, the raw message and the location", () => {
    const html = render(validation({ issues: [issue({ source: "cel", loc: "workflow.steps[0].paths[0].guard" })] }));
    const [view] = developerViews(html);

    expect(html).toContain("<details");
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(view).toContain(">cel<");
    expect(view).toContain("raw message");
    expect(view).toContain("workflow.steps[0].paths[0].guard");
  });

  it("prints the raw message nowhere else on the tab", () => {
    const html = render(validation({ issues: [issue()] }));

    expect(html.match(/raw message/g)).toHaveLength(1);
  });

  it("omits an empty location", () => {
    const html = render(validation({ issues: [issue({ loc: "" })] }));
    const [view] = developerViews(html);

    expect(view.match(/<p/g)).toHaveLength(2);
  });
});

describe("The line under Before publishing", () => {
  const HELD = "More checks run once you fix the rows above.";
  const ALONE = "Publishing also checks a few things this list cannot, and tells you if one fails.";

  it("says more checks run later while a Zod-invalid draft holds the rest back", () => {
    const html = render(
      validation({
        zodValid: false,
        dimensions: { ...RAN, duration: "not-run", structural: "not-run" },
        issues: [issue({ source: "zod", entityType: "step" })],
      }),
    );
    const lineView = developerViews(html).at(-1)!;

    expect(html).toContain(HELD);
    for (const source of ["structural", "cel", "registry", "duration", "view"]) expect(lineView).toContain(`>${source}<`);
    expect(lineView).not.toContain(">zod<");
    expect(html).not.toContain("No open issues.");
  });

  it("names structural, cel and registry but not view after a duration issue", () => {
    const html = render(
      validation({
        dimensions: { ...RAN, structural: "not-run" },
        issues: [issue({ source: "duration", entityType: "timer" })],
      }),
    );
    const lineView = developerViews(html).at(-1)!;

    for (const source of ["structural", "cel", "registry"]) expect(lineView).toContain(`>${source}<`);
    expect(lineView).not.toContain(">view<");
    expect(lineView).not.toContain(">duration<");
  });

  it("names cel and registry alone after a structural issue", () => {
    const html = render(validation({ issues: [issue({ source: "structural" })] }));
    const lineView = developerViews(html).at(-1)!;

    expect(lineView).toContain(">cel<");
    expect(lineView).toContain(">registry<");
    expect(lineView).not.toContain(">structural<");
  });

  it("names registry while no registry description has resolved", () => {
    const html = render(validation({ dimensions: { ...RAN, actionType: "not-run" } }));
    const lineView = developerViews(html).at(-1)!;

    expect(html).toContain(HELD);
    expect(lineView).toContain(">registry<");
    expect(html).not.toContain("No open issues.");
  });

  it("drops a source that printed a row of its own from the list, and keeps the line", () => {
    const html = render(
      validation({
        dimensions: { ...RAN, structural: "not-run" },
        issues: [issue({ source: "cel", entityType: "step" })],
      }),
    );
    const lineView = developerViews(html).at(-1)!;

    expect(html).toContain(HELD);
    expect(lineView).not.toContain(">cel<");
    expect(lineView).toContain(">registry<");
  });

  it("says the second part alone when nothing holds back, and still lists the two checks publishing holds", () => {
    const html = render(validation());
    const lineView = developerViews(html).at(-1)!;

    expect(html).toContain(ALONE);
    expect(html).not.toContain(HELD);
    expect(html).toContain("No open issues.");
    expect(lineView).not.toContain("Not run yet");
    expect(lineView).toContain("Plugin config check held back");
    expect(lineView).toContain("Unknown-key check held back");
  });

  it("keeps the source names inside the Developer view", () => {
    const html = render(validation({ zodValid: false, dimensions: { ...RAN, structural: "not-run" } }));

    expect(outsideDeveloperViews(html)).not.toContain("registry");
    expect(outsideDeveloperViews(html)).not.toContain("structural");
  });
});

describe("The start state", () => {
  it("prints the sentence alone, with no subject and no line", () => {
    const html = render(validation({ zodValid: false, noStepYet: true, dimensions: { ...RAN, duration: "not-run", structural: "not-run" } }));

    expect(html).toContain("No step yet.");
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<li");
  });
});
