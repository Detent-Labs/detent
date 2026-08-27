/**
 * instance-audit-log-chain's append-only guarantee, proven against a
 * non-superuser role: `detent_audit_probe` (test/preload-db.ts) holds exactly
 * the engine's own grants — INSERT/SELECT on `instance_audit`, EXECUTE on
 * `redact_instance_fields` — and nothing else. The devcontainer's
 * DATABASE_URL is the `postgres` superuser, whom no grant restrains, so this
 * suite is the only place the guarantee is actually measured. Skips whenever
 * the probe role could not be created (a maintenance role with no
 * CREATEROLE), the way the DB suites skip on `!DB`.
 */
import { SQL } from "bun";
import { test, expect, beforeAll, afterAll } from "bun:test";
import { sql, initSchema, withTransaction } from "../src/engine/store.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;

function probeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.username = "detent_audit_probe";
  parsed.password = "probe";
  return parsed.toString();
}

let PROBE = false;
let probe: SQL | undefined;

if (DB) {
  await initSchema();
  const rows = (await sql`SELECT 1 FROM pg_roles WHERE rolname = 'detent_audit_probe'`) as unknown[];
  PROBE = rows.length > 0;
  if (PROBE) {
    // 5.7: exactly the engine's own grants, issued as the owner (only it can
    // grant on its own relation/function) plus the wider `instances` grant
    // outside that block (the engine's own role already owns `instances`).
    await withTransaction(sql, async (tx) => {
      await tx`SET LOCAL ROLE detent_audit_owner`;
      await tx`GRANT INSERT, SELECT ON instance_audit TO detent_audit_probe`;
      await tx`GRANT EXECUTE ON FUNCTION redact_instance_fields(text, text, text, bigint) TO detent_audit_probe`;
    });
    await sql`GRANT INSERT, SELECT ON instances TO detent_audit_probe`;
    // Membership in detent_audit_owner is role-level, cluster-scoped state
    // that outlives any single test run (nothing here drops the probe
    // role). Revoke it unconditionally so 5.12 below starts from a known,
    // deterministic "no membership yet" state regardless of what an earlier
    // interrupted run left behind — a REVOKE of a membership not currently
    // held is a harmless no-op, as `postgres`.
    await sql`REVOKE detent_audit_owner FROM detent_audit_probe`;
    probe = new SQL(probeUrl(process.env.DATABASE_URL as string), { max: 1 });
  }
}

beforeAll(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
  if (DB) await clearInstanceAudit();
});

// `probe` opens its own connection pool, separate from the shared `sql`
// client; left open, it would keep the process alive past the last test.
afterAll(async () => {
  await probe?.close();
});

const mkId = () => `inst_${crypto.randomUUID()}`;
const auditCount = async (id: string): Promise<number> =>
  Number(((await sql`SELECT count(*) AS c FROM instance_audit WHERE instance_id = ${id}`) as { c: string }[])[0].c);

test.skipIf(!DB || !PROBE)("5.9 the probe role's INSERT through the trigger still lands", async () => {
  const id = mkId();
  await probe!`INSERT INTO instances (instance_id, transition_seq, body) VALUES (${id}, 0, ${{ data: { field_x: "probed" } }})`;
  expect(await auditCount(id)).toBe(1);
});

// The probe role holds exactly the engine's own grants (see the file header),
// so this measures the engine's real privilege shape. Asserting it against
// `current_user` instead would pass vacuously: the devcontainer connects as a
// superuser, whom `has_table_privilege` answers `true` for all four.
test.skipIf(!DB || !PROBE)("5.5 the engine's grant set is INSERT and SELECT alone, and PUBLIC holds no EXECUTE on the redaction", async () => {
  const [priv] = (await sql`
    SELECT has_table_privilege('detent_audit_probe', 'instance_audit', 'INSERT') AS ins,
           has_table_privilege('detent_audit_probe', 'instance_audit', 'SELECT') AS sel,
           has_table_privilege('detent_audit_probe', 'instance_audit', 'UPDATE') AS upd,
           has_table_privilege('detent_audit_probe', 'instance_audit', 'DELETE') AS del
  `) as { ins: boolean; sel: boolean; upd: boolean; del: boolean }[];
  expect(priv).toEqual({ ins: true, sel: true, upd: false, del: false });

  const [fn] = (await sql`
    SELECT array_to_string(proacl, E'\n') AS acl FROM pg_proc WHERE proname = 'redact_instance_fields'
  `) as { acl: string }[];
  // The positive half: a role holding no grant at all also satisfies the
  // negative one, so the grantee has to be named.
  expect(fn.acl).toContain("detent_audit_probe=X/");
  // A PUBLIC entry renders with an empty grantee, `=X/owner`.
  expect(fn.acl).not.toMatch(/(^|\n)=X\//);
});

test.skipIf(!DB)("5.1 all four audit functions pin their search path", async () => {
  const rows = (await sql`
    SELECT proname, proconfig FROM pg_proc
    WHERE proname IN ('instance_audit_diff', 'instance_audit_append', 'verify_instance_chain', 'redact_instance_fields')
  `) as { proname: string; proconfig: string[] | null }[];
  expect(rows).toHaveLength(4);
  for (const r of rows) {
    const entry = (r.proconfig ?? []).find((c) => c.startsWith("search_path="));
    expect(`${r.proname}: ${entry}`).toMatch(/pg_catalog/);
    expect(`${r.proname}: ${entry}`).toMatch(/public/);
  }
});

// Asserted against the catalog rather than the TypeScript source: what runs is
// the definition the database holds, which a rerun of initSchema replaces.
test.skipIf(!DB)("5.3 both writers reach the chain through instance_audit_append, and neither hashes on its own", async () => {
  const rows = (await sql`
    SELECT proname, pg_get_functiondef(oid) AS def FROM pg_proc
    WHERE proname IN ('instance_audit_diff', 'redact_instance_fields')
  `) as { proname: string; def: string }[];
  expect(rows).toHaveLength(2);
  for (const r of rows) {
    expect(r.def).toContain("instance_audit_append(");
    expect(r.def).not.toContain("sha256(");
  }
});

test.skipIf(!DB)("5.10 instance_audit_diff and instance_audit_append are not SECURITY DEFINER; redact_instance_fields alone is", async () => {
  const rows = (await sql`
    SELECT proname, prosecdef FROM pg_proc
    WHERE proname IN ('instance_audit_diff', 'instance_audit_append', 'redact_instance_fields')
  `) as { proname: string; prosecdef: boolean }[];
  const byName = Object.fromEntries(rows.map((r) => [r.proname, r.prosecdef]));
  expect(byName.instance_audit_diff).toBe(false);
  expect(byName.instance_audit_append).toBe(false);
  expect(byName.redact_instance_fields).toBe(true);
});

// Declared BEFORE the two 5.8 tests below on purpose: this is the one point
// in the file where the probe role holds no membership in detent_audit_owner
// yet — after 5.8's own membership grant, the same check would prove nothing
// about the degraded path.
//
// 5.12's full "detent_audit_owner absent, connecting role unable to create
// it, initSchema returns and warns, no trigger exists, an INSERT still
// succeeds" scenario needs a virgin cluster and is not reproducible here:
// the role is cluster-scoped, so once any suite's `initSchema` (run as this
// devcontainer's `postgres` superuser) creates it, no later test in this
// shared database can make it absent again without dropping cluster-wide
// state every other file's suite also depends on. Calling the full
// `initSchema` as `detent_audit_probe` does not stand in for that scenario
// either: `probe` never bootstrapped `instances`/`history_entries`/etc, so
// even the schema's own pre-existing `CREATE TABLE IF NOT EXISTS` and
// `CREATE INDEX IF NOT EXISTS` statements fail on it — measured on Postgres
// 16.14, both require schema CREATE (the first) or table ownership (the
// second) unconditionally, even when the target object already exists and
// the statement is a no-op in effect. That is a fact about `initSchema`'s
// existing statements, unrelated to this change's own degraded-path
// handling, so testing it under `probe` here would fail on the wrong thing.
//
// What IS reproducible: `SET LOCAL ROLE detent_audit_owner` genuinely fails
// with SQLSTATE 42501 when membership is absent — the exact condition
// `initInstanceAudit`'s own catch (`isInsufficientPrivilege`) is written to
// recognize and swallow rather than let crash `initSchema`.
test.skipIf(!DB || !PROBE)(
  "5.12 SET LOCAL ROLE fails with the exact SQLSTATE the degraded-path catch recognizes, when membership is absent",
  async () => {
    // A throwaway client, never the shared `probe` pool other tests reuse:
    // a transaction a raised SET LOCAL ROLE aborts leaves its connection in
    // a state later queries on that same pool hang against.
    const throwaway = new SQL(probeUrl(process.env.DATABASE_URL as string), { max: 1 });
    try {
      await expect(
        withTransaction(throwaway, async (tx) => {
          await tx`SET LOCAL ROLE detent_audit_owner`;
        }),
      ).rejects.toMatchObject({ errno: "42501" });
    } finally {
      await throwaway.close();
    }
  },
);

// 42501 (insufficient_privilege) is the refusal under test; any other
// rejection (a dropped connection, a typo'd relation) must fail the test
// rather than read as a pass, the way a bare catch-and-swallow would.
async function expectRefused(p: Promise<unknown>): Promise<void> {
  try {
    await p;
    throw new Error("expected statement to be refused, but it succeeded");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("expected statement to be refused")) throw e;
    expect(e).toMatchObject({ errno: "42501" });
  }
}

test.skipIf(!DB || !PROBE)("5.8 the probe role's UPDATE and DELETE against instance_audit are refused", async () => {
  const id = mkId();
  await sql`INSERT INTO instances (instance_id, transition_seq, body) VALUES (${id}, 0, ${{ data: { field_x: "seed" } }})`;
  await expectRefused(probe!`UPDATE instance_audit SET value = '"x"'::jsonb WHERE instance_id = ${id}`);
  await expectRefused(probe!`DELETE FROM instance_audit WHERE instance_id = ${id}`);
});

test.skipIf(!DB || !PROBE)(
  "5.8 membership in detent_audit_owner WITH INHERIT FALSE still leaves UPDATE and DELETE refused",
  async () => {
    const id = mkId();
    await sql`INSERT INTO instances (instance_id, transition_seq, body) VALUES (${id}, 0, ${{ data: { field_x: "seed" } }})`;
    await sql`
      DO $$ BEGIN
        GRANT detent_audit_owner TO detent_audit_probe WITH INHERIT FALSE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `;
    await expectRefused(probe!`UPDATE instance_audit SET value = '"x"'::jsonb WHERE instance_id = ${id}`);
    await expectRefused(probe!`DELETE FROM instance_audit WHERE instance_id = ${id}`);
  },
);
