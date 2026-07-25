/**
 * `src/auth/cli.ts` — no HTTP surface, exercised by calling `main` (not
 * re-exported since `import.meta.main` is the only entry point today; this
 * suite imports the module and drives it the same way the shell invocation
 * does, via `process.argv`-shaped args passed straight through by hand).
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { verifyLogin } from "../src/auth/users.js";

const DB = !!process.env.DATABASE_URL;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE auth_users`;
});

// The CLI's subcommands are thin wrappers over users.ts (createUser/setRoles/
// setPassword) already covered end-to-end by test/auth-users.test.ts; this
// suite checks the one thing specific to the CLI itself — that `add-user`
// produces a row whose hash verifies the given password, run through the
// actual binary rather than the underlying function.
test.skipIf(!DB)("bun run src/auth/cli.ts add-user creates a row whose hash verifies the given password", async () => {
  const proc = Bun.spawn(["bun", "run", "src/auth/cli.ts", "add-user", "cli-e2e@example.com", "correct-horse", "employee,admin"], {
    env: { ...process.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  expect(exitCode).toBe(0);

  const result = await verifyLogin("cli-e2e@example.com", "correct-horse");
  expect(result?.roles).toEqual(["employee", "admin"]);
});
