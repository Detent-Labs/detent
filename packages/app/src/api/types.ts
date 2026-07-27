import type { LocalizedText, LocaleCode } from "workflow-engine/schema";
import type { ResolvedViewField, AvailablePath, SubmissionIssue } from "form-ui";

export type { ResolvedViewField, AvailablePath, SubmissionIssue };

export interface Actor {
  id: string;
  roles: string[];
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  actor: Actor;
}

export interface InstanceSummary {
  instanceId: string;
  processId: string;
  version: number;
  status: "running" | "completed" | "cancelled" | "faulted";
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

export interface InstanceView {
  instanceId: string;
  processId: string;
  version: number;
  status: "running" | "completed" | "cancelled" | "faulted";
  step: { id: string; key: string; label: LocalizedText; type: string };
  fields: ResolvedViewField[];
  availablePaths: AvailablePath[];
}

export interface ProcessSummary {
  processId: string;
  version: number;
  key: string;
  label: LocalizedText;
  baseLocale: LocaleCode;
}

export type ClientError =
  | { type: "validation"; issues: SubmissionIssue[] }
  | { type: "already-claimed"; message: string }
  | { type: "not-a-candidate"; message: string }
  | { type: "not-claimed"; message: string }
  | { type: "not-claimant"; message: string }
  | { type: "not-assigned"; message: string }
  | { type: "guard-refused"; message: string }
  | { type: "concurrency-conflict" }
  | { type: "authorization"; message: string }
  | { type: "actor-resolution"; message: string }
  | { type: "internal"; message: string };
