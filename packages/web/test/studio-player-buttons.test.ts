import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { studioCatalog } from "../src/i18n/catalogs/studio.js";

/**
 * `PlayerScreen.tsx` names its two create buttons for the run each starts
 * (`studio-player`, "The two buttons name their runs"). The filled button is
 * "Test this draft", the one thing Test came for, and it leads the row. The
 * outlined one starts a case on the published version. No harness here clicks,
 * so the wiring is pinned at the source. `scan` returns one name per violation.
 * The first test asserts the real file has none; the rest apply one in-memory
 * mutation each and assert the matching violation appears. The tree is never
 * touched.
 */
const PLAYER = "src/areas/studio/screens/PlayerScreen.tsx";

interface CreateButton {
  className: string;
  handler: string;
  text: string;
}

/** Every `<button>` whose `onClick` calls `doCreate` or `doCreateTest`, in source order. */
function createButtons(source: string): CreateButton[] {
  const buttons: CreateButton[] = [];
  const re = /<button\b((?:=>|[^>])*?)>\s*([\s\S]*?)\s*<\/button>/g;
  for (const m of source.matchAll(re)) {
    const handler = /onClick=\{\(\) => void (doCreate(?:Test)?)\(\)\}/.exec(m[1] ?? "")?.[1];
    if (handler === undefined) continue;
    buttons.push({ className: /className="([^"]*)"/.exec(m[1] ?? "")?.[1] ?? "", handler, text: m[2] ?? "" });
  }
  return buttons;
}

function scan(source: string): string[] {
  const violations: string[] = [];
  const buttons = createButtons(source);
  if (buttons.length !== 2) return [`expected 2 create buttons, found ${buttons.length}`];
  const [first, second] = buttons;
  if (first?.handler !== "doCreateTest" || second?.handler !== "doCreate") violations.push("the draft button does not lead the row");
  const filled = buttons.filter((b) => /\bbtn-primary\b/.test(b.className));
  if (filled.length !== 1 || filled[0]?.handler !== "doCreateTest") violations.push("the fill is not on the draft button");
  const draft = buttons.find((b) => b.handler === "doCreateTest");
  const published = buttons.find((b) => b.handler === "doCreate");
  if (draft?.text !== '{t("player.testDraft")}') violations.push("the draft button is not read from player.testDraft");
  if (published?.text !== '{t("player.startCase")}') violations.push("the published button is not read from player.startCase");
  return violations;
}

const source = readFileSync(new URL(`../${PLAYER}`, import.meta.url).pathname, "utf8");

describe("the Player's two create buttons", () => {
  it("the catalog holds the two words", () => {
    expect(studioCatalog.en["player.testDraft"]).toBe("Test this draft");
    expect(studioCatalog.en["player.startCase"]).toBe("Start a case from the published version");
  });

  it("the file has no violation", () => {
    expect(scan(source)).toEqual([]);
  });

  it("neither old label stays", () => {
    expect(source).not.toContain("Create test instance");
    expect(source).not.toContain("Create new instance");
  });

  it("swapping the fill is caught", () => {
    const mutated = source.replace('className="btn btn-primary" disabled={loading} onClick={() => void doCreateTest()}', 'className="btn btn-secondary" disabled={loading} onClick={() => void doCreateTest()}');
    expect(mutated).not.toBe(source);
    expect(scan(mutated)).toContain("the fill is not on the draft button");
  });

  it("putting the published button first is caught", () => {
    const m = /(\s*<button\b[^\n]*doCreateTest[\s\S]*?<\/button>)(\s*<button\b[^\n]*doCreate\(\)[\s\S]*?<\/button>)/.exec(source);
    expect(m).not.toBeNull();
    const mutated = source.replace(m![0], (m![2] ?? "") + (m![1] ?? ""));
    expect(scan(mutated)).toContain("the draft button does not lead the row");
  });

  it("an inline label is caught", () => {
    const mutated = source.replace('{t("player.testDraft")}', "Test this draft");
    expect(scan(mutated)).toContain("the draft button is not read from player.testDraft");
  });
});
