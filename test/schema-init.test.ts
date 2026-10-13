/**
 * `openspec/changes/tidy-engine-internals`, "initSchema leaves an older
 * database as it is": every column sits in its table's CREATE TABLE, and
 * `initSchema` runs no ALTER ... ADD COLUMN, no DROP INDEX and no data-fixing
 * UPDATE. DB-backed; skips when DATABASE_URL is unset.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { SQL } from "bun";
import { sql, initSchema } from "../src/engine/store.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;

// --- Two runs change no row --------------------------------------------------

beforeEach(async () => {
  if (!DB) return;
  await sql`TRUNCATE outbox, instances`;
  await clearInstanceAudit();
});
afterEach(async () => {
  if (!DB) return;
  await sql`TRUNCATE outbox, instances`;
  await clearInstanceAudit();
});

/** Every stored row of `table`, with the system column that changes on any UPDATE. */
const snapshot = async (table: "outbox" | "instances"): Promise<unknown[]> =>
  (await sql.unsafe(`SELECT xmin::text AS version, to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)) as unknown[];

test.skipIf(!DB)("two initSchema runs change no outbox row and no instances row", async () => {
  const body = (status: string, id: string) => ({
    instanceId: id,
    processId: "proc_schema_init",
    version: 1,
    definitionHash: "h",
    currentStepId: "step_a",
    transitionSeq: 0,
    data: {},
    status,
    startedAt: "2026-01-01T00:00:00.000Z",
  });
  // Rows the retired fix-up statements used to rewrite: a mark on an instance that
  // is not running, and an outbox row with no field_version.
  await sql`INSERT INTO instances (instance_id, transition_seq, body, resolve_state) VALUES
    ('inst_si_done', 0, ${body("completed", "inst_si_done")}, 'pending'),
    ('inst_si_live', 0, ${body("running", "inst_si_live")}, 'pending')`;
  await sql`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action, status) VALUES
    ('key_si_1', 'inst_si_live', 1, 'act_x', '{"type":"http.request"}'::jsonb, 'pending'),
    ('key_si_2', 'inst_si_done', 1, 'act_y', '{"type":"http.request"}'::jsonb, 'delivered')`;

  const outboxBefore = await snapshot("outbox");
  const instancesBefore = await snapshot("instances");
  expect(outboxBefore).toHaveLength(2); // the fixture has to hold, or the equality below is vacuous
  expect(instancesBefore).toHaveLength(2);

  await initSchema();
  await initSchema();

  expect(await snapshot("outbox")).toEqual(outboxBefore);
  expect(await snapshot("instances")).toEqual(instancesBefore);
});

// --- Source text ---------------------------------------------------------------

test("initSchema holds no ADD COLUMN, DROP INDEX or UPDATE statement", async () => {
  const text = await Bun.file(new URL("../src/engine/store.ts", import.meta.url)).text();
  const start = text.indexOf("export async function initSchema");
  const end = text.indexOf("\n}\n", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const fn = text.slice(start, end);
  expect(fn).not.toMatch(/ADD COLUMN/i);
  expect(fn).not.toMatch(/DROP INDEX/i);
  expect(fn).not.toMatch(/\bdb`\s*UPDATE\b/i);
});

// --- Scratch databases ---------------------------------------------------------

// A new database runs the whole initSchema, pgcrypto and the audit roles included.
const SCRATCH_TIMEOUT_MS = 60_000;

function urlFor(database: string): string {
  const parsed = new URL(process.env.DATABASE_URL!);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/** Runs `fn` against a new empty database, then drops it. The shared test database stays untouched. */
async function withScratchDatabase(fn: (scratch: SQL) => Promise<void>): Promise<void> {
  const name = `schema_init_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const admin = new SQL(urlFor("postgres"));
  let scratch: SQL | undefined;
  try {
    // The identifier cannot be a bind parameter; `name` is generated above, not input.
    await admin.unsafe(`CREATE DATABASE "${name}"`);
    scratch = new SQL(urlFor(name));
    await fn(scratch);
  } finally {
    await scratch?.close();
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.close();
  }
}

const columnNames = async (db: SQL, table: string): Promise<string[]> =>
  ((await db`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table} ORDER BY column_name`) as {
    column_name: string;
  }[]).map((r) => r.column_name);

const catalog = async (db: SQL): Promise<unknown[]> =>
  (await db`
    SELECT 'column' AS kind, table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' '
      || coalesce(column_default, '') || ' ' || is_generated || ' ' || coalesce(generation_expression, '') AS def
    FROM information_schema.columns WHERE table_schema = 'public'
    UNION ALL
    SELECT 'index', indexdef FROM pg_indexes WHERE schemaname = 'public'
    ORDER BY 1, 2`) as unknown[];

test.skipIf(!DB)("a fresh database holds every column from its CREATE TABLE, and a second run changes no definition", async () => {
  await withScratchDatabase(async (scratch) => {
    await initSchema(scratch);
    expect(await columnNames(scratch, "outbox")).toEqual(
      expect.arrayContaining(["claimed_at", "event_id", "field_version", "last_error", "actors"]),
    );
    expect(await columnNames(scratch, "instances")).toEqual(
      expect.arrayContaining([
        "resolve_state", "resolve_claimed_at", "cancel_sweep_state", "next_timer_at", "created_at", "redacted_at", "kind",
        "process_id", "version", "status", "current_step_id", "started_by", "started_at",
      ]),
    );
    expect(await columnNames(scratch, "auth_users")).toEqual(
      expect.arrayContaining(["manager_user_id", "display_name", "locale"]),
    );
    expect(await columnNames(scratch, "data_lists")).toContain("columns");
    expect(await columnNames(scratch, "data_list_values")).toContain("attributes");

    const before = await catalog(scratch);
    await initSchema(scratch);
    expect(await catalog(scratch)).toEqual(before);
  });
}, SCRATCH_TIMEOUT_MS);

test.skipIf(!DB)("an instances table without redacted_at stays without it after initSchema", async () => {
  await withScratchDatabase(async (scratch) => {
    await initSchema(scratch);
    await scratch.unsafe(`ALTER TABLE instances DROP COLUMN redacted_at`);

    // The index over redacted_at has no column to stand on, so this run may raise.
    // The scenario concerns the table, not the outcome of the run.
    await initSchema(scratch).catch(() => undefined);

    expect(await columnNames(scratch, "instances")).not.toContain("redacted_at");
  });
}, SCRATCH_TIMEOUT_MS);

// --- A role name with a double quote ---------------------------------------------

// `GRANT ... TO "<role>"` with a bare interpolated name breaks on the `"`; the
// grants have to name the same role through quote_ident instead.
test.skipIf(!DB)("initSchema run as a role whose name has a double quote grants that role the audit privileges", async () => {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const role = `eng"role_${suffix}`;
  const quoted = `"${role.replaceAll('"', '""')}"`;
  const database = `schema_init_q_${suffix}`;
  const password = crypto.randomUUID();
  const admin = new SQL(urlFor("postgres"));
  let engine: SQL | undefined;
  try {
    // Least privilege: a plain LOGIN role that owns the scratch database (CREATE on
    // the database and on schema public) and holds ADMIN OPTION on detent_audit_owner,
    // which lets initSchema grant itself the membership it needs. Neither SUPERUSER nor
    // CREATEROLE. Identifiers cannot be bind parameters; every name here is generated.
    await admin.unsafe(`CREATE ROLE ${quoted} LOGIN PASSWORD '${password}'`);
    // The shared test database ran initSchema already, so detent_audit_owner exists.
    await admin.unsafe(`GRANT detent_audit_owner TO ${quoted} WITH ADMIN OPTION`);
    await admin.unsafe(`CREATE DATABASE "${database}" OWNER ${quoted}`);

    const url = new URL(urlFor(database));
    url.username = role;
    url.password = password;
    engine = new SQL(url.toString());
    expect(((await engine`SELECT current_user`) as { current_user: string }[])[0].current_user).toBe(role);

    await initSchema(engine);

    const [held] = (await engine`
      SELECT has_table_privilege(current_user, 'instance_audit', 'INSERT') AS can_insert,
             has_table_privilege(current_user, 'instance_audit', 'SELECT') AS can_select,
             has_function_privilege(current_user, 'redact_instance_fields(text, text, text, bigint, text[])', 'EXECUTE') AS can_redact
    `) as { can_insert: boolean; can_select: boolean; can_redact: boolean }[];
    expect(held).toEqual({ can_insert: true, can_select: true, can_redact: true });
  } finally {
    await engine?.close();
    await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.unsafe(`DROP ROLE IF EXISTS ${quoted}`);
    await admin.close();
  }
}, SCRATCH_TIMEOUT_MS);

test.skipIf(!DB)("an auth_users table without its three optional columns stays without them after initSchema", async () => {
  await withScratchDatabase(async (scratch) => {
    await initSchema(scratch);
    await scratch.unsafe(`ALTER TABLE auth_users DROP COLUMN manager_user_id, DROP COLUMN display_name, DROP COLUMN locale`);

    await initSchema(scratch);

    const columns = await columnNames(scratch, "auth_users");
    expect(columns).not.toContain("manager_user_id");
    expect(columns).not.toContain("display_name");
    expect(columns).not.toContain("locale");
  });
}, SCRATCH_TIMEOUT_MS);
