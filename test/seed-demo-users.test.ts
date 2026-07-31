/**
 * scripts/seed.ts provisions one demo user per reserved role. Asserting the
 * pairing rather than running the seed keeps this a pure test: the seed itself
 * publishes every example process, which is not what this requirement is about.
 *
 * This is the check that fails when a reserved role is added without its demo
 * user — the case that would otherwise leave a role-gated surface unreachable
 * from a seeded database.
 */
import { test, expect } from "bun:test";
import { DEMO_USERS } from "../scripts/seed.js";
import * as authorize from "../src/auth/authorize.js";

/** Every exported constant whose value carries the reserved `system:` prefix. */
const RESERVED_ROLES: string[] = Object.values(authorize).flatMap((v) => (typeof v === "string" && v.startsWith("system:") ? [v as string] : []));

test("every reserved role has exactly one demo user", () => {
  expect([...DEMO_USERS.map((u) => u.role)].sort()).toEqual([...RESERVED_ROLES].sort());
});

test("the reports role is among them", () => {
  expect(DEMO_USERS.map((u) => u.role)).toContain(authorize.REPORTS_ROLE);
});

test("each demo user has its own email suffix", () => {
  const suffixes = DEMO_USERS.map((u) => u.emailSuffix);
  expect(new Set(suffixes).size).toBe(suffixes.length);
});

// A subprocess, because the guard lives in `main()` behind `import.meta.main`
// — importing the module deliberately does not run it. DATABASE_URL is passed
// through unchanged: the guard throws before initSchema, so a run that reaches
// the database is itself the failure this asserts against.
test("the seed refuses to run without SEED_ALLOW", async () => {
  const proc = Bun.spawn(["bun", "run", "scripts/seed.ts"], {
    env: { ...process.env, SEED_ALLOW: undefined },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  expect(code).not.toBe(0);
  expect(stderr).toContain("SEED_ALLOW");
});
