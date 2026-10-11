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
 * `openspec/changes/close-ci-gate-gaps`: the silent-green gate reads a run's
 * whole summary and holds two floors. The fake runs below print what `bun test`
 * prints at the end of a run, so the gate reads a summary it can add up.
 *
 * `summary` builds that block. A zero skip or todo count prints no line, as in
 * bun. `total` overrides the number on the `Ran` line, for a run whose counts
 * do not add up.
 */
const SILENT_GREEN = resolve(import.meta.dir, "../scripts/gates/silent-green.sh");
const DB_LINE = "[test] database: x";

/** The last bare integer of a floor file, which is how the gate reads it. */
async function floorOf(file: string): Promise<number> {
  const text = await Bun.file(resolve(import.meta.dir, "../scripts/gates", file)).text();
  const integers = text.split("\n").filter((line) => /^[0-9]+$/.test(line));
  return Number(integers[integers.length - 1]);
}

function summary(counts: {
  pass: number;
  skip?: number;
  todo?: number;
  fail?: number;
  total?: number;
}): string {
  const { pass, skip = 0, todo = 0, fail = 0 } = counts;
  const total = counts.total ?? pass + skip + todo + fail;
  const lines = [` ${pass} pass`];
  if (skip > 0) lines.push(` ${skip} skip`);
  if (todo > 0) lines.push(` ${todo} todo`);
  lines.push(` ${fail} fail`, ` ${pass} expect() calls`);
  lines.push(`Ran ${total} ${total === 1 ? "test" : "tests"} across 1 file. [41.30s]`);
  return lines.join("\n") + "\n";
}

/** A shell command that prints `text` and exits with `exitCode`. */
function fakeRun(text: string, exitCode = 0): string {
  const quoted = text
    .trimEnd()
    .split("\n")
    .map((line) => `'${line}'`)
    .join(" ");
  return `printf '%s\\n' ${quoted}; exit ${exitCode}`;
}

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
  const pass = await floorOf("pass-floor.txt");
  const { exitCode, stdout } = await runRunner(fakeRun(`${DB_LINE}\n${summary({ pass })}`));
  expect(exitCode).toBe(0);
  expect(stdout).toContain(DB_LINE);
});

test("the runner rejects a run without a database although no test failed", async () => {
  const pass = await floorOf("pass-floor.txt");
  const { exitCode, stdout, stderr } = await runRunner(
    fakeRun(`[test] DATABASE_URL unset\n${summary({ pass })}`),
  );
  expect(exitCode).not.toBe(0);
  expect(stdout).toContain("[test] DATABASE_URL unset");
  expect(stderr).toContain("no-silent-green");
  expect(stderr).toContain("DATABASE_URL unset");
});

test("the runner keeps the command's own exit code on a red run", async () => {
  const pass = await floorOf("pass-floor.txt");
  const { exitCode } = await runRunner(fakeRun(`${DB_LINE}\n${summary({ pass, fail: 1 })}`, 3));
  expect(exitCode).toBe(3);
});

test("the runner keeps the command's own exit code when the gate also rejects", async () => {
  // A crashed command prints no summary, so the gate rejects the run as well.
  // The command's code still wins: 3 here, 132 for a crashed Bun.
  const { exitCode, stderr } = await runRunner(fakeRun(DB_LINE, 3));
  expect(exitCode).toBe(3);
  expect(stderr).toContain("no-silent-green");
  expect(stderr).toContain("cannot read");
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
const MACHINE_PATHS = resolve(import.meta.dir, "../scripts/gates/machine-paths.sh");

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

/**
 * The silent-green gate reads a captured run from a file. `silentGreen` writes
 * the text into a temporary directory and runs the real gate on it. No git and
 * no database take part, so the cases run everywhere the suite runs.
 *
 * Each case starts from the run that sits exactly on both floors and changes one
 * thing. The green run is the control for all of them.
 */
async function silentGreen(text: string) {
  const dir = await mkdtemp(join(tmpdir(), "gate-run-"));
  try {
    const file = join(dir, "run.txt");
    await writeFile(file, text);
    return await run(["sh", SILENT_GREEN, file], dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function floors() {
  return { skip: await floorOf("skip-floor.txt"), pass: await floorOf("pass-floor.txt") };
}

// The second summary is what `bun run test:tz` prints after `bun test`.
const TZ_SUMMARY = summary({ pass: 20 });

test("a green run on both floors passes the silent-green gate", async () => {
  const floor = await floors();
  const { exitCode, stderr } = await silentGreen(
    `${DB_LINE}\n${summary({ pass: floor.pass, skip: floor.skip })}${TZ_SUMMARY}`,
  );

  expect(exitCode).toBe(0);
  expect(stderr).toBe("");
});

test("a todo test counts as a skip at the skip floor", async () => {
  const floor = await floors();
  const text = `${DB_LINE}\n${summary({ pass: floor.pass, skip: floor.skip, todo: 1 })}${TZ_SUMMARY}`;
  const { exitCode, stderr } = await silentGreen(text);

  expect(exitCode).toBe(1);
  expect(stderr).toContain("no-silent-green");
  expect(stderr).toContain(`skipped ${floor.skip + 1} tests`);
  expect(stderr).toContain(`${floor.skip} skip and 1 todo`);
  expect(stderr).toContain(`floor is ${floor.skip}`);
});

test("a todo test within the skip floor still passes", async () => {
  // Control for the case above: todo joins the sum, it is not banned.
  const floor = await floors();
  const text = `${DB_LINE}\n${summary({ pass: floor.pass, todo: floor.skip })}${TZ_SUMMARY}`;
  const { exitCode, stderr } = await silentGreen(text);

  expect(exitCode).toBe(0);
  expect(stderr).toBe("");
});

test("a run with no pass line is a summary the gate cannot read", async () => {
  // One skip, no pass line, and a Ran line that matches the counts, so the pass
  // line is the only fault. The skip count sits at the floor and reads fine.
  const text = summary({ pass: 0, skip: 1 }).replace(" 0 pass\n", "");
  const { exitCode, stderr } = await silentGreen(`${DB_LINE}\n${text}`);

  expect(exitCode).toBe(1);
  expect(stderr).toContain("no-silent-green");
  expect(stderr).toContain("cannot read");
  expect(stderr).toContain("no 'N pass' line");
});

test("a run with no Ran line is a summary the gate cannot read", async () => {
  const floor = await floors();
  const text = summary({ pass: floor.pass, skip: floor.skip }).replace(/^Ran .*\n/m, "");
  const { exitCode, stderr } = await silentGreen(`${DB_LINE}\n${text}`);

  expect(exitCode).toBe(1);
  expect(stderr).toContain("no-silent-green");
  expect(stderr).toContain("cannot read");
  expect(stderr).toContain("Ran N tests");
});

test("a renamed skip line breaks the sum and the gate rejects it", async () => {
  // Two tests skipped under a line the gate does not know. Read alone, the run
  // shows zero skips and passes the floor. The Ran line still counts them.
  const floor = await floors();
  const text = summary({ pass: floor.pass, skip: 2 }).replace(" 2 skip\n", " 2 skipped\n");
  const { exitCode, stderr } = await silentGreen(`${DB_LINE}\n${text}`);

  expect(exitCode).toBe(1);
  expect(stderr).toContain("cannot read");
  expect(stderr).toContain(`add up to ${floor.pass}`);
  expect(stderr).toContain(`says ${floor.pass + 2} tests`);
});

test("count lines after the last Ran line are a summary the gate cannot read", async () => {
  // The first summary is whole. The second lost its Ran line, so nothing adds
  // its counts up.
  const floor = await floors();
  const second = summary({ pass: 20, skip: 5 }).replace(/^Ran .*\n/m, "");
  const text = `${DB_LINE}\n${summary({ pass: floor.pass, skip: floor.skip })}${second}`;
  const { exitCode, stderr } = await silentGreen(text);

  expect(exitCode).toBe(1);
  expect(stderr).toContain("cannot read");
  expect(stderr).toContain("last 'Ran' line");
});

test("a run that passes fewer tests than the pass floor is rejected", async () => {
  const floor = await floors();
  const text = `${DB_LINE}\n${summary({ pass: floor.pass - 1, skip: floor.skip })}${TZ_SUMMARY}`;
  const { exitCode, stderr } = await silentGreen(text);

  expect(exitCode).toBe(1);
  expect(stderr).toContain("no-silent-green");
  expect(stderr).toContain(`passed ${floor.pass - 1} tests`);
  expect(stderr).toContain(`pass floor is ${floor.pass}`);
});

test("the pass floor reads the largest pass count of the run", async () => {
  // The small test:tz summary comes first here. A gate that read the last
  // summary alone would see 20 passes.
  const floor = await floors();
  const text = `${DB_LINE}\n${TZ_SUMMARY}${summary({ pass: floor.pass, skip: floor.skip })}`;
  const { exitCode, stderr } = await silentGreen(text);

  expect(exitCode).toBe(0);
  expect(stderr).toBe("");
});

/**
 * `openspec/changes/close-ci-gate-gaps`: the home-path gate runs `git grep` over
 * every tracked file, this one included. A literal home-directory path in the
 * code below would fail the gate on this repository, so each fixture path is
 * joined from parts at run time. The cases that must pass are built the same
 * way where a literal could match.
 *
 * Each case commits one file to a temporary repository and runs the gate there.
 * A finding names the rule and the file with its line number. The gate prints
 * the matched line through `echo`, which some shells give backslash escapes, so
 * the cases do not assert on the line text.
 */
const USER = "alice";
const DOC = "docs/setup.md";

type GateResult = Awaited<ReturnType<typeof run>>;

async function scanPaths(
  files: Record<string, string>,
  check: (result: GateResult) => void,
): Promise<void> {
  await withRepo(async (repo) => {
    await repo.commit(files);
    check(await repo.gate(MACHINE_PATHS));
  });
}

function expectFinding(result: GateResult, file = DOC) {
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("no-machine-paths");
  expect(result.stderr).toContain(`${file}:1:`);
}

function expectNoFinding(result: GateResult) {
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("");
}

const REJECTED_SPELLINGS: Array<[name: string, path: string]> = [
  ["a Git Bash path", ["", "c", "Users", USER, "work"].join("/")],
  ["a macOS path", ["", "Users", USER, "work"].join("/")],
  ["a lowercase drive path", ["C:", "users", USER, "work"].join("/")],
  // Each backslash doubled, as a JSON string holds a Windows path.
  ["a JSON-escaped Windows path", ["C:", "Users", USER, "work"].join("\\\\")],
  // Positive controls: forms the pattern matched before the widening.
  ["a single-backslash drive path (control)", ["C:", "Users", USER, "work"].join("\\")],
  ["a Linux home path (control)", ["", "home", USER, "work"].join("/")],
];

for (const [name, path] of REJECTED_SPELLINGS) {
  test(`the home-path gate rejects ${name}`, async () => {
    await scanPaths({ [DOC]: `cd ${path}\n` }, (result) => expectFinding(result));
  });
}

test("the home-path gate rejects a macOS path that opens a line", async () => {
  // The `^` branch of the macOS expression: no character stands before the slash.
  const path = ["", "Users", USER, "work"].join("/");
  await scanPaths({ [DOC]: `${path}\n` }, (result) => expectFinding(result));
});

test("the home-path gate rejects a machine path beside a container path", async () => {
  // Control: the denylist neutralizes the container path alone, not the line.
  const container = ["", "home", "node", ".claude"].join("/");
  const machine = ["", "home", USER, "src"].join("/");
  await scanPaths({ [DOC]: `mount ${container} and work in ${machine}\n` }, (result) =>
    expectFinding(result),
  );
});

test("the home-path gate passes a container path", async () => {
  const container = ["", "home", "node", ".claude"].join("/");
  await scanPaths({ ".devcontainer/devcontainer.json": `"target": "${container}"\n` }, expectNoFinding);
});

test("the home-path gate passes the audit record's regex text for the macOS form", async () => {
  // The line as audit-record/reports/G.md:101 holds it. The macOS expression
  // needs a name character after `Users/`, and the record has `[` there.
  const line =
    "- Suggestion: Extend the pattern with `/[a-zA-Z]/[Uu]sers/[^/]+`, " +
    "`(^|[^A-Za-z])/Users/[^/]+` and `[\\\\]{1,2}[Uu]sers[\\\\]{1,2}`. Ignore case.";
  await scanPaths({ "reports/G.md": `${line}\n` }, expectNoFinding);
});

test("the home-path gate passes a lowercase users route", async () => {
  // Lowercase /users/ names a route. Only the drive forms ignore case.
  await scanPaths({ "docs/api.md": 'router.get("/users/me", handler);\n' }, expectNoFinding);
});

test("the home-path gate passes a relative Users directory", async () => {
  // A name character or a dot before the slash makes the path relative.
  const text = ["packages", "web", "src", "Users", "List.tsx"].join("/") + "\n" +
    ["..", "Users", "List"].join("/") + "\n";
  await scanPaths({ "docs/layout.md": text }, expectNoFinding);
});

test("the home-path gate reads tracked files only", async () => {
  // Control: the spec lets an untracked file carry a machine path.
  const path = ["", "Users", USER, "work"].join("/");
  await withRepo(async (repo) => {
    await repo.commit({ "README.md": "clean\n" });
    await writeFile(join(repo.dir, "local-notes.md"), `cd ${path}\n`);
    expectNoFinding(await repo.gate(MACHINE_PATHS));
  });
});
