import { authoredProcessBody, type ProcessBody } from "workflow-engine/schema";
import type { Draft } from "./types";
import { parseDraftJson, stringifyDraft } from "./io";

/**
 * Chromium-only as of today (design.md decision 7 / risk) — everything here
 * feature-detects and falls back to `<input type=file>` (load) or a
 * download-triggered `<a>` (save/export) rather than assuming support.
 */
export const hasFileSystemAccess = typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";

const DRAFT_TYPES: FilePickerAcceptType[] = [{ description: "Draft JSON", accept: { "application/json": [".draft.json"] } }];
const EXPORT_TYPES: FilePickerAcceptType[] = [{ description: "Process JSON", accept: { "application/json": [".json"] } }];

async function writeViaPicker(text: string, suggestedName: string, types: FilePickerAcceptType[]): Promise<void> {
  const handle = await window.showSaveFilePicker!({ suggestedName, types });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Save the in-progress Draft as-is (no validation gate — that's export's job). */
export async function saveDraft(draft: Draft): Promise<void> {
  const text = stringifyDraft(draft);
  if (hasFileSystemAccess) return writeViaPicker(text, "process.draft.json", DRAFT_TYPES);
  downloadText(text, "process.draft.json");
}

/** Load-guard-checked via `parseDraftJson` either way — the picker path is not a shortcut around it. */
export async function loadDraftViaPicker(): Promise<Draft> {
  const [handle] = await window.showOpenFilePicker!({ types: DRAFT_TYPES });
  return parseDraftJson(await (await handle.getFile()).text());
}

export async function loadDraftFromFile(file: File): Promise<Draft> {
  return parseDraftJson(await file.text());
}

/** The real gate: parses through the actual contract schema, never a relaxed Draft check. Throws on failure. */
export function exportProcessBody(draft: Draft): ProcessBody {
  return authoredProcessBody.parse(draft);
}

/** No network call, no `publishBody` — writes a local file only (editor-draft-io spec). */
export async function exportDraft(draft: Draft): Promise<void> {
  const body = exportProcessBody(draft);
  const text = JSON.stringify(body, null, 2);
  if (hasFileSystemAccess) return writeViaPicker(text, "process.json", EXPORT_TYPES);
  downloadText(text, "process.json");
}
