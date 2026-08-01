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
