/**
 * `openspec-review-check.ts` fills gaps `openspec validate --strict` leaves
 * silent — confirmed by hand: a reworded MODIFIED requirement header pairs
 * with nothing in the base spec and `--strict` reports zero issues for it.
 * Each case below plants exactly the fault the corresponding check exists
 * for, so a regression in the check's own logic (not the openspec CLI's)
 * fails loudly instead of quietly stopping catching what it used to catch.
 *
 * No database, so no `skipIf`. These run everywhere the suite runs.
 *
 * Assertions look only at findings from this script's own checks (header
 * pairing, capability coverage, design.md, tasks.md), never at whatever
 * `openspec validate` itself reports — the fixtures live outside any real
 * openspec root, and whether the `openspec` binary is even on PATH differs
 * between the host and the devcontainer.
 */
import { test, expect, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "../scripts/openspec-review-check.ts");

const temps: string[] = [];

afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

const CLEAN_PROPOSAL = `## Why
test

## What Changes
test

## Capabilities

### Modified Capabilities

- \`cap-a\`: does a thing

## Impact
none
`;

const CLEAN_DESIGN = `## Context
c

## Migration Plan
m

## Open Questions
q
`;

const CLEAN_TASKS = `## 1. Verification

- [ ] 1.1 Run \`bun run typecheck\` and the full \`bun test\` suite
`;

const CLEAN_DELTA = `## MODIFIED Requirements

### Requirement: Base thing works

The thing SHALL work.

#### Scenario: it works

- **WHEN** x
- **THEN** y
`;

const BASE_SPEC = `## Purpose
p

## Requirements

### Requirement: Base thing works

The thing SHALL work.

#### Scenario: it works

- **WHEN** x
- **THEN** y
`;

interface Overrides {
  proposal?: string;
  design?: string;
  tasks?: string;
  delta?: string;
  base?: string | null;
}

function fixture(overrides: Overrides = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "openspec-review-check-"));
  temps.push(dir);
  const changeDir = join(dir, "openspec/changes/my-change");
  mkdirSync(join(changeDir, "specs/cap-a"), { recursive: true });
  writeFileSync(join(dir, "openspec/config.yaml"), "schema: spec-driven\n");
  writeFileSync(join(changeDir, "proposal.md"), overrides.proposal ?? CLEAN_PROPOSAL);
  writeFileSync(join(changeDir, "design.md"), overrides.design ?? CLEAN_DESIGN);
  writeFileSync(join(changeDir, "tasks.md"), overrides.tasks ?? CLEAN_TASKS);
  writeFileSync(join(changeDir, "specs/cap-a/spec.md"), overrides.delta ?? CLEAN_DELTA);
  if (overrides.base !== null) {
    mkdirSync(join(dir, "openspec/specs/cap-a"), { recursive: true });
    writeFileSync(join(dir, "openspec/specs/cap-a/spec.md"), overrides.base ?? BASE_SPEC);
  }
  return dir;
}

interface Result {
  exitCode: number;
  stdout: string;
}

async function run(cwd: string, name = "my-change"): Promise<Result> {
  const proc = Bun.spawn(["bun", "run", SCRIPT, name], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { exitCode, stdout };
}

// Parses the printed report into per-severity line lists, dropping any
// "openspec validate:" line — that check's own verdict depends on whether
// the `openspec` binary is on PATH in this environment, which the CI
// devcontainer and this repo's host disagree on.
function ownFindings(stdout: string): Record<"Critical" | "Warning" | "Suggestion", string[]> {
  const sections: Record<"Critical" | "Warning" | "Suggestion", string[]> = { Critical: [], Warning: [], Suggestion: [] };
  let current: keyof typeof sections | null = null;
  for (const line of stdout.split("\n")) {
    const header = line.match(/^(Critical|Warning|Suggestion) \(\d+\)$/);
    if (header) { current = header[1] as keyof typeof sections; continue; }
    if (current && line.startsWith("- [") && !line.includes("[openspec validate")) sections[current].push(line);
  }
  return sections;
}

test("a clean change reports nothing and exits 0", async () => {
  const dir = fixture();
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(0);
  expect(ownFindings(stdout).Critical).toEqual([]);
});

test("a reworded MODIFIED header does not pair with the base requirement", async () => {
  const dir = fixture({
    delta: CLEAN_DELTA.replace("Base thing works", "The base thing now works differently"),
  });
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("does not exactly match any base requirement header");
  expect(stdout).toContain("Closest base header");
});

test("an ADDED requirement duplicating a base title is flagged", async () => {
  const dir = fixture({ delta: CLEAN_DELTA.replace("MODIFIED Requirements", "ADDED Requirements") });
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("already exists verbatim in the base spec");
});

test("a REMOVED requirement absent from the base spec is flagged", async () => {
  const dir = fixture({
    delta: CLEAN_DELTA.replace("MODIFIED Requirements", "REMOVED Requirements").replace(
      "Base thing works",
      "A requirement that was never there",
    ),
  });
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("nothing to remove");
});

test("a MODIFIED requirement in a brand-new capability is flagged", async () => {
  const dir = fixture({ base: null });
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("has no base spec yet");
});

test("a capability the proposal lists with no delta file is Critical", async () => {
  const dir = fixture({
    proposal: CLEAN_PROPOSAL + "\n" + CLEAN_PROPOSAL.replace("cap-a", "cap-b").replace(
      "### Modified Capabilities",
      "### New Capabilities",
    ),
  });
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("no `specs/cap-b/spec.md` delta file exists");
});

test("a delta file the proposal never mentions is a Warning", async () => {
  const dir = fixture({ proposal: CLEAN_PROPOSAL.replace("cap-a", "cap-unrelated") });
  const { stdout } = await run(dir);
  expect(stdout).toContain("never mentions `cap-a` anywhere");
});

test("a prose mention outside a Capabilities bullet still counts as listed", async () => {
  const dir = fixture({ proposal: CLEAN_PROPOSAL.replace("- `cap-a`: does a thing", "") + "\n`cap-a` needs a delta too.\n" });
  const { stdout } = await run(dir);
  expect(stdout).not.toContain("never mentions `cap-a`");
});

test("design.md missing Migration Plan and Open Questions is a Warning", async () => {
  const dir = fixture({ design: "## Context\nc\n" });
  const { exitCode, stdout } = await run(dir);
  expect(ownFindings(stdout).Critical).toEqual([]);
  expect(stdout).toContain("missing required `## Migration Plan`");
  expect(stdout).toContain("missing required `## Open Questions`");
  expect(exitCode).toBe(0);
});

test("a task reading 'investigate' as its own instruction is a Warning", async () => {
  const dir = fixture({
    tasks: CLEAN_TASKS + "- [ ] 1.2 Investigate whether this is even needed\n",
  });
  const { stdout } = await run(dir);
  expect(stdout).toContain('task reads "consider"/"investigate"');
});

test("a task disclaiming 'not to investigate' is not flagged", async () => {
  const dir = fixture({
    tasks: CLEAN_TASKS + "- [ ] 1.2 Read the file to confirm, not to investigate\n",
  });
  const { stdout } = await run(dir);
  expect(stdout).not.toContain('task reads "consider"/"investigate"');
});

test("a last task group that is not Verification is Critical", async () => {
  const dir = fixture({ tasks: "## 1. Build the thing\n\n- [ ] 1.1 Do it\n" });
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(1);
  expect(stdout).toContain('last task group is "Build the thing", not Verification');
});

test("a Verification group missing typecheck or bun test is Critical", async () => {
  const dir = fixture({ tasks: "## 1. Verification\n\n- [ ] 1.1 Run the suite\n" });
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("never mentions `bun run typecheck`");
  expect(stdout).toContain("never mentions the full `bun test` run");
});

test("an unknown change name exits 2", async () => {
  const dir = fixture();
  const { exitCode, stdout } = await run(dir, "does-not-exist");
  expect(exitCode).toBe(2);
  expect(stdout).toBe("");
});
