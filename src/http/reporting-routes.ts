/**
 * Process-owner routes behind `system:reports`: a process list, the three
 * read-only views, and saved-report CRUD/execution. Kept out of `routes.ts`
 * the same way `admin-routes.ts` and `studio-routes.ts` are — one file per
 * role-scoped surface. Same framework-agnostic handler shape, and the same
 * `resolveActor` and `guarded` helpers, imported from `routes.ts` rather
 * than copied.
 *
 * Every handler requires the role BEFORE resolving the process or report, so
 * a caller without it gets 403 for an id that does not exist, and cannot
 * probe which ids do. The three view handlers and the report reads stay
 * read-only; the report CRUD handlers below are this file's one exception
 * (`reporting-app`'s "The frontend offers no way to change anything" names
 * it explicitly) — each confines its write to the `reports`/
 * `report_principals` tables, through the Runtime API Layer's own
 * `createReport`/`updateReport`/`deleteReport`.
 */
import type { SQL } from "bun";
import { z } from "zod";
import { listProcesses } from "../engine/definitions.js";
import { cycleTime, bottleneck, sla, type DateRange } from "../engine/reporting.js";
import {
  createReport,
  updateReport,
  deleteReport,
  getReport,
  listMyReports,
  executeReport,
  previewReportDraft,
  previewReportColumnChoices,
  type ReportQuery,
  type ReportColumn,
} from "../runtime/api.js";
import { instanceStatus, type ProcessId } from "../schema/definition.js";
import type { ActorResolver } from "../auth/resolve.js";
import { requireRole, REPORTS_ROLE } from "../auth/authorize.js";
import { RequestShapeError, notFound, type HttpResult } from "./errors.js";
import { route, readJson } from "./routes.js";

/**
 * Shallow envelope schemas for the report request bodies, mirroring
 * `routes.ts`'s own "Zod for the two request bodies, not hand-written
 * checks" precedent. Deliberately loose on `dataWhere`'s `value`: deep
 * validation is `queryInstances`'s own job at execution time (it already
 * raises `RequestShapeError` there), so duplicating it here would create a
 * second place to keep the rule in sync.
 */
const reportColumnSchema = z.union([
  z.object({ type: z.literal("field"), fieldId: z.string().min(1) }),
  z.object({ type: z.literal("merge"), fieldIds: z.array(z.string().min(1)).min(1) }),
]);
const reportQuerySchema = z.object({
  status: z.array(instanceStatus).optional(),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  dataWhere: z.array(z.object({ fieldId: z.string().min(1), operator: z.enum(["eq", "ne", "in"]), value: z.unknown() })).optional(),
});
const createReportBodySchema = z.object({
  processId: z.string().min(1),
  name: z.string().min(1),
  query: reportQuerySchema.optional(),
  columns: z.array(reportColumnSchema).optional(),
  viewers: z.array(z.string()).optional(),
  editors: z.array(z.string()).optional(),
});
const updateReportBodySchema = z.object({
  name: z.string().min(1).optional(),
  owner: z.string().min(1).optional(),
  query: reportQuerySchema.optional(),
  columns: z.array(reportColumnSchema).optional(),
  viewers: z.array(z.string()).optional(),
  editors: z.array(z.string()).optional(),
});
const draftPreviewBodySchema = z.object({
  processId: z.string().min(1),
  query: reportQuerySchema.optional(),
  columns: z.array(reportColumnSchema).optional(),
});
const columnChoicesBodySchema = z.object({
  processId: z.string().min(1),
  query: reportQuerySchema.optional(),
});

/** `routes.ts`'s own `parseJsonBody`, not exported — this file keeps its own copy, the same split `admin-routes.ts`'s `readJson`-based parsing already follows. */
async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await readJson(req);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new RequestShapeError(`request body does not match the expected shape: ${parsed.error.message}`);
  return parsed.data;
}

/**
 * Both bounds are required and must parse. The frontend computes the
 * last-30-days default and sends it explicitly on every request, so there is no
 * server-side default to fall back to — an absent bound is a request error, not
 * an invitation to guess a window.
 */
function parseRange(url: URL): DateRange {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from === null || to === null) throw new RequestShapeError("both 'from' and 'to' are required");
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs)) throw new RequestShapeError(`'from' must be an ISO date, got '${from}'`);
  if (Number.isNaN(toMs)) throw new RequestShapeError(`'to' must be an ISO date, got '${to}'`);
  if (fromMs > toMs) throw new RequestShapeError("'from' must not be after 'to'");
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() };
}

export async function handleReportingListProcesses(req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return route(req, resolver, db, (actor) => requireRole(actor, REPORTS_ROLE), async () => {
    return { status: 200, body: { processes: await listProcesses(db) } };
  });
}

/**
 * The three views differ only in which engine function they call, so they share
 * one handler rather than three near-identical ones. `view` is fixed by the
 * router's own path match, never read off the request.
 */
async function handleView(
  processId: string,
  view: "cycle-time" | "bottleneck" | "sla",
  req: Request,
  resolver: ActorResolver,
  db: SQL,
): Promise<HttpResult> {
  return route(req, resolver, db, (actor) => requireRole(actor, REPORTS_ROLE), async () => {
    const range = parseRange(new URL(req.url));
    const id = processId as ProcessId;
    const result = view === "cycle-time"
      ? await cycleTime(id, range, db)
      : view === "bottleneck"
        ? await bottleneck(id, range, db)
        : await sla(id, range, db);
    if (!result) return notFound(`no such process: ${processId}`);
    return { status: 200, body: result as unknown as Record<string, unknown> };
  });
}

export async function handleReportingCycleTime(processId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return handleView(processId, "cycle-time", req, resolver, db);
}

export async function handleReportingBottleneck(processId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return handleView(processId, "bottleneck", req, resolver, db);
}

export async function handleReportingSla(processId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return handleView(processId, "sla", req, resolver, db);
}

// ============================================================
// Saved reports: CRUD, execution, and the unsaved-draft preview
// ============================================================

export async function handleListReports(req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return route(req, resolver, db, (actor) => requireRole(actor, REPORTS_ROLE), async (actor) => {
    return { status: 200, body: { reports: await listMyReports(actor, db) } };
  });
}

export async function handleCreateReport(req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return route(req, resolver, db, (actor) => requireRole(actor, REPORTS_ROLE), async (actor) => {
    const body = await parseBody(req, createReportBodySchema);
    const report = await createReport(
      actor,
      {
        processId: body.processId as ProcessId,
        name: body.name,
        query: body.query as ReportQuery | undefined,
        columns: body.columns as ReportColumn[] | undefined,
        viewers: body.viewers,
        editors: body.editors,
      },
      db,
    );
    return { status: 201, body: report };
  });
}

export async function handleGetReport(reportId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return route(req, resolver, db, (actor) => requireRole(actor, REPORTS_ROLE), async (actor) => {
    const report = await getReport(reportId, actor, db);
    if (!report) return notFound(`no such report: ${reportId}`);
    return { status: 200, body: report };
  });
}

export async function handleUpdateReport(reportId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return route(req, resolver, db, (actor) => requireRole(actor, REPORTS_ROLE), async (actor) => {
    const body = await parseBody(req, updateReportBodySchema);
    const updated = await updateReport(
      reportId,
      actor,
      {
        name: body.name,
        owner: body.owner,
        query: body.query as ReportQuery | undefined,
        columns: body.columns as ReportColumn[] | undefined,
        viewers: body.viewers,
        editors: body.editors,
      },
      db,
    );
    if (!updated) return notFound(`no such report: ${reportId}`);
    return { status: 200, body: updated };
  });
}

export async function handleDeleteReport(reportId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return route(req, resolver, db, (actor) => requireRole(actor, REPORTS_ROLE), async (actor) => {
    const result = await deleteReport(reportId, actor, db);
    if (!result) return notFound(`no such report: ${reportId}`);
    return { status: 200, body: result };
  });
}

export async function handleExecuteReport(reportId: string, req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return route(req, resolver, db, (actor) => requireRole(actor, REPORTS_ROLE), async (actor) => {
    const result = await executeReport(reportId, actor, db);
    if (!result) return notFound(`no such report: ${reportId}`);
    return { status: 200, body: result };
  });
}

/** The builder's live preview of an unsaved draft — same result shape as `handleExecuteReport`, gated the same way (`can(actor, "read", processId, db)`, inside `previewReportDraft`), but against a configuration named in the body rather than a stored report id. */
export async function handlePreviewReport(req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return route(req, resolver, db, (actor) => requireRole(actor, REPORTS_ROLE), async (actor) => {
    const body = await parseBody(req, draftPreviewBodySchema);
    const result = await previewReportDraft(
      { processId: body.processId as ProcessId, query: (body.query ?? {}) as ReportQuery, columns: (body.columns ?? []) as ReportColumn[] },
      actor,
      db,
    );
    return { status: 200, body: result };
  });
}

/** The column choices a builder offers before any column is picked — same process-`read` gate as a saved execution, via `previewReportColumnChoices`. */
export async function handleReportColumnChoices(req: Request, resolver: ActorResolver, db: SQL): Promise<HttpResult> {
  return route(req, resolver, db, (actor) => requireRole(actor, REPORTS_ROLE), async (actor) => {
    const body = await parseBody(req, columnChoicesBodySchema);
    const choices = await previewReportColumnChoices(body.processId as ProcessId, (body.query ?? {}) as ReportQuery, actor, db);
    return { status: 200, body: { choices } };
  });
}
