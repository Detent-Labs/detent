import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { Draft } from "../draft/types";
import { t } from "../catalog.js";
import { parseDraftText, formatDraftText } from "./draftJsonLogic";

const styles = stylex.create({
  studioJsonEditor: {
    display: "block",
    width: "100%",
    marginTop: space.s1,
    fontFamily: fonts.mono,
    fontSize: "0.85rem",
    border: `1px solid ${colors.border}`,
    padding: space.s2,
    background: colors.surface,
    resize: "vertical",
  },
  studioControls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBottom: space.s3,
    alignItems: "center",
  },
  studioJsonError: {
    color: colors.refusal,
    whiteSpace: "pre-line",
  },
});

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
          {...stylex.props(styles.studioJsonEditor)}
          rows={24}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </label>
      <div {...stylex.props(styles.studioControls)}>
        <button type="button" className="btn btn-secondary" onClick={apply}>
          {t("jsonView.apply")}
        </button>
      </div>
      {error && <p {...stylex.props(styles.studioJsonError)}>{error}</p>}
    </div>
  );
}
