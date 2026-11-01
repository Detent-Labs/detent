import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JsonView } from "../src/areas/studio/panels/JsonView.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/** A Fix that opens the JSON surface prints its check's sentence above the input
 * (`studio-json-view`). The menu entry opens the surface with none. */
const DRAFT = { key: "invoice" } as unknown as Draft;

describe("The JSON surface's note", () => {
  it("prints the check's sentence above the input", () => {
    const html = renderToStaticMarkup(<JsonView draft={DRAFT} onApply={() => {}} note="Two parts share one id." />);

    expect(html).toContain("Two parts share one id.");
    expect(html.indexOf("Two parts share one id.")).toBeLessThan(html.indexOf("<textarea"));
  });

  it("prints nothing above the input with no note", () => {
    const html = renderToStaticMarkup(<JsonView draft={DRAFT} onApply={() => {}} />);

    expect(html.slice(0, html.indexOf("<textarea"))).not.toContain("<p");
  });
});
