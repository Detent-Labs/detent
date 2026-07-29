import type { MigrationResult } from "../api/types.js";

/** Same rejection rule as the server's parseVersionField: an empty or non-integer string is not a valid version. */
export function parseVersionInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : undefined;
}

export function buildRunConfirmation(processId: string, fromVersion: number, toVersion: number): string {
  return (
    `Run the registered migration plan for "${processId}", from version ${fromVersion} to version ${toVersion}? ` +
    "This migrates every running instance still on the source version. " +
    "Run the orphan-key check in Studio first if you have not already."
  );
}

export interface MigrationBucket {
  key: keyof MigrationResult;
  label: string;
  ids: string[];
}

const BUCKET_LABELS: Record<keyof MigrationResult, string> = {
  migrated: "Migrated",
  skipped: "Skipped",
  conflicted: "Conflicted",
  failed: "Failed",
};

/** Buckets in a fixed, spec-required order, migrated/skipped/conflicted/failed — including empty ones, so the operator sees the full shape of the result. */
export function migrationBuckets(result: MigrationResult): MigrationBucket[] {
  return (Object.keys(BUCKET_LABELS) as (keyof MigrationResult)[]).map((key) => ({ key, label: BUCKET_LABELS[key], ids: result[key] }));
}
