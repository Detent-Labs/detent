import { t } from "../catalog.js";
import type { PublishResult } from "../api/types.js";

interface Props {
  processLabel: string;
  revision: number;
  isDirty: boolean;
  lastSavedAt: Date | undefined;
  publishResult: PublishResult | null;
}

/**
 * A read-only summary above the four-column layout (studio-canvas: "A
 * process-identity header bar shows draft and publish status"). It shows
 * state `EditorArea` owns or passes through — never a second copy of
 * `DraftToolbar`'s own Save/Discard/Publish logic, which keeps rendering
 * where it renders today.
 */
export function ProcessHeaderBar({ processLabel, revision, isDirty, lastSavedAt, publishResult }: Props) {
  return (
    <header className="studio-header-bar">
      {/* h2, not h1: the screen's own "Process Studio" <h1> stays the page's
          one top-level heading; this names the loaded process beneath it. */}
      <h2 className="studio-header-bar-name">{processLabel || t("headerBar.unnamedProcess")}</h2>
      <span className="studio-header-bar-badge">
        {t("headerBar.revision")} {revision}
      </span>
      <span className={isDirty ? "studio-header-bar-dirty" : "studio-header-bar-saved"}>
        {isDirty ? t("headerBar.unsaved") : t("headerBar.saved")}
      </span>
      {!isDirty && lastSavedAt && (
        <span className="studio-header-bar-timestamp">
          {t("headerBar.lastSaved")} {lastSavedAt.toLocaleTimeString()}
        </span>
      )}
      {publishResult && (
        <span className="studio-header-bar-published">
          {t("headerBar.published")} v{publishResult.version} ({publishResult.definitionHash.slice(0, 12)})
        </span>
      )}
    </header>
  );
}
