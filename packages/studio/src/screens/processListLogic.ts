import type { DraftSummary, LocaleCode, LocalizedText, ProcessSummary } from "../api/types.js";

export interface ProcessRowDraft {
  revision: number;
  baseVersion: number | null;
  updatedBy: string;
  updatedAt: string;
}

export interface ProcessRowPublished {
  version: number;
  definitionHash: string;
  key: string;
  label: LocalizedText;
  baseLocale: LocaleCode;
}

export interface ProcessRow {
  processId: string;
  draft?: ProcessRowDraft;
  published?: ProcessRowPublished;
}

/**
 * Merges `GET /processes` (the newest published version per process) with
 * `GET /drafts` (one draft per process) into one row per process id. A
 * process may carry either, both, or (transiently, between mint and first
 * save) neither. Sorted by processId for a stable render order — neither
 * source is guaranteed pre-sorted the same way.
 */
export function deriveProcessRows(processes: ProcessSummary[], drafts: DraftSummary[]): ProcessRow[] {
  const rows = new Map<string, ProcessRow>();

  for (const p of processes) {
    rows.set(p.processId, {
      processId: p.processId,
      published: { version: p.version, definitionHash: p.definitionHash, key: p.key, label: p.label, baseLocale: p.baseLocale },
    });
  }
  for (const d of drafts) {
    const existing = rows.get(d.processId);
    const draft: ProcessRowDraft = { revision: d.revision, baseVersion: d.baseVersion, updatedBy: d.updatedBy, updatedAt: d.updatedAt };
    rows.set(d.processId, existing ? { ...existing, draft } : { processId: d.processId, draft });
  }

  return [...rows.values()].sort((a, b) => a.processId.localeCompare(b.processId));
}
