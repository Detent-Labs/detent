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

// Control: passes on the old scripts. It pairs with the trailing-space case above.
test("a valid clean range passes the whitespace gate", async () => {
  await withRepo(async (repo) => {
    const base = await repo.commit({ "a.txt": "one\n" });
    const tip = await repo.commit({ "b.txt": "two\n" });
    const { exitCode, stderr } = await repo.gate(WHITESPACE, `${base}..${tip}\n`);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
  });
});

// Control: passes on the old scripts.
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

// Control for the mutation run: a spec scenario that passes on the old scripts.
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

// Control: passes on the old scripts.
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

// Control: passes on the old gate, which has no pass floor.
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
 * A finding names the rule and the file with its line number. Most cases assert
 * on that alone. One case also asserts on the printed line text, because `echo`
 * gives backslash escapes to some shells and garbled the backslash forms.
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

test("the home-path gate prints a backslash path as written and lists every finding", async () => {
  // `\cache` is an escape that stops `echo` under dash, the shell of the
  // devcontainer and of CI. Printed through `echo`, the first finding would end
  // the output and hide the second. The gate prints through `printf` instead.
  const backslashPath = ["C:", "Users", USER, "cache", "x"].join("\\");
  const otherPath = ["", "home", USER, "work"].join("/");
  const files = {
    "docs/a-backslash.md": `cd ${backslashPath}\n`,
    "docs/b-other.md": `cd ${otherPath}\n`,
  };
  await scanPaths(files, (result) => {
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("docs/a-backslash.md:1:");
    expect(result.stderr).toContain(backslashPath);
    expect(result.stderr).toContain("docs/b-other.md:1:");
    expect(result.stderr).toContain(otherPath);
  });
});

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
  const file = ".devcontainer/devcontainer.json";
  await scanPaths({ [file]: `"target": "${container}"\n` }, expectNoFinding);
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
  const lines = [
    ["packages", "web", "src", "Users", "List.tsx"].join("/"),
    ["..", "Users", "List"].join("/"),
  ];
  await scanPaths({ "docs/layout.md": lines.join("\n") + "\n" }, expectNoFinding);
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

/**
 * `openspec/changes/close-ci-gate-gaps`: the hosted workflow and the Dependabot
 * file are data a test can read. `workflowProblems` and `dependabotProblems`
 * return one message per broken rule, so the real files return an empty list
 * and each rejecting fixture returns the message of the rule it breaks.
 *
 * `Bun.YAML.parse` drops comments, so the sha pins and their release comments
 * come from the raw text in a second pass. That pass also counts the `uses`
 * lines against the parse, so a line the pattern cannot see fails the count
 * instead of passing unread.
 */
const WORKFLOW = resolve(import.meta.dir, "../.github/workflows/check.yml");
const DEPENDABOT = resolve(import.meta.dir, "../.github/dependabot.yml");

type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown> };
type Job = { permissions?: unknown; steps?: Step[] };
type Workflow = { permissions?: unknown; jobs?: Record<string, Job> };
type Update = { "package-ecosystem"?: string; directory?: string };
type Dependabot = { updates: Update[] };

const READ_ONLY = JSON.stringify({ contents: "read" });
const BUN_DIRECTORIES = ["/", "/packages/form-ui", "/packages/web"];

function workflowProblems(workflow: Workflow, raw: string): string[] {
  const problems: string[] = [];
  if (JSON.stringify(workflow.permissions) !== READ_ONLY) {
    problems.push("top-level permissions must be exactly contents: read");
  }

  let parsedUses = 0;
  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    if (job.permissions !== undefined && JSON.stringify(job.permissions) !== READ_ONLY) {
      problems.push(`job ${jobName} sets permissions beyond contents: read`);
    }
    for (const step of job.steps ?? []) {
      const label = `${jobName}: ${step.name ?? step.uses?.split("@")[0]}`;
      if (step.uses !== undefined) parsedUses++;
      const keepsToken = step.with?.["persist-credentials"] !== false;
      if (step.uses?.startsWith("actions/checkout@") && keepsToken) {
        problems.push(`${label} must set persist-credentials: false`);
      }
      const run = step.run ?? "";
      if (/\bbun install\b/.test(run) && !run.includes("--frozen-lockfile")) {
        problems.push(`${label} runs bun install without --frozen-lockfile`);
      }
    }
  }

  // The gate is the check job's first install, so it must precede both steps
  // that read the lockfile or the install it leaves behind.
  const steps = workflow.jobs?.check?.steps ?? [];
  const indexOf = (name: string) => steps.findIndex((step) => step.name === name);
  const gate = indexOf("frozen-lockfile");
  if (gate < 0) {
    problems.push("check: no step named frozen-lockfile");
  } else {
    if (!steps[gate].run?.includes("scripts/gates/lockfile.sh")) {
      problems.push("check: frozen-lockfile must run scripts/gates/lockfile.sh");
    }
    for (const later of ["bun audit", "bun run check"]) {
      const at = indexOf(later);
      if (at < 0) problems.push(`check: no step named ${later}`);
      else if (gate > at) problems.push(`check: frozen-lockfile must come before ${later}`);
    }
  }

  const usesLines = raw.split(/\r?\n/).filter((line) => /^\s*(- )?uses:/.test(line));
  for (const line of usesLines) {
    if (!/@[0-9a-f]{40} # v\d+(\.\d+)*$/.test(line)) {
      problems.push(`a uses line needs a 40-character sha and a release comment: ${line.trim()}`);
    }
  }
  if (usesLines.length !== parsedUses) {
    problems.push(`the raw text holds ${usesLines.length} uses lines, the parse ${parsedUses}`);
  }
  return problems;
}

function dependabotProblems(config: Dependabot): string[] {
  const problems: string[] = [];
  const updates = config.updates ?? [];
  for (const update of updates) {
    if (update["package-ecosystem"] === "npm") {
      problems.push(`the npm ecosystem for ${update.directory}`);
    }
  }
  for (const directory of BUN_DIRECTORIES) {
    const found = updates.some(
      (update) => update["package-ecosystem"] === "bun" && update.directory === directory,
    );
    if (!found) problems.push(`no bun entry for ${directory}`);
  }
  if (!updates.some((update) => update["package-ecosystem"] === "github-actions")) {
    problems.push("no github-actions entry");
  }
  return problems;
}

async function readWorkflow() {
  const raw = await Bun.file(WORKFLOW).text();
  return { workflow: Bun.YAML.parse(raw) as Workflow, raw };
}

async function readDependabot() {
  return Bun.YAML.parse(await Bun.file(DEPENDABOT).text()) as Dependabot;
}

/** The named job with its steps, which the fixtures below mutate in place. */
function jobOf(workflow: Workflow, name: string): Job & { steps: Step[] } {
  const job = workflow.jobs?.[name];
  if (!job?.steps) throw new Error(`the workflow has no ${name} job`);
  return job as Job & { steps: Step[] };
}

/** The step whose name is given, which a fixture reads or edits in place. */
function stepOf(workflow: Workflow, jobName: string, stepName: string): Step {
  const step = jobOf(workflow, jobName).steps.find((s) => s.name === stepName);
  if (!step) throw new Error(`the ${jobName} job has no ${stepName} step`);
  return step;
}

/** The step that installs, which is the one `run` mentioning bun install. */
function installStep(workflow: Workflow, jobName: string): Step {
  const step = jobOf(workflow, jobName).steps.find((s) => s.run?.includes("bun install"));
  if (!step) throw new Error(`the ${jobName} job has no install step`);
  return step;
}

function moveStepAfter(workflow: Workflow, name: string, after: string) {
  const { steps } = jobOf(workflow, "check");
  const [step] = steps.splice(
    steps.findIndex((s) => s.name === name),
    1,
  );
  steps.splice(steps.findIndex((s) => s.name === after) + 1, 0, step);
}

/** Each expected text appears in the problem at its index, and no problem is extra. */
function expectProblems(actual: string[], expected: string[]) {
  expect(actual).toEqual(expected.map((text) => expect.stringContaining(text)));
}

test("the real workflow breaks none of the workflow rules", async () => {
  const { workflow, raw } = await readWorkflow();
  expect(workflowProblems(workflow, raw)).toEqual([]);
});

const PLAIN_INSTALL = "docker compose exec -T -w /workspace app bun install";

const WORKFLOW_FIXTURES: [string, (workflow: Workflow) => void, string[]][] = [
  [
    "a workflow with no permissions block",
    (w) => {
      delete w.permissions;
    },
    ["top-level permissions must be exactly contents: read"],
  ],
  [
    "a wider top-level permission",
    (w) => {
      w.permissions = { contents: "write" };
    },
    ["top-level permissions must be exactly contents: read"],
  ],
  [
    "a job that adds a permission",
    (w) => {
      jobOf(w, "e2e").permissions = { contents: "read", issues: "write" };
    },
    ["job e2e sets permissions beyond contents: read"],
  ],
  [
    "a checkout with no with block",
    (w) => {
      delete jobOf(w, "e2e").steps[0].with;
    },
    ["e2e: actions/checkout must set persist-credentials: false"],
  ],
  [
    "a checkout that keeps the token",
    (w) => {
      const checkout = jobOf(w, "host-gates").steps[0];
      checkout.with = { ...checkout.with, "persist-credentials": true };
    },
    ["host-gates: actions/checkout must set persist-credentials: false"],
  ],
  [
    "a plain install in the e2e job",
    (w) => {
      const step = installStep(w, "e2e");
      step.name = "bun install";
      step.run = PLAIN_INSTALL;
    },
    ["e2e: bun install runs bun install without --frozen-lockfile"],
  ],
  [
    "a plain install ahead of the gate in the check job",
    (w) => {
      jobOf(w, "check").steps.splice(1, 0, { name: "bun install", run: PLAIN_INSTALL });
    },
    ["check: bun install runs bun install without --frozen-lockfile"],
  ],
  [
    "the gate after bun audit",
    (w) => moveStepAfter(w, "frozen-lockfile", "bun audit"),
    ["check: frozen-lockfile must come before bun audit"],
  ],
  [
    "the gate after bun run check",
    (w) => moveStepAfter(w, "frozen-lockfile", "bun run check"),
    [
      "check: frozen-lockfile must come before bun audit",
      "check: frozen-lockfile must come before bun run check",
    ],
  ],
  [
    "a check job with no gate step",
    (w) => {
      const { steps } = jobOf(w, "check");
      steps.splice(
        steps.findIndex((s) => s.name === "frozen-lockfile"),
        1,
      );
    },
    ["check: no step named frozen-lockfile"],
  ],
  [
    "a gate step that runs something else",
    (w) => {
      stepOf(w, "check", "frozen-lockfile").run = "true";
    },
    ["check: frozen-lockfile must run scripts/gates/lockfile.sh"],
  ],
  [
    "a check job with no audit step",
    (w) => {
      const { steps } = jobOf(w, "check");
      steps.splice(
        steps.findIndex((s) => s.name === "bun audit"),
        1,
      );
    },
    ["check: no step named bun audit"],
  ],
  [
    "a uses step the raw pass cannot see",
    (w) => {
      jobOf(w, "e2e").steps.push({ name: "extra", uses: "example/action@v1" });
    },
    [" uses lines, the parse "],
  ],
];

for (const [name, mutate, expected] of WORKFLOW_FIXTURES) {
  test(`the workflow rules reject ${name}`, async () => {
    const { workflow, raw } = await readWorkflow();
    mutate(workflow);
    expectProblems(workflowProblems(workflow, raw), expected);
  });
}

// The raw pass: each fixture edits the first uses line, which is a checkout.
const RAW_FIXTURES: [string, (raw: string) => string][] = [
  ["a tag in place of a sha", (raw) => raw.replace(/@[0-9a-f]{40} # v\S+/, "@v7")],
  ["a sha with no release comment", (raw) => raw.replace(/(@[0-9a-f]{40}) # v\S+/, "$1")],
  ["a sha one character short", (raw) => raw.replace(/@[0-9a-f]{40}/, `@${"a".repeat(39)}`)],
  ["a comment that names no release", (raw) => raw.replace(/ # v\S+/, " # latest")],
];

for (const [name, mutate] of RAW_FIXTURES) {
  test(`the workflow rules reject ${name}`, async () => {
    const { workflow, raw } = await readWorkflow();
    const edited = mutate(raw);
    expect(edited).not.toBe(raw);
    expectProblems(workflowProblems(workflow, edited), [
      "a uses line needs a 40-character sha and a release comment: - uses: actions/checkout@",
    ]);
  });
}

test("the real Dependabot file breaks none of the Dependabot rules", async () => {
  expect(dependabotProblems(await readDependabot())).toEqual([]);
});

const DEPENDABOT_FIXTURES: [string, (config: Dependabot) => void, string[]][] = [
  [
    "an npm entry in place of the root bun entry",
    (c) => {
      c.updates[0]["package-ecosystem"] = "npm";
    },
    ["the npm ecosystem for /", "no bun entry for /"],
  ],
  [
    "an npm entry beside the bun entries",
    (c) => {
      c.updates.push({ "package-ecosystem": "npm", directory: "/docs" });
    },
    ["the npm ecosystem for /docs"],
  ],
  [
    "no entry for packages/form-ui",
    (c) => {
      c.updates = c.updates.filter((u) => u.directory !== "/packages/form-ui");
    },
    ["no bun entry for /packages/form-ui"],
  ],
  [
    "no entry for packages/web",
    (c) => {
      c.updates = c.updates.filter((u) => u.directory !== "/packages/web");
    },
    ["no bun entry for /packages/web"],
  ],
  [
    "no github-actions entry",
    (c) => {
      c.updates = c.updates.filter((u) => u["package-ecosystem"] !== "github-actions");
    },
    ["no github-actions entry"],
  ],
];

for (const [name, mutate, expected] of DEPENDABOT_FIXTURES) {
  test(`the Dependabot rules reject ${name}`, async () => {
    const config = await readDependabot();
    mutate(config);
    expectProblems(dependabotProblems(config), expected);
  });
}
