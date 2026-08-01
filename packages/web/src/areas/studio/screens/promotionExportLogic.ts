import type { VersionSummary } from "../api/types.js";

/**
 * The file environment promotion writes and reads back. `version` and
 * `definitionHash` describe the SOURCE environment only — the target counts
 * versions in its own database and recomputes the hash itself. They ride along
 * so a developer can read the file, and so the import preview can name where
 * the definition came from. Import sends `processId` and `body` alone.
 */
export interface PromotionFile {
  processId: string;
  version: number;
  definitionHash: string;
  body: unknown;
}

/**
 * ponytail: `body` is the COMPILED body `getVersionBody` returned, passed
 * through untouched. Do not reach for `stripCompiledContent` here the way
 * `processListLogic.ts::seededDraftInput` does one screen over — a draft must
 * be authored-shape because the panels and `authoredProcessBody` reject the
 * injected cancel sink, but an import publishes rather than edits.
 * `publishBody` calls `compileProcessBody`, which returns an already-compiled
 * body unchanged (`src/schema/compile.ts`, guarded by
 * `test/compile-validation.test.ts` and `test/validate.test.ts`), so the target
 * recomputes the same `definitionHash` the source held. Stripping would reach
 * the same hash by a longer road, and add an error surface for nothing.
 */
export function buildPromotionFile(processId: string, version: VersionSummary, body: unknown): PromotionFile {
  return { processId, version: version.version, definitionHash: version.definitionHash, body };
}

/**
 * A filename a developer can tell apart in a downloads folder. Built from the
 * process `key`, which is human-readable but unconstrained (unlike
 * `FieldDef.key`, the only key the schema holds to an identifier grammar), so
 * anything outside a safe filename set collapses to `-`. An unreadable or
 * empty key falls back to the `processId`, which is always present.
 */
export function promotionFilename(body: unknown, version: number, processId: string): string {
  const key = (body as { key?: unknown } | null)?.key;
  const slug = typeof key === "string" ? key.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") : "";
  return `${slug || processId}-v${version}.json`;
}
