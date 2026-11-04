import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LinesInput } from "../src/areas/studio/panels/shared/LinesInput.js";

/** `studio-plugin-config-form`: a string list states its one-per-line rule on screen. */

const render = (props: { error?: string }) =>
  renderToStaticMarkup(<LinesInput label="candidates" value={["a", "b"]} onChange={() => {}} {...props} />);
const renderCaption = (props: { error?: string } = {}) =>
  renderToStaticMarkup(<LinesInput caption="People or roles, one per line" value={["a", "b"]} onChange={() => {}} {...props} />);
const CAPTION_LABEL = /<label id="([^"]+)" for="[^"]+"[^>]*>People or roles, one per line<\/label>/;

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

  it("stands a caption as the label above the control, the rule printed once", () => {
    const html = renderCaption();
    expect(count(html, "one per line")).toBe(1);
    expect(html).not.toContain("<small");
    expect(html.indexOf("</label>")).toBeLessThan(html.indexOf("<textarea"));
  });

  it("names the caption's label as the description", () => {
    const html = renderCaption();
    const labelId = CAPTION_LABEL.exec(html)?.[1];
    expect(labelId).toBeDefined();
    expect(/aria-describedby="([^"]+)"/.exec(html)?.[1]).toBe(labelId!);
  });

  it("keeps the caption's label in the description beside an error", () => {
    const html = renderCaption({ error: "Enter one value per line." });
    const labelId = CAPTION_LABEL.exec(html)?.[1];
    expect(html.indexOf("</label>")).toBeLessThan(html.indexOf('class="error"'));
    expect(html.indexOf('class="error"')).toBeLessThan(html.indexOf("<textarea"));
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1].split(" ") ?? [];
    expect(describedBy).toHaveLength(2);
    expect(describedBy[0]).toBe(labelId!);
  });

  it("keeps the hint under the control for a plain label", () => {
    const html = render({});
    expect(html).toContain(">candidates</label>");
    expect(html.indexOf("<textarea")).toBeLessThan(html.indexOf("<small"));
  });

  it("puts an error beside the label and adds it to the description", () => {
    const html = render({ error: "Enter one value per line." });
    expect(html).toContain('class="error">Enter one value per line.</span>');
    expect(html.indexOf("</label>")).toBeLessThan(html.indexOf('class="error"'));
    expect(/aria-describedby="([^"]+)"/.exec(html)?.[1].split(" ")).toHaveLength(2);
  });
});
