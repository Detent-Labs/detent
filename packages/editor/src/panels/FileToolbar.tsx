import { useRef, useState } from "react";
import { useDraft } from "../draft/store";
import { saveDraft, loadDraftViaPicker, loadDraftFromFile, exportDraft, hasFileSystemAccess } from "../draft/file-io";

function describeError(e: unknown): string | null {
  if (e instanceof DOMException && e.name === "AbortError") return null; // user cancelled the picker
  return e instanceof Error ? e.message : "operation failed";
}

/** Draft save/load and validated export (task group 6) — no server, no `publishBody` call. */
export function FileToolbar() {
  const { draft, replace, validation } = useDraft();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canExport = validation.zodValid && validation.issues.length === 0;

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
      setError(null);
    } catch (e) {
      const message = describeError(e);
      if (message) setError(message);
    }
  };

  const handleLoad = () => {
    if (hasFileSystemAccess) {
      run(async () => replace(await loadDraftViaPicker()));
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
      <legend>File</legend>
      <button type="button" onClick={() => run(() => saveDraft(draft))}>
        Save draft
      </button>
      <button type="button" onClick={handleLoad}>
        Load draft
      </button>
      {!hasFileSystemAccess && (
        <input ref={fileInputRef} type="file" accept=".json,.draft.json" style={{ display: "none" }} onChange={handleFileInputChange} />
      )}
      <button
        type="button"
        disabled={!canExport}
        title={canExport ? "" : "resolve all validation issues before exporting"}
        onClick={() => run(() => exportDraft(draft))}
      >
        Export process JSON
      </button>
      {error && <p className="file-io-error">{error}</p>}
    </fieldset>
  );
}
