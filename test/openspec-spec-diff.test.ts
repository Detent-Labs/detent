/**
 * `openspec-spec-diff.ts`'s CLI entry, exercised the same way
 * `openspec-review-check.test.ts` exercises its own script: fixtures in a
 * temp directory, no database, no `skipIf`.
 */
import { test, expect, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "../scripts/openspec-spec-diff.ts");

const temps: string[] = [];

afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

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
  delta?: string | null;
  base?: string | null;
  noSpecsDir?: boolean;
}

function fixture(overrides: Overrides = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "openspec-spec-diff-"));
  temps.push(dir);
  const changeDir = join(dir, "openspec/changes/my-change");
  if (!overrides.noSpecsDir) {
    mkdirSync(join(changeDir, "specs/cap-a"), { recursive: true });
    if (overrides.delta !== null) {
      writeFileSync(join(changeDir, "specs/cap-a/spec.md"), overrides.delta ?? CLEAN_DELTA);
    }
  } else {
    mkdirSync(changeDir, { recursive: true });
  }
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

test("a MODIFIED requirement whose header matches the base spec prints matched", async () => {
  const dir = fixture();
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("MODIFIED");
  expect(stdout).toContain("(matched)");
  expect(stdout).not.toContain("(unmatched)");
});

test("a MODIFIED requirement whose header does not match any base header prints unmatched with a closest hint", async () => {
  const dir = fixture({ delta: CLEAN_DELTA.replace("Base thing works", "The base thing now works differently") });
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("(unmatched)");
  expect(stdout).toContain('closest: "Base thing works"');
});

test("a capability with no base spec yet prints every delta requirement as ADDED with no match check", async () => {
  const dir = fixture({ base: null });
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("ADDED");
  expect(stdout).not.toContain("(matched)");
  expect(stdout).not.toContain("(unmatched)");
});

test("an unknown change name exits 2", async () => {
  const dir = fixture();
  const { exitCode, stdout } = await run(dir, "does-not-exist");
  expect(exitCode).toBe(2);
  expect(stdout).toBe("");
});

test("a diff reporting an unmatched MODIFIED header still exits 0", async () => {
  const dir = fixture({ delta: CLEAN_DELTA.replace("Base thing works", "Something else entirely") });
  const { exitCode } = await run(dir);
  expect(exitCode).toBe(0);
});

test("a change with no specs directory prints nothing and exits 0", async () => {
  const dir = fixture({ noSpecsDir: true });
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(0);
  expect(stdout).toBe("");
});
