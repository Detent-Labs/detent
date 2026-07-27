import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PathButtons } from "../src/PathButtons.js";

describe("PathButtons", () => {
  it("renders one submit action per available path", () => {
    const html = renderToStaticMarkup(
      <PathButtons paths={[{ id: "p1", key: "a", label: "Approve" }, { id: "p2", key: "b", label: "Reject" }]} onSubmit={() => {}} />,
    );
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });

  it("renders nothing when there are no available paths", () => {
    const html = renderToStaticMarkup(<PathButtons paths={[]} onSubmit={() => {}} />);
    expect(html).toBe("");
  });

  it("falls back to the path key when no label is given", () => {
    const html = renderToStaticMarkup(<PathButtons paths={[{ id: "p1", key: "b" }]} onSubmit={() => {}} />);
    expect(html).toContain("b");
  });
});
