/**
 * Deterministic pre-flight for `openspec-review-change`. Runs the checks in
 * that skill's checklist that are pure text/structure — no judgment, no
 * codebase semantics — so the reviewing model spends its reasoning budget on
 * the checks that need it instead of re-deriving these by eye.
 *
 * `openspec validate --strict` already catches a missing Scenario and a
 * MODIFIED requirement dropping a scenario its base still has, *when the
 * requirement's header exactly matches a base title*. It does not verify
 * that match exists at all: a reworded MODIFIED header pairs with nothing,
 * gets no scenario check, and archives as a silently added requirement
 * instead of a modified one (confirmed by probing the CLI directly — a
 * one-word rename produces zero errors either way). That gap, and the
 * proposal/tasks/design conventions `openspec validate` knows nothing about,
 * are what this script covers. `openspec validate` output is folded straight
 * into this script's own findings, mapped by its `level` field (ERROR ->
 * Critical, WARNING -> Warning) — including its own SHALL/MUST-wording
 * check, so this script does not duplicate that one.
 *
 * Deliberately not here: scanning artifacts for named file paths and
 * checking they exist on disk. This skill reviews a change before any code
 * exists, so most named paths are ones the change proposes to *create* —
 * checking them against the current tree produces near-total false
 * positives, not signal. That half of claim verification stays manual.
 *
 * Usage: bun run scripts/openspec-review-check.ts <change-name>
 * Exit codes: 0 clean, 1 Critical findings present, 2 usage/environment error.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { extractRequirements, extractBaseTitles, closest } from "./openspec-spec-diff";

type Severity = "Critical" | "Warning" | "Suggestion";

interface Finding {
  severity: Severity;
  artifact: string;
  summary: string;
}

const REPO_ROOT = process.cwd();

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

// --- Capability coverage (proposal.md bullets vs specs/ delta files) ------

function extractCapabilityBullets(proposalText: string): Map<string, "New" | "Modified" | "Removed"> {
  const result = new Map<string, "New" | "Modified" | "Removed">();
  let section: "New" | "Modified" | "Removed" | null = null;
  for (const line of proposalText.split("\n")) {
    const sectionMatch = line.match(/^### (New|Modified|Removed) Capabilities\s*$/);
    if (sectionMatch) { section = sectionMatch[1] as "New" | "Modified" | "Removed"; continue; }
    if (/^#{1,6} /.test(line)) { section = null; continue; }
    if (!section) continue;
    const bulletMatch = line.match(/^- `([a-zA-Z0-9_-]+)`:/);
    if (bulletMatch) result.set(bulletMatch[1], section);
  }
  return result;
}

// --- tasks.md hygiene -----------------------------------------------------

function checkTasks(tasksText: string, findings: Finding[]): void {
  const lines = tasksText.split("\n");
  let blockStart = -1;
  let blockLines: string[] = [];
  const flushBlock = () => {
    if (blockStart === -1) return;
    const text = blockLines.join(" ");
    // "not to investigate" / "without investigating" are a task disclaiming
    // vagueness, not committing it — the pattern this check exists for.
    if (/\b(consider|investigate)\b/i.test(text) && !/\b(not to|without)\s+investigat/i.test(text)) {
      const firstLine = blockLines[0].trim().slice(0, 80);
      findings.push({
        severity: "Warning",
        artifact: `tasks.md:${blockStart}`,
        summary: `task reads "consider"/"investigate" — that belongs in design.md's Open Questions, not a task: "${firstLine}"`,
      });
    }
    blockStart = -1;
    blockLines = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (/^- \[[ x]\]/.test(lines[i])) {
      flushBlock();
      blockStart = i + 1;
      blockLines = [lines[i]];
    } else if (blockStart !== -1 && /^\s+\S/.test(lines[i])) {
      blockLines.push(lines[i]);
    } else if (blockStart !== -1) {
      flushBlock();
    }
  }
  flushBlock();

  const groupHeaders: Array<{ title: string; line: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^## \d+\.\s*(.+)$/);
    if (m) groupHeaders.push({ title: m[1].trim(), line: i + 1 });
  }
  if (groupHeaders.length === 0) {
    findings.push({ severity: "Warning", artifact: "tasks.md", summary: "no numbered `## N. Title` groups found — could not check for a terminal Verification group" });
    return;
  }
  const last = groupHeaders[groupHeaders.length - 1];
  if (!/verification/i.test(last.title)) {
    findings.push({
      severity: "Critical",
      artifact: `tasks.md:${last.line}`,
      summary: `last task group is "${last.title}", not Verification — openspec/config.yaml requires the final group to run typecheck and the full test suite`,
    });
    return;
  }
  const groupBody = lines.slice(last.line).join("\n");
  if (!/typecheck/i.test(groupBody)) {
    findings.push({ severity: "Critical", artifact: `tasks.md:${last.line}`, summary: `Verification group never mentions \`bun run typecheck\`` });
  }
  if (!/bun test/i.test(groupBody)) {
    findings.push({ severity: "Critical", artifact: `tasks.md:${last.line}`, summary: `Verification group never mentions the full \`bun test\` run` });
  }
}

// --- design.md required sections ------------------------------------------

function checkDesign(designText: string, findings: Finding[]): void {
  for (const heading of ["Migration Plan", "Open Questions"]) {
    if (!new RegExp(`^## ${heading}\\s*$`, "m").test(designText)) {
      findings.push({ severity: "Warning", artifact: "design.md", summary: `missing required \`## ${heading}\` section (openspec/config.yaml requires it beyond the base template)` });
    }
  }
}

// --- main -------------------------------------------------------------

async function runOpenspecValidate(name: string, findings: Finding[]): Promise<void> {
  try {
    const proc = Bun.spawn(["openspec", "validate", name, "--strict", "--json"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    if (exitCode !== 0 && !stdout.trim()) {
      findings.push({ severity: "Warning", artifact: "openspec validate", summary: `exited ${exitCode} with no output — run \`openspec validate ${name} --strict\` by hand` });
      return;
    }
    const parsed = JSON.parse(stdout);
    for (const item of parsed.items ?? []) {
      for (const issue of item.issues ?? []) {
        const severity: Severity = issue.level === "ERROR" ? "Critical" : "Warning";
        findings.push({ severity, artifact: `openspec validate: ${issue.path ?? item.id}`, summary: issue.message });
      }
    }
  } catch (err) {
    findings.push({ severity: "Warning", artifact: "openspec validate", summary: `could not run the openspec CLI (${err instanceof Error ? err.message : String(err)}) — run \`openspec validate ${name} --strict\` by hand` });
  }
}

async function main(): Promise<number> {
  const name = process.argv[2];
  if (!name) {
    console.error("usage: bun run scripts/openspec-review-check.ts <change-name>");
    return 2;
  }
  const changeDir = join(REPO_ROOT, "openspec/changes", name);
  if (!existsSync(changeDir)) {
    console.error(`no such change: openspec/changes/${name}`);
    return 2;
  }

  const findings: Finding[] = [];

  await runOpenspecValidate(name, findings);

  const proposalText = readIfExists(join(changeDir, "proposal.md"));
  const designText = readIfExists(join(changeDir, "design.md"));
  const tasksText = readIfExists(join(changeDir, "tasks.md"));

  if (!proposalText) findings.push({ severity: "Critical", artifact: "proposal.md", summary: "missing" });
  if (!designText) findings.push({ severity: "Critical", artifact: "design.md", summary: "missing" });
  if (!tasksText) findings.push({ severity: "Critical", artifact: "tasks.md", summary: "missing" });

  const specsDir = join(changeDir, "specs");
  const capabilitiesOnDisk = existsSync(specsDir)
    ? readdirSync(specsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  if (proposalText) {
    const bullets = extractCapabilityBullets(proposalText);
    for (const [cap, section] of bullets) {
      if (section === "Removed") continue;
      if (!capabilitiesOnDisk.includes(cap)) {
        findings.push({ severity: "Critical", artifact: "proposal.md § Capabilities", summary: `lists \`${cap}\` under ${section} Capabilities, but no \`specs/${cap}/spec.md\` delta file exists` });
      }
    }
    for (const cap of capabilitiesOnDisk) {
      // A capability needing only a small delta is often called out in prose
      // ("`foo` needs a delta...") rather than a Capabilities bullet — that's
      // an established pattern here, not a gap. Only flag a delta file the
      // proposal names nowhere at all.
      if (!bullets.has(cap) && !proposalText.includes(`\`${cap}\``)) {
        findings.push({ severity: "Warning", artifact: `specs/${cap}/spec.md`, summary: `delta file exists, but proposal.md never mentions \`${cap}\` anywhere` });
      }
    }
  }

  for (const cap of capabilitiesOnDisk) {
    const deltaPath = join(specsDir, cap, "spec.md");
    const deltaText = readFileSync(deltaPath, "utf8");
    const deltaLabel = `specs/${cap}/spec.md`;
    const basePath = join(REPO_ROOT, "openspec/specs", cap, "spec.md");
    const baseText = readIfExists(basePath);
    const baseTitles = baseText ? extractBaseTitles(baseText) : null;

    for (const req of extractRequirements(deltaText)) {
      if (baseTitles === null) {
        if (req.kind !== "ADDED") {
          findings.push({ severity: "Critical", artifact: `${deltaLabel}:${req.line}`, summary: `\`${cap}\` has no base spec yet (new capability) — a ${req.kind} requirement makes no sense here; use ADDED` });
        }
        continue;
      }

      const inBase = baseTitles.includes(req.title);
      if (req.kind === "MODIFIED" && !inBase) {
        const hint = closest(req.title, baseTitles);
        findings.push({
          severity: "Critical",
          artifact: `${deltaLabel}:${req.line}`,
          summary: `MODIFIED requirement "${req.title}" does not exactly match any base requirement header — it archives as an added requirement, not a modification${hint ? `. Closest base header: "${hint}"` : ""}`,
        });
      }
      if (req.kind === "ADDED" && inBase) {
        findings.push({ severity: "Critical", artifact: `${deltaLabel}:${req.line}`, summary: `ADDED requirement "${req.title}" already exists verbatim in the base spec — should be MODIFIED, not ADDED` });
      }
      if (req.kind === "REMOVED" && !inBase) {
        const hint = closest(req.title, baseTitles);
        findings.push({
          severity: "Critical",
          artifact: `${deltaLabel}:${req.line}`,
          summary: `REMOVED requirement "${req.title}" does not exactly match any base requirement header — nothing to remove${hint ? `. Closest base header: "${hint}"` : ""}`,
        });
      }
    }
  }

  if (designText) checkDesign(designText, findings);
  if (tasksText) checkTasks(tasksText, findings);

  const order: Severity[] = ["Critical", "Warning", "Suggestion"];
  for (const severity of order) {
    const group = findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    console.log(`\n${severity} (${group.length})`);
    for (const f of group) console.log(`- [${f.artifact}] ${f.summary}`);
  }
  const criticalCount = findings.filter((f) => f.severity === "Critical").length;
  console.log(`\n${criticalCount} Critical, ${findings.filter((f) => f.severity === "Warning").length} Warning, ${findings.filter((f) => f.severity === "Suggestion").length} Suggestion — mechanical checks only, not a substitute for the full read-through.`);
  return criticalCount > 0 ? 1 : 0;
}

process.exit(await main());
