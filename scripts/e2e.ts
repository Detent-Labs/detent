/**
 * Owns one smoke-suite run end to end (design D1). `bun run e2e` is the one
 * command a laptop and CI both run:
 *
 *   1. Read DATABASE_URL, failing and naming it when unset.
 *   2. Refuse to start when the production web build is missing.
 *   3. Drop and recreate the `_e2e` database, so every run starts clean.
 *   4. Seed it (scripts/seed.ts, as a child, with SEED_ALLOW=1).
 *   5. Add the suite's account and its changed draft (design D3).
 *   6. Start the engine on an OS-assigned port and read that port back from
 *      its own startup log line.
 *   7. Run `bunx playwright test` against it.
 *   8. Stop the engine on every path out, and exit with Playwright's code.
 *
 * Never point this at the development or `_test` database (development-
 * toolchain: "The smoke suite runs against a database of its own"). The
 * `_test` database belongs to `bun test`'s own preload (test/preload-db.ts);
 * this script copies its six-line name derivation rather than importing it,
 * since that module runs its work at import time and would derive `_test`,
 * not `_e2e`.
 */
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { SQL } from "bun";
import { createUser } from "../src/auth/users.js";
import { saveDraft } from "../src/engine/drafts.js";
import type { ProcessId } from "../src/schema/definition.js";
import {
  ADMIN_ROLE,
  CANCEL_ANY_ROLE,
  DEVELOPER_ROLE,
  AUTHOR_ROLE,
  PUBLISH_ROLE,
  REPORTS_ROLE,
  CREATE_ROLE,
} from "../src/auth/authorize.js";

/** How long the engine child gets to log its bound port (design D1 step 6). */
const ENGINE_STARTUP_DEADLINE_MS = 30_000;

const E2E_EMAIL = "e2e-operator@example.test";
const E2E_LAPTOP_INVENTORY_PROCESS_ID = "proc_laptop_inventory" as ProcessId;
const E2E_DRAFT_LABEL = "E2E draft";

/**
 * Every role a flow needs across the four areas, plus `employee` — the role
 * Expense Approval's first step assigns to (examples/expense-approval.json).
 * One account, not one per role: design D3 keeps the flows on what the smoke
 * suite exists for, not on re-testing the role gates `bun test` already
 * covers.
 */
const E2E_ROLES = [ADMIN_ROLE, CANCEL_ANY_ROLE, DEVELOPER_ROLE, AUTHOR_ROLE, PUBLISH_ROLE, REPORTS_ROLE, CREATE_ROLE, "employee"];

/** `postgres://u:p@h:5432/workflow_engine` -> the same URL on `..._e2e`. Appends even to a name already ending `_test`, since this suite must never write to that database. */
function deriveE2eDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, "");
  if (!name) throw new Error(`DATABASE_URL carries no database name: ${url}`);
  parsed.pathname = `/${name}_e2e`;
  return parsed.toString();
}

/** The same server, with the database swapped for the one every Postgres install ships. */
function maintenanceUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = "/postgres";
  return parsed.toString();
}

/**
 * Drops and recreates the `_e2e` database, so every run starts from the same
 * seeded state (development-toolchain: "A second run starts from the same
 * state"). `WITH (FORCE)` ends the connections of an engine a crashed run
 * left alive; a plain `DROP DATABASE` refuses while one stays open.
 */
async function resetE2eDatabase(e2eUrl: string): Promise<void> {
  const name = new URL(e2eUrl).pathname.replace(/^\//, "");
  const admin = new SQL(maintenanceUrl(e2eUrl));
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.close();
  }
}

/** Runs the seed script against `e2eUrl`, as its own process — the same shape `scripts/seed.ts` already runs in, guarded by `import.meta.main`. */
async function runSeed(e2eUrl: string): Promise<void> {
  const proc = Bun.spawn(["bun", "run", "scripts/seed.ts"], {
    env: { ...process.env, DATABASE_URL: e2eUrl, SEED_ALLOW: "1" },
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`scripts/seed.ts exited with code ${code}`);
}

/**
 * Design D3: one account holding every role the four flows need, and one
 * draft of Laptop Inventory whose body differs from the published v1 in its
 * process label only. Calls `createUser` and `saveDraft` directly, the way
 * `scripts/seed.ts` calls `publishBody` directly.
 *
 * Both functions default to the shared `sql` client in `src/engine/store.ts`,
 * which connects lazily on first query (`getSql`). Running this in the same
 * process as the rest of the script, right after `process.env.DATABASE_URL`
 * is pointed at the `_e2e` URL, is therefore enough — no child process is
 * needed the way `runSeed` above needs one only because `scripts/seed.ts`
 * runs its `main()` at import time (`import.meta.main`).
 */
async function addSuiteFixtures(password: string): Promise<void> {
  const { userId } = await createUser(E2E_EMAIL, password, E2E_ROLES, "E2E Operator");

  const raw = JSON.parse(readFileSync(new URL("../examples/laptop-inventory.json", import.meta.url), "utf-8")) as {
    definition?: Record<string, unknown>;
  } & Record<string, unknown>;
  const body = (raw.definition ?? raw) as { label: Record<string, string>; baseLocale: string } & Record<string, unknown>;
  const draftBody = { ...body, label: { ...body.label, [body.baseLocale]: E2E_DRAFT_LABEL } };

  await saveDraft(E2E_LAPTOP_INVENTORY_PROCESS_ID, {
    body: draftBody,
    layout: {},
    revision: 0,
    updatedBy: userId,
    baseVersion: 1,
  });
}

interface EngineHandle {
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  port: number;
}

/** The port from `log.info("HTTP server listening", { port })` (src/log.ts, src/http/server.ts:903), or `undefined` while that line has not arrived yet. Parses each line as JSON rather than matching a number out of free text — the design's own risk note names this as the one place the server's log format matters. */
function boundPort(text: string): number | undefined {
  for (const line of text.split("\n")) {
    if (!line.includes('"HTTP server listening"')) continue;
    try {
      const parsed = JSON.parse(line) as { msg?: string; port?: number };
      if (parsed.msg === "HTTP server listening" && typeof parsed.port === "number") return parsed.port;
    } catch {
      // A partial line, still arriving. The next poll sees the whole one.
    }
  }
  return undefined;
}

function lastLineOf(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  return lines[lines.length - 1] ?? "(no output)";
}

/** Starts the engine on an OS-assigned port and waits for it to report that port back. */
async function startEngine(e2eUrl: string, jwtSecret: string): Promise<EngineHandle> {
  const proc = Bun.spawn(["bun", "run", "src/http/server.ts"], {
    env: { ...process.env, PORT: "0", DATABASE_URL: e2eUrl, AUTH_JWT_SECRET: jwtSecret },
    stdout: "pipe",
    stderr: "pipe",
  });

  let text = "";
  const pump = (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of proc.stdout) {
      const decoded = decoder.decode(chunk);
      text += decoded;
      process.stdout.write(decoded);
    }
  })();
  const pumpStderr = (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of proc.stderr) process.stderr.write(decoder.decode(chunk));
  })();
  void pump;
  void pumpStderr;

  const deadline = Date.now() + ENGINE_STARTUP_DEADLINE_MS;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`engine exited during startup with code ${proc.exitCode}; last line: ${lastLineOf(text)}`);
    }
    const port = boundPort(text);
    if (port !== undefined) return { proc, port };
    await Bun.sleep(50);
  }
  proc.kill("SIGKILL");
  throw new Error(`engine did not log "HTTP server listening" within ${ENGINE_STARTUP_DEADLINE_MS}ms; last line: ${lastLineOf(text)}`);
}

/** Stops the engine gracefully (SIGTERM), the same signal a deployment sends, then waits for it to exit. */
async function stopEngine(engine: EngineHandle): Promise<void> {
  engine.proc.kill("SIGTERM");
  await engine.proc.exited;
}

async function runPlaywright(baseUrl: string, password: string, extraArgs: string[]): Promise<number> {
  const proc = Bun.spawn(["bunx", "playwright", "test", ...extraArgs], {
    env: { ...process.env, E2E_BASE_URL: baseUrl, E2E_PASSWORD: password },
    stdout: "inherit",
    stderr: "inherit",
  });
  return proc.exited;
}

async function main(): Promise<number> {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    console.error("DATABASE_URL is not set. Point it at the devcontainer's Postgres connection string before running `bun run e2e`.");
    return 1;
  }

  if (!existsSync("packages/web/dist/index.html")) {
    console.error("packages/web/dist is missing or empty. Run `bun run build` first.");
    return 1;
  }

  const e2eUrl = deriveE2eDatabaseUrl(rawUrl);
  const e2eName = new URL(e2eUrl).pathname.replace(/^\//, "");

  console.log(`Resetting database ${e2eName}...`);
  await resetE2eDatabase(e2eUrl);

  console.log("Seeding...");
  await runSeed(e2eUrl);

  console.log("Adding the suite account and draft...");
  const password = crypto.randomUUID();
  process.env.DATABASE_URL = e2eUrl;
  await addSuiteFixtures(password);

  console.log("Starting the engine...");
  const jwtSecret = randomBytes(48).toString("base64");
  const engine = await startEngine(e2eUrl, jwtSecret);
  console.log(`Engine listening on 127.0.0.1:${engine.port}`);

  try {
    console.log("Running Playwright...");
    return await runPlaywright(`http://127.0.0.1:${engine.port}`, password, Bun.argv.slice(2));
  } finally {
    console.log("Stopping the engine...");
    await stopEngine(engine);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
