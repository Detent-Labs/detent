import { describe, expect, it } from "bun:test";
import { focusVisible, scrollKeyboardFocusIntoView } from "../src/areas/studio/focusScroll.js";

/**
 * `scrollKeyboardFocusIntoView` runs on a surface root's `onFocusCapture`
 * (`studio-focus-ring-clipping`). No DOM mounts here, so each case hands the
 * handler a stand-in target that records its `scrollIntoView` calls. Whether
 * the scroll clears the ring is a layout fact; `docs/browser-checks.md` and
 * the change's browser measurement cover that.
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
    const { element, calls } = target();
    scrollKeyboardFocusIntoView({ target: element as unknown as EventTarget });
    expect(calls).toEqual([{ block: "nearest", inline: "nearest", behavior: "instant" }]);
  });

  it("leaves a pointer focus where it stands", () => {
    const { element, calls } = target({ visible: false });
    scrollKeyboardFocusIntoView({ target: element as unknown as EventTarget });
    expect(calls).toEqual([]);
  });

  it("scrolls nothing where the engine cannot parse :focus-visible", () => {
    const { element, calls } = target({ visible: "throws" });
    scrollKeyboardFocusIntoView({ target: element as unknown as EventTarget });
    expect(calls).toEqual([]);
  });

  it("leaves a canvas node to the canvas's own pan", () => {
    const { element, calls } = target({ inSvg: true });
    scrollKeyboardFocusIntoView({ target: element as unknown as EventTarget });
    expect(calls).toEqual([]);
  });

  it("ignores a target that cannot scroll", () => {
    expect(() => scrollKeyboardFocusIntoView({ target: null })).not.toThrow();
    expect(() => scrollKeyboardFocusIntoView({ target: {} as EventTarget })).not.toThrow();
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
