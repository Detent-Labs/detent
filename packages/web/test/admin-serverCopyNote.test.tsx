import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ServerCopyNote } from "../src/areas/admin/ServerCopyNote.js";

const MESSAGE = "The server copy changed while you were editing.";
const DISCARD = "Discard my edits and load the server copy";

describe("ServerCopyNote", () => {
  it("renders an empty status region while no message is set", () => {
    const html = renderToStaticMarkup(<ServerCopyNote discardLabel={DISCARD} onDiscard={() => {}} />);
    expect(html).toContain('role="status"');
    expect(html).not.toContain("<p");
    expect(html).not.toContain("<button");
    expect(html).not.toContain(DISCARD);
  });

  it("renders an empty status region for an empty message", () => {
    const html = renderToStaticMarkup(<ServerCopyNote message="" discardLabel={DISCARD} onDiscard={() => {}} />);
    expect(html).toContain('role="status"');
    expect(html).not.toContain("<button");
  });

  it("renders the callout text and the discard button inside the region", () => {
    const html = renderToStaticMarkup(<ServerCopyNote message={MESSAGE} discardLabel={DISCARD} onDiscard={() => {}} />);
    const region = html.slice(html.indexOf('role="status"'));
    expect(region).toContain(MESSAGE);
    expect(region).toContain(DISCARD);
    expect(region).toContain('<button type="button" class="btn btn-secondary"');
  });
});
