import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * Every exit from an open, unsaved draft in `root.tsx` asks first.
 *
 * Four kinds of exit leave the draft: in-area navigation (the area nav and
 * `EditScreen`'s `navigate`), the `go` that `EditScreen` receives (the `⋮`
 * menu's groups link), the account menu's three handlers on `Chrome`, and
 * closing the tab. A raw `navigate`, `go` or `onLogout` on any of them brings
 * the defect back with every type check still green.
 *
 * A source test in the idiom `studio-no-confirm.test.ts` uses: no harness in
 * this package can click a control and observe a prompt, so the wiring is
 * guarded at the source. `scan` returns one name per violation. The first test
 * asserts the real file has none. The rest apply one in-memory mutation to the
 * real file and assert the matching violation appears, so each rule is proved
 * to fire.
 *
 * `onUnauthorized` is the opposite rule: a dead session asks nothing, so every
 * screen receives the shell's callback unwrapped. `ProcessSurface` wraps it
 * further down, to stash unsaved work, and asks nothing either.
 */
const ROOT = "src/areas/studio/root.tsx";

/** Every screen element `root.tsx` renders. Each takes `onUnauthorized`. */
const SCREENS = [
  "ProcessesScreen",
  "EditScreen",
  "VersionsScreen",
  "MigrationPlanScreen",
  "ToolsScreen",
  "PlayerScreen",
  "TemplatesScreen",
] as const;

/** The area nav's three buttons, by the route name each one opens. */
const NAV_ROUTES = ["processes", "tools", "templates"] as const;

/** Each guarded wrapper: the guard its body opens with, and the call it then
 * makes. The guard is a literal shape, so a wrapper that asks and ignores the
 * answer fails it. */
const WRAPPERS = [
  { name: "guardedNavigate", guard: /^if \(\w+\.name !== "edit" && !confirmLeave\(\)\) return;/, callee: "navigate" },
  { name: "guardedGo", guard: /^if \(!confirmLeave\(\)\) return;/, callee: "go" },
  { name: "guardedLogout", guard: /^if \(!confirmLeave\(\)\) return;/, callee: "onLogout" },
] as const;

/** Block comments first, then line comments, as `studio-no-confirm.test.ts`
 * strips: a name in a comment is not wiring. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** The text between the brace at `open` and its matching close brace. */
function braced(code: string, open: number): string | undefined {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return code.slice(open + 1, i);
  }
  return undefined;
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

/** The text between the braces of every `prop={...}` in `code`, trimmed. */
function propValues(code: string, prop: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(new RegExp(`\\b${prop}\\s*=\\s*\\{`, "g"))) {
    const value = braced(code, m.index! + m[0].length - 1);
    if (value !== undefined) out.push(value.trim());
  }
  return out;
}

/** The text between the braces of the first `prop={...}`, trimmed. */
function propValue(tag: string, prop: string): string | undefined {
  return propValues(tag, prop)[0];
}

/** True when `value` reaches `guarded` and never the raw `raw`. */
function guardedOnly(value: string | undefined, guarded: string, raw: string): boolean {
  return value !== undefined && new RegExp(`\\b${guarded}\\b`).test(value) && !new RegExp(`\\b${raw}\\b`).test(value);
}

/** The block body of the arrow function bound to `const name`, with runs of
 * whitespace folded to one space and trimmed. */
function arrowBody(code: string, name: string): string | undefined {
  const m = new RegExp(`const\\s+${name}\\s*=[^{]*?=>\\s*\\{`).exec(code);
  if (!m) return undefined;
  return braced(code, m.index + m[0].length - 1)?.replace(/\s+/g, " ").trim();
}

function scan(source: string): string[] {
  const code = stripComments(source);
  const violations: string[] = [];
  const edit = openingTag(code, "EditScreen");
  const chrome = openingTag(code, "Chrome");

  if (edit !== undefined) {
    if (!guardedOnly(propValue(edit, "go"), "guardedGo", "go")) violations.push("EditScreen go is not guardedGo");
    if (!guardedOnly(propValue(edit, "navigate"), "guardedNavigate", "navigate")) violations.push("EditScreen navigate is not guardedNavigate");
  }

  for (const screen of SCREENS) {
    const tag = openingTag(code, screen);
    if (tag === undefined) violations.push(`${screen} element not found`);
    else if (propValue(tag, "onUnauthorized") !== "onUnauthorized") violations.push(`${screen} onUnauthorized is not the raw callback`);
  }

  // The area nav: every button that opens one of the three routes goes
  // through `guardedNavigate`, and at least one such button exists.
  const clicks = propValues(code, "onClick");
  for (const route of NAV_ROUTES) {
    const opening = clicks.filter((v) => new RegExp(`name:\\s*"${route}"`).test(v));
    if (opening.length === 0 || !opening.every((v) => guardedOnly(v, "guardedNavigate", "navigate"))) {
      violations.push(`nav ${route} button bypasses guardedNavigate`);
    }
  }

  if (chrome === undefined) violations.push("Chrome element not found");
  else {
    if (!guardedOnly(propValue(chrome, "onGoToArea"), "guardedGo", "go")) violations.push("Chrome onGoToArea bypasses guardedGo");
    if (!guardedOnly(propValue(chrome, "onGoToProfile"), "guardedGo", "go")) violations.push("Chrome onGoToProfile bypasses guardedGo");
    if (!guardedOnly(propValue(chrome, "onLogout"), "guardedLogout", "onLogout")) violations.push("Chrome onLogout is not guardedLogout");
  }

  // The wrappers must ask and obey the answer, or a guarded name guards nothing.
  if (!/const\s+confirmLeave\s*=\s*\(\)\s*=>\s*!dirtyRef\.current\s*\|\|\s*confirm\s*\(/.test(code)) {
    violations.push("confirmLeave does not ask while dirtyRef is set");
  }
  for (const { name, guard, callee } of WRAPPERS) {
    const body = arrowBody(code, name) ?? "";
    if (!guard.test(body)) violations.push(`${name} skips confirmLeave`);
    // A statement of its own: `callee(` right after a `;`, `{` or `}`.
    if (!new RegExp(`(?:^|[;{}] )${callee}\\(`).test(body)) violations.push(`${name} does not call ${callee}`);
  }

  const added = /\.addEventListener\(\s*["']beforeunload["']\s*,\s*(\w+)\s*\)/.exec(code);
  const removed = /\.removeEventListener\(\s*["']beforeunload["']\s*,\s*(\w+)\s*\)/.exec(code);
  if (!added) violations.push("beforeunload listener is not added");
  if (!removed) violations.push("beforeunload listener is not removed");
  if (added && removed && added[1] !== removed[1]) violations.push("beforeunload add and remove name different handlers");
  // `(?<![!\w.])` refuses a negated read: `!dirtyRef.current` prompts on a
  // clean draft and stays silent on a dirty one.
  if (!/(?<![!\w.])dirtyRef\.current\s*(?:&&\s*|\)\s*\{?\s*)\w+\.preventDefault\s*\(/.test(code)) {
    violations.push("beforeunload handler ignores dirtyRef");
  }

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

  it("a raw navigate on EditScreen is flagged", () => {
    expect(scan(mutate(real, /\bnavigate=\{guardedNavigate\}/, "navigate={navigate}"))).toEqual([
      "EditScreen navigate is not guardedNavigate",
    ]);
  });

  it("a nav button that calls the raw navigate is flagged", () => {
    for (const route of NAV_ROUTES) {
      const raw = mutate(real, new RegExp(`guardedNavigate\\(\\{ name: "${route}" \\}\\)`), `navigate({ name: "${route}" })`);
      expect(scan(raw), route).toEqual([`nav ${route} button bypasses guardedNavigate`]);
    }
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

  it("a wrapped onUnauthorized on any screen is flagged", () => {
    for (const screen of SCREENS) {
      const wrapped = mutate(
        real,
        new RegExp(`(<${screen}(?=[\\s>/])[\\s\\S]*?)onUnauthorized=\\{onUnauthorized\\}`),
        "$1onUnauthorized={() => onUnauthorized()}",
      );
      expect(scan(wrapped), screen).toEqual([`${screen} onUnauthorized is not the raw callback`]);
    }
  });

  it("a missing beforeunload registration is flagged", () => {
    const removed = mutate(real, /window\.addEventListener\(\s*"beforeunload"\s*,\s*\w+\s*\);?/, "");
    expect(scan(removed)).toEqual(["beforeunload listener is not added"]);
  });

  it("a missing beforeunload cleanup is flagged", () => {
    const kept = mutate(real, /window\.removeEventListener\(\s*"beforeunload"\s*,\s*\w+\s*\);?/, "");
    expect(scan(kept)).toEqual(["beforeunload listener is not removed"]);
  });

  it("a cleanup that removes another handler than the one added is flagged", () => {
    const other = mutate(real, /(window\.removeEventListener\(\s*"beforeunload"\s*,\s*)\w+/, "$1otherHandler");
    expect(scan(other)).toEqual(["beforeunload add and remove name different handlers"]);
  });

  it("a beforeunload handler that prompts on a clean draft is flagged", () => {
    const always = mutate(real, /if \(dirtyRef\.current\) (\w+\.preventDefault\(\))/, "$1");
    expect(scan(always)).toEqual(["beforeunload handler ignores dirtyRef"]);
  });

  it("a beforeunload handler that reads dirtyRef negated is flagged", () => {
    const negated = mutate(real, /if \(dirtyRef\.current\) (\w+\.preventDefault\(\))/, "if (!dirtyRef.current) $1");
    expect(scan(negated)).toEqual(["beforeunload handler ignores dirtyRef"]);
  });

  it("a guarded wrapper that skips confirmLeave is flagged", () => {
    for (const { name } of WRAPPERS) {
      const skipped = mutate(real, new RegExp(`(const\\s+${name}\\s*=[^;]*?)\\bconfirmLeave\\(\\)`), "$1true");
      expect(scan(skipped), name).toEqual([`${name} skips confirmLeave`]);
    }
  });

  it("a guarded wrapper that asks and ignores the answer is flagged", () => {
    for (const { name } of WRAPPERS) {
      const ignored = mutate(real, new RegExp(`(const\\s+${name}\\s*=[^;]*?)!confirmLeave\\(\\)\\) return;`), "$1!confirmLeave()) {}");
      expect(scan(ignored), name).toEqual([`${name} skips confirmLeave`]);
    }
  });

  it("a guarded wrapper that never makes its call is flagged", () => {
    for (const { name, callee } of WRAPPERS) {
      const dropped = mutate(real, new RegExp(`(const\\s+${name}\\s*=[\\s\\S]*?return;\\s*)${callee}\\([^;]*;`), "$1");
      expect(scan(dropped), name).toEqual([`${name} does not call ${callee}`]);
    }
  });

  it("a confirmLeave that never reads dirtyRef is flagged", () => {
    const blind = mutate(real, /(const\s+confirmLeave\s*=[^;]*?)!dirtyRef\.current \|\| /, "$1");
    expect(scan(blind)).toEqual(["confirmLeave does not ask while dirtyRef is set"]);
  });

  it("a confirmLeave that reads dirtyRef the wrong way round is flagged", () => {
    const flipped = mutate(real, /(const\s+confirmLeave\s*=[^;]*?)!dirtyRef\.current \|\| /, "$1dirtyRef.current || ");
    expect(scan(flipped)).toEqual(["confirmLeave does not ask while dirtyRef is set"]);
  });

  it("whitespace and line breaks inside a prop change no verdict", () => {
    const spread = mutate(real, /\bgo=\{guardedGo\}/, "go =\n  {\n    guardedGo\n  }");
    expect(scan(spread)).toEqual([]);
    const spreadRaw = mutate(real, /\bgo=\{guardedGo\}/, "go =\n  {\n    go\n  }");
    expect(scan(spreadRaw)).toEqual(["EditScreen go is not guardedGo"]);
  });

  it("an extra prop on EditScreen is not a violation", () => {
    expect(scan(mutate(real, /<EditScreen/, "<EditScreen\n              extra={1}"))).toEqual([]);
  });
});
