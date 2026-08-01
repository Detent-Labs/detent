export type { Actor, LoginResponse, ClientError } from "../../../api/types.js";
import type { LocalizedText, LocaleCode, HistoryEntry, InstanceEvent } from "workflow-engine/schema";

export type { LocalizedText, LocaleCode, HistoryEntry, InstanceEvent };

export type InstanceStatus = "running" | "completed" | "cancelled" | "faulted";

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
}

export interface InstancePage {
  items: InstanceSummary[];
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

/** Mirrors src/runtime/api.ts::InstanceRecordElement. */
export type InstanceRecordElement = { kind: "transition"; entry: HistoryEntry } | { kind: "event"; event: InstanceEvent };

export interface InstanceRecordPage {
  items: InstanceRecordElement[];
  cursor?: string;
}

/** Mirrors src/engine/definitions.ts::VersionSummary. */
export interface VersionSummary {
  version: number;
  definitionHash: string;
  status: string;
  publishedAt: string;
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
}

export interface UserPage {
  items: UserSummary[];
}

/** Mirrors src/engine/migration.ts::MigrationResult. */
export interface MigrationResult {
  migrated: string[];
  skipped: string[];
  conflicted: string[];
  failed: string[];
}

