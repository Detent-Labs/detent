import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DiscardDraftDialog } from "../src/areas/studio/panels/DiscardDraftDialog.js";

/**
 * `DiscardDraftDialog.tsx`, the one discard dialog the header bar and the
 * process list both mount (`studio-app`: "Discarding a draft confirms in a
 * modal dialog", "Discarding from the process list takes the discard dialog").
 * A static render reads the words and the disabled state. The header bar's own
 * mounting stands in `studio-processHeaderBar-publishGate.test.tsx`.
 */

function renderDialog(over: Partial<React.ComponentProps<typeof DiscardDraftDialog>> = {}): string {
  return renderToStaticMarkup(
    <DiscardDraftDialog
      processLabel="Laptop Pool"
      refusal={null}
      busy={false}
      triggerRef={{ current: null }}
      onCancel={() => {}}
      onConfirm={() => {}}
      {...over}
    />,
  );
}

const buttonTags = (html: string): string[] => html.match(/<button[^>]*>/g) ?? [];

describe("DiscardDraftDialog", () => {
  it("asks whether to discard, names the process and says what stays", () => {
    const html = renderDialog();

    expect(html).toContain("Discard this draft?</h2>");
    expect(html).toMatch(/<dt[^>]*>Process<\/dt><dd class="value">Laptop Pool<\/dd>/);
    expect(html).toContain("The published versions stay. Only the unpublished draft goes.");
  });

  it("prints no revision and no key or id", () => {
    const html = renderDialog();

    expect(html).not.toContain("Revision");
    expect(html).not.toContain("<code");
    expect(html).not.toContain("<details");
  });

  it("prints the last save as a date and a time, only where one is known", () => {
    expect(renderDialog()).not.toContain("Last saved");

    const row = /<dt[^>]*>Last saved<\/dt><dd[^>]*>([^<]*)<\/dd>/.exec(renderDialog({ lastSavedAt: new Date(2026, 9, 31, 14, 5) }));
    expect(row![1]).toContain("Oct 31, 2026");
    expect(row![1]).toMatch(/\d{1,2}:05/);
  });

  it("closes with the destructive confirm, then Cancel holding the focus", () => {
    const tags = buttonTags(renderDialog());

    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain("btn-secondary btn-destructive");
    expect(tags[0]).not.toContain("autofocus");
    expect(tags[1]).toContain("autofocus");
    expect(renderDialog()).toContain(">Discard draft</button>");
  });

  it("prints a refusal as an alert after the body, with the server's text in a closed Developer view", () => {
    const html = renderDialog({ refusal: { message: "The engine refused.", detail: "raw\ntext" } });

    expect(html).toContain('role="alert"');
    expect(html.indexOf("The engine refused.")).toBeGreaterThan(html.indexOf("Only the unpublished draft goes."));
    expect(html).toContain("raw\ntext");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });

  it("prints no Developer view for a refusal with no server text", () => {
    const html = renderDialog({ refusal: { message: "The engine refused.", detail: null } });

    expect(html).toContain('role="alert"');
    expect(html).not.toContain("<details");
  });

  it("prints no alert without a refusal", () => {
    expect(renderDialog()).not.toContain('role="alert"');
  });

  it("disables both controls while busy", () => {
    expect(buttonTags(renderDialog({ busy: true })).every((tag) => tag.includes("disabled"))).toBe(true);
    expect(buttonTags(renderDialog()).some((tag) => tag.includes("disabled"))).toBe(false);
  });
});

describe("useDraftToolbarActions' discarding flag", () => {
  const source = readFileSync(new URL("../src/areas/studio/panels/DraftToolbar.tsx", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const run = code.slice(code.indexOf("const runDiscard"), code.indexOf("const resolveDialog"));

  it("is set before the request and cleared in a finally, so a refusal frees the controls", () => {
    expect(run).toContain("setDiscarding(true)");
    expect(run.indexOf("setDiscarding(true)")).toBeLessThan(run.indexOf("deleteDraft("));
    expect(run).toMatch(/finally\s*\{\s*setDiscarding\(false\)/);
  });

  it("is returned beside saving and publishing", () => {
    expect(code).toMatch(/return \{\s*saving,\s*publishing,\s*discarding,/);
  });
});
