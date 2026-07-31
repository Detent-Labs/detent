/**
 * Points `bun test` at its own database, before any suite imports
 * `src/engine/store.ts`. Wired through `bunfig.toml`'s `[test] preload`, so it
 * applies to every invocation of the runner rather than to one script name.
 *
 * Why this exists. `src/http/server.ts` starts four background pollers through
 * `startEngine`; one claims outbox rows every 500 ms. The devcontainer has one
 * database, so a `bun run serve` left running drives the same tables a test run
 * drives. Measured over twenty runs each: three red with a dev server up, zero
 * with none. The four captured assertions are in the change's design.md
 * (`make-db-suites-deterministic`).
 *
 * The split also holds in the other direction. `bun test` truncates in
 * `beforeEach`, and used to take the devcontainer's demo state with it.
 *
 * An unset `DATABASE_URL` stays unset: the DB-backed suites are
 * `test.skipIf(!DB)` and must keep skipping, not fail on a derived name.
 */

/** `postgres://u:p@h:5432/workflow_engine?opt=1` -> the same URL on `..._test`. Already-suffixed input is returned unchanged. */
export function deriveTestDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, "");
  if (!name) throw new Error(`DATABASE_URL carries no database name: ${url}`);
  if (name.endsWith("_test")) return url;
  parsed.pathname = `/${name}_test`;
  return parsed.toString();
}

/** The same server, with the database swapped for the one every Postgres install ships. */
function maintenanceUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = "/postgres";
  return parsed.toString();
}

async function ensureDatabase(testUrl: string): Promise<void> {
  const { SQL } = await import("bun");
  const name = new URL(testUrl).pathname.replace(/^\//, "");
  const admin = new SQL(maintenanceUrl(testUrl));
  try {
    const rows = (await admin`SELECT 1 FROM pg_database WHERE datname = ${name}`) as unknown[];
    // No CREATE DATABASE IF NOT EXISTS in Postgres, and the identifier cannot be
    // a bind parameter. `name` is derived from DATABASE_URL, not from input.
    if (rows.length === 0) await admin.unsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.close();
  }
}

const url = process.env.DATABASE_URL;
if (url) {
  const testUrl = deriveTestDatabaseUrl(url);
  await ensureDatabase(testUrl);
  process.env.DATABASE_URL = testUrl;
  console.log(`[test] database: ${new URL(testUrl).pathname.replace(/^\//, "")}`);
} else {
  console.log("[test] DATABASE_URL unset — DB-backed suites will skip");
}
