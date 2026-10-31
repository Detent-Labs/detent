import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProcessListRow, ProcessListTable } from "../src/areas/studio/screens/ProcessesScreen.js";
import type { ProcessRowView } from "../src/areas/studio/screens/processListLogic.js";

/**
 * studio-app spec, "The process list shows draft and published state per
 * process": one row, drawn from a fixed `ProcessRowView`. The fixture's key,
 * revision, account id and hash are values the row never prints outside its
 * Developer view, so their absence from the rest of the text is the check.
 */
const NOW = Date.parse("2026-10-31T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const PROCESS_ID = "process_fixture_pid";

const both: ProcessRowView = {
  processId: PROCESS_ID,
  name: "Laptop Pool",
  open: { name: "edit", processId: PROCESS_ID },
  saved: { by: "Demo Superuser", at: new Date(NOW - 72 * HOUR).toISOString() },
  published: { version: 3, at: new Date(NOW - 24 * HOUR).toISOString() },
  seedVersion: 3,
  developer: { key: "pl_dev_key", processId: PROCESS_ID, revision: 4711, hash: "hash_fixture_full", savedBy: "user_fixture_saver" },
  commands: ["versions", "discard"],
};

const FIXTURE_VALUES = ["pl_dev_key", "4711", "user_fixture_saver", "hash_fixture_full"];

function renderRow(view: ProcessRowView): string {
  return renderToStaticMarkup(
    <table>
      <tbody>
        <ProcessListRow view={view} now={NOW} creating={false} onNavigate={() => {}} onCreateDraft={() => {}} onDiscard={() => {}} />
      </tbody>
    </table>,
  );
}

/** The row's text with the Developer view removed, tags and attributes gone. */
function textOutsideDeveloperView(html: string): string {
  return html.replace(/<details[\s\S]*?<\/details>/g, "").replace(/<[^>]*>/g, "");
}

function developerView(html: string): string {
  return html.match(/<details[\s\S]*?<\/details>/)?.[0] ?? "";
}

describe("A process-list row", () => {
  it("names the process in an <a href> carrying the draft's address", () => {
    const html = renderRow(both);

    expect(html).toMatch(new RegExp(`<a href="/studio/processes/${PROCESS_ID}/edit"[^>]*>Laptop Pool</a>`));
  });

  it("says who saved the draft and when, in a <time>", () => {
    const html = renderRow(both);

    expect(textOutsideDeveloperView(html)).toContain("Saved by Demo Superuser, 3 days ago");
    expect(html.toLowerCase()).toContain(`<time datetime="${both.saved?.at.toLowerCase()}"`);
    expect(html).toMatch(/<time [^>]*title="[^"]+"[^>]*>3 days ago<\/time>/);
  });

  it("prints the version number and its age", () => {
    expect(textOutsideDeveloperView(renderRow(both))).toContain("v3 · 1 day ago");
  });

  it("prints no process id, key, revision, account id or hash outside the Developer view", () => {
    const text = textOutsideDeveloperView(renderRow(both));

    expect(text).not.toContain(PROCESS_ID);
    for (const value of FIXTURE_VALUES) expect(text).not.toContain(value);
  });

  it("holds every machine value in a Developer view that stands closed", () => {
    const details = developerView(renderRow(both));

    expect(details).toMatch(/^<details(?![^>]*\sopen)[^>]*>/);
    expect(details).toContain("Developer view");
    expect(details).toContain(PROCESS_ID);
    for (const value of FIXTURE_VALUES) expect(details).toContain(value);
  });

  it("names no one when the saving account has no display name", () => {
    const view: ProcessRowView = { ...both, saved: { by: null, at: new Date(NOW - 2 * HOUR).toISOString() } };

    expect(textOutsideDeveloperView(renderRow(view))).toContain("Saved 2 hours ago");
  });

  it("prints a $ pattern in a name as written", () => {
    const view: ProcessRowView = { ...both, saved: { by: "A $& B", at: both.saved?.at ?? "" } };

    expect(textOutsideDeveloperView(renderRow(view))).toContain("Saved by A $&amp; B, 3 days ago");
  });

  it("reads an empty name as Untitled process, still inside the link", () => {
    const html = renderRow({ ...both, name: "" });

    expect(html).toMatch(/<a href="[^"]+"[^>]*>Untitled process<\/a>/);
  });

  it("says a draft-only process is not published yet", () => {
    const { published: _published, ...draftOnly } = both;
    const html = renderRow({
      ...draftOnly,
      developer: { key: "pl_dev_key", processId: PROCESS_ID, revision: 4711, savedBy: "user_fixture_saver" },
      commands: ["discard"],
    });

    expect(textOutsideDeveloperView(html)).toContain("Not published yet");
    expect(html).not.toContain("Versions");
  });

  it("says a published-only process has no draft, and opens Versions from its name", () => {
    const { saved: _saved, ...publishedOnly } = both;
    const view: ProcessRowView = {
      ...publishedOnly,
      open: { name: "versions", processId: PROCESS_ID },
      developer: { key: "pl_dev_key", processId: PROCESS_ID, hash: "hash_fixture_full" },
      commands: ["createDraft"],
    };
    const html = renderRow(view);

    expect(textOutsideDeveloperView(html)).toContain("No draft");
    expect(html).toContain(`<a href="/studio/processes/${PROCESS_ID}/versions"`);
    expect(textOutsideDeveloperView(html)).toContain("Create draft");
    expect(html).not.toContain(">Versions</button>");
  });
});

/** spa-accessibility: the list table carries a name, and every column header carries text. */
describe("The process-list table", () => {
  const html = renderToStaticMarkup(<ProcessListTable>{null}</ProcessListTable>);

  it("names the table Processes", () => {
    expect(html).toMatch(/<table [^>]*aria-label="Processes"/);
  });

  it("gives every column a header with text, the commands column's visually hidden", () => {
    const heads = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => (m[1] ?? "").replace(/<[^>]*>/g, ""));
    expect(heads).toEqual(["Process", "Draft", "Published", "Actions"]);
    expect(html).toMatch(/<th[^>]*><span class="[^"]+">Actions<\/span><\/th>/);
  });

  it("sets one width per column, so an open Developer view moves none", () => {
    expect([...html.matchAll(/<col /g)]).toHaveLength(4);
  });
});
