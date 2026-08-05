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

/** The base locale a `+ New process` draft declares. Publish requires
 * `baseLocale` and this seed is the only place the structural panels can
 * supply it before the author has typed anything, so without it a process
 * authored only through those panels could never be published. "en" is what
 * every other studio reader already falls back to for a draft that declares
 * nothing (`collectUsedLocales`, `CanvasView`, the store's content locale). */
const NEW_PROCESS_BASE_LOCALE = "en";

/**
 * The body a new draft starts from. Without a `seedVersion` it declares only
 * `baseLocale`, the `+ New process` case. With one, it is that published
 * version read back and stripped of the compile pass's cancel-sink injection,
 * since a draft holds the authored shape — stamped with the version it came
 * from so the Versions screen can diff against it. A published body carries
 * its own `baseLocale` (it could not have reached publish otherwise) and
 * `stripCompiledContent` does not remove it, so only the no-seed branch seeds.
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
  if (seedVersion === undefined) return { body: { baseLocale: NEW_PROCESS_BASE_LOCALE }, layout: {}, revision: 0 };
  const published = (await readBody(seedVersion)) as ProcessBody;
  return { body: stripCompiledContent(published), layout: {}, revision: 0, baseVersion: seedVersion };
}

/**
 * The body a new draft starts from when the author picks a template rather
 * than the empty choice. The template's body and layout travel unchanged: a
 * template already holds the authored shape, so nothing needs stripping here
 * the way `seededDraftInput` strips a published version.
 *
 * No `baseVersion`. A template is not a published version of the new process,
 * and stamping one would offer the Versions screen a diff against a version
 * that has nothing to do with this body. The write path would reject it too.
 *
 * `readTemplate` rejecting propagates, exactly as `seededDraftInput`'s
 * `readBody` does, and for the same reason: an empty draft in place of the
 * template the author picked is the bug this path exists to prevent.
 */
export async function templateDraftInput(
  templateKey: string,
  readTemplate: (key: string) => Promise<{ body: unknown; layout: Record<string, unknown> }>,
): Promise<CreateDraftInput> {
  const template = await readTemplate(templateKey);
  return { body: template.body, layout: template.layout, revision: 0 };
}

/**
 * What a template row and a picker entry are named by. A template body carries
 * its own `label`, but a template is allowed to declare none — the store checks
 * the envelope only — so this falls back to the key rather than rendering a
 * nameless row. `baseLocale` is the body's own, which a template need not
 * declare either, so the caller passes the locale it is displaying in.
 */
export function templateDisplayName(
  label: Partial<Record<string, string>> | null | undefined,
  locale: string,
  templateKey: string,
): string {
  if (!label) return templateKey;
  return label[locale] ?? Object.values(label).find((text) => text !== undefined && text !== "") ?? templateKey;
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
