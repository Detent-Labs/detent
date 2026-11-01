import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  ArrangeDialog,
  DeleteTemplateDialog,
  KindDropDialog,
  LeaveDraftDialog,
  RemoveStepsDialog,
  ReplaceTemplateDialog,
  RestoreOverChangesDialog,
  TechnicalClearDialog,
} from "../src/areas/studio/panels/confirmations.js";

/**
 * `panels/confirmations.tsx`: each prompt's heading, body and confirm label
 * (`studio-app`: "Each confirmation names its act"; `studio-canvas`: "Arrange
 * confirms before discarding a hand-placed layout"). The web package has no DOM
 * harness, so a static render reads the words. A real browser checks the rest.
 */

const handlers = { triggerRef: { current: null }, onCancel: () => {}, onConfirm: () => {} };

const NO_UNDO = "The studio has no undo.";

interface Expected {
  name: string;
  element: ReactElement;
  heading: string;
  body: string[];
  confirm: string;
}

const CASES: Expected[] = [
  {
    name: "LeaveDraftDialog",
    element: <LeaveDraftDialog {...handlers} />,
    heading: "Leave this draft?",
    body: ["Your unsaved changes go with it. The saved draft stays."],
    confirm: "Leave without saving",
  },
  {
    name: "ArrangeDialog",
    element: <ArrangeDialog {...handlers} />,
    heading: "Arrange every step?",
    body: ["Every step moves to a new place, and each path loses the bends placed on it.", NO_UNDO],
    confirm: "Arrange",
  },
  {
    name: "RestoreOverChangesDialog",
    element: <RestoreOverChangesDialog {...handlers} />,
    heading: "Replace your current changes?",
    body: ["The restored copy takes their place.", NO_UNDO],
    confirm: "Replace them",
  },
  {
    name: "KindDropDialog, the format",
    element: <KindDropDialog label="Due date" from="Date" to="Number" dropped={["format"]} {...handlers} />,
    heading: "Change “Due date” from Date to Number?",
    body: ["The new kind cannot keep how this field checks its value.", NO_UNDO],
    confirm: "Change kind",
  },
  {
    name: "KindDropDialog, the control",
    element: <KindDropDialog label="Due date" from="Date" to="Number" dropped={["control"]} {...handlers} />,
    heading: "Change “Due date” from Date to Number?",
    body: ["The new kind cannot keep how this field asks for its value.", NO_UNDO],
    confirm: "Change kind",
  },
  {
    name: "KindDropDialog, both",
    element: <KindDropDialog label="Due date" from="Date" to="Number" dropped={["format", "control"]} {...handlers} />,
    heading: "Change “Due date” from Date to Number?",
    body: ["The new kind keeps neither how this field checks its value nor how it asks for it.", NO_UNDO],
    confirm: "Change kind",
  },
  {
    name: "KindDropDialog, an old kind with no name",
    element: <KindDropDialog label="Due date" from={undefined} to="Number" dropped={["format"]} {...handlers} />,
    heading: "Change the kind of “Due date”?",
    body: ["The new kind cannot keep how this field checks its value.", NO_UNDO],
    confirm: "Change kind",
  },
  {
    name: "RemoveStepsDialog",
    element: <RemoveStepsDialog names={["Review", "Book", "Close"]} {...handlers} />,
    heading: "Remove 3 steps?",
    body: ["The ways out leading to them stay, and the checks report them.", NO_UNDO],
    confirm: "Remove the steps",
  },
  {
    name: "TechnicalClearDialog",
    element: <TechnicalClearDialog label="Reference" count={3} {...handlers} />,
    heading: "Mark “Reference” as technical?",
    body: ["The process fills this field in by itself, so no step can require it or make it read-only.", NO_UNDO],
    confirm: "Mark as technical",
  },
  {
    name: "DeleteTemplateDialog",
    element: <DeleteTemplateDialog name="Approval" {...handlers} />,
    heading: "Delete “Approval”?",
    body: ["Processes already created from it stay as they are.", NO_UNDO],
    confirm: "Delete template",
  },
  {
    name: "ReplaceTemplateDialog",
    element: <ReplaceTemplateDialog name="Approval" {...handlers} />,
    heading: "Replace “Approval”?",
    body: ["A template keeps no earlier version, so the old one goes. Processes already created from it stay as they are."],
    confirm: "Replace template",
  },
];

const buttonTags = (html: string): string[] => html.match(/<button[^>]*>/g) ?? [];

/** The text of each paragraph in the described body, in order. */
const paragraphs = (html: string): string[] => [...html.matchAll(/<p[^>]*>([^<]*)<\/p>/g)].map((m) => m[1]!);

describe("each confirmation names its act", () => {
  for (const { name, element, heading, body, confirm } of CASES) {
    it(`${name} prints its heading, its body and its confirm`, () => {
      const html = renderToStaticMarkup(element);

      expect(html).toContain(`>${heading}</h2>`);
      expect(paragraphs(html)).toEqual(body);
      expect(html).toContain(`>${confirm}</button>`);
    });

    it(`${name} closes with an outlined confirm, then Cancel holding the focus`, () => {
      const tags = buttonTags(renderToStaticMarkup(element));

      expect(tags).toHaveLength(2);
      expect(tags[0]).toContain("btn-secondary btn-destructive");
      expect(tags[0]).not.toContain("autofocus");
      expect(tags[1]).toContain("autofocus");
      expect(renderToStaticMarkup(element)).toContain(">Cancel</button>");
    });
  }

  it("RemoveStepsDialog names each step under one term", () => {
    const html = renderToStaticMarkup(<RemoveStepsDialog names={["Review", "Book (step 3)"]} {...handlers} />);

    expect(html).toMatch(/<dt[^>]*>Steps<\/dt><dd[^>]*><ul[^>]*><li>Review<\/li><li>Book \(step 3\)<\/li><\/ul><\/dd>/);
  });

  it("TechnicalClearDialog counts what it clears, in a term and a figure", () => {
    const html = renderToStaticMarkup(<TechnicalClearDialog label="Reference" count={3} {...handlers} />);

    expect(html).toMatch(/<dt[^>]*>Required and read-only settings it clears<\/dt><dd[^>]*>3<\/dd>/);
  });

  it("a name with a replacement pattern prints as written", () => {
    expect(renderToStaticMarkup(<KindDropDialog label="$& cost" from="{to}" to="Number" dropped={["format"]} {...handlers} />)).toContain("Change “$&amp; cost” from {to} to Number?");
    expect(renderToStaticMarkup(<TechnicalClearDialog label="$& cost" count={1} {...handlers} />)).toContain("“$&amp; cost”");
    expect(renderToStaticMarkup(<DeleteTemplateDialog name="$& cost" {...handlers} />)).toContain("“$&amp; cost”");
    expect(renderToStaticMarkup(<ReplaceTemplateDialog name="$& cost" {...handlers} />)).toContain("“$&amp; cost”");
  });
});
