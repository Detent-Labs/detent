import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * Every exit from an open, unsaved draft in `root.tsx` asks first.
 *
 * `guardedNavigate` once held the only check. Three other paths left the draft
 * with no prompt: the `go` that `EditScreen` receives (the `⋮` menu's groups
 * link), the account menu's three handlers on `Chrome`, and closing the tab. A
 * raw `go` or `onLogout` on any of them brings the defect back with every type
 * check still green.
 *
 * A source test in the idiom `studio-no-confirm.test.ts` uses: no harness in
 * this package can click a control and observe a prompt, so the wiring is
 * guarded at the source. `scan` returns one name per violation. The first test
 * asserts the real file has none. The rest apply one in-memory mutation to the
 * real file and assert the matching violation appears, so each rule is proved
 * to fire.
 *
 * `onUnauthorized` is the opposite rule: a dead session asks nothing, so
 * `EditScreen` receives the shell's callback unwrapped.
 */
const ROOT = "src/areas/studio/root.tsx";

/** Block comments first, then line comments, as `studio-no-confirm.test.ts`
 * strips: a name in a comment is not wiring. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * The opening tag of the first `<name ...>` element. It ends at the first `>`
 * outside every `{}`, so the `=>` of an arrow function prop and a `>` inside a
 * template literal do not end it. Whitespace and line breaks are free.
 */
function openingTag(code: string, name: string): string | undefined {
  const start = code.search(new RegExp(`<${name}(?=[\\s>/])`));
  if (start < 0) return undefined;
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    const c = code[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return code.slice(start, i + 1);
  }
  return undefined;
}

/** The text between the braces of `prop={...}`, trimmed. */
function propValue(tag: string, prop: string): string | undefined {
  const m = new RegExp(`\\b${prop}\\s*=\\s*\\{`).exec(tag);
  if (!m) return undefined;
  const from = m.index + m[0].length;
  let depth = 1;
  for (let i = from; i < tag.length; i++) {
    if (tag[i] === "{") depth++;
    else if (tag[i] === "}" && --depth === 0) return tag.slice(from, i).trim();
  }
  return undefined;
}

/** True when `value` reaches `guarded` and never the raw `raw`. */
function guardedOnly(value: string | undefined, guarded: string, raw: string): boolean {
  return value !== undefined && new RegExp(`\\b${guarded}\\b`).test(value) && !new RegExp(`\\b${raw}\\b`).test(value);
}

/** True when the arrow function bound to `name` calls `confirmLeave(` before
 * its first `;`. No parameter list or type annotation here holds a `;`. */
function asksFirst(code: string, name: string): boolean {
  return new RegExp(`const\\s+${name}\\s*=[^;]*?\\bconfirmLeave\\s*\\(`).test(code);
}

function scan(source: string): string[] {
  const code = stripComments(source);
  const violations: string[] = [];
  const edit = openingTag(code, "EditScreen");
  const chrome = openingTag(code, "Chrome");

  if (edit === undefined) violations.push("EditScreen element not found");
  else {
    if (!guardedOnly(propValue(edit, "go"), "guardedGo", "go")) violations.push("EditScreen go is not guardedGo");
    if (propValue(edit, "onUnauthorized") !== "onUnauthorized") violations.push("EditScreen onUnauthorized is not the raw callback");
  }

  if (chrome === undefined) violations.push("Chrome element not found");
  else {
    if (!guardedOnly(propValue(chrome, "onGoToArea"), "guardedGo", "go")) violations.push("Chrome onGoToArea bypasses guardedGo");
    if (!guardedOnly(propValue(chrome, "onGoToProfile"), "guardedGo", "go")) violations.push("Chrome onGoToProfile bypasses guardedGo");
    if (!guardedOnly(propValue(chrome, "onLogout"), "guardedLogout", "onLogout")) violations.push("Chrome onLogout is not guardedLogout");
  }

  // The wrappers must ask, or a guarded name guards nothing.
  if (!/const\s+confirmLeave\s*=[^;]*dirtyRef\.current[^;]*\bconfirm\s*\(/.test(code)) violations.push("confirmLeave does not ask while dirtyRef is set");
  for (const name of ["guardedNavigate", "guardedGo", "guardedLogout"]) {
    if (!asksFirst(code, name)) violations.push(`${name} skips confirmLeave`);
  }

  if (!/\.addEventListener\(\s*["']beforeunload["']/.test(code)) violations.push("beforeunload listener is not added");
  if (!/\.removeEventListener\(\s*["']beforeunload["']/.test(code)) violations.push("beforeunload listener is not removed");
  if (!/dirtyRef\.current\s*(?:&&\s*|\)\s*\{?\s*)\w+\.preventDefault\s*\(/.test(code)) violations.push("beforeunload handler ignores dirtyRef");

  return violations;
}

/** Replaces the first match in `code`. It fails when nothing matches, so a
 * mutation that drifted from the source cannot pass as a clean scan. */
function mutate(code: string, from: RegExp, to: string): string {
  const out = code.replace(from, to);
  expect(out, `the mutation ${String(from)} matched nothing in root.tsx`).not.toBe(code);
  return out;
}

const real = stripComments(readFileSync(new URL(`../${ROOT}`, import.meta.url).pathname, "utf8"));

describe("every exit from an unsaved draft in root.tsx asks first", () => {
  it("the real root.tsx has no violation", () => {
    expect(scan(real)).toEqual([]);
  });

  it("a raw go on EditScreen is flagged", () => {
    expect(scan(mutate(real, /\bgo=\{guardedGo\}/, "go={go}"))).toEqual(["EditScreen go is not guardedGo"]);
  });

  it("a raw go on the account menu's area switch is flagged", () => {
    expect(scan(mutate(real, /onGoToArea=\{\(a\) => guardedGo\(/, "onGoToArea={(a) => go("))).toEqual([
      "Chrome onGoToArea bypasses guardedGo",
    ]);
  });

  it("a raw go on the account menu's profile entry is flagged", () => {
    expect(scan(mutate(real, /onGoToProfile=\{\(\) => guardedGo\(/, "onGoToProfile={() => go("))).toEqual([
      "Chrome onGoToProfile bypasses guardedGo",
    ]);
  });

  it("a raw onLogout on Chrome is flagged", () => {
    expect(scan(mutate(real, /onLogout=\{guardedLogout\}/, "onLogout={onLogout}"))).toEqual(["Chrome onLogout is not guardedLogout"]);
  });

  it("a wrapped onUnauthorized on EditScreen is flagged", () => {
    const wrapped = mutate(real, /(<EditScreen[\s\S]*?)onUnauthorized=\{onUnauthorized\}/, "$1onUnauthorized={() => onUnauthorized()}");
    expect(scan(wrapped)).toEqual(["EditScreen onUnauthorized is not the raw callback"]);
  });

  it("a missing beforeunload registration is flagged", () => {
    const removed = mutate(real, /window\.addEventListener\(\s*"beforeunload"\s*,\s*\w+\s*\);?/, "");
    expect(scan(removed)).toEqual(["beforeunload listener is not added"]);
  });

  it("a missing beforeunload cleanup is flagged", () => {
    const kept = mutate(real, /window\.removeEventListener\(\s*"beforeunload"\s*,\s*\w+\s*\);?/, "");
    expect(scan(kept)).toEqual(["beforeunload listener is not removed"]);
  });

  it("a beforeunload handler that prompts on a clean draft is flagged", () => {
    const always = mutate(real, /if \(dirtyRef\.current\) (\w+\.preventDefault\(\))/, "$1");
    expect(scan(always)).toEqual(["beforeunload handler ignores dirtyRef"]);
  });

  it("a guarded wrapper that skips confirmLeave is flagged", () => {
    for (const name of ["guardedNavigate", "guardedGo", "guardedLogout"]) {
      const skipped = mutate(real, new RegExp(`(const\\s+${name}\\s*=[^;]*?)\\bconfirmLeave\\(\\)`), "$1true");
      expect(scan(skipped), name).toEqual([`${name} skips confirmLeave`]);
    }
  });

  it("a confirmLeave that never reads dirtyRef is flagged", () => {
    const blind = mutate(real, /(const\s+confirmLeave\s*=[^;]*?)!dirtyRef\.current \|\| /, "$1");
    expect(scan(blind)).toEqual(["confirmLeave does not ask while dirtyRef is set"]);
  });

  it("whitespace and line breaks inside a prop change no verdict", () => {
    const spread = mutate(real, /\bgo=\{guardedGo\}/, "go =\n  {\n    guardedGo\n  }");
    expect(scan(spread)).toEqual([]);
    const spreadRaw = mutate(real, /\bgo=\{guardedGo\}/, "go =\n  {\n    go\n  }");
    expect(scan(spreadRaw)).toEqual(["EditScreen go is not guardedGo"]);
  });

  it("an extra prop on EditScreen is not a violation", () => {
    expect(scan(mutate(real, /<EditScreen/, "<EditScreen\n              actorId={session.actorId}"))).toEqual([]);
  });
});
