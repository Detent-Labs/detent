import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * Unapplied text on the JSON surface counts as unsaved work (`studio-json-view`). No
 * harness in this package can type or press, so the wiring is guarded at the source,
 * in the idiom `studio-stash-wiring.test.ts` uses. `e2e/draft-autosave.e2e.ts` walks
 * the same rule in Chromium. Each mutation runs in memory.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function read(path: string): string {
  return stripComments(readFileSync(new URL(`../src/areas/studio/${path}`, import.meta.url).pathname, "utf8"));
}

interface Sources {
  json: string;
  screen: string;
}

function scan({ json, screen }: Sources): string[] {
  const out: string[] = [];
  const flag = (holds: boolean, name: string) => {
    if (!holds) out.push(name);
  };

  flag(/\bconst unapplied = text !== seed;/.test(json), "the surface does not compare its text with the seed");
  flag(/\bonUnappliedChange\?\.\(unapplied\);\s*return \(\) => onUnappliedChange\?\.\(false\);\s*\}, \[unapplied\]\)/.test(json), "the surface does not report upward and lower it as it goes");
  const apply = json.slice(json.indexOf("const apply ="), json.indexOf("return (", json.indexOf("const apply =")));
  flag(apply.indexOf('if ("error" in parsed)') >= 0 && apply.indexOf('if ("error" in parsed)') < apply.indexOf("setSeed(text);"), "a refused Apply clears the state");
  flag(/\bsetSeed\(text\);/.test(apply), "a successful Apply keeps the state");
  flag(!/\bdoSave\b|\bflush\b/.test(json), "the surface sends a save");

  flag(/\bonUnappliedChange=\{setJsonUnapplied\}/.test(screen), "the screen does not hear the surface");
  flag(/\bif \(!jsonUnapplied\) \{\s*proceed\(\);\s*return;\s*\}\s*jsonLeaveTrigger\.current = activeControl\(\);\s*setJsonLeave\(\(\) => proceed\);/.test(screen), "leaving the surface does not ask first");
  flag(/\bonOpen=\{\(target\) =>\s*leaveJsonSurface\(\(\) => \{\s*setJsonOpen\(false\);/.test(screen), "a tab press drops the text with no question");
  flag(/\bonToggleJson=\{\(\) =>\s*leaveJsonSurface\(\(\) => \{\s*setJsonOpen\(\(open\) => !open\);/.test(screen), "the menu's entry drops the text with no question");
  flag(/<LeaveDraftDialog\s+triggerRef=\{jsonLeaveTrigger\}\s+jsonUnapplied\s+onCancel=\{\(\) => setJsonLeave\(undefined\)\}/.test(screen), "the surface's question is not the leave dialog over unapplied JSON");
  flag(/\bsetJsonLeave\(undefined\);\s*jsonLeave\(\);/.test(screen), "the question's confirm does not leave the surface");
  flag(/\bonDirtyChange\?\.\(false\);\s*onUnappliedJsonChange\?\.\(false\);\s*navigate\(\{ name: "processes" \}\);/.test(screen), "a discard asks about the text it just discarded");
  flag(/\bonUnappliedJsonChange\?\.\(jsonUnapplied\);\s*return \(\) => onUnappliedJsonChange\?\.\(false\);/.test(screen), "the screen does not report the text upward");
  flag(!/\bconst changeNotLanded = [^;]*jsonUnapplied/.test(screen), "the text reads as a change the flush can land");
  return out;
}

const real: Sources = { json: read("panels/JsonView.tsx"), screen: read("screens/EditScreen.tsx") };

function mutate(file: keyof Sources, from: RegExp, to: string): Sources {
  const out = real[file].replace(from, to);
  expect(out, `the mutation ${String(from)} matched nothing in ${file}`).not.toBe(real[file]);
  return { ...real, [file]: out };
}

describe("unapplied JSON's wiring", () => {
  it("the real sources have no violation", () => {
    expect(scan(real)).toEqual([]);
  });

  const cases: [string, keyof Sources, RegExp, string, string][] = [
    ["a surface that always reads applied", "json", /const unapplied = text !== seed;/, "const unapplied = false;", "does not compare"],
    ["a surface that stays raised after it goes", "json", /return \(\) => onUnappliedChange\?\.\(false\);/, "", "does not report upward"],
    ["an Apply that keeps the state", "json", /setSeed\(text\);/, "", "keeps the state"],
    ["a refused Apply that clears the state", "json", /const parsed = parseDraftText\(text\);/, "setSeed(text);\nconst parsed = parseDraftText(text);", "a refused Apply"],
    ["a screen deaf to the surface", "screen", /onUnappliedChange=\{setJsonUnapplied\}/, "", "does not hear"],
    ["a way off the surface that never asks", "screen", /setJsonLeave\(\(\) => proceed\);/, "proceed();", "does not ask first"],
    ["a tab press with no question", "screen", /onOpen=\{\(target\) =>\s*leaveJsonSurface\(\(\) => \{/, "onOpen={(target) =>\n ((run: () => void) => run())(() => {", "a tab press"],
    ["a menu entry with no question", "screen", /onToggleJson=\{\(\) =>\s*leaveJsonSurface\(\(\) => \{/, "onToggleJson={() =>\n ((run: () => void) => run())(() => {", "the menu's entry"],
    ["a question with the failed save's body", "screen", /triggerRef=\{jsonLeaveTrigger\}\s+jsonUnapplied/, "triggerRef={jsonLeaveTrigger}", "not the leave dialog"],
    ["a cancel that leaves", "screen", /onCancel=\{\(\) => setJsonLeave\(undefined\)\}/, "onCancel={() => jsonLeave?.()}", "not the leave dialog"],
    ["a confirm that stays", "screen", /setJsonLeave\(undefined\);\s*jsonLeave\(\);/, "setJsonLeave(undefined);", "does not leave the surface"],
    ["a discard that then asks", "screen", /(onDirtyChange\?\.\(false\);)\s*onUnappliedJsonChange\?\.\(false\);/, "$1", "a discard asks"],
    ["a screen that reports nothing upward", "screen", /onUnappliedJsonChange\?\.\(jsonUnapplied\);/, "", "does not report the text"],
    ["text the flush reads as a change", "screen", /const changeNotLanded = dirtyNow \|\| actions\.saving;/, "const changeNotLanded = dirtyNow || actions.saving || jsonUnapplied;", "can land"],
  ];
  for (const [name, file, from, to, expected] of cases) {
    it(`flags ${name}`, () => {
      const found = scan(mutate(file, from, to));
      expect(found.some((v) => v.includes(expected)), found.join("\n") || "no violation").toBe(true);
    });
  }
});
