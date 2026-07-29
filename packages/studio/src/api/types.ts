import type { LocalizedText, LocaleCode, HistoryEntry, InstanceEvent } from "workflow-engine/schema";
import type { ResolvedViewField, AvailablePath, SubmissionIssue } from "form-ui";

export type { LocalizedText, LocaleCode, HistoryEntry, InstanceEvent, ResolvedViewField, AvailablePath, SubmissionIssue };

export interface Actor {
  id: string;
  roles: string[];
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  actor: Actor;
}

/** Mirrors src/engine/definitions.ts::ProcessSummary — the newest-version summary GET /processes returns per process. */
export interface ProcessSummary {
  processId: string;
  version: number;
  definitionHash: string;
  key: string;
  label: LocalizedText;
  baseLocale: LocaleCode;
}

/** Mirrors src/engine/definitions.ts::VersionSummary. */
export interface VersionSummary {
  version: number;
  definitionHash: string;
  status: string;
  publishedAt: string;
}

/** Mirrors src/engine/drafts.ts::Draft. `body`/`layout` are opaque — never parsed against ProcessBody client-side either. */
export interface DraftRecord {
  processId: string;
  body: unknown;
  layout: Record<string, unknown>;
  revision: number;
  baseVersion: number | null;
  updatedBy: string;
  updatedAt: string;
}

/** Mirrors src/engine/drafts.ts::DraftSummary — no body. */
export interface DraftSummary {
  processId: string;
  revision: number;
  baseVersion: number | null;
  updatedBy: string;
  updatedAt: string;
}

/** Echoed by POST /drafts/:processId/publish — mirrors src/engine/definitions.ts's publishBody return. */
export interface PublishResult {
  processId: string;
  version: number;
  definitionHash: string;
  status: string;
}

/** Mirrors src/engine/migration.ts::resolveMigrationPlan's return shape. `spec` is opaque JSON, never parsed client-side — same as DraftRecord.body. */
export interface MigrationPlan {
  spec: unknown;
  appliedAt: string | null;
}

/** Mirrors src/engine/migration.ts::OrphanKeyEntry. */
export interface OrphanKeyEntry {
  instanceId: string;
  keys: string[];
}

/** Mirrors src/engine/migration.ts::OrphanKeyScan. */
export interface OrphanKeyScan {
  orphans: OrphanKeyEntry[];
  unreadable: string[];
}

/** GET /registry's response: the running server's registered plugin type names, nothing more (studio-tools spec). */
export interface RegistryInfo {
  actionTypes: string[];
  dataSourceTypes: string[];
}

/** Mirrors src/runtime/api.ts::InstanceView (studio-player spec). */
export interface InstanceView {
  instanceId: string;
  processId: string;
  version: number;
  status: "running" | "completed" | "cancelled" | "faulted";
  step: { id: string; key: string; label: LocalizedText; type: string };
  fields: ResolvedViewField[];
  availablePaths: AvailablePath[];
}

/** Mirrors src/runtime/api.ts::InstanceRecordElement. */
export type InstanceRecordElement = { kind: "transition"; entry: HistoryEntry } | { kind: "event"; event: InstanceEvent };

export interface InstanceRecordPage {
  items: InstanceRecordElement[];
  cursor?: string;
}

export type ClientError =
  | { type: "authorization"; message: string }
  | { type: "actor-resolution"; message: string }
  | { type: "request-shape"; message: string }
  | { type: "not-found"; message: string }
  | { type: "draft-conflict"; message: string }
  | { type: "migration-plan"; message: string }
  | { type: "validation"; issues: SubmissionIssue[] }
  | { type: "already-claimed"; message: string }
  | { type: "not-a-candidate"; message: string }
  | { type: "not-claimed"; message: string }
  | { type: "not-claimant"; message: string }
  | { type: "not-assigned"; message: string }
  | { type: "guard-refused"; message: string }
  | { type: "concurrency-conflict" }
  | { type: "internal"; message: string };
