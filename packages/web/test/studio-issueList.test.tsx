import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { IssueItems } from "../src/areas/studio/panels/shared/IssueList.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";

/**
 * An issue's source is the machine-matched category its check came from. It
 * renders as its own mono label rather than as a `[zod]` bracket prefix
 * inline in the message (`studio-checks-rail`).
 *
 * The label's own look is a compiled class, which hashes, so no assertion
 * here can name a face or a color. `docs/browser-checks.md` carries that
 * half. What a static render sees is the structure: the source sits in its
 * own element, and no bracket wraps it.
 */
const issue = (over: Partial<EditorIssue> = {}): EditorIssue => ({
  entityType: "field",
  entityId: "field_1",
  message: "Pattern does not compile",
  source: "zod",
  loc: "fields[0].validation.pattern",
  ...over,
});

describe("An issue's source label", () => {
  it("renders the source in its own element, apart from the message", () => {
    const html = renderToStaticMarkup(<IssueItems issues={[issue()]} />);

    expect(html).toContain(">zod</span>");
    expect(html).toContain("Pattern does not compile");
  });

  it("wraps the source in no brackets", () => {
    const html = renderToStaticMarkup(<IssueItems issues={[issue()]} />);

    // The violating input: the old `[{issue.source}] {issue.message}` text,
    // which printed the machine value as bracketed prose.
    expect(html).not.toContain("[zod]");
    expect(html).not.toContain("[");
  });

  it("keeps the per-source class the list item already carried", () => {
    const html = renderToStaticMarkup(<IssueItems issues={[issue({ source: "cel" })]} />);

    expect(html).toContain('class="issue issue-cel"');
  });

  it("renders nothing at all for an empty issue set", () => {
    expect(renderToStaticMarkup(<IssueItems issues={[]} />)).toBe("");
  });
});
