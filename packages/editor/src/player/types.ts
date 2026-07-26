import type { BaseFieldType, Plugin, LocalizedText, FieldOption } from "workflow-engine/schema";

/**
 * The Player talks to the engine only over HTTP (JSON), never in-process —
 * unlike the Draft/structural editor side, it has no reason to import
 * engine-internal runtime types (`ResolvedViewField`, `InstanceView`, ...
 * from `src/runtime/api.ts`), which the root package doesn't export anyway.
 * These types mirror the HTTP wrapper's wire shapes instead.
 */

export interface WireField {
  id: string;
  key: string;
  label: LocalizedText;
  description?: LocalizedText;
  type: BaseFieldType | Plugin;
  options?: FieldOption[];
  dataSource?: string;
}

export interface ResolvedViewField {
  field: WireField;
  value: unknown;
  required: boolean;
  readonly: boolean;
  group?: string;
  options?: FieldOption[];
}

export interface AvailablePath {
  id: string;
  key: string;
  label?: string;
}

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

export interface SubmissionIssue {
  kind: string;
  fieldId: string;
  [key: string]: unknown;
}

export type ClientError =
  | { type: "validation"; issues: SubmissionIssue[] }
  | { type: "guard-refused"; message: string }
  | { type: "concurrency-conflict" }
  | { type: "rate-limited"; message: string }
  | { type: "internal"; message: string };
