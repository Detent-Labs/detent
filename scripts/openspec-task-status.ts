/**
 * Prints a change's task-completion status as one JSON object, so
 * `openspec-archive-change` step 3 can branch on it instead of counting
 * `- [ ]`/`- [x]` boxes by reading `tasks.md` by eye.
 *
 * Usage: bun run scripts/openspec-task-status.ts <change-name>
 * Exit codes: 0 valid JSON printed (including the no-tasks.md case),
 * 2 usage/environment error (unknown change, or tasks.md unreadable).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();

interface BrowserTask {
  line: number;
  text: string;
}

interface Status {
  total: number;
  done: number;
  incomplete: number;
  browserTasks: BrowserTask[];
}

const BROWSER_TASK_RE = /\b(browser|manual UI walkthrough|playwright-cli)\b/i;

// Mirrors (does not import) the block-flushing approach in
// `openspec-review-check.ts`'s `checkTasks`: a checkbox line starts a block,
// its indented continuation lines join it, and the next checkbox or
// non-indented line flushes it.
function computeStatus(tasksText: string): Status {
  const lines = tasksText.split("\n");
  let total = 0;
  let done = 0;
  const browserTasks: BrowserTask[] = [];

  let blockStart = -1;
  let blockDone = false;
  let blockLines: string[] = [];
  const flushBlock = () => {
    if (blockStart === -1) return;
    total++;
    if (blockDone) {
      done++;
    } else {
      const text = blockLines.join(" ");
      if (BROWSER_TASK_RE.test(text)) browserTasks.push({ line: blockStart, text });
    }
    blockStart = -1;
    blockLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const checkboxMatch = lines[i].match(/^- \[([ x])\]/);
    if (checkboxMatch) {
      flushBlock();
      blockStart = i + 1;
      blockDone = checkboxMatch[1] === "x";
      blockLines = [lines[i]];
    } else if (blockStart !== -1 && /^\s+\S/.test(lines[i])) {
      blockLines.push(lines[i]);
    } else if (blockStart !== -1) {
      flushBlock();
    }
  }
  flushBlock();

  return { total, done, incomplete: total - done, browserTasks };
}

function main(): number {
  const name = process.argv[2];
  if (!name) {
    console.error("usage: bun run scripts/openspec-task-status.ts <change-name>");
    return 2;
  }
  const changeDir = join(REPO_ROOT, "openspec/changes", name);
  if (!existsSync(changeDir)) {
    console.error(`no such change: openspec/changes/${name}`);
    return 2;
  }

  const tasksPath = join(changeDir, "tasks.md");
  if (!existsSync(tasksPath)) {
    console.log(JSON.stringify({ total: 0, done: 0, incomplete: 0, browserTasks: [] }));
    return 0;
  }

  let tasksText: string;
  try {
    tasksText = readFileSync(tasksPath, "utf8");
  } catch (err) {
    console.error(`could not read ${tasksPath}: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  console.log(JSON.stringify(computeStatus(tasksText)));
  return 0;
}

process.exit(main());
