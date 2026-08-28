export type { Actor, LoginResponse, ClientError } from "../../../api/types.js";
import type { LocalizedText, LocaleCode } from "workflow-engine/schema";

/** Display-ready error shape, mirroring packages/admin/src/api/types.ts. */
/** The subset of the engine's ProcessSummary this package renders. */
export type ProcessSummary = {
  processId: string;
  version: number;
  key: string;
  label: LocalizedText;
  baseLocale: LocaleCode;
};

export type StepLabel = { stepId: string; key: string; label: LocalizedText };

export type CycleTimeView = {
  sampleSize: number;
  p50Ms: number | null;
  p90Ms: number | null;
  p99Ms: number | null;
  perStep: (StepLabel & { averageMs: number; traversals: number })[];
  skippedInstances: number;
};

export type BottleneckView = {
  ranking: (StepLabel & { medianMs: number; traversals: number })[];
  workInProgress: (StepLabel & { running: number })[];
  skippedInstances: number;
};

export type SlaView = {
  steps: (StepLabel & { breached: number; traversals: number; breachRate: number })[];
  skippedInstances: number;
};

// ============================================================
// Saved reports (instance-data-tables) — mirrors src/runtime/api.ts's
// Report/ReportColumn/ReportQuery/ReportExecutionResult shapes.
// ============================================================

export type DataComparison = { fieldId: string; operator: "eq" | "ne" | "in"; value: unknown };

export type ReportQuery = {
  status?: ("running" | "completed" | "cancelled" | "faulted")[];
  createdAfter?: string;
  createdBefore?: string;
  dataWhere?: DataComparison[];
};

export type ReportColumn = { type: "field"; fieldId: string } | { type: "merge"; fieldIds: string[] };

export type Report = {
  reportId: string;
  owner: string;
  processId: string;
  name: string;
  query: ReportQuery;
  columns: ReportColumn[];
  viewers: string[];
  editors: string[];
  createdAt: string;
  updatedAt: string;
};

export type ReportInput = {
  processId: string;
  name: string;
  query?: ReportQuery;
  columns?: ReportColumn[];
  viewers?: string[];
  editors?: string[];
};

export type ReportPatch = Partial<Omit<ReportInput, "processId">> & { owner?: string };

export type ColumnChoice = { fieldId: string; versions: number[] };

export type ReportCell =
  | { kind: "value"; value: unknown }
  | { kind: "no-value" }
  | { kind: "not-in-version" }
  | { kind: "redacted" };

export type MergeReportCell = { kind: "value"; value: string; collision: boolean } | { kind: "redacted" };

export type ReportResultColumn = { type: "field"; fieldId: string } | { type: "merge"; fieldIds: string[]; collisions: number };

export type ReportExecutionRow = { instanceId: string; cells: (ReportCell | MergeReportCell)[] };

export type ReportExecutionResult = { columns: ReportResultColumn[]; rows: ReportExecutionRow[]; truncated: boolean };
