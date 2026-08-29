export type { Actor, LoginResponse, ClientError, VersionSummary, InstanceRecordElement, InstanceRecordPage } from "../../../api/types.js";
import type { LocalizedText, LocaleCode } from "workflow-engine/schema";

export type { LocalizedText, LocaleCode };

export type InstanceStatus = "running" | "completed" | "cancelled" | "faulted";

export type InstanceKind = "published" | "test";

/** Mirrors src/runtime/api.ts::InstanceSummary — never the `data` payload. */
export interface InstanceSummary {
  instanceId: string;
  processId: string;
  version: number;
  status: InstanceStatus;
  currentStepId: string;
  transitionSeq: number;
  assignment?: { candidates: string[]; claimedBy?: string; claimedAt?: string } | null;
  startedBy?: string;
  createdAt: string;
  currentStepEnteredAt?: string;
  processLabel: LocalizedText;
  stepLabel: LocalizedText;
  processBaseLocale: LocaleCode;
  kind: InstanceKind;
}

/**
 * Mirrors src/runtime/api.ts::DegradedInstanceSummary — stands in for an
 * `InstanceSummary` the engine could not resolve. Only ever appears in an
 * admin-scoped `InstancePage`. `scope=all` is the one scope that asks for a
 * degraded item; neither `scope=mine` nor `scope=started` ever returns one.
 */
export interface DegradedInstanceSummary {
  degraded: true;
  instanceId: string;
  processId: string;
  version: number;
  status: InstanceStatus;
  currentStepId: string;
  transitionSeq: number;
  startedBy?: string;
  createdAt: string;
  reason: "missing-definition" | "current-step-not-in-body";
  kind: InstanceKind;
}

export type InstanceSummaryItem = InstanceSummary | DegradedInstanceSummary;

export interface InstancePage {
  items: InstanceSummaryItem[];
  cursor?: string;
}

/** Mirrors src/runtime/api.ts::InstanceView — the participant-facing view, unrestricted by role; the admin instance screen reads only its process/version/status/step fields. */
export interface InstanceView {
  instanceId: string;
  processId: string;
  version: number;
  status: InstanceStatus;
  step: { id: string; key: string; label: LocalizedText; type: string };
  redactedAt?: string;
}

/** Mirrors src/engine/definitions.ts::ProcessSummary — the newest-version summary GET /processes returns per process. `baseLocale` is process-level and stable across versions, so this is also where the instance screen resolves a step label's active locale. */
export interface ProcessSummary {
  processId: string;
  version: number;
  key: string;
  label: LocalizedText;
  baseLocale: LocaleCode;
}

/** Mirrors src/engine/admin-queries.ts::OutboxRow. */
export interface OutboxRow {
  idempotencyKey: string;
  instanceId: string;
  transitionSeq: number;
  actionId: string;
  type: string;
  status: string;
  attempts: number;
  nextAttemptAt: string;
  createdAt: string;
  claimedAt: string | null;
  lastError: string | null;
}

export interface OutboxPage {
  items: OutboxRow[];
  cursor?: string;
  counts: Record<string, number>;
}

/** Mirrors src/engine/admin-queries.ts::PendingTimer. */
export interface PendingTimer {
  instanceId: string;
  processId: string;
  version: number;
  currentStepId: string;
  nextTimerAt: string;
}

export interface PendingTimerPage {
  items: PendingTimer[];
  cursor?: string;
}

/** Mirrors src/auth/users.ts::UserSummary — never password_hash. */
export interface UserSummary {
  userId: string;
  email: string;
  roles: string[];
  disabled: boolean;
  /** The `userId` of this account's manager, absent when none is on record. Read by the `org.manager-of-starter` assignment strategy. */
  managerUserId?: string;
}

export interface UserPage {
  items: UserSummary[];
  /** Absent once the page is the last one, like `OutboxPage`/`PendingTimerPage`. */
  cursor?: string;
}

/** Mirrors src/auth/groups.ts::GroupScope. Strict on write, lenient on read, the same as the engine's own copy. */
export type GroupScope = { type: "global" } | { type: "processes"; processIds: string[] };

/** Mirrors src/auth/groups.ts::GroupSummary. */
export interface GroupSummary {
  groupId: string;
  name: string;
  scope: GroupScope;
  members: string[];
}

export interface GroupPage {
  items: GroupSummary[];
  /** Absent once the page is the last one, like `UserPage`. */
  cursor?: string;
}

/**
 * Mirrors src/engine/admin-queries.ts::AuditEntry. `value` is absent, not
 * `null`, for a `redact` entry or a `set` entry a later redaction cleared —
 * distinguishable from a `set` entry whose authored value is a JSON null.
 */
export interface AuditEntry {
  seq: number;
  transitionSeq: number;
  fieldId: string;
  op: string;
  value?: unknown;
  actor: string | null;
  source: string | null;
  reason: string | null;
  at: string;
}

export interface AuditEntryPage {
  items: AuditEntry[];
  cursor?: string;
}

/** Mirrors src/engine/admin-queries.ts::verifyInstanceChain's return shape. */
export interface AuditVerifyResult {
  ok: boolean;
  failedSeq: number | null;
}

/** Mirrors src/engine/migration.ts::MigrationResult. */
export interface MigrationResult {
  migrated: string[];
  skipped: string[];
  conflicted: string[];
  failed: string[];
}

/**
 * One extra column a list's values carry beyond `value` and `label`. `label` is
 * plain operator text in one language, exactly as the list's own label is:
 * this is operator configuration, not authored content.
 */
export interface DataListColumn {
  key: string;
  label: string;
  type: "string" | "number" | "boolean";
}

/** Mirrors the `data_lists` row the overview route returns. */
export interface DataListSummary {
  listKey: string;
  label: string;
  description: string | null;
  columns: DataListColumn[];
  updatedAt: string;
  updatedBy: string;
  activeValueCount: number;
}

export interface DataListPage {
  items: DataListSummary[];
}

/**
 * One `data_list_values` row. `active` false means retired: the value is out of
 * new option lists but still resolves for an instance that holds it, which is
 * why the editor marks it rather than hiding it.
 */
export interface DataListValue {
  value: string;
  label: Record<string, string>;
  /** One entry per declared column the value fills, typed by that column. */
  attributes: Record<string, string | number | boolean>;
  active: boolean;
  sortOrder: number;
}

/** A published version whose body declares a `"db.list"` data source naming this list. */
export interface DataListUsage {
  processId: string;
  version: number;
  /**
   * The list's column keys this version maps into catalog fields, sorted. A key
   * the list no longer declares appears too: a mapping outliving its column is
   * what an operator reads this report to find.
   */
  columns: string[];
}

export interface DataListDetail {
  listKey: string;
  label: string;
  description: string | null;
  columns: DataListColumn[];
  values: DataListValue[];
  usedBy: DataListUsage[];
}

/** `area -> locale -> key -> value`, the shape both the admin read and the public read return. */
export type UiStringOverrideMap = Record<string, Record<string, Record<string, string>>>;
