/**
 * The `instance_drafts` table: a participant's unfinished form input on a
 * running instance, one row per instance, kept apart from
 * `instances.body.data`. Saving is lenient — only the envelope is checked,
 * never the field rules `submitAndTransition` enforces. No `revision`
 * column: the draft is single-writer at a time (the claimant, the starter,
 * or an admin), so a plain upsert is enough.
 */
import type { SQL } from "bun";
import { sql } from "./store.js";
import type { InstanceId, StepId } from "../schema/definition.js";
import { RequestShapeError } from "../errors.js";
import { parseJsonb } from "./drafts.js";

export const MAX_DRAFT_ENVELOPE_BYTES = 8 * 1024 * 1024; // 8 MiB

export type InstanceDraft = {
  instanceId: InstanceId;
  stepId: StepId;
  data: Record<string, unknown>;
  updatedBy: string;
  updatedAt: string;
};

type InstanceDraftRow = {
  instance_id: string;
  step_id: string;
  data: unknown;
  updated_by: string;
  updated_at: string | Date;
};

function toInstanceDraft(row: InstanceDraftRow): InstanceDraft {
  return {
    instanceId: row.instance_id as InstanceId,
    stepId: row.step_id as StepId,
    data: parseJsonb(row.data) as Record<string, unknown>,
    updatedBy: row.updated_by,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** A JSON object, excluding arrays, `null`, and scalars. */
function isJsonObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkEnvelope(data: unknown): void {
  if (!isJsonObject(data)) {
    throw new RequestShapeError("instance draft data must be a JSON object");
  }
  const size = Buffer.byteLength(JSON.stringify(data), "utf8");
  if (size > MAX_DRAFT_ENVELOPE_BYTES) {
    throw new RequestShapeError(`instance draft data exceeds the ${MAX_DRAFT_ENVELOPE_BYTES}-byte bound`);
  }
}

export async function getInstanceDraft(instanceId: InstanceId, db: SQL = sql): Promise<InstanceDraft | undefined> {
  const rows = (await db`
    SELECT instance_id, step_id, data, updated_by, updated_at
    FROM instance_drafts WHERE instance_id = ${instanceId}
  ` as unknown) as InstanceDraftRow[];
  return rows[0] ? toInstanceDraft(rows[0]) : undefined;
}

export async function saveInstanceDraft(
  instanceId: InstanceId,
  stepId: StepId,
  data: unknown,
  updatedBy: string,
  db: SQL = sql,
): Promise<InstanceDraft> {
  checkEnvelope(data);
  const rows = (await db`
    INSERT INTO instance_drafts (instance_id, step_id, data, updated_by, updated_at)
    VALUES (${instanceId}, ${stepId}, ${data as object}, ${updatedBy}, now())
    ON CONFLICT (instance_id) DO UPDATE SET
      step_id = ${stepId}, data = ${data as object}, updated_by = ${updatedBy}, updated_at = now()
    RETURNING instance_id, step_id, data, updated_by, updated_at
  ` as unknown) as InstanceDraftRow[];
  return toInstanceDraft(rows[0]!);
}

/** Removes the row, a no-op when none exists. */
export async function deleteInstanceDraft(instanceId: InstanceId, db: SQL = sql): Promise<void> {
  await db`DELETE FROM instance_drafts WHERE instance_id = ${instanceId}`;
}
