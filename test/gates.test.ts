/**
 * `openspec/changes/whitespace-gate-reports-empty-range`: the whitespace gate
 * reads its ranges on stdin, and an empty list left it nothing to check. It
 * exited 0 without a word, so a contributor following the documented
 * `< /dev/null` call read a green that proved nothing. That happened twice
 * here, each time independently.
 *
 * The case below drives the script the way the defect appeared: empty stdin,
 * stdout read back. Asserting on the shell source instead would pass while the
 * script misbehaves.
 *
 * No git, on purpose. The gate returns before its `git ls-files` probe on this
 * path, and `bun test` runs in the devcontainer, where /workspace is not a
 * usable repository — a linked worktree's `.git` is a file pointing outside the
 * mount.
 *
 * No database either, so no `skipIf`. This runs everywhere the suite runs.
 */
import { test, expect } from "bun:test";
import { resolve } from "node:path";

const GATE = resolve(import.meta.dir, "../scripts/gates/whitespace.sh");

test("the whitespace gate reports an empty range instead of passing in silence", async () => {
  const proc = Bun.spawn(["sh", GATE], {
    stdin: new Blob([""]),
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();

  expect(exitCode).toBe(0);
  expect(stdout).toContain("pushed-whitespace");
  expect(stdout).toContain("nothing to check");
});

/**
 * `openspec/changes/rtk-gated-test-runner`: the runner executes the command it
 * receives, prints the output, and applies the no-silent-green check to it. The
 * cases pass a fake `sh -c` command, so no rtk, no database and no git take part.
 */
const RUNNER = resolve(import.meta.dir, "../scripts/test-gated.sh");

async function runRunner(script: string) {
  const proc = Bun.spawn(["sh", RUNNER, "sh", "-c", script], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout, stderr };
}

test("the runner passes a green run that names its database", async () => {
  const { exitCode, stdout } = await runRunner("echo '[test] database: x'; exit 0");
  expect(exitCode).toBe(0);
  expect(stdout).toContain("[test] database: x");
});

test("the runner rejects a run without a database although no test failed", async () => {
  const { exitCode, stdout, stderr } = await runRunner("echo '[test] DATABASE_URL unset'; exit 0");
  expect(exitCode).not.toBe(0);
  expect(stdout).toContain("[test] DATABASE_URL unset");
  expect(stderr).toContain("no-silent-green");
});

test("the runner keeps the command's own exit code on a red run", async () => {
  const { exitCode } = await runRunner("echo '[test] database: x'; exit 3");
  expect(exitCode).toBe(3);
});
