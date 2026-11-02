/**
 * The `draft_save_points` table: named copies of a draft's persisted body and
 * layout, kept beside the draft and read by no hash. The draft itself is
 * touched only through `drafts.ts` (`lockDraft`, `writeRestoredDraft`). Create
 * and restore run in one transaction that locks the draft row first, so the
 * revision check and the count bound hold against a concurrent writer.
 */
import type { SQL } from "bun";
import { sql, withTransaction } from "./store.js";
import { DraftConflictError, lockDraft, parseJsonb, writeRestoredDraft } from "./drafts.js";
import type { Draft } from "./drafts.js";
import type { ProcessId } from "../schema/definition.js";
import { RequestShapeError } from "../errors.js";

/** The most save points one draft holds. */
export const MAX_SAVE_POINTS = 50;
/** The longest save point name, in characters, after trimming. */
export const MAX_SAVE_POINT_NAME_LENGTH = 200;

/** A save point without its copy of the draft. */
export type SavePointSummary = {
  savePointId: string;
  processId: ProcessId;
  name: string;
  revision: number;
  createdBy: string;
  createdAt: string;
};

type SavePointRow = {
  save_point_id: string;
  process_id: string;
  name: string;
  revision: number;
  created_by: string;
  created_at: string | Date;
};

function toSummary(row: SavePointRow): SavePointSummary {
  return {
    savePointId: row.save_point_id,
    processId: row.process_id as ProcessId,
    name: row.name,
    revision: row.revision,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function checkName(raw: unknown, what: string): string {
  if (typeof raw !== "string") throw new RequestShapeError(`${what} must be a string`);
  const name = raw.trim();
  if (name.length === 0) throw new RequestShapeError(`${what} must not be empty`);
  if (name.length > MAX_SAVE_POINT_NAME_LENGTH) {
    throw new RequestShapeError(`${what} exceeds ${MAX_SAVE_POINT_NAME_LENGTH} characters`);
  }
  return name;
}

function checkRevision(revision: unknown): void {
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
    throw new RequestShapeError("save point revision must be a non-negative integer");
  }
}

/** Counts under the draft lock the caller holds, so two callers cannot both pass at one below the bound. */
async function checkRoom(processId: ProcessId, tx: SQL): Promise<void> {
  const rows = (await tx`
    SELECT count(*)::integer AS n FROM draft_save_points WHERE process_id = ${processId}
  ` as unknown) as { n: number }[];
  if ((rows[0]?.n ?? 0) >= MAX_SAVE_POINTS) {
    throw new RequestShapeError(`a draft holds at most ${MAX_SAVE_POINTS} save points`);
  }
}

async function insertPoint(
  tx: SQL,
  draft: Draft,
  name: string,
  createdBy: string,
): Promise<SavePointSummary> {
  const id = `spt_${crypto.randomUUID()}`;
  const rows = (await tx`
    INSERT INTO draft_save_points (save_point_id, process_id, name, body, layout, revision, created_by)
    VALUES (${id}, ${draft.processId}, ${name}, ${draft.body}, ${draft.layout}, ${draft.revision}, ${createdBy})
    RETURNING save_point_id, process_id, name, revision, created_by, created_at
  ` as unknown) as SavePointRow[];
  return toSummary(rows[0]!);
}

/** Newest first, no body or layout. */
export async function listSavePoints(processId: ProcessId, db: SQL = sql): Promise<SavePointSummary[]> {
  const rows = (await db`
    SELECT save_point_id, process_id, name, revision, created_by, created_at
    FROM draft_save_points WHERE process_id = ${processId}
    ORDER BY created_at DESC, save_point_id DESC
  ` as unknown) as SavePointRow[];
  return rows.map(toSummary);
}

/**
 * Copies the persisted draft under `name`. `undefined` when the process has no
 * draft. A `revision` the draft has passed raises `DraftConflictError`, and the
 * bound raises `RequestShapeError`; either stores nothing.
 */
export async function createSavePoint(
  processId: ProcessId,
  input: { name: string; revision: number; createdBy: string },
  db: SQL = sql,
): Promise<SavePointSummary | undefined> {
  const name = checkName(input.name, "save point name");
  checkRevision(input.revision);
  return withTransaction(db, async (tx) => {
    const draft = await lockDraft(processId, tx);
    if (!draft) return undefined;
    if (draft.revision !== input.revision) throw new DraftConflictError(processId);
    await checkRoom(processId, tx);
    return insertPoint(tx, draft, name, input.createdBy);
  });
}

/**
 * Keeps the current draft as a new save point named `keepName`, then writes the
 * point's body and layout onto the draft at the next revision. The restored
 * point stays. `undefined` when the process has no draft or holds no such
 * point. Stale revision and the bound raise as in `createSavePoint`, and change
 * nothing.
 */
export async function restoreSavePoint(
  processId: ProcessId,
  savePointId: string,
  input: { revision: number; keepName: string; restoredBy: string },
  db: SQL = sql,
): Promise<Draft | undefined> {
  const keepName = checkName(input.keepName, "kept save point name");
  checkRevision(input.revision);
  return withTransaction(db, async (tx) => {
    const draft = await lockDraft(processId, tx);
    if (!draft) return undefined;
    const points = (await tx`
      SELECT body, layout FROM draft_save_points
      WHERE save_point_id = ${savePointId} AND process_id = ${processId}
    ` as unknown) as { body: unknown; layout: unknown }[];
    const point = points[0];
    if (!point) return undefined;
    if (draft.revision !== input.revision) throw new DraftConflictError(processId);
    await checkRoom(processId, tx);
    await insertPoint(tx, draft, keepName, input.restoredBy);
    return writeRestoredDraft(
      processId,
      { body: parseJsonb(point.body), layout: parseJsonb(point.layout), updatedBy: input.restoredBy },
      tx,
    );
  });
}

/** Reports whether a row went. An id held by another process matches nothing. */
export async function deleteSavePoint(processId: ProcessId, savePointId: string, db: SQL = sql): Promise<boolean> {
  const rows = (await db`
    DELETE FROM draft_save_points WHERE save_point_id = ${savePointId} AND process_id = ${processId}
    RETURNING save_point_id
  ` as unknown) as unknown[];
  return rows.length > 0;
}
