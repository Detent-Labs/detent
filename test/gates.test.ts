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
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

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

/**
 * `openspec/changes/close-ci-gate-gaps`: the gates that read a pushed range run
 * against a temporary repository each test builds itself. `bun test` runs in the
 * devcontainer, where /workspace is not a usable repository, and a fixture there
 * could not name the commits a range needs.
 *
 * `withRepo` is the shared helper. It makes a repository under the system temp
 * directory, hands the body a `commit` function, and removes the directory
 * afterwards. A commit adds the files it is given, so each commit gets its own
 * tree and its own sha. `origin/main` is a plain ref, set with `update-ref`.
 *
 * The gate scripts are the real ones, run with the temporary repository as the
 * working directory.
 */
const RANGE = resolve(import.meta.dir, "../scripts/gates/range.sh");
const PROSE = resolve(import.meta.dir, "../scripts/gates/prose.sh");
const WHITESPACE = GATE;

// A sha no repository holds, and the hash git gives the empty tree.
const MISSING_SHA = "deadbeef".repeat(5);
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const ZERO_SHA = "0".repeat(40);

/**
 * The environment of a child process without any GIT_* variable. A hook that
 * runs this suite sets GIT_DIR, and it would redirect the temporary repository
 * to the repository that runs the hook.
 */
function envWithoutGit(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !name.startsWith("GIT_")) env[name] = value;
  }
  return { ...env, ...extra };
}

async function run(
  cmd: string[],
  cwd: string,
  stdin = "",
  extraEnv: Record<string, string> = {},
) {
  const proc = Bun.spawn(cmd, {
    cwd,
    env: envWithoutGit(extraEnv),
    stdin: new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

type Repo = {
  dir: string;
  /** Writes the files, commits them and returns the new commit's sha. */
  commit: (files: Record<string, string>) => Promise<string>;
  /** Points refs/remotes/origin/main at the sha. */
  setOriginMain: (sha: string) => Promise<void>;
  /** Runs a gate script in the repository. `stdin` holds the range lines. */
  gate: (
    script: string,
    stdin?: string,
    extraEnv?: Record<string, string>,
  ) => ReturnType<typeof run>;
};

async function withRepo(body: (repo: Repo) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "gate-repo-"));
  const git = async (...args: string[]) => {
    const result = await run(
      ["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
      dir,
    );
    if (result.exitCode !== 0) {
      throw new Error(`git ${args.join(" ")} exited ${result.exitCode}: ${result.stderr}`);
    }
    return result.stdout.trim();
  };
  try {
    await git("init", "-q", "-b", "main");
    await body({
      dir,
      commit: async (files) => {
        for (const [path, text] of Object.entries(files)) {
          await mkdir(dirname(join(dir, path)), { recursive: true });
          await writeFile(join(dir, path), text);
        }
        await git("add", "-A");
        await git("commit", "-q", "-m", "c");
        return git("rev-parse", "HEAD");
      },
      setOriginMain: async (sha) => {
        await git("update-ref", "refs/remotes/origin/main", sha);
      },
      gate: (script, stdin = "", extraEnv = {}) => run(["sh", script], dir, stdin, extraEnv),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** One pre-push line: <local ref> <local sha> <remote ref> <remote sha>. */
function pushLine(localSha: string, remoteSha: string) {
  return `refs/heads/topic ${localSha} refs/heads/topic ${remoteSha}\n`;
}

test("a range git cannot diff stops the whitespace gate", async () => {
  await withRepo(async (repo) => {
    await repo.commit({ "a.txt": "one\n" });
    const range = `${MISSING_SHA}..HEAD`;
    const { exitCode, stdout, stderr } = await repo.gate(WHITESPACE, `${range}\n`);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("pushed-whitespace");
    expect(stderr).toContain(range);
    expect(stderr).toContain("fatal:");
    expect(stdout).not.toContain("nothing to check");
    expect(stdout).not.toContain("changes no text file");
  });
});

test("a range git cannot diff stops the prose gate", async () => {
  await withRepo(async (repo) => {
    await repo.commit({ "a.md": "One short sentence.\n" });
    const range = `${MISSING_SHA}..HEAD`;
    const { exitCode, stdout, stderr } = await repo.gate(PROSE, `${range}\n`);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("changed-markdown-prose");
    expect(stderr).toContain(range);
    expect(stderr).toContain("fatal:");
    expect(stdout).not.toContain("nothing to check");
    expect(stdout).not.toContain("changes no Markdown");
  });
});

test("a valid range with a trailing space still rejects the push", async () => {
  await withRepo(async (repo) => {
    const base = await repo.commit({ "a.txt": "one\n" });
    const tip = await repo.commit({ "b.txt": "trailing \n" });
    const { exitCode, stderr } = await repo.gate(WHITESPACE, `${base}..${tip}\n`);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("pushed-whitespace");
    expect(stderr).toContain("b.txt");
    expect(stderr).toContain("trailing whitespace");
    expect(stderr).not.toContain("git cannot diff");
  });
});

test("a valid clean range passes the whitespace gate", async () => {
  await withRepo(async (repo) => {
    const base = await repo.commit({ "a.txt": "one\n" });
    const tip = await repo.commit({ "b.txt": "two\n" });
    const { exitCode, stderr } = await repo.gate(WHITESPACE, `${base}..${tip}\n`);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
  });
});

test("a valid range with Markdown reaches the prose gate's linter check", async () => {
  await withRepo(async (repo) => {
    const base = await repo.commit({ "a.txt": "one\n" });
    const tip = await repo.commit({ "b.md": "One short sentence.\n" });
    // A linter path that does not exist makes the gate print its named skip
    // after the diff stage, on every machine, with or without the real linter.
    const { exitCode, stdout, stderr } = await repo.gate(PROSE, `${base}..${tip}\n`, {
      ANTISLOP: join(repo.dir, "no-such-linter.py"),
    });

    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("changes no Markdown");
    expect(stderr).toContain("SKIPPED");
  });
});

test("a missing remote sha falls back to the range since main", async () => {
  await withRepo(async (repo) => {
    const main = await repo.commit({ "a.txt": "one\n" });
    await repo.setOriginMain(main);
    await repo.commit({ "b.txt": "two\n" });
    const tip = await repo.commit({ "c.txt": "three\n" });
    const { exitCode, stdout, stderr } = await repo.gate(RANGE, pushLine(tip, MISSING_SHA));

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`${main}..${tip}\n`);
    expect(stderr).toContain(MISSING_SHA);
  });
});

test("a reachable remote sha keeps its own range", async () => {
  await withRepo(async (repo) => {
    const main = await repo.commit({ "a.txt": "one\n" });
    await repo.setOriginMain(main);
    const remote = await repo.commit({ "b.txt": "two\n" });
    const tip = await repo.commit({ "c.txt": "three\n" });
    const { exitCode, stdout, stderr } = await repo.gate(RANGE, pushLine(tip, remote));

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`${remote}..${tip}\n`);
    expect(stderr).toBe("");
  });
});

test("a new branch still gets the range since main", async () => {
  await withRepo(async (repo) => {
    const main = await repo.commit({ "a.txt": "one\n" });
    await repo.setOriginMain(main);
    const tip = await repo.commit({ "b.txt": "two\n" });
    const { stdout } = await repo.gate(RANGE, pushLine(tip, ZERO_SHA));

    expect(stdout).toBe(`${main}..${tip}\n`);
  });
});

test("a missing remote sha in a clone without origin/main falls to the empty tree", async () => {
  await withRepo(async (repo) => {
    const tip = await repo.commit({ "a.txt": "one\n" });
    const { exitCode, stdout, stderr } = await repo.gate(RANGE, pushLine(tip, MISSING_SHA));

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`${EMPTY_TREE}..${tip}\n`);
    expect(stderr).toContain(MISSING_SHA);
  });
});

test("a fallback range inside main leaves the gates with nothing to check", async () => {
  await withRepo(async (repo) => {
    const inside = await repo.commit({ "a.txt": "one\n" });
    const main = await repo.commit({ "b.txt": "two\n" });
    await repo.setOriginMain(main);

    const ranges = await repo.gate(RANGE, pushLine(inside, MISSING_SHA));
    expect(ranges.exitCode).toBe(0);
    expect(ranges.stdout).toBe(`${inside}..${inside}\n`);

    const whitespace = await repo.gate(WHITESPACE, ranges.stdout);
    expect(whitespace.exitCode).toBe(0);
    expect(whitespace.stdout).toContain("nothing to check");

    const prose = await repo.gate(PROSE, ranges.stdout);
    expect(prose.exitCode).toBe(0);
    expect(prose.stdout).toContain("nothing to check");
  });
});
