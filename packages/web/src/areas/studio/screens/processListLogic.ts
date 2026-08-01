import type { DraftSummary, LocaleCode, LocalizedText, ProcessSummary } from "../api/types.js";
import type { ProcessBody } from "workflow-engine/schema";
import { stripCompiledContent } from "workflow-engine/schema/strip-compiled";

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
/**
 * The published version a new draft for this row seeds from, or `undefined`
 * for a row with nothing published (a never-published process, or a process id
 * that only a `+ New process` mint has produced). The list already carries the
 * newest published version per row, so seeding needs no extra lookup.
 */
export function seedVersionFor(row: ProcessRow): number | undefined {
  return row.published?.version;
}

/** What `PUT /drafts/:processId` is given to create a draft. */
export interface CreateDraftInput {
  body: unknown;
  layout: Record<string, unknown>;
  revision: number;
  baseVersion?: number;
}

/**
 * The body a new draft starts from. Without a `seedVersion` it is empty, the
 * `+ New process` case. With one, it is that published version read back and
 * stripped of the compile pass's cancel-sink injection, since a draft holds the
 * authored shape — stamped with the version it came from so the Versions screen
 * can diff against it.
 *
 * `readBody` rejecting propagates, and the caller must not write in its place:
 * an empty draft over a published version the author wanted to continue from is
 * the bug this whole path exists to remove. Extracted from `ProcessesScreen` so
 * both branches and that failure are testable without a DOM (studio-app spec,
 * "Studio's testable logic is extracted from its components").
 */
export async function seededDraftInput(
  seedVersion: number | undefined,
  readBody: (version: number) => Promise<unknown>,
): Promise<CreateDraftInput> {
  if (seedVersion === undefined) return { body: {}, layout: {}, revision: 0 };
  const published = (await readBody(seedVersion)) as ProcessBody;
  return { body: stripCompiledContent(published), layout: {}, revision: 0, baseVersion: seedVersion };
}

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
