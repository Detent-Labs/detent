import { useRef, useState } from "react";
import { useDraft } from "../draft/store";
import { useT } from "../i18n/store";
import { saveDraft, loadDraftViaPicker, loadDraftFromFile, exportDraft, hasFileSystemAccess } from "../draft/file-io";

/**
 * `fallback` is the translated "operation failed" text, resolved by the caller — this function
 * has no hook access (design.md). Exported so its locale-independent branches (a real
 * `Error`/`DOMException`'s own `.message` passes through unchanged; only a non-`Error` throw
 * uses the translated `fallback`) are directly testable without rendering anything.
 */
export function describeError(e: unknown, fallback: string): string | null {
  if (e instanceof DOMException && e.name === "AbortError") return null; // user cancelled the picker
  return e instanceof Error ? e.message : fallback;
}

/** Draft save/load and validated export (task group 6) — no server, no `publishBody` call. */
export function FileToolbar() {
  const { draft, replace, validation } = useDraft();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canExport = validation.zodValid && validation.issues.length === 0;

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
      setError(null);
    } catch (e) {
      const message = describeError(e, t("fileToolbar.operationFailed"));
      if (message) setError(message);
    }
  };

  const handleLoad = () => {
    if (hasFileSystemAccess) {
      run(async () => replace(await loadDraftViaPicker(t("fileToolbar.draftFileDescription"))));
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) run(async () => replace(await loadDraftFromFile(file)));
  };

  return (
    <fieldset className="file-toolbar">
      <legend>{t("fileToolbar.legend")}</legend>
      <button type="button" onClick={() => run(() => saveDraft(draft, t("fileToolbar.draftFileDescription")))}>
        {t("fileToolbar.save")}
      </button>
      <button type="button" onClick={handleLoad}>
        {t("fileToolbar.load")}
      </button>
      {!hasFileSystemAccess && (
        <input ref={fileInputRef} type="file" accept=".json,.draft.json" style={{ display: "none" }} onChange={handleFileInputChange} />
      )}
      <button
        type="button"
        disabled={!canExport}
        title={canExport ? "" : t("fileToolbar.exportDisabledHint")}
        onClick={() => run(() => exportDraft(draft, t("fileToolbar.exportFileDescription")))}
      >
        {t("fileToolbar.export")}
      </button>
      {error && <p className="file-io-error">{error}</p>}
    </fieldset>
  );
}
