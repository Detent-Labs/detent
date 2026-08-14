/**
 * `openspec/changes/fix-schema-bootstrap-and-indexes`: `bun run serve`
 * (`startHttpServer`) and `src/auth/cli.ts` must create the schema on a
 * fresh database instead of failing at request/command time (ERR-9), and a
 * missing `DATABASE_URL` must fail loudly at construction, naming the
 * variable, instead of deferring an opaque connection error to whichever
 * query happens to run first.
 */
import { test, expect, afterEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { startHttpServer } from "../src/http/server.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { publishBody } from "../src/engine/definitions.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;

/** step_a (task, terminal): field_amount (number). The minimum a publish needs. */
const minimalBody = (): ProcessBody =>
  ({
    key: "schema_bootstrap_minimal",
    label: { en: "Schema Bootstrap Minimal" },
    baseLocale: "en",
    fields: [{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
    workflow: {
      initialStep: "step_a",
      steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true }],
    },
  }) as unknown as ProcessBody;

let stopServer: (() => Promise<void>) | undefined;

afterEach(async () => {
  // Awaited: `stop` drains in-flight requests before it resolves, and the
  // next test asks the OS for a port straight after.
  await stopServer?.();
  stopServer = undefined;
  // However a test above finished, leave a full schema behind for every
  // other suite sharing this database — the same guarantee initSchema's own
  // idempotency gives a real deployment.
  if (DB) await initSchema(sql);
});

test.skipIf(!DB)(
  "starting the http server against a database with the schema dropped creates it, and requests succeed",
  async () => {
    // Every table initSchema creates today — a genuinely fresh database.
    await sql`DROP TABLE IF EXISTS outbox, instances, history_entries, instance_events, definitions, migration_plans, auth_users, drafts, data_list_values, data_lists CASCADE`;

    const prevPort = process.env.PORT;
    // The OS picks (`development-toolchain`: "A test that spawns a server takes
    // an ephemeral port and reaps its child"). A fixed number here outlived a
    // run that died and blocked the next one.
    process.env.PORT = "0";
    try {
      const server = await startHttpServer(createRegistry(), createDataSourceRegistry(), sql, devHeaderResolver);
      stopServer = server.stop;

      const res = await fetch(`http://127.0.0.1:${server.port}/processes`, { headers: { "X-Actor-Id": "schema-bootstrap-test" } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    } finally {
      process.env.PORT = prevPort;
    }
  },
);

test.skipIf(!DB)(
  "starting the http server against a database that already has the schema changes nothing",
  async () => {
    await initSchema(sql);
    await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
    const reg = createRegistry();
    const dsReg = createDataSourceRegistry();
    const processId = `proc_schema_bootstrap_${crypto.randomUUID()}` as ProcessId;
    const published = await publishBody(processId, minimalBody(), reg, dsReg, sql);

    const prevPort = process.env.PORT;
    process.env.PORT = "0";
    try {
      const server = await startHttpServer(reg, dsReg, sql, devHeaderResolver);
      stopServer = server.stop;

      const res = await fetch(`http://127.0.0.1:${server.port}/processes`, { headers: { "X-Actor-Id": "schema-bootstrap-test" } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { processId: string; version: number; definitionHash: string; status: string }[];
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({ processId, version: published.version, definitionHash: published.definitionHash, status: "published" });
    } finally {
      process.env.PORT = prevPort;
    }
  },
);

test.skipIf(!DB)(
  "bun run src/auth/cli.ts add-user against a database with auth_users dropped creates the schema and completes",
  async () => {
    await sql`DROP TABLE IF EXISTS auth_users CASCADE`;

    const proc = Bun.spawn(
      ["bun", "run", "src/auth/cli.ts", "add-user", "fresh-db-cli@example.com", "correct-horse", "employee"],
      { env: { ...process.env }, stdout: "pipe", stderr: "pipe" },
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      console.error(await new Response(proc.stderr).text());
    }
    expect(exitCode).toBe(0);

    const rows = (await sql`SELECT 1 FROM auth_users WHERE email = ${"fresh-db-cli@example.com"}`) as unknown[];
    expect(rows).toHaveLength(1);
  },
);

test.skipIf(!DB)("running the CLI with DATABASE_URL unset fails immediately, naming the variable", async () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;

  const proc = Bun.spawn(["bun", "run", "src/auth/cli.ts", "add-user", "no-db@example.com", "correct-horse"], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stderr = await new Response(proc.stderr).text();

  expect(exitCode).not.toBe(0);
  expect(stderr).toContain("DATABASE_URL");
});
