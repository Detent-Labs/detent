import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { IssueItems } from "../src/areas/studio/panels/shared/IssueList.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";

/**
 * Every placement prints an issue's sentence with no source label
 * (`studio-checks-rail`: "A check prints its sentence at every placement").
 * The source and the raw message stand in the Checks tab's Developer view.
 */
const issue = (over: Partial<EditorIssue> = {}): EditorIssue => ({
  entityType: "field",
  entityId: "field_1",
  message: "Pattern does not compile",
  source: "zod",
  loc: "fields[0].validation.pattern",
  ...over,
});

describe("An issue at its placement", () => {
  it("prints the sentence and neither the raw message nor a source label", () => {
    const html = renderToStaticMarkup(
      <IssueItems issues={[issue({ sentence: "The pattern on “Amount” cannot be read. Under More, correct it in Validation." })]} />,
    );

    expect(html).toContain("The pattern on “Amount” cannot be read. Under More, correct it in Validation.");
    expect(html).not.toContain("Pattern does not compile");
    expect(html).not.toContain(">zod<");
    expect(html).not.toContain("<span");
  });

  it("falls back to the raw message for an issue built with no sentence", () => {
    const html = renderToStaticMarkup(<IssueItems issues={[issue()]} />);

    expect(html).toContain("Pattern does not compile");
    expect(html).not.toContain(">zod<");
  });

  it("keeps the per-source class the list item already carried", () => {
    const html = renderToStaticMarkup(<IssueItems issues={[issue({ source: "cel" })]} />);

    expect(html).toContain('class="issue issue-cel');
  });

  it("renders nothing at all for an empty issue set", () => {
    expect(renderToStaticMarkup(<IssueItems issues={[]} />)).toBe("");
  });

  it("sets the anchor id and a focus stop on the list when asked", () => {
    const html = renderToStaticMarkup(<IssueItems issues={[issue()]} anchorId="check-anchor-source" />);

    expect(html).toContain('id="check-anchor-source"');
    expect(html).toContain('tabindex="-1"');
  });

  it("sets no id and no focus stop without an anchor", () => {
    const html = renderToStaticMarkup(<IssueItems issues={[issue()]} />);

    expect(html).not.toContain("id=");
    expect(html).not.toContain("tabindex");
  });
});

/** A static render sees no compiled value, so the form reads off the source. */
describe("The warning callout's form", () => {
  const source = readFileSync(new URL("../src/areas/studio/panels/shared/IssueList.tsx", import.meta.url).pathname, "utf8");
  const between = (from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

  it("holds no list marker, and no margin of its own", () => {
    const list = between("  list: {", "  },");

    expect(list).toContain('listStyle: "none"');
    expect(list).toContain("margin: 0");
    expect(list).toContain("padding: 0");
  });

  it("sets refusal text beside a 3px Advisory rule", () => {
    const item = between("  item: {", "  },");

    expect(item).toContain("color: colors.refusal");
    expect(item).toContain("borderLeftWidth: 3");
    expect(item).toContain("borderLeftColor: colors.advisory");
    expect(item).toContain("paddingLeft: space.s2");
  });

  it("prints a view finding in slate", () => {
    expect(between("  itemAdvisory: {", "  },")).toContain("color: colors.textMuted");
    expect(source).toContain('issue.source === "view" && styles.itemAdvisory');
  });

  it("leaves a caller's style its margins alone", () => {
    for (const path of ["../src/areas/studio/panels/FieldCatalogPanel.tsx", "../src/areas/studio/panels/StepPage.tsx"]) {
      const panel = readFileSync(new URL(path, import.meta.url).pathname, "utf8");
      const style = /(?:zoneIssueList|bodyIssues): \{([^}]*)\}/.exec(panel)![1]!;

      expect(style).not.toContain("color");
      expect(style).not.toContain("listStyle");
    }
  });
});
