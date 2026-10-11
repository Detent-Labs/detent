import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ServerCopyNote } from "../src/areas/admin/ServerCopyNote.js";

const MESSAGE = "The server copy changed while you were editing.";
const DISCARD = "Discard my edits and load the server copy";

/** The inner markup of the status region. The region holds no nested `<div>`, so the first `</div>` closes it. */
function statusRegion(html: string): string {
  const match = /<div role="status">([\s\S]*?)<\/div>/.exec(html);
  if (!match) throw new Error(`no status region in: ${html}`);
  return match[1] ?? "";
}

describe("ServerCopyNote", () => {
  it("renders an empty status region while no message is set", () => {
    const html = renderToStaticMarkup(<ServerCopyNote discardLabel={DISCARD} onDiscard={() => {}} />);
    expect(statusRegion(html)).toBe("");
    expect(html).not.toContain("<p");
  });

  it("renders no button while no message is set", () => {
    const html = renderToStaticMarkup(<ServerCopyNote discardLabel={DISCARD} onDiscard={() => {}} />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain(DISCARD);
  });

  it("renders an empty status region and no button for an empty message", () => {
    const html = renderToStaticMarkup(<ServerCopyNote message="" discardLabel={DISCARD} onDiscard={() => {}} />);
    expect(statusRegion(html)).toBe("");
    expect(html).not.toContain("<button");
  });

  it("renders the callout sentence inside the status region", () => {
    const html = renderToStaticMarkup(<ServerCopyNote message={MESSAGE} discardLabel={DISCARD} onDiscard={() => {}} />);
    const region = statusRegion(html);
    expect(region).toContain("<p");
    expect(region).toContain(MESSAGE);
  });

  it("renders the discard button after, and outside, the status region", () => {
    const html = renderToStaticMarkup(<ServerCopyNote message={MESSAGE} discardLabel={DISCARD} onDiscard={() => {}} />);
    const region = statusRegion(html);
    expect(region).not.toContain("<button");
    expect(region).not.toContain(DISCARD);
    expect(html).toContain('<button type="button" class="btn btn-secondary');
    expect(html).toContain(DISCARD);
    expect(html.indexOf("<button")).toBeGreaterThan(html.indexOf("</div>"));
  });

  it("keeps the wrapper focusable by script in both states", () => {
    const quiet = renderToStaticMarkup(<ServerCopyNote discardLabel={DISCARD} onDiscard={() => {}} />);
    const shown = renderToStaticMarkup(<ServerCopyNote message={MESSAGE} discardLabel={DISCARD} onDiscard={() => {}} />);
    expect(quiet.startsWith('<div tabindex="-1"')).toBe(true);
    expect(shown.startsWith('<div tabindex="-1"')).toBe(true);
  });
});
