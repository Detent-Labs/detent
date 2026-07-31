import { resolveDraftLocalizedText } from "../draft/localized-text.js";
import type { ProcessRow } from "./processListLogic.js";

/** What the preview shows, and what the confirm publishes. */
export interface PromotionPreview {
  /** Sent to `POST /processes` verbatim, together with `body`. */
  processId: string;
  /** The compiled body from the file, sent unchanged — see `promotionExportLogic`. */
  body: unknown;
  key: string;
  /** Resolved through the body's own `baseLocale`; `undefined` when the file carries no usable entry. */
  label: string | undefined;
  /** The SOURCE environment's numbers, shown but never sent. */
  version: number | undefined;
  definitionHash: string | undefined;
}

export type PromotionParse = { ok: true; preview: PromotionPreview } | { ok: false; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a promotion file back. This is a guard against the wrong file, not a
 * second implementation of the definition contract: it confirms the text parses
 * and carries a string `processId` and an object `body`, and reads two display
 * fields out of that body. It never parses `body` against `ProcessBody` —
 * Studio ships no client-side schema validation for a published body, and keeps
 * `DraftRecord.body` opaque for the same reason. The server validates on
 * publish, and rejects everything this guard lets through.
 */
export function parsePromotionFile(text: string): PromotionParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: "The file is not valid JSON." };
  }
  if (!isObject(parsed)) return { ok: false, message: "The file must contain a JSON object." };
  if (typeof parsed.processId !== "string" || parsed.processId === "") {
    return { ok: false, message: "The file has no processId. Export it from a Versions screen." };
  }
  if (!isObject(parsed.body)) {
    return { ok: false, message: "The file has no body. Export it from a Versions screen." };
  }

  const body = parsed.body;
  const baseLocale = typeof body.baseLocale === "string" ? body.baseLocale : "en";
  return {
    ok: true,
    preview: {
      processId: parsed.processId,
      body,
      key: typeof body.key === "string" ? body.key : "",
      // The draft resolver, not the engine's `resolveLocalizedText`: this value
      // comes out of a file a developer could have edited, so a missing entry
      // must resolve to `undefined` rather than be assumed present.
      label: resolveDraftLocalizedText(body.label as Record<string, string> | undefined, baseLocale, baseLocale),
      version: typeof parsed.version === "number" ? parsed.version : undefined,
      definitionHash: typeof parsed.definitionHash === "string" ? parsed.definitionHash : undefined,
    },
  };
}

/**
 * The `processId` of a DIFFERENT process in the target that already publishes
 * under this `key`, or `undefined`. Nothing enforces key uniqueness — the
 * `definitions` primary key is `(process_id, version)` and `key` lives inside
 * the body — so an import can leave two processes sharing one key, and nothing
 * can delete either afterwards. The caller warns; it must not block, since a
 * developer may well intend it.
 *
 * Reads the process list the screen already loaded, so this costs no request.
 * It compares against local state only, never a remote environment.
 */
export function collidingProcessId(preview: PromotionPreview, rows: ProcessRow[]): string | undefined {
  if (preview.key === "") return undefined;
  return rows.find((r) => r.published?.key === preview.key && r.processId !== preview.processId)?.processId;
}
