import { actionId, dataSourceId, fieldId, pathId, processId, stepId, timerId } from "workflow-engine/schema";
import type { ActionId, DataSourceId, FieldId, PathId, ProcessId, StepId, TimerId } from "workflow-engine/schema";

/**
 * Mints a prefixed UUIDv4 id per entity kind at creation time (design.md
 * decision 4: minted on creation, never on save, so a reference drawn before
 * its target exists still points at a stable id). Reuses the contract's own
 * branded id schemas to parse the generated string, rather than re-declaring
 * the prefix scheme — `${prefix}_${crypto.randomUUID()}`, the same scheme
 * the engine uses for its own runtime ids.
 */
const MINTERS = {
  step: { prefix: "step", schema: stepId },
  path: { prefix: "path", schema: pathId },
  field: { prefix: "field", schema: fieldId },
  action: { prefix: "action", schema: actionId },
  timer: { prefix: "timer", schema: timerId },
  dataSource: { prefix: "ds", schema: dataSourceId },
  process: { prefix: "proc", schema: processId },
} as const;

export type EntityKind = keyof typeof MINTERS;

export function mintId(kind: "step"): StepId;
export function mintId(kind: "path"): PathId;
export function mintId(kind: "field"): FieldId;
export function mintId(kind: "action"): ActionId;
export function mintId(kind: "timer"): TimerId;
export function mintId(kind: "dataSource"): DataSourceId;
export function mintId(kind: "process"): ProcessId;
export function mintId(kind: EntityKind) {
  const { prefix, schema } = MINTERS[kind];
  return schema.parse(`${prefix}_${crypto.randomUUID()}`);
}
