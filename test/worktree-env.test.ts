/**
 * `openspec/changes/per-worktree-devcontainer-stacks`: each checkout derives
 * its own Compose project name and host ports from
 * `scripts/worktree-env.sh`, in the shape `test/enable-hooks.test.ts` already
 * uses — a temporary repository, plus a linked worktree via `git worktree
 * add`.
 *
 * The real checkout this suite runs from cannot stand in for either shape.
 * Inside the devcontainer, `.git` may point at a host path the container
 * cannot resolve, so exercising the real checkout here would only ever hit
 * the fallback branch. Every scenario below builds its own repository
 * instead.
 *
 * No database, so no `skipIf`. These run everywhere the suite runs.
 */
import { test, expect, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "../scripts/worktree-env.sh");
const COMPOSE_FILE = resolve(import.meta.dir, "../.devcontainer/docker-compose.yml");

const temps: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "worktree-env-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  // A worktree's administrative files live under the main repo's .git, so
  // removing the directory alone would leave a registration behind. Each
  // case that makes one prunes it before this runs.
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

type Vars = { COMPOSE_PROJECT_NAME: string; PORT_APP: string; PORT_VITE: string; PORT_MAILPIT: string };

async function sourceEnv(cwd: string): Promise<Vars> {
  const proc = Bun.spawn(["sh", "-c", `. "${SCRIPT}" && printf 'COMPOSE_PROJECT_NAME=%s\\nPORT_APP=%s\\nPORT_VITE=%s\\nPORT_MAILPIT=%s\\n' "$COMPOSE_PROJECT_NAME" "$PORT_APP" "$PORT_VITE" "$PORT_MAILPIT"`], {
    cwd,
    env: { ...process.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  if (exitCode !== 0) throw new Error(`sourcing worktree-env.sh in ${cwd} failed: ${await new Response(proc.stderr).text()}`);
  const vars: Record<string, string> = {};
  for (const line of stdout.trim().split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    vars[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return vars as unknown as Vars;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd, env: { ...process.env }, stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  if (exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${await new Response(proc.stderr).text()}`);
  return stdout.trim();
}

async function mainRepo(): Promise<string> {
  const dir = tempDir();
  await git(dir, "init", "--quiet");
  await git(dir, "config", "user.email", "test@example.test");
  await git(dir, "config", "user.name", "test");
  await Bun.write(join(dir, "seed.txt"), "seed\n");
  await git(dir, "add", "seed.txt");
  await git(dir, "commit", "--quiet", "-m", "seed", "--no-verify");
  return dir;
}

async function linkedWorktree(main: string, dirName: string, branch: string): Promise<string> {
  const linked = join(main, dirName);
  await git(main, "worktree", "add", "--quiet", linked, "-b", branch);
  return linked;
}

test("a main checkout keeps the established identity", async () => {
  const main = await mainRepo();
  const vars = await sourceEnv(main);
  expect(vars.COMPOSE_PROJECT_NAME).toBe("workflow-engine");
  expect(vars.PORT_APP).toBe("3000");
  expect(vars.PORT_VITE).toBe("5173");
  expect(vars.PORT_MAILPIT).toBe("8025");
});

test("a subdirectory of a main checkout keeps that same identity", async () => {
  const main = await mainRepo();
  const sub = join(main, "src", "deep");
  await Bun.write(join(sub, ".keep"), "");
  const vars = await sourceEnv(sub);
  expect(vars.COMPOSE_PROJECT_NAME).toBe("workflow-engine");
  expect(vars.PORT_APP).toBe("3000");
});

test("a linked worktree derives an identity distinct from main's", async () => {
  const main = await mainRepo();
  const linked = await linkedWorktree(main, "linked", "linked-branch");
  const vars = await sourceEnv(linked);
  expect(vars.COMPOSE_PROJECT_NAME).not.toBe("workflow-engine");
  expect(vars.PORT_APP).not.toBe("3000");
  expect(vars.COMPOSE_PROJECT_NAME.startsWith("detent-")).toBe(true);
});

test("a worktree directory name carrying capitals derives a lowercase project name", async () => {
  const main = await mainRepo();
  const linked = await linkedWorktree(main, "CapitalWorktree", "capital-branch");
  const vars = await sourceEnv(linked);
  expect(vars.COMPOSE_PROJECT_NAME).toBe(vars.COMPOSE_PROJECT_NAME.toLowerCase());
  expect(vars.COMPOSE_PROJECT_NAME).not.toMatch(/[A-Z]/);
});

test("no repository answers: the script exports the established identity and the caller keeps running", async () => {
  const dir = tempDir();
  const vars = await sourceEnv(dir);
  expect(vars.COMPOSE_PROJECT_NAME).toBe("workflow-engine");
  expect(vars.PORT_APP).toBe("3000");
});

test("the derivation holds across a recreate: two sourcing runs agree", async () => {
  const main = await mainRepo();
  const linked = await linkedWorktree(main, "linked", "linked-branch");
  const first = await sourceEnv(linked);
  const second = await sourceEnv(linked);
  expect(second).toEqual(first);
});

test("two worktrees the derivation maps to different offsets get different port sets", async () => {
  const main = await mainRepo();
  let a: Vars | undefined;
  let b: Vars | undefined;
  // Two hundred buckets, so a handful of deterministically named worktrees
  // is enough to find a differing pair — see worktree-env.sh's own
  // ponytail comment on the collision ceiling this loop works around.
  for (let i = 0; a === undefined || b === undefined || a.PORT_APP === b.PORT_APP; i++) {
    if (i > 20) throw new Error("could not find two worktrees with differing offsets in 20 tries");
    a = await sourceEnv(await linkedWorktree(main, `wt-a-${i}`, `branch-a-${i}`));
    b = await sourceEnv(await linkedWorktree(main, `wt-b-${i}`, `branch-b-${i}`));
  }
  expect(a!.PORT_APP).not.toBe(b!.PORT_APP);
  expect(a!.PORT_VITE).not.toBe(b!.PORT_VITE);
  expect(a!.PORT_MAILPIT).not.toBe(b!.PORT_MAILPIT);
});

test("two worktrees sharing a directory basename under different parents derive different project names", async () => {
  const mainA = await mainRepo();
  const mainB = await mainRepo();
  const linkedA = await linkedWorktree(mainA, "shared-name", "branch-a");
  const linkedB = await linkedWorktree(mainB, "shared-name", "branch-b");
  const varsA = await sourceEnv(linkedA);
  const varsB = await sourceEnv(linkedB);
  expect(varsA.COMPOSE_PROJECT_NAME).not.toBe(varsB.COMPOSE_PROJECT_NAME);
});

test("the established COMPOSE_PROJECT_NAME matches docker-compose.yml's name: attribute", async () => {
  const main = await mainRepo();
  const vars = await sourceEnv(main);
  const compose = readFileSync(COMPOSE_FILE, "utf8");
  const match = compose.match(/^name:\s*(\S+)\s*$/m);
  expect(match?.[1]).toBe(vars.COMPOSE_PROJECT_NAME);
});

test("the established PORT_VITE matches docker-compose.yml's PORT_VITE default, and CORS_ALLOWED_ORIGINS carries both localhost forms", async () => {
  const main = await mainRepo();
  const vars = await sourceEnv(main);
  const compose = readFileSync(COMPOSE_FILE, "utf8");
  expect(compose).toContain(`PORT_VITE: \${PORT_VITE:-${vars.PORT_VITE}}`);
  expect(compose).toContain(`http://localhost:\${PORT_VITE`);
  expect(compose).toContain(`http://127.0.0.1:\${PORT_VITE`);
});
