import type { LocalizedText, LocaleCode } from "workflow-engine/schema";
import type { ResolvedViewField, AvailablePath, SubmissionIssue } from "form-ui";

export type { ResolvedViewField, AvailablePath, SubmissionIssue };

export type { Actor, LoginResponse, ClientError } from "../../../api/types.js";

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

// Not `Comment` — that name collides with the DOM's own `Comment` node
// interface, in scope in this package's browser TypeScript config.
export interface InstanceComment {
  id: string;
  instanceId: string;
  actorId: string;
  text: string;
  createdAt: string;
}

export interface CommentPage {
  items: InstanceComment[];
  cursor?: string;
}

// Metadata only — never file bytes, which `downloadAttachment` fetches
// separately as a `Blob`.
export interface InstanceAttachment {
  id: string;
  instanceId: string;
  actorId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AttachmentPage {
  items: InstanceAttachment[];
  cursor?: string;
}

export interface ProcessSummary {
  processId: string;
  version: number;
  key: string;
  label: LocalizedText;
  baseLocale: LocaleCode;
}
