/**
 * `fix-the-frontend-image-build-context`: Docker anchors a `.dockerignore`
 * entry that holds no slash and no `*` to the context root. `node_modules`
 * on its own therefore excludes the root `node_modules` only. `bun install`
 * also writes one into every workspace member, and BuildKit follows the
 * symlinks those directories hold, reaching a target the root-only filter
 * removed:
 *
 *   invalid file request packages/form-ui/node_modules/@types/react
 *
 * `findRootAnchoredRecurringEntries` is the reusable check: given the
 * pattern list and a set of repository-relative paths, it reports every
 * bare entry whose name occurs below the root. No build runs here; this
 * reads pattern text and file names only.
 *
 * What this file does not cover: Docker's actual matching semantics (it
 * assumes `**\/name` matches at every depth, and does not re-verify that),
 * a name with no second copy in the tree this suite runs against, and any
 * development-only path nobody has listed yet.
 */
import { test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const DOCKERIGNORE_PATH = resolve(REPO_ROOT, ".dockerignore");

const REQUIRED_ENTRIES = ["**/node_modules", "**/.git", "**/.env", ".claude", ".worktrees"];

function parsePatterns(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function isBareEntry(pattern: string): boolean {
  return !pattern.includes("/") && !pattern.includes("*");
}

/**
 * Reports every bare (root-anchored) entry in `patterns` whose name also
 * occurs below the root in `observedPaths` — a segment at index > 0. A
 * root-anchored entry never matches such an occurrence, so it reaches the
 * build context unfiltered.
 */
export function findRootAnchoredRecurringEntries(patterns: string[], observedPaths: string[]): string[] {
  const bareNames = new Set(patterns.filter(isBareEntry));
  const violating = new Set<string>();
  for (const path of observedPaths) {
    const segments = path.split("/");
    for (let i = 1; i < segments.length; i++) {
      if (bareNames.has(segments[i])) violating.add(segments[i]);
    }
  }
  return [...violating].sort();
}

/** Whether `pattern` matches `relativePath` under the two shapes this file
 * needs: bare (root only) and `**\/name` (any depth). Anything else does
 * not match, so the walk below keeps exploring rather than silently trust
 * a pattern shape it does not model. */
function patternMatches(pattern: string, relativePath: string): boolean {
  if (pattern.startsWith("**/")) {
    return relativePath.split("/").includes(pattern.slice(3));
  }
  if (isBareEntry(pattern)) {
    return relativePath === pattern;
  }
  return false;
}

/**
 * Walks the working tree from its root, skipping any directory `patterns`
 * already excludes, and returns the relative path of every directory it
 * still reaches. The skip is what keeps this bounded: `.claude` and
 * `.worktrees` are root-anchored bare entries, so the nine sibling agent
 * worktrees under them never get walked into.
 */
function collectDirectoryPaths(patterns: string[]): string[] {
  const observed: string[] = [];
  function walk(relDir: string): void {
    const absDir = relDir === "" ? REPO_ROOT : join(REPO_ROOT, relDir);
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      if (patterns.some((p) => patternMatches(p, rel))) continue;
      observed.push(rel);
      walk(rel);
    }
  }
  walk("");
  return observed;
}

test("the committed pre-fix pattern list fails on a nested node_modules", () => {
  const preFixPatterns = ["node_modules", "**/dist", ".git", ".devcontainer", "docs", "test", "**/test"];
  const violations = findRootAnchoredRecurringEntries(preFixPatterns, [
    "packages/form-ui/node_modules/@types/react",
  ]);
  expect(violations).toEqual(["node_modules"]);
});

test("a new bare entry for a name that recurs is rejected", () => {
  const violations = findRootAnchoredRecurringEntries(["coverage"], ["coverage", "packages/web/coverage"]);
  expect(violations).toEqual(["coverage"]);
});

test("the repaired .dockerignore lists the required recursive and root-only entries", () => {
  const patterns = parsePatterns(readFileSync(DOCKERIGNORE_PATH, "utf8"));
  for (const required of REQUIRED_ENTRIES) {
    expect(patterns).toContain(required);
  }
});

test("the repaired .dockerignore has no bare entry for a name that recurs in this working tree", () => {
  const patterns = parsePatterns(readFileSync(DOCKERIGNORE_PATH, "utf8"));
  const observed = collectDirectoryPaths(patterns);
  expect(findRootAnchoredRecurringEntries(patterns, observed)).toEqual([]);
});
