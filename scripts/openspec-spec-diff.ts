/**
 * Shared requirement-matching helpers, extracted from
 * `openspec-review-check.ts` so `openspec-archive-change`'s step 4 reaches
 * the same verdict on a MODIFIED/REMOVED header instead of re-deriving it
 * by eye. See that script's own header comment for why the match matters:
 * a reworded MODIFIED header pairs with nothing and archives as a silent
 * add.
 *
 * Also a standalone CLI: `bun run scripts/openspec-spec-diff.ts <change-name>`
 * prints each delta spec's requirements as ADDED/MODIFIED/REMOVED, each
 * marked `(matched)` or `(unmatched)` against the base spec, with a
 * `closest` hint on an unmatched MODIFIED or REMOVED entry.
 *
 * Exit codes: 0 on every successful run (a non-match is data, not a
 * failure); 2 on a missing or unknown change name.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();

function normalizeHeading(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

export interface RequirementEntry {
  kind: "ADDED" | "MODIFIED" | "REMOVED";
  title: string;
  line: number;
}

/**
 * A `## RENAMED Requirements` block declares a header change as a
 * `- FROM:` / `- TO:` pair, each naming a full `### Requirement:` header.
 * The MODIFIED section beneath it then carries the TO header, which the
 * base spec does not hold yet — matching it there pairs with nothing and
 * reads as a critical the rename block already answers. So a TO header is
 * folded back onto its FROM header, the one the base still carries and
 * the one a MODIFIED or REMOVED entry has to pair with.
 */
function extractRenames(specText: string): Map<string, string> {
  const renames = new Map<string, string>();
  let inBlock = false;
  let from: string | null = null;
  for (const line of specText.split("\n")) {
    if (/^## RENAMED Requirements\s*$/.test(line)) { inBlock = true; from = null; continue; }
    if (/^## /.test(line)) { inBlock = false; continue; }
    if (!inBlock) continue;
    const fromMatch = line.match(/^-\s*FROM:\s*`?### Requirement: (.+?)`?\s*$/);
    if (fromMatch) { from = normalizeHeading(fromMatch[1]); continue; }
    const toMatch = line.match(/^-\s*TO:\s*`?### Requirement: (.+?)`?\s*$/);
    if (toMatch && from) { renames.set(normalizeHeading(toMatch[1]), from); from = null; }
  }
  return renames;
}

export function extractRequirements(specText: string): RequirementEntry[] {
  const entries: RequirementEntry[] = [];
  const renames = extractRenames(specText);
  let kind: RequirementEntry["kind"] | null = null;
  const lines = specText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kindMatch = lines[i].match(/^## (ADDED|MODIFIED|REMOVED) Requirements\s*$/);
    if (kindMatch) { kind = kindMatch[1] as RequirementEntry["kind"]; continue; }
    if (/^## /.test(lines[i]) && !kindMatch) kind = null;
    const reqMatch = lines[i].match(/^### Requirement: (.+)$/);
    if (reqMatch && kind) {
      const title = normalizeHeading(reqMatch[1]);
      entries.push({ kind, title: renames.get(title) ?? title, line: i + 1 });
    }
  }
  return entries;
}

export function extractBaseTitles(specText: string): string[] {
  const titles: string[] = [];
  for (const line of specText.split("\n")) {
    const m = line.match(/^### Requirement: (.+)$/);
    if (m) titles.push(normalizeHeading(m[1]));
  }
  return titles;
}

export function closest(title: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(title, c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

async function main(name: string): Promise<number> {
  if (!name) {
    console.error("usage: bun run scripts/openspec-spec-diff.ts <change-name>");
    return 2;
  }
  const changeDir = join(REPO_ROOT, "openspec/changes", name);
  if (!existsSync(changeDir)) {
    console.error(`no such change: openspec/changes/${name}`);
    return 2;
  }

  const specsDir = join(changeDir, "specs");
  const capabilities = existsSync(specsDir)
    ? readdirSync(specsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  for (const cap of capabilities) {
    const deltaPath = join(specsDir, cap, "spec.md");
    if (!existsSync(deltaPath)) continue;
    const deltaText = readFileSync(deltaPath, "utf8");
    const deltaLabel = `specs/${cap}/spec.md`;
    const basePath = join(REPO_ROOT, "openspec/specs", cap, "spec.md");
    const baseText = readIfExists(basePath);
    const baseTitles = baseText ? extractBaseTitles(baseText) : null;

    for (const req of extractRequirements(deltaText)) {
      if (baseTitles === null) {
        console.log(`${deltaLabel}:${req.line} ADDED "${req.title}"`);
        continue;
      }
      const inBase = baseTitles.includes(req.title);
      if (inBase) {
        console.log(`${deltaLabel}:${req.line} ${req.kind} "${req.title}" (matched)`);
      } else {
        const hint = closest(req.title, baseTitles);
        console.log(`${deltaLabel}:${req.line} ${req.kind} "${req.title}" (unmatched)${hint ? ` closest: "${hint}"` : ""}`);
      }
    }
  }

  return 0;
}

if (import.meta.main) {
  process.exit(await main(process.argv[2]));
}
