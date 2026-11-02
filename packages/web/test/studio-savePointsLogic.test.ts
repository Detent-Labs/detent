import { describe, expect, it } from "bun:test";
import type { SavePointList } from "../src/areas/studio/api/types.js";
import {
  atBound,
  boundSentence,
  createLanding,
  createdLine,
  entryFocus,
  movesToBound,
  nameDecision,
  removedLine,
  removeLanding,
  restoredLine,
  restoreLanding,
  savedLineTemplate,
  viewState,
} from "../src/areas/studio/panels/savePointsLogic.js";
import type { SavePointOutcome } from "../src/areas/studio/screens/draftAutosaveLogic.js";

/**
 * The Save points view's decisions (`studio-app`: "The Save points view lists a
 * draft's save points", "Restoring a save point asks first and names what it
 * kept", "Removing a save point asks first"). One test per row of `design.md`
 * D10's outcome table.
 */

function listOf(count: number, limit = 50): SavePointList {
  return {
    limit,
    items: Array.from({ length: count }, (_, i) => ({
      savePointId: `spt_${i}`,
      processId: "proc_1",
      name: `Point ${i}`,
      revision: i,
      createdBy: "actor_1",
      createdAt: "2026-11-02T10:00:00.000Z",
      createdByDisplayName: "Roman",
    })),
  };
}

describe("the bound", () => {
  it("is reached at the server's own limit, not before", () => {
    expect(atBound(listOf(49))).toBe(false);
    expect(atBound(listOf(50))).toBe(true);
    expect(atBound(listOf(3, 3))).toBe(true);
    expect(atBound(undefined)).toBe(false);
  });

  it("prints the limit the server states", () => {
    expect(boundSentence(50)).toBe("This draft holds 50 save points. Remove one to name another or to restore one.");
  });
});

describe("the view's state", () => {
  it("shows the form and a waiting line before the first answer", () => {
    expect(viewState(undefined, false)).toEqual({ rows: "waiting", form: "input" });
  });

  it("says none exist for an empty list", () => {
    expect(viewState(listOf(0), false)).toEqual({ rows: "empty", form: "input" });
  });

  it("lists rows and keeps the form below the bound", () => {
    expect(viewState(listOf(49), false)).toEqual({ rows: "list", form: "input" });
  });

  it("replaces the form with the bound's sentence at the bound", () => {
    expect(viewState(listOf(50), false)).toEqual({ rows: "list", form: "bound" });
  });

  it("reports a failed fetch where the rows stand and keeps the form", () => {
    expect(viewState(undefined, true)).toEqual({ rows: "failed", form: "input" });
    expect(viewState(listOf(50), true)).toEqual({ rows: "failed", form: "input" });
  });
});

describe("a name", () => {
  it("asks for a name where the input is empty or blank, sending nothing", () => {
    expect(nameDecision("")).toEqual({ kind: "empty" });
    expect(nameDecision("   \t")).toEqual({ kind: "empty" });
  });

  it("sends the name trimmed", () => {
    expect(nameDecision("  Before the review step ")).toEqual({ kind: "name", name: "Before the review step" });
  });
});

describe("a create's outcome", () => {
  it("clears the input, says what it saved and refetches", () => {
    expect(createLanding({ kind: "done", value: {} }, "Before the review step")).toEqual({
      clearName: true,
      status: "Saved “Before the review step”.",
      refetch: true,
    });
  });

  it("prints a refusal at the input and keeps the name typed", () => {
    expect(createLanding({ kind: "refused", message: "The server refused." }, "x")).toEqual({
      clearName: false,
      inputError: "The server refused.",
      refetch: false,
    });
  });

  it("says at the input that a failed save stops it, and keeps the name typed", () => {
    expect(createLanding({ kind: "unsaved" }, "x")).toEqual({
      clearName: false,
      inputError: "This save point cannot hold your latest changes until they save. Try again above.",
      refetch: false,
    });
  });

  for (const kind of ["conflict", "ended"] as const) {
    it(`prints nothing for ${kind}: the banner stands and the name stays typed`, () => {
      expect(createLanding({ kind }, "x")).toEqual({ clearName: false, refetch: false });
    });
  }

  it("keeps a $ pattern in a name as written", () => {
    expect(createdLine("Cost $& centre")).toBe("Saved “Cost $& centre”.");
  });
});

describe("a restore's outcome", () => {
  it("closes the dialog, names both points and refetches", () => {
    expect(restoreLanding({ kind: "done", value: { kept: "Before restoring “A”" } }, "A")).toEqual({
      dialog: "close",
      refetch: true,
      status: "Restored “A”. Your work before it stands as “Before restoring “A””.",
      focusInputAfter: false,
    });
  });

  it("closes the dialog and refetches on a 404", () => {
    expect(restoreLanding({ kind: "gone" }, "A")).toEqual({ dialog: "close", refetch: true, focusInputAfter: false });
  });

  it("keeps the dialog open and prints the reason inside it on another refusal", () => {
    expect(restoreLanding({ kind: "refused", message: "No." }, "A")).toEqual({
      dialog: "stay",
      refusal: "No.",
      refetch: false,
      focusInputAfter: false,
    });
  });

  it("keeps the dialog open and says why when a failed save stops it", () => {
    expect(restoreLanding({ kind: "unsaved" }, "A")).toEqual({
      dialog: "stay",
      refusal: "Detent cannot restore yet, because your latest changes have not saved. Cancel and press Try again, then restore.",
      refetch: false,
      focusInputAfter: false,
    });
  });

  for (const kind of ["conflict", "ended"] as const) {
    it(`closes the dialog with no request for ${kind}, leaving the banner to report it`, () => {
      expect(restoreLanding({ kind }, "A")).toEqual({ dialog: "close", refetch: false, focusInputAfter: false });
    });
  }

  it("fills a $ pattern in either name as written", () => {
    expect(restoredLine("$&", "$1")).toBe("Restored “$&”. Your work before it stands as “$1”.");
    expect(restoredLine("{kept}", "K")).toBe("Restored “{kept}”. Your work before it stands as “K”.");
  });
});

describe("a lost answer reads the list again", () => {
  const lost = { kind: "refused", message: "No answer.", lost: true } as const;

  it("a create keeps its name and its sentence, and shows the row that may have landed", () => {
    expect(createLanding(lost, "x")).toEqual({ clearName: false, inputError: "No answer.", refetch: true });
  });

  it("a restore keeps its dialog and its sentence, and shows the point that may have been kept", () => {
    expect(restoreLanding(lost, "A")).toEqual({ dialog: "stay", refusal: "No answer.", refetch: true, focusInputAfter: false });
  });
});

describe("a remove's outcome", () => {
  it("closes the dialog, says what went, refetches and sends the focus to the input afterwards", () => {
    expect(removeLanding({ kind: "done", value: undefined }, "A")).toEqual({
      dialog: "close",
      refetch: true,
      status: "Removed “A”.",
      focusInputAfter: true,
    });
  });

  it("closes the dialog and refetches on a 404, says the same and sends the focus to the input, since the row goes", () => {
    expect(removeLanding({ kind: "gone" }, "A")).toEqual({
      dialog: "close",
      refetch: true,
      status: "Removed “A”.",
      focusInputAfter: true,
    });
  });

  it("keeps a $ pattern in the name as written", () => {
    expect(removedLine("Cost $& centre")).toBe("Removed “Cost $& centre”.");
  });

  it("keeps the dialog open on a refusal", () => {
    const outcome: SavePointOutcome<undefined> = { kind: "refused", message: "No." };
    expect(removeLanding(outcome, "A")).toMatchObject({ dialog: "stay", refusal: "No.", refetch: false });
    expect(removeLanding(outcome, "A").status).toBeUndefined();
  });

  it("closes the dialog on a conflict", () => {
    expect(removeLanding({ kind: "conflict" }, "A")).toMatchObject({ dialog: "close", refetch: false });
  });
});

describe("where the focus lands", () => {
  it("moves to the bound's sentence only when the input held it and the answer reached the bound", () => {
    expect(movesToBound({ inputHeld: true, atBound: false }, { atBound: true })).toBe(true);
    expect(movesToBound({ inputHeld: false, atBound: false }, { atBound: true })).toBe(false);
    expect(movesToBound({ inputHeld: true, atBound: false }, { atBound: false })).toBe(false);
    expect(movesToBound({ inputHeld: true, atBound: true }, { atBound: true })).toBe(false);
  });

  it("enters on the input below the bound and on the sentence at it", () => {
    expect(entryFocus(false)).toBe("input");
    expect(entryFocus(true)).toBe("bound");
  });

  it("returns the input in the commit a remove at the bound leaves it", () => {
    const before = listOf(50);
    const after = { ...before, items: before.items.slice(1) };

    expect(entryFocus(atBound(before))).toBe("bound");
    expect(entryFocus(atBound(after))).toBe("input");
  });
});

describe("the saved line", () => {
  it("names who saved the point, and reads without a name where none resolves", () => {
    expect(savedLineTemplate("Roman")).toBe("Saved by {name}, {when}");
    expect(savedLineTemplate(null)).toBe("Saved {when}");
    expect(savedLineTemplate(undefined)).toBe("Saved {when}");
  });
});
