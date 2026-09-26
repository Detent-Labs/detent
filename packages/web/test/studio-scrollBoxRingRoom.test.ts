/**
 * A scroll box clips a focus ring at its own padding edge
 * (`studio-focus-ring-clipping`). Nothing in the type system or the build
 * stops someone from deleting the `focus.reach` padding a box carries today
 * and shipping a box that clips again. This test is that guard, the way
 * `stylex-shorthand.test.ts` guards the shorthand ban: it scans source for
 * every `stylex.create` style under the studio area that sets `overflow`,
 * `overflowX` or `overflowY` to `"auto"` or `"scroll"`, and fails unless
 * that same style object reads `focus.reach` in both a padding key and a
 * scroll-padding key — directly, or inside a `max(…)`.
 *
 * `EXEMPT` names the boxes that carry no such key on purpose, each with a
 * one-line reason checked against the source below, not asserted on trust.
 *
 * What it cannot see: whether the ring actually clears the box in a real
 * layout. The harness mounts no DOM, resolves no custom property and lays
 * out nothing. `docs/browser-checks.md` carries that half, per
 * `development-toolchain`'s split rule.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

const STUDIO = new URL("../src/areas/studio/", import.meta.url).pathname;

/**
 * The boxes that carry no `focus.reach` key on purpose. Each key is
 * `<path from packages/>:<style object name>`, exactly as the violation
 * list below reports a hit, so a stale entry (a renamed file or style) is
 * easy to spot by eye.
 */
const EXEMPT: Record<string, string> = {
  "packages/web/src/areas/studio/panels/FieldMatrixGrid.tsx:matrixScroll":
    "its grid cells draw their own focus ring inset at -2px (matrixCell's :focus-visible), so the box itself needs no gap",
  "packages/web/src/areas/studio/panels/ChangeList.tsx:developerBox":
    "its raw JSON entries (RawEntry) render plain text with no focusable element, so no ring can ever clip there",
  "packages/web/src/areas/studio/panels/ProcessTabRow.tsx:row":
    "its own scrollTabIntoRow keeps 32px clear of each edge (scrollPaddingInline: space.s8), more than the ring's 4px reach, so the row needs no scrollPadding: focus.reach; its padding: focus.reach already covers the static ring room",
};

const OVERFLOW_AUTO = /\b(?:overflow|overflowX|overflowY)\s*:\s*"(?:auto|scroll)"/;

/** Matches a `paddingXxx` key (never a `scrollPaddingXxx` one: JS is
 * case-sensitive, and `scrollPadding` has a capital `P`) whose value reads
 * `focus.reach`, directly or inside a `max(…)`, on the same source line —
 * every property in this codebase sits on its own line. Stopping at the
 * next comma instead would break on `max(a, b)`'s own internal comma. */
const PADDING_READS_REACH = /\bpadding[A-Za-z]*\s*:\s*[^\n]*?focus\.reach/;

/** Matches a `scrollPaddingXxx` (or bare `scrollPadding`) key the same way. */
const SCROLL_PADDING_READS_REACH = /\bscrollPadding[A-Za-z]*\s*:\s*[^\n]*?focus\.reach/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const modules = walk(STUDIO).filter((f) => /\.tsx?$/.test(f));

/** Blanks out every comment's characters but keeps its length and its line
 * breaks, so a brace mentioned in prose cannot desync the depth count below,
 * and a reported line number still matches the original file. */
function stripComments(source: string): string {
  return source
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * Every top-level style object inside every `stylex.create({ … })` call in
 * `source`: `{ key, body, line }`, `body` comment-stripped and `line` its
 * 1-based start line. A brace inside a `${…}` template expression always
 * opens and closes in the same balanced pair, so counting every `{`/`}`
 * character (comments already blanked) tracks depth correctly with no need
 * to parse strings at all.
 */
function styleObjects(source: string): { key: string; body: string; line: number }[] {
  const code = stripComments(source);
  const out: { key: string; body: string; line: number }[] = [];
  let searchFrom = 0;
  while (true) {
    const callIdx = code.indexOf("stylex.create(", searchFrom);
    if (callIdx === -1) break;
    const braceIdx = code.indexOf("{", callIdx);
    if (braceIdx === -1) break;
    let depth = 1;
    let keyStart = -1;
    let keyName = "";
    let i = braceIdx + 1;
    for (; i < code.length && depth > 0; i++) {
      const ch = code[i];
      if (ch === "{") {
        depth++;
        if (depth === 2 && keyStart === -1) {
          const before = code.slice(0, i);
          const m = /([A-Za-z_$][\w$]*)\s*:\s*$/.exec(before);
          if (m) {
            keyName = m[1] ?? "";
            keyStart = m.index;
          }
        }
      } else if (ch === "}") {
        if (depth === 2 && keyStart !== -1) {
          out.push({
            key: keyName,
            body: code.slice(keyStart, i + 1),
            line: source.slice(0, keyStart).split("\n").length,
          });
          keyStart = -1;
          keyName = "";
        }
        depth--;
      }
    }
    searchFrom = Math.max(i, callIdx + 1);
  }
  return out;
}

/** Every scan hit that neither satisfies the requirement nor is exempt, as
 * `<path>:<key> (line N)`. Empty means the requirement holds everywhere. */
function violations(files: string[]): string[] {
  return files.flatMap((file) => {
    const rel = file.slice(file.indexOf("packages/"));
    const source = readFileSync(file, "utf8");
    return styleObjects(source)
      .filter((o) => OVERFLOW_AUTO.test(o.body))
      .filter((o) => !(`${rel}:${o.key}` in EXEMPT))
      .filter((o) => !(PADDING_READS_REACH.test(o.body) && SCROLL_PADDING_READS_REACH.test(o.body)))
      .map((o) => `${rel}:${o.key} (line ${o.line})`);
  });
}

describe("studio scroll boxes leave room for the focus ring", () => {
  it("finds modules to check, so an empty walk cannot pass", () => {
    // A broken path would return no files and report no hit, which reads as
    // a pass. The count is the guard on the guard.
    expect(modules.length).toBeGreaterThan(20);
  });

  it("finds more than a handful of overflow: auto/scroll style objects, so an empty scan cannot pass either", () => {
    const total = modules.reduce((n, file) => n + styleObjects(readFileSync(file, "utf8")).filter((o) => OVERFLOW_AUTO.test(o.body)).length, 0);
    expect(total).toBeGreaterThan(10);
  });

  it("every overflow: auto/scroll style reads focus.reach in a padding key and a scroll-padding key, or is named exempt", () => {
    // The message carries every hit, so one run names every site to fix
    // rather than one per run.
    expect(violations(modules)).toEqual([]);
  });

  it("catches a style object that drops the padding", () => {
    // Mutation cover: without this, a scanner that silently matched nothing
    // would still pass the assertion above.
    const fixture = `
const styles = stylex.create({
  broken: {
    overflowY: "auto",
    padding: space.s3,
  },
  fine: {
    overflowY: "auto",
    padding: \`max(\${space.s3}, \${focus.reach})\`,
    scrollPadding: focus.reach,
  },
});
`;
    const hits = styleObjects(fixture)
      .filter((o) => OVERFLOW_AUTO.test(o.body))
      .filter((o) => !(PADDING_READS_REACH.test(o.body) && SCROLL_PADDING_READS_REACH.test(o.body)))
      .map((o) => o.key);
    expect(hits).toEqual(["broken"]);
  });

  it("exempts only a box that would otherwise fail, and only one still in the tree", () => {
    for (const [relKey, reason] of Object.entries(EXEMPT)) {
      expect(reason.length).toBeGreaterThan(0);
      const lastColon = relKey.lastIndexOf(":");
      const rel = relKey.slice(0, lastColon);
      const key = relKey.slice(lastColon + 1);
      const file = modules.find((f) => f.slice(f.indexOf("packages/")) === rel);
      expect(file).toBeDefined();
      const obj = file ? styleObjects(readFileSync(file, "utf8")).find((o) => o.key === key) : undefined;
      expect(obj).toBeDefined();
      expect(obj && OVERFLOW_AUTO.test(obj.body)).toBe(true);
      // A box exempted for no reason would already pass on its own, which
      // is the "do not exempt a box just to pass" mistake this catches.
      expect(obj && PADDING_READS_REACH.test(obj.body) && SCROLL_PADDING_READS_REACH.test(obj.body)).toBe(false);
    }
  });
});
