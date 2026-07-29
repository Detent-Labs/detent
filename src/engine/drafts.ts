/**
 * The `drafts` table: one mutable, pre-publish draft per process. The stored
 * body is the authored (uncompiled) shape and is never parsed against
 * `processBody` — only its envelope is checked, since a draft under
 * construction routinely violates the authoring-time invariants. Saving is
 * revision-checked optimistic concurrency, the same pattern `transitionSeq`
 * establishes: a conditional `UPDATE` with a caller-supplied expected value,
 * zero affected rows reported as a conflict, never merged.
 */
import type { SQL } from "bun";
import { sql } from "./store.js";
import type { ProcessId } from "../schema/definition.js";
import { RequestShapeError } from "../errors.js";

export type Draft = {
  processId: ProcessId;
  body: unknown;
  layout: Record<string, unknown>;
  revision: number;
  baseVersion: number | null;
  updatedBy: string;
  updatedAt: string;
};

export type DraftSummary = {
  processId: ProcessId;
  revision: number;
  baseVersion: number | null;
  updatedBy: string;
  updatedAt: string;
};

export type SaveDraftInput = {
  body: unknown;
  layout: unknown;
  revision: number;
  updatedBy: string;
};

/** A save's expected `revision` no longer matches the stored one, or a create lost the primary-key race. Distinct from `runtime/api.ts::ConcurrencyConflict`, which means an instance `transitionSeq` mismatch to every existing client. */
export class DraftConflictError extends Error {
  constructor(processId: string) {
    super(`draft conflict: '${processId}' is not at the expected revision`);
    this.name = "DraftConflictError";
  }
}

type DraftRow = {
  process_id: string;
  body: unknown;
  layout: unknown;
  revision: number;
  base_version: number | null;
  updated_by: string;
  updated_at: string | Date;
};

/** jsonb columns arrive already parsed under Bun.sql; the string guard is portability only. */
function parseJsonb(raw: unknown): unknown {
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

function toDraft(row: DraftRow): Draft {
  return {
    processId: row.process_id as ProcessId,
    body: parseJsonb(row.body),
    layout: parseJsonb(row.layout) as Record<string, unknown>,
    revision: row.revision,
    baseVersion: row.base_version,
    updatedBy: row.updated_by,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function toDraftSummary(row: Omit<DraftRow, "body" | "layout">): DraftSummary {
  return {
    processId: row.process_id as ProcessId,
    revision: row.revision,
    baseVersion: row.base_version,
    updatedBy: row.updated_by,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** A JSON object, excluding arrays, `null`, and scalars. */
function isJsonObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Sized to the largest plausible legitimate draft (a few megabytes of body and
// layout together). The HTTP server now declares its own maxRequestBodySize
// (src/http/server.ts), which covers a draft save arriving over HTTP — but
// drafts.ts is a module boundary in its own right, so this bound exists to
// hold for a caller that does not arrive over HTTP too.
const MAX_DRAFT_ENVELOPE_BYTES = 8 * 1024 * 1024; // 8 MiB

function checkEnvelope(input: SaveDraftInput): void {
  if (!isJsonObject(input.body)) {
    throw new RequestShapeError("draft body must be a JSON object");
  }
  if (!isJsonObject(input.layout)) {
    throw new RequestShapeError("draft layout must be a JSON object");
  }
  if (typeof input.revision !== "number" || !Number.isInteger(input.revision) || input.revision < 0) {
    throw new RequestShapeError("draft revision must be a non-negative integer");
  }
  const size = Buffer.byteLength(JSON.stringify(input.body), "utf8") + Buffer.byteLength(JSON.stringify(input.layout), "utf8");
  if (size > MAX_DRAFT_ENVELOPE_BYTES) {
    throw new RequestShapeError(`draft envelope exceeds the ${MAX_DRAFT_ENVELOPE_BYTES}-byte bound`);
  }
}

export async function getDraft(processId: ProcessId, db: SQL = sql): Promise<Draft | undefined> {
  const rows = (await db`
    SELECT process_id, body, layout, revision, base_version, updated_by, updated_at
    FROM drafts WHERE process_id = ${processId}
  ` as unknown) as DraftRow[];
  return rows[0] ? toDraft(rows[0]) : undefined;
}

/**
 * `revision === 0` with no existing row is a create (`INSERT`); everything
 * else — including `revision === 0` against an already-created row — is the
 * conditional `UPDATE`. A racing create that loses the primary-key insert
 * between the existence check and the insert is reported as the same
 * `DraftConflictError`, never silently overwritten.
 */
export async function saveDraft(processId: ProcessId, input: SaveDraftInput, db: SQL = sql): Promise<Draft> {
  checkEnvelope(input);
  const { body, layout, revision, updatedBy } = input;

  if (revision === 0) {
    const existing = (await db`SELECT 1 FROM drafts WHERE process_id = ${processId} LIMIT 1`) as unknown[];
    if (existing.length === 0) {
      const inserted = (await db`
        INSERT INTO drafts (process_id, body, layout, revision, updated_by, updated_at)
        VALUES (${processId}, ${body}, ${layout}, 0, ${updatedBy}, now())
        ON CONFLICT (process_id) DO NOTHING
        RETURNING process_id, body, layout, revision, base_version, updated_by, updated_at
      ` as unknown) as DraftRow[];
      if (inserted[0]) return toDraft(inserted[0]);
      throw new DraftConflictError(processId);
    }
  }

  const updated = (await db`
    UPDATE drafts SET body = ${body}, layout = ${layout}, revision = revision + 1, updated_by = ${updatedBy}, updated_at = now()
    WHERE process_id = ${processId} AND revision = ${revision}
    RETURNING process_id, body, layout, revision, base_version, updated_by, updated_at
  ` as unknown) as DraftRow[];
  if (!updated[0]) throw new DraftConflictError(processId);
  return toDraft(updated[0]);
}

/** One summary per draft, newest-saved first, carrying no body. */
export async function listDrafts(db: SQL = sql): Promise<DraftSummary[]> {
  const rows = (await db`
    SELECT process_id, revision, base_version, updated_by, updated_at
    FROM drafts ORDER BY updated_at DESC
  ` as unknown) as Omit<DraftRow, "body" | "layout">[];
  return rows.map(toDraftSummary);
}

/** Removes the row and touches no `definitions` row. Reports whether a draft existed to remove. */
export async function deleteDraft(processId: ProcessId, db: SQL = sql): Promise<boolean> {
  const rows = (await db`DELETE FROM drafts WHERE process_id = ${processId} RETURNING process_id`) as unknown[];
  return rows.length > 0;
}

/**
 * Stamps `base_version` after a successful publish. Not routed through
 * `saveDraft` — it touches neither `body`, `layout`, nor `revision`, so it
 * carries none of `saveDraft`'s revision-checked optimistic concurrency.
 */
export async function markDraftPublished(processId: ProcessId, version: number, db: SQL = sql): Promise<void> {
  await db`UPDATE drafts SET base_version = ${version} WHERE process_id = ${processId}`;
}
