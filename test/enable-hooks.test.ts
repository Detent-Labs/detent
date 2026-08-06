/**
 * `openspec/changes/document-deployment-and-self-enable-the-hook`: the root
 * `prepare` script runs `scripts/enable-hooks.sh`, so a clone gains the push
 * gate from its first `bun install` instead of from a contributor typing
 * `git config core.hooksPath .githooks` (the 2026-08-01 review's TEST-1).
 *
 * Three shapes matter, and each has a case below.
 *
 * A directory holding no repository is the violating input: it is what
 * `docker/engine.Dockerfile` installs from, since `.dockerignore` excludes
 * `.git`. The script must exit 0 there, or the production image stops
 * building.
 *
 * A linked worktree is the shape a `[ -d .git ]` guard gets wrong. There
 * `.git` is a FILE holding a `gitdir:` pointer, so the directory test answers
 * false inside a real repository — and this repository does most of its work
 * in worktrees.
 *
 * No database, so no `skipIf`. These run everywhere the suite runs.
 */
import { test, expect, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "../scripts/enable-hooks.sh");

const temps: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "enable-hooks-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  // A worktree's administrative files live under the main repo's .git, so
  // removing the directory alone would leave a registration behind. Each case
  // that makes one prunes it before this runs.
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

async function run(cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["sh", SCRIPT], { cwd, env: { ...process.env }, stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  return { exitCode, stdout: await new Response(proc.stdout).text(), stderr: await new Response(proc.stderr).text() };
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd, env: { ...process.env }, stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  if (exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${await new Response(proc.stderr).text()}`);
  return stdout.trim();
}

test("a repository gains core.hooksPath", async () => {
  const dir = tempDir();
  await git(dir, "init", "--quiet");

  const { exitCode, stdout } = await run(dir);

  expect(exitCode).toBe(0);
  expect(await git(dir, "config", "--get", "core.hooksPath")).toBe(".githooks");
  expect(stdout).toContain(".githooks");
});

test("a directory holding no repository exits 0 and sets nothing", async () => {
  const dir = tempDir();

  const { exitCode, stdout } = await run(dir);

  expect(exitCode).toBe(0);
  expect(existsSync(join(dir, ".git"))).toBe(false);
  expect(stdout).toContain("no git repository");
});

test("a linked worktree gains core.hooksPath, where .git is a file", async () => {
  const main = tempDir();
  await git(main, "init", "--quiet");
  await git(main, "config", "user.email", "test@example.test");
  await git(main, "config", "user.name", "test");
  await Bun.write(join(main, "seed.txt"), "seed\n");
  await git(main, "add", "seed.txt");
  await git(main, "commit", "--quiet", "-m", "seed", "--no-verify");

  const linked = join(main, "linked");
  await git(main, "worktree", "add", "--quiet", linked, "-b", "linked-branch");

  // The premise this case exists for: a directory test would answer false here.
  expect(Bun.file(join(linked, ".git")).size).toBeGreaterThan(0);

  const { exitCode } = await run(linked);

  expect(exitCode).toBe(0);
  // A worktree writes core.hooksPath to the shared config, which is what a
  // contributor wants: one setting covers every worktree of the clone.
  expect(await git(linked, "config", "--get", "core.hooksPath")).toBe(".githooks");
});

const KEEPALIVE_CMD = "ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=30";

test("a repository with no core.sshCommand gains the keepalive", async () => {
  const dir = tempDir();
  await git(dir, "init", "--quiet");

  const { exitCode, stdout } = await run(dir);

  expect(exitCode).toBe(0);
  expect(await git(dir, "config", "--get", "core.sshCommand")).toBe(KEEPALIVE_CMD);
  expect(stdout).toContain(KEEPALIVE_CMD);
});

test("a foreign core.sshCommand survives the run", async () => {
  const dir = tempDir();
  await git(dir, "init", "--quiet");
  await git(dir, "config", "core.sshCommand", "ssh -i /tmp/other_key");

  const { exitCode, stdout } = await run(dir);

  expect(exitCode).toBe(0);
  expect(await git(dir, "config", "--get", "core.sshCommand")).toBe("ssh -i /tmp/other_key");
  expect(stdout).toContain("GIT_SSH_COMMAND");
});

test("GIT_SSH in the environment keeps the script out", async () => {
  const dir = tempDir();
  await git(dir, "init", "--quiet");

  const proc = Bun.spawn(["sh", SCRIPT], {
    cwd: dir,
    env: { ...process.env, GIT_SSH: "plink" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();

  expect(exitCode).toBe(0);
  await expect(git(dir, "config", "--get", "core.sshCommand")).rejects.toThrow();
  expect(stdout).toContain("GIT_SSH_COMMAND");
});

test("a second run writes nothing new", async () => {
  const dir = tempDir();
  await git(dir, "init", "--quiet");

  await run(dir);
  const { exitCode, stdout } = await run(dir);

  expect(exitCode).toBe(0);
  expect(await git(dir, "config", "--get", "core.sshCommand")).toBe(KEEPALIVE_CMD);
  expect(stdout).toContain("already carries the push keepalive");
});
