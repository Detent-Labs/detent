/**
 * Process-owner routes behind `system:reports`: a process list and the three
 * views. Kept out of `routes.ts` the same way `admin-routes.ts` and
 * `studio-routes.ts` are — one file per role-scoped surface. Same
 * framework-agnostic handler shape, and the same `resolveActor` and `guarded`
 * helpers, imported from `routes.ts` rather than copied.
 *
 * Every handler requires the role BEFORE resolving the process, so a caller
 * without it gets 403 for a process id that does not exist, and cannot probe
 * which ids do. Read-only throughout: no handler here writes.
 */
import type { SQL } from "bun";
import { listProcesses } from "../engine/definitions.js";
import { cycleTime, bottleneck, sla, type DateRange } from "../engine/reporting.js";
import type { ProcessId } from "../schema/definition.js";
import type { ActorResolver } from "../auth/resolve.js";
import { requireRole, REPORTS_ROLE } from "../auth/authorize.js";
import { RequestShapeError, notFound, type HttpResult } from "./errors.js";
import { route } from "./routes.js";

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
