/**
 * Maps a thrown value from the Runtime API Layer to a plain
 * `{status, body}` shape. `routes.ts` (and its `admin-routes.ts`/
 * `studio-routes.ts` siblings) hand this whatever they catch, plus the
 * request's method and path, and turn the result into a real `Response`.
 * Every typed error below gets a specific status. Anything else — a
 * `Bun.sql` error, a plugin handler's throw, a programming fault — falls
 * back to 500 with a message-free body (`{ error: { type: "internal" } }`,
 * the shape `ConcurrencyConflict` already uses) and is logged server-side
 * with its message, its stack, and the request's method and path: the
 * client learns the request failed, the operator learns why. The Runtime API
 * Layer's not-found conditions are the one exception carved out of that
 * fallback — typed as `NotFoundError` and kept message-bearing at 500 (not
 * 404; see design.md's "Keep not-found at 500" and the recorded open
 * question), so that spec-pinned scenario survives the fallback going
 * message-free.
 */
import {
  SubmissionValidationError,
  GuardRefused,
  ConcurrencyConflict,
  PinMismatch,
  NotAssignedError,
  NotACandidateError,
  AlreadyClaimedError,
  NotClaimedError,
  NotClaimantError,
} from "../runtime/api.js";
import { ActorResolutionError } from "../auth/resolve.js";
import { AuthorizationError } from "../auth/authorize.js";
import {
  CrossProcessValidationError,
  CelValidationError,
  RegistryValidationError,
  AssignmentRegistryValidationError,
  DataSourceRegistryValidationError,
} from "../engine/definitions.js";
import { DurationValidationError, CompileValidationError } from "../schema/compile.js";
import { DraftConflictError } from "../engine/drafts.js";
import { MigrationPlanError } from "../engine/migration.js";
import { ZodError } from "zod";
import { RequestShapeError, NotFoundError, InstanceNotRunningError, InstanceRunningError } from "../errors.js";

export type HttpResult = { status: number; body: unknown };

/**
 * The one route whose success response is not JSON: an attachment download.
 * `handleGetAttachment` alone returns this, on success; its own errors still
 * map to a plain `HttpResult` through `mapError` like every other route. See
 * `add-instance-attachments`'s design.md, "The download route breaks the
 * JSON-only response envelope".
 */
export type HttpBinaryResult = { status: number; contentType: string; data: Uint8Array };

/** Method and path of the request being mapped, threaded in so the fallback's log entry is actionable — a stack with no request is not. */
export type ErrorContext = { method: string; path: string };

export { RequestShapeError, NotFoundError, InstanceNotRunningError, InstanceRunningError };

type IssuesMapping = { ctor: new (...args: any[]) => Error & { issues: unknown }; status: number; type: string };
type MessageMapping = { ctor: new (...args: any[]) => Error; status: number; type: string };

const ISSUES_ERRORS: IssuesMapping[] = [
  { ctor: SubmissionValidationError, status: 422, type: "validation" },
  { ctor: RegistryValidationError, status: 422, type: "registry-validation" },
  { ctor: AssignmentRegistryValidationError, status: 422, type: "registry-validation" },
  { ctor: DataSourceRegistryValidationError, status: 422, type: "registry-validation" },
  { ctor: CelValidationError, status: 422, type: "cel-validation" },
  { ctor: DurationValidationError, status: 422, type: "duration-validation" },
  { ctor: CompileValidationError, status: 422, type: "compile-validation" },
  { ctor: ZodError, status: 422, type: "schema-validation" },
];

const MESSAGE_ERRORS: MessageMapping[] = [
  { ctor: RequestShapeError, status: 400, type: "request-shape" },
  { ctor: CrossProcessValidationError, status: 422, type: "cross-process-validation" },
  { ctor: GuardRefused, status: 409, type: "guard-refused" },
  { ctor: InstanceNotRunningError, status: 409, type: "instance-not-running" },
  { ctor: InstanceRunningError, status: 409, type: "instance-running" },
  { ctor: PinMismatch, status: 500, type: "internal" },
  { ctor: NotFoundError, status: 500, type: "internal" },
  { ctor: ActorResolutionError, status: 401, type: "actor-resolution" },
  { ctor: AuthorizationError, status: 403, type: "authorization" },
  { ctor: NotAssignedError, status: 403, type: "not-assigned" },
  { ctor: NotACandidateError, status: 403, type: "not-a-candidate" },
  { ctor: AlreadyClaimedError, status: 403, type: "already-claimed" },
  { ctor: NotClaimedError, status: 403, type: "not-claimed" },
  { ctor: NotClaimantError, status: 403, type: "not-claimant" },
  { ctor: DraftConflictError, status: 409, type: "draft-conflict" },
  { ctor: MigrationPlanError, status: 409, type: "migration-plan" },
];

export function mapError(err: unknown, ctx?: ErrorContext): HttpResult {
  const issues = ISSUES_ERRORS.find((e) => err instanceof e.ctor);
  if (issues) {
    return { status: issues.status, body: { error: { type: issues.type, issues: (err as { issues: unknown }).issues } } };
  }
  if (err instanceof ConcurrencyConflict) {
    return { status: 409, body: { error: { type: "concurrency-conflict" } } };
  }
  const message = MESSAGE_ERRORS.find((e) => err instanceof e.ctor);
  if (message) {
    return { status: message.status, body: { error: { type: message.type, message: (err as Error).message } } };
  }
  // Unrecognized: a Bun.sql error naming relations/columns/constraints, a
  // plugin handler's throw, a programming fault. Logged in full server-side
  // — the operator's only trace of it — and disclosed to the client as
  // nothing but the fact that something failed.
  const where = ctx ? `${ctx.method} ${ctx.path}` : "(unknown request)";
  console.error(`[http] unhandled error on ${where}:`, err instanceof Error ? (err.stack ?? err.message) : err);
  return { status: 500, body: { error: { type: "internal" } } };
}
