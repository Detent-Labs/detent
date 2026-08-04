import { useState } from "react";
import type { Draft } from "../draft/types";
import { t } from "../catalog.js";
import { parseDraftText, formatDraftText } from "./draftJsonLogic";

interface JsonViewProps {
  draft: Draft;
  onApply: (draft: Draft) => void;
}

/**
 * studio-json-view: a replacing, one-way JSON surface over the draft body.
 * `text` is seeded once from `draft` on mount (no resync effect) — switching
 * away from this surface unmounts it, so switching back always remounts
 * fresh from the current draft. Typing has no effect on the draft until
 * Apply succeeds.
 */
export function JsonView({ draft, onApply }: JsonViewProps) {
  const [text, setText] = useState(() => formatDraftText(draft));
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    const parsed = parseDraftText(text);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    onApply(parsed.draft);
  };

  return (
    <div className="studio-json-view">
      <label>
        {t("jsonView.label")}
        <textarea
          className="studio-json-editor"
          rows={24}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </label>
      <div className="studio-controls">
        <button type="button" className="btn btn-secondary" onClick={apply}>
          {t("jsonView.apply")}
        </button>
      </div>
      {error && <p className="studio-error studio-json-error">{error}</p>}
    </div>
  );
}
