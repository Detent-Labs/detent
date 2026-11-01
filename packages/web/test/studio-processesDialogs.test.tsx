import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PromotionPreviewDialog, StartPickerDialog } from "../src/areas/studio/screens/ProcessesScreen.js";
import type { PromotionPreview } from "../src/areas/studio/screens/promotionImportLogic.js";
import type { TemplateSummary } from "../src/areas/studio/api/types.js";

/**
 * The process list's two dialogs (`studio-app`: "A dialog reads as one form",
 * "A dialog's controls keep one order and one look"; `environment-promotion`:
 * "Import previews the incoming version before publishing it", "The preview
 * warns about a process key another process already holds"). A static render
 * reads the words, the order and the opening focus's attribute.
 */

const trigger = { current: null };
const noop = () => {};

const preview: PromotionPreview = {
  processId: "proc_incoming",
  body: {},
  key: "laptop_pool",
  label: "Laptop Pool",
  version: 4,
  definitionHash: "abc123def456",
};

function renderPreview(over: { preview?: Partial<PromotionPreview>; collision?: string; error?: string; busy?: boolean } = {}): string {
  return renderToStaticMarkup(
    <PromotionPreviewDialog
      preview={{ ...preview, ...over.preview }}
      collision={over.collision}
      error={over.error}
      busy={over.busy ?? false}
      triggerRef={trigger}
      onCancel={noop}
      onConfirm={noop}
    />,
  );
}

const template = (templateKey: string): TemplateSummary => ({
  templateKey,
  label: { en: templateKey },
  description: null,
  createdBy: "user_1",
  updatedAt: "2026-10-31T12:00:00Z",
});

function renderPicker(templates: TemplateSummary[]): string {
  return renderToStaticMarkup(<StartPickerDialog templates={templates} triggerRef={trigger} onCancel={noop} onPick={noop} />);
}

const buttonTags = (html: string): string[] => html.match(/<button[^>]*>/g) ?? [];

/** The Developer view's `<details>`, and the dialog without it. */
function splitDeveloperView(html: string): { inside: string; outside: string } {
  const summary = html.indexOf(">Developer view</summary>");
  expect(summary).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<details", summary);
  const end = html.indexOf("</details>", summary) + "</details>".length;
  return { inside: html.slice(start, end), outside: html.slice(0, start) + html.slice(end) };
}

describe("The import preview", () => {
  it("asks whether to publish here, naming the process and the source version", () => {
    const html = renderPreview();

    expect(html).toContain("Publish this version here?</h2>");
    expect(html).toMatch(/<dt[^>]*>Process<\/dt><dd class="value">Laptop Pool<\/dd>/);
    expect(html).toMatch(/<dt[^>]*>Source version<\/dt><dd class="value mono">v4<\/dd>/);
    expect(html).toContain("This environment assigns its own version number.");
  });

  it("falls back to the untitled word for a file with no label, never to the key or the id", () => {
    const { outside } = splitDeveloperView(renderPreview({ preview: { label: undefined } }));

    expect(outside).toMatch(/<dt[^>]*>Process<\/dt><dd class="value">Untitled process<\/dd>/);
    expect(outside).not.toContain("laptop_pool");
    expect(outside).not.toContain("proc_incoming");
  });

  it("prints a source version it cannot read as a dash", () => {
    expect(renderPreview({ preview: { version: undefined } })).toMatch(/<dt[^>]*>Source version<\/dt><dd class="value mono">—<\/dd>/);
  });

  it("holds the key, the process id and the hash in a closed Developer view, and nowhere else", () => {
    const { inside, outside } = splitDeveloperView(renderPreview());

    expect(inside.match(/^<details[^>]*>/)![0]).not.toContain("open");
    expect(inside).toMatch(/<dt[^>]*>Key<\/dt><dd class="value mono">laptop_pool<\/dd>/);
    expect(inside).toMatch(/<dt[^>]*>Process id<\/dt><dd class="value mono">proc_incoming<\/dd>/);
    expect(inside).toMatch(/<dt[^>]*>Source hash<\/dt><dd class="value mono">abc123def456<\/dd>/);
    for (const value of ["laptop_pool", "proc_incoming", "abc123def456", "Source hash"]) expect(outside).not.toContain(value);
    expect(outside).not.toContain("<code");
  });

  it("warns about a colliding key without printing the key or the other id outside the Developer view", () => {
    const { inside, outside } = splitDeveloperView(renderPreview({ collision: "proc_other" }));

    expect(outside).toContain(
      "Another process already uses this internal name. Importing leaves both, and nobody can delete a published process.",
    );
    expect(outside).not.toContain("proc_other");
    expect(outside).not.toContain("laptop_pool");
    expect(inside).toMatch(/<dt[^>]*>Other process with this key<\/dt><dd class="value mono">proc_other<\/dd>/);
  });

  it("prints no warning and no other id where the key is free", () => {
    const html = renderPreview();

    expect(html).not.toContain("internal name");
    expect(html).not.toContain("Other process with this key");
  });

  it("closes with the filled Publish here, then Cancel holding the focus", () => {
    const html = renderPreview();
    const tags = buttonTags(html);

    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain('class="btn btn-primary"');
    expect(tags[0]).not.toContain("autofocus");
    expect(tags[1]).toContain("autofocus");
    expect(html).toContain(">Publish here</button>");
  });

  it("reads Publishing… and disables both controls while the request runs", () => {
    const html = renderPreview({ busy: true });

    expect(html).toContain(">Publishing…</button>");
    expect(buttonTags(html).every((tag) => tag.includes("disabled"))).toBe(true);
  });

  it("renders a refusal inside the dialog, after the body, and keeps its line breaks", () => {
    const html = renderPreview({ error: "schema-validation\nworkflow.steps[0]: bad" });

    expect(html).toContain('role="alert"');
    expect(html).toContain("schema-validation\nworkflow.steps[0]: bad");
    expect(html.indexOf('role="alert"')).toBeGreaterThan(html.indexOf("This environment assigns"));
    expect(html).toContain('class="refusal"');
  });

  it("prints no alert without a refusal", () => {
    expect(renderPreview()).not.toContain('role="alert"');
  });
});

describe("The start picker", () => {
  it("reads as a statement, since it offers a choice and confirms nothing", () => {
    expect(renderPicker([])).toContain("Start a new process</h2>");
  });

  it("leads with the empty choice and names each template after it", () => {
    const html = renderPicker([template("approval"), template("intake")]);

    expect(html.indexOf(">Empty process<")).toBeLessThan(html.indexOf(">approval<"));
    expect(html.indexOf(">approval<")).toBeLessThan(html.indexOf(">intake<"));
  });

  it("holds the opening focus on the first choice, and Cancel does not take it", () => {
    const tags = buttonTags(renderPicker([template("approval")]));
    const cancel = tags[tags.length - 1]!;

    expect(cancel).toContain('class="btn btn-secondary"');
    expect(cancel).not.toContain("autofocus");
  });

  it("has no confirm: the choices then Cancel alone", () => {
    const tags = buttonTags(renderPicker([template("approval")]));

    expect(tags).toHaveLength(3);
    expect(tags.some((tag) => tag.includes("btn-destructive"))).toBe(false);
  });

  it("says no template exists only where none does", () => {
    expect(renderPicker([])).toContain("No templates exist yet. A curator creates them on the Templates screen.");
    expect(renderPicker([template("approval")])).not.toContain("No templates exist yet");
  });
});

describe("The process list's dialogs", () => {
  const source = readFileSync(new URL("../src/areas/studio/screens/ProcessesScreen.tsx", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("writes no dialog element of its own", () => {
    expect(code).not.toContain("<dialog");
    expect(code).not.toContain("showModal");
  });

  it("returns each dialog's focus to the control that opened it", () => {
    expect(code).toMatch(/<button ref=\{newProcessButton\}[^>]*onClick=\{\(\) => void newProcess\(\)\}/);
    expect(code).toMatch(/<button ref=\{importButton\}[^>]*onClick=\{\(\) => fileInput\.current\?\.click\(\)\}/);
    expect(code).toContain("triggerRef={newProcessButton}");
    expect(code).toContain("triggerRef={importButton}");
  });
});
