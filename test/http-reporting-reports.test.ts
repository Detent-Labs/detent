/**
 * The `/reporting/reports*` HTTP surface (src/http/reporting-routes.ts):
 * report CRUD, execution, and the unsaved-draft preview/column-choice reads.
 * DB-backed — skips when DATABASE_URL is unset. The three original
 * `/reporting/*` view routes are covered by reporting-routes.test.ts; this
 * file covers only the new report routes this change adds.
 */
import { test, expect, beforeAll, beforeEach, spyOn } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createServer } from "../src/http/server.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { REPORTS_ROLE, ADMIN_ROLE } from "../src/auth/authorize.js";
import { publishBody } from "../src/engine/definitions.js";
import type { Actor } from "../src/cel/eval.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);

const owner: Actor = { id: "user_owner", roles: [REPORTS_ROLE] };
const bystander: Actor = { id: "user_bystander", roles: [] };
const adminReports: Actor = { id: "user_admin_reports", roles: [REPORTS_ROLE, ADMIN_ROLE] };
// Holds the reports role, but is neither owner, editor nor viewer of any
// report created below — the "non-member" half of the CSV route's gate.
const nonMember: Actor = { id: "user_non_member", roles: [REPORTS_ROLE] };

const req = (url: string, actor: Actor, method = "GET", body?: unknown) =>
  new Request(url, {
    method,
    headers: {
      "X-Actor-Id": actor.id,
      ...(actor.roles.length > 0 ? { "X-Actor-Roles": actor.roles.join(",") } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

let n = 0;
const pid = () => `proc_rep_http_${++n}` as ProcessId;

const body = (): ProcessBody =>
  ({
    key: "rep_http_reports",
    label: { en: "Reports HTTP" },
    baseLocale: "en",
    fields: [{ id: "field_x", key: "x", label: { en: "X" }, type: "string" }],
    workflow: {
      initialStep: "step_done",
      steps: [{ id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true }],
    },
  }) as unknown as ProcessBody;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions, auth_users, migration_plans, permission_grants, reports, report_principals`;
  if (DB) await clearInstanceAudit();
});

// ============================================================
// 4.1 CRUD routes
// ============================================================

test.skipIf(!DB)("POST /reporting/reports creates a report and returns 201", async () => {
  const P = pid();
  await publishBody(P, body(), reg, dataSourceReg);
  const res = await fetch(req("http://x/reporting/reports", owner, "POST", { processId: P, name: "My report" }));
  expect(res.status).toBe(201);
  const created = (await res.json()) as { reportId: string; owner: string };
  expect(created.owner).toBe(owner.id);
  expect(created.reportId).toBeTruthy();
});

test.skipIf(!DB)("GET /reporting/reports lists the caller's own reports", async () => {
  const P = pid();
  await publishBody(P, body(), reg, dataSourceReg);
  await fetch(req("http://x/reporting/reports", owner, "POST", { processId: P, name: "Mine" }));

  const res = await fetch(req("http://x/reporting/reports", owner));
  expect(res.status).toBe(200);
  const listed = (await res.json()) as { reports: { name: string }[] };
  expect(listed.reports.map((r) => r.name)).toContain("Mine");
});

test.skipIf(!DB)("GET/PUT/DELETE /reporting/reports/:id round-trip a report", async () => {
  const P = pid();
  await publishBody(P, body(), reg, dataSourceReg);
  const created = (await (await fetch(req("http://x/reporting/reports", owner, "POST", { processId: P, name: "Original" }))).json()) as {
    reportId: string;
  };

  const get = await fetch(req(`http://x/reporting/reports/${created.reportId}`, owner));
  expect(get.status).toBe(200);

  const put = await fetch(req(`http://x/reporting/reports/${created.reportId}`, owner, "PUT", { name: "Renamed" }));
  expect(put.status).toBe(200);
  expect(((await put.json()) as { name: string }).name).toBe("Renamed");

  const del = await fetch(req(`http://x/reporting/reports/${created.reportId}`, owner, "DELETE"));
  expect(del.status).toBe(200);

  const getAfterDelete = await fetch(req(`http://x/reporting/reports/${created.reportId}`, owner));
  expect(getAfterDelete.status).toBe(404);
});

test.skipIf(!DB)("every /reporting/reports route answers 403 without the reports role", async () => {
  const P = pid();
  await publishBody(P, body(), reg, dataSourceReg);
  const created = (await (await fetch(req("http://x/reporting/reports", owner, "POST", { processId: P, name: "R" }))).json()) as {
    reportId: string;
  };

  expect((await fetch(req("http://x/reporting/reports", bystander))).status).toBe(403);
  expect((await fetch(req("http://x/reporting/reports", bystander, "POST", { processId: P, name: "R2" }))).status).toBe(403);
  expect((await fetch(req(`http://x/reporting/reports/${created.reportId}`, bystander))).status).toBe(403);
  expect((await fetch(req(`http://x/reporting/reports/${created.reportId}`, bystander, "PUT", { name: "x" }))).status).toBe(403);
  expect((await fetch(req(`http://x/reporting/reports/${created.reportId}`, bystander, "DELETE"))).status).toBe(403);
  expect((await fetch(req(`http://x/reporting/reports/${created.reportId}/table`, bystander))).status).toBe(403);
  expect((await fetch(req("http://x/reporting/reports/preview", bystander, "POST", { processId: P }))).status).toBe(403);
  expect((await fetch(req("http://x/reporting/reports/columns", bystander, "POST", { processId: P }))).status).toBe(403);
});

// ============================================================
// 4.2 Execution + draft preview + column choices
// ============================================================

test.skipIf(!DB)("GET /reporting/reports/:id/table executes a saved report", async () => {
  const P = pid();
  const v = await publishBody(P, body(), reg, dataSourceReg);
  await createInstance(v.definition, { processId: P, version: v.version, data: { field_x: "hi" } as never }, sql);

  const created = (await (
    await fetch(
      req("http://x/reporting/reports", adminReports, "POST", {
        processId: P,
        name: "R",
        columns: [{ type: "field", fieldId: "field_x" }],
      }),
    )
  ).json()) as { reportId: string };

  const res = await fetch(req(`http://x/reporting/reports/${created.reportId}/table`, adminReports));
  expect(res.status).toBe(200);
  const table = (await res.json()) as { rows: unknown[] };
  expect(table.rows).toHaveLength(1);
});

test.skipIf(!DB)("POST /reporting/reports/preview previews an unsaved draft, gated by process read permission", async () => {
  const P = pid();
  const v = await publishBody(P, body(), reg, dataSourceReg);
  await createInstance(v.definition, { processId: P, version: v.version, data: { field_x: "hi" } as never }, sql);

  const withRead = await fetch(
    req("http://x/reporting/reports/preview", adminReports, "POST", {
      processId: P,
      columns: [{ type: "field", fieldId: "field_x" }],
    }),
  );
  expect(withRead.status).toBe(200);
  expect(((await withRead.json()) as { rows: unknown[] }).rows).toHaveLength(1);

  const noRead = await fetch(
    req("http://x/reporting/reports/preview", owner, "POST", { processId: P, columns: [{ type: "field", fieldId: "field_x" }] }),
  );
  expect(noRead.status).toBe(200);
  expect(((await noRead.json()) as { rows: unknown[] }).rows).toEqual([]);
});

test.skipIf(!DB)("POST /reporting/reports/columns returns column choices, empty without process read permission", async () => {
  const P = pid();
  const v = await publishBody(P, body(), reg, dataSourceReg);
  await createInstance(v.definition, { processId: P, version: v.version, data: { field_x: "hi" } as never }, sql);

  const withRead = await fetch(req("http://x/reporting/reports/columns", adminReports, "POST", { processId: P }));
  expect(withRead.status).toBe(200);
  const withReadBody = (await withRead.json()) as { choices: { fieldId: string; type?: string }[] };
  expect(withReadBody.choices.map((c) => c.fieldId)).toContain("field_x");
  expect(withReadBody.choices.find((c) => c.fieldId === "field_x")?.type).toBe("string");

  const noRead = await fetch(req("http://x/reporting/reports/columns", owner, "POST", { processId: P }));
  expect(((await noRead.json()) as { choices: unknown[] }).choices).toEqual([]);
});

// ============================================================
// 4.2b CSV export — reuses executeReport's gates unchanged
// ============================================================

test.skipIf(!DB)("GET /reporting/reports/:id/table.csv refuses a non-member", async () => {
  const P = pid();
  await publishBody(P, body(), reg, dataSourceReg);
  const created = (await (
    await fetch(req("http://x/reporting/reports", owner, "POST", { processId: P, name: "CSV report" }))
  ).json()) as { reportId: string };

  const res = await fetch(req(`http://x/reporting/reports/${created.reportId}/table.csv`, nonMember));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("GET /reporting/reports/:id/table.csv returns a header-only CSV for a member without read permission", async () => {
  const P = pid();
  const v = await publishBody(P, body(), reg, dataSourceReg);
  await createInstance(v.definition, { processId: P, version: v.version, data: { field_x: "hi" } as never }, sql);
  const created = (await (
    await fetch(
      req("http://x/reporting/reports", owner, "POST", {
        processId: P,
        name: "CSV report",
        columns: [{ type: "field", fieldId: "field_x" }],
      }),
    )
  ).json()) as { reportId: string };

  // `owner` is the report's own creator (a member), but holds no `read`
  // permission on the process: an empty CSV, not a refusal.
  const res = await fetch(req(`http://x/reporting/reports/${created.reportId}/table.csv`, owner));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/csv");
  expect(await res.text()).toBe("field_x\r\n");
});

test.skipIf(!DB)("GET /reporting/reports/:id/table.csv prefixes a formula string, while the table keeps the raw value", async () => {
  const P = pid();
  const v = await publishBody(P, body(), reg, dataSourceReg);
  await createInstance(v.definition, { processId: P, version: v.version, data: { field_x: "=1+1" } as never }, sql);
  const created = (await (
    await fetch(
      req("http://x/reporting/reports", adminReports, "POST", {
        processId: P,
        name: "Formula report",
        columns: [{ type: "field", fieldId: "field_x" }],
      }),
    )
  ).json()) as { reportId: string };

  const csv = await fetch(req(`http://x/reporting/reports/${created.reportId}/table.csv`, adminReports));
  expect(csv.status).toBe(200);
  expect(await csv.text()).toBe("field_x\r\n'=1+1\r\n");

  const table = await fetch(req(`http://x/reporting/reports/${created.reportId}/table`, adminReports));
  const json = (await table.json()) as { rows: { cells: { value: unknown }[] }[] };
  expect(json.rows[0]!.cells[0]!.value).toBe("=1+1");
});

// ============================================================
// 4.3 Error shapes
// ============================================================

test.skipIf(!DB)("an unknown report id answers 404 on get, update, delete and execute", async () => {
  const missing = "rep_does_not_exist";
  expect((await fetch(req(`http://x/reporting/reports/${missing}`, owner))).status).toBe(404);
  expect((await fetch(req(`http://x/reporting/reports/${missing}`, owner, "PUT", { name: "x" }))).status).toBe(404);
  expect((await fetch(req(`http://x/reporting/reports/${missing}`, owner, "DELETE"))).status).toBe(404);
  expect((await fetch(req(`http://x/reporting/reports/${missing}/table`, owner))).status).toBe(404);
});

test.skipIf(!DB)("a malformed create/update body answers 400 and runs no query", async () => {
  const P = pid();
  await publishBody(P, body(), reg, dataSourceReg);

  const before = (await sql`SELECT count(*)::int AS n FROM reports`) as { n: number }[];

  const missingName = await fetch(req("http://x/reporting/reports", owner, "POST", { processId: P }));
  expect(missingName.status).toBe(400);

  const badColumn = await fetch(
    req("http://x/reporting/reports", owner, "POST", { processId: P, name: "R", columns: [{ type: "bogus" }] }),
  );
  expect(badColumn.status).toBe(400);

  const after = (await sql`SELECT count(*)::int AS n FROM reports`) as { n: number }[];
  expect(after[0]!.n).toBe(before[0]!.n);
});

// ============================================================
// Date bounds: one instant check on write and on read
// ============================================================

type ErrorBody = { error: { type: string } };

test.skipIf(!DB)("create, save, draft preview and column choices answer 400 request-shape for a bound that is no date", async () => {
  const P = pid();
  await publishBody(P, body(), reg, dataSourceReg);
  const created = (await (
    await fetch(req("http://x/reporting/reports", owner, "POST", { processId: P, name: "Dated" }))
  ).json()) as { reportId: string };
  const before = (await sql`SELECT count(*)::int AS n FROM reports`) as { n: number }[];

  for (const query of [{ createdAfter: "letzte Woche" }, { createdBefore: "letzte Woche" }, { createdAfter: "0000-01-01" }]) {
    const answers = [
      await fetch(req("http://x/reporting/reports", owner, "POST", { processId: P, name: "Bad", query })),
      await fetch(req(`http://x/reporting/reports/${created.reportId}`, owner, "PUT", { query })),
      await fetch(req("http://x/reporting/reports/preview", adminReports, "POST", { processId: P, query })),
      await fetch(req("http://x/reporting/reports/columns", adminReports, "POST", { processId: P, query })),
    ];
    for (const res of answers) {
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).error.type).toBe("request-shape");
    }
  }

  // Neither the create nor the save left a trace.
  const after = (await sql`SELECT count(*)::int AS n FROM reports`) as { n: number }[];
  expect(after[0]!.n).toBe(before[0]!.n);
  const [stored] = (await sql`SELECT query FROM reports WHERE instance_report_id = ${created.reportId}`) as { query: unknown }[];
  expect(stored!.query).toEqual({});
});

test.skipIf(!DB)("a report whose bounds are valid instants still saves and runs", async () => {
  const P = pid();
  const v = await publishBody(P, body(), reg, dataSourceReg);
  await createInstance(v.definition, { processId: P, version: v.version, data: { field_x: "hi" } as never }, sql);
  const query = { createdAfter: "2026-10-01T00:00:00Z", createdBefore: "2999-01-01T00:00:00Z" };

  const created = await fetch(
    req("http://x/reporting/reports", adminReports, "POST", { processId: P, name: "Valid", query, columns: [{ type: "field", fieldId: "field_x" }] }),
  );
  expect(created.status).toBe(201);
  const { reportId } = (await created.json()) as { reportId: string };
  const table = await fetch(req(`http://x/reporting/reports/${reportId}/table`, adminReports));
  expect(table.status).toBe(200);
  expect(((await table.json()) as { rows: unknown[] }).rows).toHaveLength(1);
});

// A saved report predates the write-side check, or was written by SQL. The
// stored bound has to answer for itself when the report runs.
test.skipIf(!DB)("a stored report with a bound that is no date answers 400 request-shape on the table and the CSV, with no unhandled-error log", async () => {
  const P = pid();
  const v = await publishBody(P, body(), reg, dataSourceReg);
  await createInstance(v.definition, { processId: P, version: v.version, data: { field_x: "hi" } as never }, sql);
  await sql`INSERT INTO permission_grants (role, permission, scope)
    VALUES (${"finance-readers"}, ${"read"}, ${{ type: "process", config: { processId: P } }})`;
  const viewer: Actor = { id: "user_viewer", roles: [REPORTS_ROLE, "finance-readers"] };
  const created = (await (
    await fetch(
      req("http://x/reporting/reports", owner, "POST", {
        processId: P,
        name: "Stored bad bound",
        columns: [{ type: "field", fieldId: "field_x" }],
        viewers: [viewer.id],
      }),
    )
  ).json()) as { reportId: string };

  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  try {
    for (const stored of [{ createdBefore: "letzte Woche" }, { createdAfter: "0000-01-01" }]) {
      await sql`UPDATE reports SET query = ${stored} WHERE instance_report_id = ${created.reportId}`;
      for (const path of ["table", "table.csv"]) {
        const res = await fetch(req(`http://x/reporting/reports/${created.reportId}/${path}`, viewer));
        expect({ stored, path, status: res.status }).toEqual({ stored, path, status: 400 });
        expect(res.headers.get("content-type")).toContain("application/json");
        expect(((await res.json()) as ErrorBody).error.type).toBe("request-shape");
      }
    }
    const logged = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).not.toContain("unhandled error");
  } finally {
    errorSpy.mockRestore();
  }

  // A member without `read` on the process keeps the empty table, bound or not.
  const noRead = await fetch(req(`http://x/reporting/reports/${created.reportId}/table`, owner));
  expect(noRead.status).toBe(200);
  expect(((await noRead.json()) as { rows: unknown[] }).rows).toEqual([]);
  const noReadCsv = await fetch(req(`http://x/reporting/reports/${created.reportId}/table.csv`, owner));
  expect(noReadCsv.status).toBe(200);
  expect(await noReadCsv.text()).toBe("field_x\r\n");
});
