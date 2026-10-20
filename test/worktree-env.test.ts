/**
 * `worktree-isolation`: each checkout derives its own pod name and host ports
 * from `scripts/worktree-env.sh`, and `scripts/dev-pod.sh spec` turns them
 * into the Pod spec the bring-up plays. Both run in the shape
 * `test/enable-hooks.test.ts` already uses — a temporary repository, plus a
 * linked worktree via `git worktree add`.
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
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "../scripts/worktree-env.sh");
const POD_SCRIPT = resolve(import.meta.dir, "../scripts/dev-pod.sh");

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

type Vars = { DEV_POD: string; PORT_APP: string; PORT_VITE: string; PORT_MAILPIT: string };

async function sourceEnv(cwd: string): Promise<Vars> {
  const proc = Bun.spawn(["sh", "-c", `. "${SCRIPT}" && printf 'DEV_POD=%s\\nPORT_APP=%s\\nPORT_VITE=%s\\nPORT_MAILPIT=%s\\n' "$DEV_POD" "$PORT_APP" "$PORT_VITE" "$PORT_MAILPIT"`], {
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
  expect(vars.DEV_POD).toBe("workflow-engine");
  expect(vars.PORT_APP).toBe("3100");
  expect(vars.PORT_VITE).toBe("5173");
  expect(vars.PORT_MAILPIT).toBe("8025");
});

test("a subdirectory of a main checkout keeps that same identity", async () => {
  const main = await mainRepo();
  const sub = join(main, "src", "deep");
  await Bun.write(join(sub, ".keep"), "");
  const vars = await sourceEnv(sub);
  expect(vars.DEV_POD).toBe("workflow-engine");
  expect(vars.PORT_APP).toBe("3100");
});

test("a linked worktree derives an identity distinct from main's", async () => {
  const main = await mainRepo();
  const linked = await linkedWorktree(main, "linked", "linked-branch");
  const vars = await sourceEnv(linked);
  expect(vars.DEV_POD).not.toBe("workflow-engine");
  expect(vars.PORT_APP).not.toBe("3100");
  expect(vars.DEV_POD.startsWith("detent-")).toBe(true);
});

test("a worktree directory name carrying capitals derives a lowercase pod name", async () => {
  const main = await mainRepo();
  const linked = await linkedWorktree(main, "CapitalWorktree", "capital-branch");
  const vars = await sourceEnv(linked);
  expect(vars.DEV_POD).toBe(vars.DEV_POD.toLowerCase());
  expect(vars.DEV_POD).not.toMatch(/[A-Z]/);
});

test("no repository answers: the script exports the established identity and the caller keeps running", async () => {
  const dir = tempDir();
  const vars = await sourceEnv(dir);
  expect(vars.DEV_POD).toBe("workflow-engine");
  expect(vars.PORT_APP).toBe("3100");
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

test("two worktrees sharing a directory basename under different parents derive different pod names", async () => {
  const mainA = await mainRepo();
  const mainB = await mainRepo();
  const linkedA = await linkedWorktree(mainA, "shared-name", "branch-a");
  const linkedB = await linkedWorktree(mainB, "shared-name", "branch-b");
  const varsA = await sourceEnv(linkedA);
  const varsB = await sourceEnv(linkedB);
  expect(varsA.DEV_POD).not.toBe(varsB.DEV_POD);
});

/** `sh scripts/dev-pod.sh spec` run in `cwd`: the raw text and its parse. */
async function podSpec(cwd: string): Promise<{ text: string; pod: any; stderr: string }> {
  const proc = Bun.spawn(["sh", POD_SCRIPT, "spec"], { cwd, env: { ...process.env }, stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  const text = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  if (exitCode !== 0) throw new Error(`dev-pod.sh spec in ${cwd} failed: ${stderr}`);
  return { text, pod: Bun.YAML.parse(text), stderr };
}

function container(pod: any, name: string): any {
  const found = pod.spec.containers.find((c: any) => c.name === name);
  if (!found) throw new Error(`the spec declares no ${name} container`);
  return found;
}

function envValue(c: any, name: string): string | undefined {
  return c.env?.find((e: any) => e.name === name)?.value;
}

function hostPorts(pod: any): any[] {
  return pod.spec.containers.flatMap((c: any) => c.ports ?? []);
}

test("the main checkout's spec names the pod workflow-engine", async () => {
  const main = await mainRepo();
  const { pod } = await podSpec(main);
  expect(pod.kind).toBe("Pod");
  expect(pod.metadata.name).toBe("workflow-engine");
  expect(pod.spec.containers.map((c: any) => c.name).sort()).toEqual(["app", "db", "mailpit"]);
});

test("generating the spec writes nothing to stderr (a backtick in a heredoc comment would run as a command)", async () => {
  const main = await mainRepo();
  const { stderr } = await podSpec(main);
  expect(stderr).toBe("");
});

test("the spec carries the derived PORT_VITE, and CORS_ALLOWED_ORIGINS carries both localhost forms", async () => {
  const main = await mainRepo();
  const vars = await sourceEnv(main);
  const app = container((await podSpec(main)).pod, "app");
  expect(envValue(app, "PORT_VITE")).toBe(vars.PORT_VITE);
  expect(envValue(app, "CORS_ALLOWED_ORIGINS")).toBe(`http://localhost:${vars.PORT_VITE},http://127.0.0.1:${vars.PORT_VITE}`);
});

/**
 * `track-latest-postgres`: PGDATA left `/var/lib/postgresql/data` at
 * postgres:18, and the image declares the parent `/var/lib/postgresql` as its
 * volume instead. A mount on the old path stops the container: the entrypoint
 * detects it and exits 1 with "in 18+, these Docker images are configured to
 * store database data in a ... (unused mount/volume)". Measured on 18.6
 * against an empty volume and against one written by 16; the 16 data survives
 * intact in the volume, unread, while the stack refuses to come up.
 *
 * So a revert here takes the devcontainer down rather than losing data. These
 * asserts catch it before that, since bring-up is manual.
 */
test("the db container mounts the pgdata claim at the parent of PGDATA, so a major bump keeps its data", async () => {
  const main = await mainRepo();
  const { pod, text } = await podSpec(main);
  const db = container(pod, "db");
  expect(db.volumeMounts).toEqual([{ name: "pgdata", mountPath: "/var/lib/postgresql" }]);
  const claim = pod.spec.volumes.find((v: any) => v.name === "pgdata");
  expect(claim.persistentVolumeClaim.claimName).toBe("workflow-engine-pgdata");
  expect(text).not.toContain("/var/lib/postgresql/data");
});

test("the db container tracks the latest PostgreSQL release", async () => {
  const main = await mainRepo();
  const db = container((await podSpec(main)).pod, "db");
  expect(db.image).toBe("docker.io/library/postgres:latest");
});

test("every image names its registry host", async () => {
  const main = await mainRepo();
  const { pod } = await podSpec(main);
  for (const c of pod.spec.containers) {
    const firstSegment = c.image.split("/")[0];
    expect(c.image.includes("/") && (firstSegment === "localhost" || firstSegment.includes("."))).toBe(true);
  }
});

test("the db container passes its server flags as args, so the entrypoint still runs initdb", async () => {
  const main = await mainRepo();
  const db = container((await podSpec(main)).pod, "db");
  expect(db.command).toBeUndefined();
  expect(db.args).toEqual(["postgres", "-c", "log_timezone=Europe/Zurich", "-c", "timezone=Europe/Zurich"]);
});

test("every published port binds 127.0.0.1", async () => {
  const main = await mainRepo();
  const ports = hostPorts((await podSpec(main)).pod);
  expect(ports.length).toBe(3);
  for (const p of ports) {
    expect(p.hostPort).toBeDefined();
    expect(p.hostIP).toBe("127.0.0.1");
  }
});

test("no SMTP, Postgres or webhook sink port is published", async () => {
  const main = await mainRepo();
  const { pod } = await podSpec(main);
  const published = hostPorts(pod).map((p: any) => p.containerPort);
  for (const internal of [1025, 5432, 8080]) expect(published).not.toContain(internal);
  expect(container(pod, "db").ports).toBeUndefined();
});

/**
 * The app container shares the pod's loopback address with the database, and
 * initdb trusts 127.0.0.1 by default. Without scram on host lines any
 * password authenticates, and the privileges suite's retired-password test
 * fails on a fresh volume.
 */
test("the db container's initdb requires a password over TCP", async () => {
  const main = await mainRepo();
  const db = container((await podSpec(main)).pod, "db");
  expect(envValue(db, "POSTGRES_INITDB_ARGS")).toBe("--auth-host=scram-sha-256");
});

test("the db probe connects over TCP to the loopback address", async () => {
  const main = await mainRepo();
  const db = container((await podSpec(main)).pod, "db");
  const cmd: string[] = db.livenessProbe.exec.command;
  expect(cmd[0]).toBe("pg_isready");
  expect(cmd[cmd.indexOf("-h") + 1]).toBe("127.0.0.1");
});

test("a linked worktree's spec carries that worktree's pod name, ports, path and CORS origins", async () => {
  const main = await mainRepo();
  const linked = await linkedWorktree(main, "linked", "linked-branch");
  const vars = await sourceEnv(linked);
  const toplevel = await git(linked, "rev-parse", "--show-toplevel");
  const { pod } = await podSpec(linked);
  expect(vars.DEV_POD).not.toBe("workflow-engine");
  expect(pod.metadata.name).toBe(vars.DEV_POD);
  expect(container(pod, "app").image).toBe(`localhost/${vars.DEV_POD}-app:latest`);
  const byContainerPort = Object.fromEntries(hostPorts(pod).map((p: any) => [p.containerPort, String(p.hostPort)]));
  expect(byContainerPort).toEqual({ 3000: vars.PORT_APP, 5173: vars.PORT_VITE, 8025: vars.PORT_MAILPIT });
  expect(pod.spec.volumes.find((v: any) => v.name === "workspace").hostPath.path).toBe(toplevel);
  expect(pod.spec.volumes.find((v: any) => v.name === "pgdata").persistentVolumeClaim.claimName).toBe(`${vars.DEV_POD}-pgdata`);
  const app = container(pod, "app");
  expect(envValue(app, "PORT_VITE")).toBe(vars.PORT_VITE);
  expect(envValue(app, "CORS_ALLOWED_ORIGINS")).toBe(`http://localhost:${vars.PORT_VITE},http://127.0.0.1:${vars.PORT_VITE}`);
});

test("a worktree path holding a space, a colon, a hash, a quote and a backslash reads back exactly", async () => {
  const main = await mainRepo();
  const linked = await linkedWorktree(main, 'odd path #1: "q" \\b', "odd-branch");
  const toplevel = await git(linked, "rev-parse", "--show-toplevel");
  expect(toplevel).toContain(" ");
  const { pod } = await podSpec(linked);
  expect(pod.spec.volumes.find((v: any) => v.name === "workspace").hostPath.path).toBe(toplevel);
});
