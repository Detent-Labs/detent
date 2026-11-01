import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import { ProcessSettingsPanel } from "../src/areas/studio/panels/ProcessSettingsPanel.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import { t } from "../src/areas/studio/catalog.js";

/**
 * The Settings tab's Process view (`studio-process-tabs`: "The Settings tab
 * gathers the process-wide settings"), rendered inside a hand-built
 * `DraftProvider`. `renderToStaticMarkup` fires no event, so the tests read
 * what each control shows for a given draft.
 */
const KEY = "settings_fixture_key";
const PROCESS_ID = "proc_settings_fixture";

const HASH = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function render(draft: Draft, lastPublish?: { version: number; definitionHash: string }): string {
  return renderToStaticMarkup(
    <DraftProvider initial={draft} token="t">
      <ProcessSettingsPanel processId={PROCESS_ID} revision={7} lastPublish={lastPublish} />
    </DraftProvider>,
  );
}

/** The checkbox `<input>` tag that stands right before a label's text. */
function checkboxBefore(html: string, text: string): string {
  const match = new RegExp(`(<input type="checkbox"[^>]*>)${text}`).exec(html);
  expect(match).not.toBeNull();
  return match![1]!;
}

/** The markup inside the `<details>` element, and the markup outside it. */
function splitDetails(html: string): { inside: string; outside: string } {
  const start = html.indexOf("<details");
  const end = html.indexOf("</details>") + "</details>".length;
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return { inside: html.slice(start, end), outside: html.slice(0, start) + html.slice(end) };
}

describe("ProcessSettingsPanel", () => {
  it("shows the draft's base language in its labelled input", () => {
    const html = render({ baseLocale: "de", key: KEY });

    expect(html).toMatch(/<span[^>]*>Base language<\/span><input type="text" value="de"\/>/);
  });

  it("renders the add-a-language control", () => {
    const html = render({ key: KEY });

    expect(html).toContain(`>${t("contentLocale.add")}</button>`);
  });

  it("checks the cancellable setting when the draft carries no cancellable key", () => {
    const html = render({ key: KEY });

    expect(checkboxBefore(html, "A case can be cancelled while it runs")).toContain('checked=""');
  });

  it("unchecks the cancellable setting for cancellable: false", () => {
    const html = render({ key: KEY, cancellable: false });

    expect(checkboxBefore(html, "A case can be cancelled while it runs")).not.toContain("checked");
  });

  it("groups both collaboration defaults under a Collaboration legend, checked when absent", () => {
    const html = render({ key: KEY });
    const fieldset = html.slice(html.indexOf("<fieldset"), html.indexOf("</fieldset>"));

    expect(fieldset).toMatch(/<legend[^>]*>Collaboration<\/legend>/);
    expect(checkboxBefore(fieldset, "Participants can comment on a case")).toContain('checked=""');
    expect(checkboxBefore(fieldset, "Participants can attach files to a case")).toContain('checked=""');
  });

  it("reads each collaboration default from the draft on its own", () => {
    const html = render({ key: KEY, collaboration: { comments: true, attachments: false } });

    expect(checkboxBefore(html, "Participants can comment on a case")).toContain('checked=""');
    expect(checkboxBefore(html, "Participants can attach files to a case")).not.toContain("checked");
  });

  it("stands the Developer view closed, holding the key input and the process id", () => {
    const { inside } = splitDetails(render({ key: KEY }));

    expect(inside).toMatch(/^<details[^>]*>/);
    expect(inside.match(/^<details[^>]*>/)![0]).not.toContain("open");
    expect(inside).toMatch(/<summary[^>]*>Developer view<\/summary>/);
    expect(inside).toMatch(new RegExp(`<span[^>]*>Key</span><input type="text"[^>]*value="${KEY}"/>`));
    expect(inside).toContain(`>${PROCESS_ID}</code>`);
  });

  it("prints the key and the process id nowhere outside the Developer view", () => {
    const { outside } = splitDetails(render({ key: KEY }));

    expect(outside).not.toContain(KEY);
    expect(outside).not.toContain(PROCESS_ID);
  });

  it("stands the content-locale select between the base language and the add control", () => {
    const html = render({ key: KEY, baseLocale: "en", label: { en: "Expense", de: "Spesen" }, description: { en: "Claims" } });
    const label = html.indexOf(`>${t("settings.contentLocale")}</span>`);

    expect(label).toBeGreaterThan(html.indexOf(`>${t("settings.baseLocale")}</span>`));
    expect(label).toBeLessThan(html.indexOf(t("contentLocale.addPlaceholder")));
    expect(html).toContain("Language you are editing");
    expect(html).not.toContain("Content locale");
  });

  it("lists each used language as an option, with the gap count of a part-translated one", () => {
    const html = render({ key: KEY, baseLocale: "en", label: { en: "Expense", de: "Spesen" }, description: { en: "Claims" } });
    const select = html.slice(html.indexOf("<select"), html.indexOf("</select>"));

    expect(select).toContain('<option value="en" selected="">en</option>');
    expect(select).toContain('<option value="de">de \u2014 1 missing</option>');
  });

  it("prints the revision inside the Developer view only", () => {
    const { inside, outside } = splitDetails(render({ key: KEY }));

    expect(inside).toContain(`${t("settings.revision")} <code`);
    expect(inside).toContain(">7</code>");
    expect(outside).not.toContain(t("settings.revision"));
  });

  it("prints no version and no hash before a publish", () => {
    const html = render({ key: KEY });

    expect(html).not.toContain(t("settings.publishedVersion"));
    expect(html).not.toContain(t("settings.definitionHash"));
  });

  it("prints the published version and the whole hash inside the Developer view after a publish", () => {
    const { inside, outside } = splitDetails(render({ key: KEY }, { version: 2, definitionHash: HASH }));

    expect(inside).toContain(`${t("settings.publishedVersion")} <code`);
    expect(inside).toContain(">v2</code>");
    expect(inside).toContain(`>${HASH}</code>`);
    expect(outside).not.toContain(HASH);
    expect(outside).not.toContain(t("settings.publishedVersion"));
  });
});
