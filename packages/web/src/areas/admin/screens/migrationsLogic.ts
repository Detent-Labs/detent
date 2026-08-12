import type { MigrationResult } from "../api/types.js";
import type { UiLocale } from "../../../i18n/locale.js";
import { t, tFill, type CatalogKey } from "../catalog.js";

/** Same rejection rule as the server's parseVersionField: an empty or non-integer string is not a valid version. */
export function parseVersionInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : undefined;
}

export function buildRunConfirmation(processId: string, fromVersion: number, toVersion: number, locale: UiLocale): string {
  return tFill(locale, "migrations.runConfirm", { process: processId, from: fromVersion, to: toVersion });
}

export interface MigrationBucket {
  key: keyof MigrationResult;
  label: string;
  ids: string[];
}

const BUCKET_KEYS: Record<keyof MigrationResult, CatalogKey> = {
  migrated: "migrations.bucketMigrated",
  skipped: "migrations.bucketSkipped",
  conflicted: "migrations.bucketConflicted",
  failed: "migrations.bucketFailed",
};

/** Buckets in a fixed, spec-required order, migrated/skipped/conflicted/failed — including empty ones, so the operator sees the full shape of the result. */
export function migrationBuckets(result: MigrationResult, locale: UiLocale): MigrationBucket[] {
  return (Object.keys(BUCKET_KEYS) as (keyof MigrationResult)[]).map((key) => ({ key, label: t(locale, BUCKET_KEYS[key]), ids: result[key] }));
}
