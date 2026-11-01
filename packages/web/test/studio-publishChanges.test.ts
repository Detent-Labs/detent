import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { changesSentence } from "../src/areas/studio/panels/publishChangesLogic.js";

/**
 * The publish dialog's Changes sentence (`studio-publish`: "The publish dialog
 * states the changes since the base version"; `studio-six-tabs` design D6 and
 * D10), one case per state.
 */
describe("changesSentence", () => {
  it("names a first version when the draft has no base", () => {
    expect(changesSentence({ kind: "first" }, null)).toBe("This publish mints the first version.");
  });

  it("names the base version while its body is read", () => {
    expect(changesSentence({ kind: "reading" }, 4)).toBe("Reading version 4…");
  });

  it("states a failed read with its message, printing a `$` pattern as written", () => {
    expect(changesSentence({ kind: "failed", message: "HTTP 500: $& and $1 {version}" }, 4)).toBe(
      "Could not read version 4: HTTP 500: $& and $1 {version}",
    );
  });

  it("says the draft has no changes since its base", () => {
    expect(changesSentence({ kind: "loaded", count: 0 }, 4)).toBe("No changes since version 4.");
  });

  it("counts one change in the singular", () => {
    expect(changesSentence({ kind: "loaded", count: 1 }, 4)).toBe("1 change since version 4.");
  });

  it("counts several changes in the plural", () => {
    expect(changesSentence({ kind: "loaded", count: 12 }, 4)).toBe("12 changes since version 4.");
  });
});

/**
 * The Changes row's disclosure mounts the change list. The harness mounts no
 * DOM and the list draws only once the base body loads, so these read the
 * component's source.
 */
describe("The publish dialog's change list", () => {
  const source = readFileSync(new URL("../src/areas/studio/panels/PublishChanges.tsx", import.meta.url), "utf8");

  it("mounts the list with no heading of its own, so the dialog's title stays its one h2", () => {
    const mount = source.match(/<ChangeList\b[^>]*\/>/)?.[0] ?? "";

    expect(mount).toContain("rows={rows}");
    expect(mount).not.toContain("heading=");
  });

  // The dialog is the one scroll box and its footer is sticky, so a nested
  // scroll box would trap the wheel inside the list.
  it("keeps no scroll box of its own around the list", () => {
    expect(source).not.toContain("listBox");
    expect(source).not.toContain("maxHeight");
    expect(source).not.toContain("overflowY");
    expect(source).toMatch(/<\/summary>[\s\S]*<ChangeList rows=\{rows\} \/>\s*<\/details>/);
  });

  it("prints the Changes sentence as a DialogFact row", () => {
    expect(source).toMatch(/<DialogFact term=\{t\("draftToolbar\.publishDialogChanges"\)\}>/);
    expect(source).not.toContain("<dt");
  });
});
