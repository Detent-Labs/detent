import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LinesInput } from "../src/areas/studio/panels/shared/LinesInput.js";

/** `studio-plugin-config-form`: a string list states its one-per-line rule on screen. */

const render = (props: { caption?: string; error?: string }) =>
  renderToStaticMarkup(<LinesInput label="candidates" value={["a", "b"]} onChange={() => {}} {...props} />);

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("LinesInput", () => {
  it("prints the rule as visible text that the textarea's description names", () => {
    const html = render({});
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(describedBy).not.toBe("");
    const target = new RegExp(`<small id="${describedBy.replace(/:/g, "\\:")}">([^<]*)</small>`).exec(html);
    expect(target?.[1]).toContain("one per line");
    expect(html).not.toContain("aria-label");
  });

  it("prints the rule once when a caption states it", () => {
    const html = render({ caption: "People or roles, one per line" });
    expect(count(html, "one per line")).toBe(1);
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(html).toContain(`id="${describedBy}">People or roles, one per line</small>`);
  });

  it("puts an error beside the label and adds it to the description", () => {
    const html = render({ error: "Enter one value per line." });
    expect(html).toContain('class="error">Enter one value per line.</span>');
    expect(html.indexOf("</label>")).toBeLessThan(html.indexOf('class="error"'));
    expect(/aria-describedby="([^"]+)"/.exec(html)?.[1].split(" ")).toHaveLength(2);
  });
});
