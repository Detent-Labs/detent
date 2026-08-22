/**
 * `openspec-task-status.ts` replaces the by-eye checkbox count
 * `openspec-archive-change` step 3 used to do. Each case plants exactly the
 * shape the script's block-flushing and browser-task regex exist to handle.
 *
 * No database, so no `skipIf`. These run everywhere the suite runs.
 */
import { test, expect, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "../scripts/openspec-task-status.ts");

const temps: string[] = [];

afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

function fixture(tasksText: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), "openspec-task-status-"));
  temps.push(dir);
  const changeDir = join(dir, "openspec/changes/my-change");
  mkdirSync(changeDir, { recursive: true });
  if (tasksText !== null) writeFileSync(join(changeDir, "tasks.md"), tasksText);
  return dir;
}

interface Result {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function run(cwd: string, name = "my-change"): Promise<Result> {
  const proc = Bun.spawn(["bun", "run", SCRIPT, name], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

test("a mix of done/incomplete boxes is counted", async () => {
  const dir = fixture(
    "## 1. Group\n\n- [x] 1.1 Done thing\n- [ ] 1.2 Incomplete thing\n- [ ] 1.3 Another incomplete thing\n",
  );
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(0);
  const json = JSON.parse(stdout);
  expect(json.total).toBe(3);
  expect(json.done).toBe(1);
  expect(json.incomplete).toBe(2);
});

test("a browser-check phrase on a continuation line lands in browserTasks with the checkbox line number", async () => {
  const dir = fixture(
    "## 1. Group\n\n- [ ] 1.1 Verify the change works\n      using playwright-cli against a real browser\n",
  );
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(0);
  const json = JSON.parse(stdout);
  expect(json.browserTasks).toHaveLength(1);
  expect(json.browserTasks[0].line).toBe(3);
  expect(json.browserTasks[0].text).toContain("playwright-cli");
  expect(json.browserTasks[0].text).toContain("Verify the change works");
});

test("a complete task naming 'browser' does not land in browserTasks", async () => {
  const dir = fixture("## 1. Group\n\n- [x] 1.1 Checked in a real browser\n");
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(0);
  const json = JSON.parse(stdout);
  expect(json.browserTasks).toEqual([]);
  expect(json.done).toBe(1);
});

test("no tasks.md file at all reports the all-zero JSON and exits 0", async () => {
  const dir = fixture(null);
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(0);
  expect(JSON.parse(stdout)).toEqual({ total: 0, done: 0, incomplete: 0, browserTasks: [] });
});

test("an unknown change name exits 2", async () => {
  const dir = fixture("## 1. Group\n\n- [ ] 1.1 Thing\n");
  const { exitCode, stdout } = await run(dir, "does-not-exist");
  expect(exitCode).toBe(2);
  expect(stdout).toBe("");
});

test("a tasks.md path that is a directory exits 2", async () => {
  const dir = fixture(null);
  mkdirSync(join(dir, "openspec/changes/my-change/tasks.md"));
  const { exitCode, stdout } = await run(dir);
  expect(exitCode).toBe(2);
  expect(stdout).toBe("");
});
