import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelsRailFieldRow } from "../src/areas/studio/screens/PanelsScreen.js";

/**
 * field-catalog-editor-rework task 4.1: the Fields rail row drops to one
 * line — the resolved label, the friendly type, the issue mark. It no
 * longer prints the field's key.
 */
describe("PanelsRailFieldRow", () => {
  it("renders the resolved label and friendly type, and no key text", () => {
    const html = renderToStaticMarkup(
      <PanelsRailFieldRow label="Amount" typeLabel="Number" depth={0} issues={0} selected={false} onClick={() => {}} />,
    );
    expect(html).toContain(">Amount<");
    expect(html).toContain(">Number<");
    expect(html).not.toContain("studio-panels-rail-key");
  });

  it("shows the issue mark only when the row carries one", () => {
    const withIssue = renderToStaticMarkup(
      <PanelsRailFieldRow label="Amount" typeLabel="Number" depth={0} issues={2} selected={false} onClick={() => {}} />,
    );
    expect(withIssue).toContain("studio-panels-rail-issues");
    expect(withIssue).toContain(">2<");

    const withoutIssue = renderToStaticMarkup(
      <PanelsRailFieldRow label="Amount" typeLabel="Number" depth={0} issues={0} selected={false} onClick={() => {}} />,
    );
    expect(withoutIssue).not.toContain("studio-panels-rail-issues");
  });
});
