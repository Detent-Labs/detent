import { authoredProcessBody, type ProcessBody } from "workflow-engine/schema";
import type { Draft } from "./types";
import { parseDraftJson, parseImportedProcessJson, stringifyDraft } from "./io";

/**
 * Chromium-only as of today (design.md decision 7 / risk) — everything here
 * feature-detects and falls back to `<input type=file>` (load) or a
 * download-triggered `<a>` (save/export) rather than assuming support.
 */
export const hasFileSystemAccess = typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";

function acceptTypes(description: string, extensions: string[]): FilePickerAcceptType[] {
  return [{ description, accept: { "application/json": extensions } }];
}

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

/**
 * Save the in-progress Draft as-is (no validation gate — that's export's job).
 * `draftFileDescription` is the file-picker type description text — resolved by the
 * caller (a component, via `useT()`), never looked up here (design.md "Non-component
 * call sites receive translated strings as parameters").
 */
export async function saveDraft(draft: Draft, draftFileDescription: string): Promise<void> {
  const text = stringifyDraft(draft);
  if (hasFileSystemAccess) return writeViaPicker(text, "process.draft.json", acceptTypes(draftFileDescription, [".draft.json"]));
  downloadText(text, "process.draft.json");
}

/** Load-guard-checked via `parseDraftJson` either way — the picker path is not a shortcut around it. */
export async function loadDraftViaPicker(draftFileDescription: string): Promise<Draft> {
  const [handle] = await window.showOpenFilePicker!({ types: acceptTypes(draftFileDescription, [".draft.json"]) });
  return parseDraftJson(await (await handle.getFile()).text());
}

export async function loadDraftFromFile(file: File): Promise<Draft> {
  return parseDraftJson(await file.text());
}

/**
 * Distinct from Load draft: accepts a `DefinitionVersion` wrapper or a raw
 * `ProcessBody` (`.json`, not `.draft.json`) and converts it to a Draft via
 * the strict `parseImportedProcessJson` (editor-draft-io spec, "An existing
 * process file can be imported as an editable Draft").
 */
export async function importProcessViaPicker(importFileDescription: string): Promise<Draft> {
  const [handle] = await window.showOpenFilePicker!({ types: acceptTypes(importFileDescription, [".json"]) });
  return parseImportedProcessJson(await (await handle.getFile()).text());
}

export async function importProcessFromFile(file: File): Promise<Draft> {
  return parseImportedProcessJson(await file.text());
}

/** The real gate: parses through the actual contract schema, never a relaxed Draft check. Throws on failure. */
export function exportProcessBody(draft: Draft): ProcessBody {
  return authoredProcessBody.parse(draft);
}

/** No network call, no `publishBody` — writes a local file only (editor-draft-io spec). */
export async function exportDraft(draft: Draft, exportFileDescription: string): Promise<void> {
  const body = exportProcessBody(draft);
  const text = JSON.stringify(body, null, 2);
  if (hasFileSystemAccess) return writeViaPicker(text, "process.json", acceptTypes(exportFileDescription, [".json"]));
  downloadText(text, "process.json");
}
