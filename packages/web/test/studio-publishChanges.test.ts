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
