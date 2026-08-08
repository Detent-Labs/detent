/**
 * `src/auth/cli.ts` — no HTTP surface, exercised by calling `main` (not
 * re-exported since `import.meta.main` is the only entry point today; this
 * suite imports the module and drives it the same way the shell invocation
 * does, via `process.argv`-shaped args passed straight through by hand).
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { verifyLogin, DISPLAY_NAME_MAX_LENGTH } from "../src/auth/users.js";

const DB = !!process.env.DATABASE_URL;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE auth_users`;
});

/** One CLI invocation, through the actual binary. Returns its exit code. */
const runCli = async (...args: string[]): Promise<number> => {
  const proc = Bun.spawn(["bun", "run", "src/auth/cli.ts", ...args], {
    env: { ...process.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  return await proc.exited;
};

const storedDisplayName = async (email: string): Promise<string | null> => {
  const rows = (await sql`SELECT display_name FROM auth_users WHERE email = ${email}`) as { display_name: string | null }[];
  return rows[0]!.display_name;
};

// The CLI's subcommands are thin wrappers over users.ts (createUser/setRoles/
// setPassword) already covered end-to-end by test/auth-users.test.ts; this
// suite checks the one thing specific to the CLI itself — that `add-user`
// produces a row whose hash verifies the given password, run through the
// actual binary rather than the underlying function.
test.skipIf(!DB)("bun run src/auth/cli.ts add-user creates a row whose hash verifies the given password", async () => {
  expect(await runCli("add-user", "cli-e2e@example.com", "correct-horse", "employee,admin")).toBe(0);

  const result = await verifyLogin("cli-e2e@example.com", "correct-horse");
  expect(result?.roles).toEqual(["employee", "admin"]);
});

// Each case below is one `bun` process plus one argon2 hash, past the 5s default.
test.skipIf(!DB)(
  "add-user stores a trailing display name and leaves display_name NULL without one",
  async () => {
    expect(await runCli("add-user", "cli-named@example.com", "pw", "employee", "  Rita Alvarez  ")).toBe(0);
    expect(await storedDisplayName("cli-named@example.com")).toBe("Rita Alvarez");

    expect(await runCli("add-user", "cli-unnamed@example.com", "pw", "employee")).toBe(0);
    expect(await storedDisplayName("cli-unnamed@example.com")).toBeNull();
    expect((await verifyLogin("cli-unnamed@example.com", "pw"))?.displayName).toBe("cli-unnamed@example.com");
  },
  30_000,
);

// The empty roles argument is the documented form for a named account with no
// roles: display name sits last, so the position has to be filled.
test.skipIf(!DB)(
  "add-user with an empty roles argument keeps the display name in its own position, and a whitespace-only one stores NULL",
  async () => {
    expect(await runCli("add-user", "cli-noroles@example.com", "pw", "", "Rita Alvarez")).toBe(0);
    expect(await storedDisplayName("cli-noroles@example.com")).toBe("Rita Alvarez");
    expect((await verifyLogin("cli-noroles@example.com", "pw"))?.roles).toEqual([]);

    expect(await runCli("add-user", "cli-blank@example.com", "pw", "", "   ")).toBe(0);
    expect(await storedDisplayName("cli-blank@example.com")).toBeNull();
    expect((await verifyLogin("cli-blank@example.com", "pw"))?.displayName).toBe("cli-blank@example.com");
  },
  30_000,
);

test.skipIf(!DB)(
  "set-name sets the trimmed value on an existing account, and a whitespace-only argument clears it",
  async () => {
    expect(await runCli("add-user", "cli-setname@example.com", "pw", "employee")).toBe(0);

    expect(await runCli("set-name", "cli-setname@example.com", "  Rita Alvarez  ")).toBe(0);
    expect(await storedDisplayName("cli-setname@example.com")).toBe("Rita Alvarez");

    expect(await runCli("set-name", "cli-setname@example.com", "   ")).toBe(0);
    expect(await storedDisplayName("cli-setname@example.com")).toBeNull();
    expect((await verifyLogin("cli-setname@example.com", "pw"))?.displayName).toBe("cli-setname@example.com");
  },
  30_000,
);

// The bound lives in normalizeDisplayName, so the CLI enforces the same 200
// characters both HTTP routes do. Before that, `set-name` stored a value
// neither route would accept back, and the operator could not re-save the row
// without shortening it first.
test.skipIf(!DB)(
  "add-user and set-name refuse a display name past the bound, exit non-zero, and change no column",
  async () => {
    const tooLong = "x".repeat(DISPLAY_NAME_MAX_LENGTH + 1);

    expect(await runCli("add-user", "cli-toolong@example.com", "pw", "", tooLong)).not.toBe(0);
    const rows = (await sql`SELECT count(*)::int AS n FROM auth_users WHERE email = 'cli-toolong@example.com'`) as { n: number }[];
    expect(rows[0]!.n).toBe(0);

    expect(await runCli("add-user", "cli-bound@example.com", "pw", "", "Rita Alvarez")).toBe(0);
    expect(await runCli("set-name", "cli-bound@example.com", tooLong)).not.toBe(0);
    expect(await storedDisplayName("cli-bound@example.com")).toBe("Rita Alvarez");

    // The bound itself is accepted, so the rejection is past it and not at it.
    const atBound = "y".repeat(DISPLAY_NAME_MAX_LENGTH);
    expect(await runCli("set-name", "cli-bound@example.com", atBound)).toBe(0);
    expect(await storedDisplayName("cli-bound@example.com")).toBe(atBound);
  },
  45_000,
);
