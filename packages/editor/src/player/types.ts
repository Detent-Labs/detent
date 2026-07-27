import type { LocalizedText } from "workflow-engine/schema";
import type { WireField, ResolvedViewField, AvailablePath, SubmissionIssue } from "form-ui";

/**
 * The Player talks to the engine only over HTTP (JSON), never in-process —
 * unlike the Draft/structural editor side, it has no reason to import
 * engine-internal runtime types (`ResolvedViewField`, `InstanceView`, ...
 * from `src/runtime/api.ts`), which the root package doesn't export anyway.
 * These types mirror the HTTP wrapper's wire shapes instead. The field-form
 * shapes (`WireField`/`ResolvedViewField`/`AvailablePath`/`SubmissionIssue`)
 * live in `form-ui`, shared with the end-user app, so the Player re-exports
 * them here rather than declaring its own copies.
 */

export type { WireField, ResolvedViewField, AvailablePath, SubmissionIssue };

export interface InstanceView {
  instanceId: string;
  processId: string;
  version: number;
  status: "running" | "completed" | "cancelled" | "faulted";
  step: { id: string; key: string; label: LocalizedText; type: string };
  fields: ResolvedViewField[];
  availablePaths: AvailablePath[];
}

export interface Actor {
  id: string;
  roles: string[];
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  actor: Actor;
}

export type ClientError =
  | { type: "validation"; issues: SubmissionIssue[] }
  | { type: "guard-refused"; message: string }
  | { type: "concurrency-conflict" }
  | { type: "rate-limited"; message: string }
  | { type: "internal"; message: string };
