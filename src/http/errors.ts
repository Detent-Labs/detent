/**
 * Maps a thrown value from the Runtime API Layer to a plain
 * `{status, body}` shape. `routes.ts` hands this whatever it catches;
 * `server.ts` turns the result into a real `Response`. Only the Runtime API
 * Layer's typed errors get a specific status — anything else (including its
 * own untyped "not found" `Error`s) falls back to 500. See design.md's
 * "Error mapping" for why not-found stays 500 instead of 404.
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
import { DurationValidationError } from "../schema/compile.js";
import { ZodError } from "zod";

export type HttpResult = { status: number; body: unknown };

/** A request's shape (a query parameter, a JSON body) is malformed — the client can fix it by reading the API. */
export class RequestShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestShapeError";
  }
}

type IssuesMapping = { ctor: new (...args: any[]) => Error & { issues: unknown }; status: number; type: string };
type MessageMapping = { ctor: new (...args: any[]) => Error; status: number; type: string };

const ISSUES_ERRORS: IssuesMapping[] = [
  { ctor: SubmissionValidationError, status: 422, type: "validation" },
  { ctor: RegistryValidationError, status: 422, type: "registry-validation" },
  { ctor: AssignmentRegistryValidationError, status: 422, type: "registry-validation" },
  { ctor: DataSourceRegistryValidationError, status: 422, type: "registry-validation" },
  { ctor: CelValidationError, status: 422, type: "cel-validation" },
  { ctor: DurationValidationError, status: 422, type: "duration-validation" },
  { ctor: ZodError, status: 422, type: "schema-validation" },
];

const MESSAGE_ERRORS: MessageMapping[] = [
  { ctor: RequestShapeError, status: 400, type: "request-shape" },
  { ctor: CrossProcessValidationError, status: 422, type: "cross-process-validation" },
  { ctor: GuardRefused, status: 409, type: "guard-refused" },
  { ctor: PinMismatch, status: 500, type: "internal" },
  { ctor: ActorResolutionError, status: 401, type: "actor-resolution" },
  { ctor: AuthorizationError, status: 403, type: "authorization" },
  { ctor: NotAssignedError, status: 403, type: "not-assigned" },
  { ctor: NotACandidateError, status: 403, type: "not-a-candidate" },
  { ctor: AlreadyClaimedError, status: 403, type: "already-claimed" },
  { ctor: NotClaimedError, status: 403, type: "not-claimed" },
  { ctor: NotClaimantError, status: 403, type: "not-claimant" },
];

export function mapError(err: unknown): HttpResult {
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
  const fallbackMessage = err instanceof Error ? err.message : String(err);
  return { status: 500, body: { error: { type: "internal", message: fallbackMessage } } };
}
