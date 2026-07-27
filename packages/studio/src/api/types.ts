import type { LocalizedText, LocaleCode } from "workflow-engine/schema";

export type { LocalizedText, LocaleCode };

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

export type ClientError =
  | { type: "authorization"; message: string }
  | { type: "actor-resolution"; message: string }
  | { type: "request-shape"; message: string }
  | { type: "not-found"; message: string }
  | { type: "draft-conflict"; message: string }
  | { type: "internal"; message: string };
