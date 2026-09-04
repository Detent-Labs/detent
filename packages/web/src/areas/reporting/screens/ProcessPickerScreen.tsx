import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { listProcesses } from "../api/client.js";
import { describeCaughtError, stepName } from "./reportingLogic.js";
import { EmptyState, ErrorNote, WaitingNote } from "../components.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { ClientError, ProcessSummary } from "../api/types.js";

/**
 * A process is chosen before any view renders — the same process-first shape
 * Studio's Versions and Migration screens use. Every process is listed, not
 * only those with instances in range: an empty report is a legitimate answer
 * to "how is this process doing".
 */
/** `app.css`'s screen/picker rules, as StyleX. */
const styles = stylex.create({
  screen: {
    maxWidth: "60rem",
    marginInline: "auto",
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  picker: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  pickerRow: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  pickerItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: space.s3,
    width: "100%",
    background: { default: "none", ":hover": colors.surfaceMuted },
    borderWidth: 0,
    padding: `${space.s3} ${space.s2}`,
    font: "inherit",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  pickerLabel: {
    fontWeight: 600,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  pickerMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    whiteSpace: "nowrap",
  },
});

export function ProcessPickerScreen({
  token,
  locale,
  onPick,
}: {
  token: string;
  locale: UiLocale;
  onPick: (processId: string, label: string) => void;
}) {
  const [processes, setProcesses] = useState<ProcessSummary[] | undefined>();
  const [error, setError] = useState<ClientError | undefined>();

  useEffect(() => {
    let cancelled = false;
    listProcesses(token)
      .then((rows) => { if (!cancelled) setProcesses(rows); })
      .catch((cause: unknown) => { if (!cancelled) setError(describeCaughtError(cause)); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main {...stylex.props(styles.screen)}>
      <h1>{t(locale, "picker.title")}</h1>
      {error && <ErrorNote error={error} locale={locale} />}
      {!error && processes === undefined && <WaitingNote locale={locale} />}
      {!error && processes?.length === 0 && <EmptyState>{t(locale, "picker.empty")}</EmptyState>}
      {!error && processes && processes.length > 0 && (
        <ul {...stylex.props(styles.picker)}>
          {processes.map((p) => {
            const name = stepName({ stepId: p.processId, key: p.key, label: p.label }, p.baseLocale);
            return (
              <li key={p.processId} {...stylex.props(styles.pickerRow)}>
                <button type="button" {...stylex.props(styles.pickerItem)} onClick={() => onPick(p.processId, name)}>
                  <span {...stylex.props(styles.pickerLabel)}>{name}</span>
                  <span {...stylex.props(styles.pickerMeta)} translate="no">
                    {p.key} · v{p.version}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
