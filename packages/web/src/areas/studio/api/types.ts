import type { LocalizedText, LocaleCode } from "workflow-engine/schema";
import type { ResolvedViewField, ResolvedViewEntry, AvailablePath, SubmissionIssue } from "form-ui";

export type { LocalizedText, LocaleCode, ResolvedViewField, ResolvedViewEntry, AvailablePath, SubmissionIssue };

export type { Actor, LoginResponse, ClientError, PublishIssue, VersionSummary, InstanceRecordElement, InstanceRecordPage } from "../../../api/types.js";

/** Mirrors src/engine/definitions.ts::ProcessSummary — the newest-version summary GET /processes returns per process. */
export interface ProcessSummary {
  processId: string;
  version: number;
  definitionHash: string;
  key: string;
  label: LocalizedText;
  baseLocale: LocaleCode;
}

/**
 * Mirrors src/engine/drafts.ts::Draft. `body`/`layout` are opaque — never
 * parsed against ProcessBody client-side either. `canPlanMigration` and
 * `canPublish` are not part of `Draft`: `handleGetDraft` computes each per
 * request, from `can(actor, "migrate", processId, db)` and
 * `can(actor, "publish", processId, db)`, beside the stored fields.
 */
export interface DraftRecord {
  processId: string;
  body: unknown;
  layout: Record<string, unknown>;
  revision: number;
  baseVersion: number | null;
  updatedBy: string;
  updatedAt: string;
  canPlanMigration: boolean;
  canPublish: boolean;
}

/** Mirrors src/engine/drafts.ts::DraftSummary — no body. */
export interface DraftSummary {
  processId: string;
  revision: number;
  baseVersion: number | null;
  updatedBy: string;
  updatedAt: string;
}

/**
 * Mirrors src/engine/definitions.ts::PublishFinding — a reported (not
 * rejected) reference `"instance.query"`'s or `instance.transition`'s
 * cross-process check flags. `dataSourceId` is optional: an action-site
 * finding names no data source.
 */
export interface PublishFinding {
  loc: string;
  dataSourceId?: string;
  referenceKind: "step" | "field" | "path";
  reference: string;
  carriedByVersions: number[];
  liveInstanceCountOutsideCarryingVersions: number;
}

/** Echoed by POST /drafts/:processId/publish — mirrors src/engine/definitions.ts's publishBody return. */
export interface PublishResult {
  processId: string;
  version: number;
  definitionHash: string;
  status: string;
  findings: PublishFinding[];
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

/**
 * Mirrors src/engine/config-descriptor.ts::ConfigFieldDescriptor
 * (studio-plugin-config-form spec).
 */
export interface ConfigFieldDescriptor {
  key: string;
  kind: "string" | "number" | "boolean" | "enum" | "string-array";
  required: boolean;
  enumValues?: string[];
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  minItems?: number;
  maxItems?: number;
  format?: "email";
}

/**
 * GET /registry's response: the running server's registered plugin type
 * names (studio-tools spec), plus a config-schema description per type
 * where one exists (studio-plugin-config-form spec) — keyed per registry,
 * since a type name (e.g. "static") is not unique across the three.
 */
export interface RegistryInfo {
  actionTypes: string[];
  dataSourceTypes: string[];
  assignmentStrategyTypes: string[];
  actionSchemas: Record<string, ConfigFieldDescriptor[]>;
  dataSourceSchemas: Record<string, ConfigFieldDescriptor[]>;
  assignmentStrategySchemas: Record<string, ConfigFieldDescriptor[]>;
}

/** Mirrors src/runtime/api.ts::InstanceView (studio-player spec). */
export interface InstanceView {
  instanceId: string;
  processId: string;
  version: number;
  status: "running" | "completed" | "cancelled" | "faulted";
  /** Mirrors the underlying instance's own `kind` (draft-play-instance-marker). */
  kind: "published" | "test";
  baseLocale: LocaleCode;
  step: { id: string; key: string; label: LocalizedText; type: string };
  fields: ResolvedViewEntry[];
  /** The step's declared form width. Optional here, unlike on the engine's own
   * type: a response predating the key omits it, and the form reads that as 1. */
  columns?: 1 | 2;
  availablePaths: AvailablePath[];
}

/**
 * One located publish-time defect. `loc` is a path into the body
 * (`steps[1].timers[0].onFire.actions[0]`); every issue-bearing publish error
 * the engine raises carries both fields. A Zod issue names its path `path`
 * instead, normalized on arrival.
 */

/**
 * Mirrors src/engine/templates.ts::TemplateSummary. The list route projects
 * `label` and `description` out of the stored body and carries no body: a body
 * may reach the envelope bound, so a list of every body would answer the picker
 * with megabytes it never reads. Both are `null` for a body that declares
 * neither, which a template is allowed to do.
 */
export interface TemplateSummary {
  templateKey: string;
  label: LocalizedText | null;
  description: LocalizedText | null;
  createdBy: string;
  updatedAt: string;
}

/** Mirrors src/engine/templates.ts::Template. `body`/`layout` are opaque, as a draft's are. */
export interface TemplateRecord {
  templateKey: string;
  body: unknown;
  layout: Record<string, unknown>;
  createdBy: string;
  updatedAt: string;
}

/**
 * One data list as the studio reads it: its key, and the columns it declares.
 *
 * The `"db.list"` picker uses the key alone. The field catalog's column-mapping
 * editor uses the columns, so an author picks a declared key rather than typing
 * one (`studio-column-mapping-form`).
 */
export interface StudioDataList {
  listKey: string;
  columns: { key: string; label: string; type: "string" | "number" | "boolean" }[];
}
