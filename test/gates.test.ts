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
