import { describe, expect, it } from "bun:test";
import { focusVisible, noteInputModality, scrollKeyboardFocusIntoView } from "../src/areas/studio/focusScroll.js";

/**
 * `scrollKeyboardFocusIntoView` runs on a surface root's `onFocusCapture`
 * (`studio-focus-ring-clipping`). No DOM mounts here, so each case hands the
 * handler a stand-in target that records its `scrollIntoView` calls. Whether
 * the scroll clears the ring is a layout fact; `docs/browser-checks.md` and
 * the change's browser measurement cover that.
 *
 * `focusScroll.ts` also installs a document-level `pointerdown`/`keydown`
 * capture pair, guarded for a no-DOM environment, that this file never
 * loads a `document` for. Each case that cares about the input modality
 * calls `noteInputModality` directly instead (I-4).
 */
type Call = ScrollIntoViewOptions | boolean | undefined;

function target(over: { visible?: boolean | "throws"; inSvg?: boolean } = {}) {
  const calls: Call[] = [];
  const element = {
    matches: (selector: string) => {
      if (over.visible === "throws") throw new SyntaxError(`unknown selector ${selector}`);
      return selector === ":focus-visible" && (over.visible ?? true);
    },
    closest: (selector: string) => (selector === "svg" && over.inSvg ? {} : null),
    scrollIntoView: (options?: Call) => {
      calls.push(options);
    },
  };
  return { element, calls };
}

describe("scrollKeyboardFocusIntoView", () => {
  it("scrolls a keyboard focus by the nearest distance, at once", () => {
    noteInputModality("keyboard");
    const { element, calls } = target();
    scrollKeyboardFocusIntoView({ target: element as unknown as EventTarget });
    expect(calls).toEqual([{ block: "nearest", inline: "nearest", behavior: "instant" }]);
  });

  it("leaves a pointer focus where it stands", () => {
    noteInputModality("keyboard");
    const { element, calls } = target({ visible: false });
    scrollKeyboardFocusIntoView({ target: element as unknown as EventTarget });
    expect(calls).toEqual([]);
  });

  it("scrolls nothing where the engine cannot parse :focus-visible", () => {
    noteInputModality("keyboard");
    const { element, calls } = target({ visible: "throws" });
    scrollKeyboardFocusIntoView({ target: element as unknown as EventTarget });
    expect(calls).toEqual([]);
  });

  it("leaves a canvas node to the canvas's own pan", () => {
    noteInputModality("keyboard");
    const { element, calls } = target({ inSvg: true });
    scrollKeyboardFocusIntoView({ target: element as unknown as EventTarget });
    expect(calls).toEqual([]);
  });

  it("ignores a target that cannot scroll", () => {
    noteInputModality("keyboard");
    expect(() => scrollKeyboardFocusIntoView({ target: null })).not.toThrow();
    expect(() => scrollKeyboardFocusIntoView({ target: {} as EventTarget })).not.toThrow();
  });

  it("leaves a pointer focus on a text field where it stands, though the field itself is focus-visible", () => {
    // Chrome and Firefox both match `:focus-visible` on a pointer focus of a
    // text field, so `visible: true` alone stands in for that field here.
    // The modality flag is what must stop the scroll (I-4).
    noteInputModality("pointer");
    const { element, calls } = target({ visible: true });
    scrollKeyboardFocusIntoView({ target: element as unknown as EventTarget });
    expect(calls).toEqual([]);
  });

  it("scrolls a text field after a keydown, the same field a pointer press left alone above", () => {
    noteInputModality("keyboard");
    const { element, calls } = target({ visible: true });
    scrollKeyboardFocusIntoView({ target: element as unknown as EventTarget });
    expect(calls).toEqual([{ block: "nearest", inline: "nearest", behavior: "instant" }]);
  });
});

describe("focusVisible", () => {
  it("reads a keyboard focus as true and a pointer focus as false", () => {
    expect(focusVisible(target().element)).toBe(true);
    expect(focusVisible(target({ visible: false }).element)).toBe(false);
  });

  it("reads false where the selector throws", () => {
    expect(focusVisible(target({ visible: "throws" }).element)).toBe(false);
  });
});
